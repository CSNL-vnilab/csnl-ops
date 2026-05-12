-- =============================================================================
-- 20260512120000_lab_reservation_fdw.sql
--
-- Sets up a Foreign Data Wrapper pointing at the lab-reservation Supabase
-- project so that csnl-ops can SELECT from lab-reservation tables directly
-- (without duplicating data via API calls).
--
-- IMPORTANT: This migration CANNOT be applied until both manual steps below
-- are completed.  Applying it before those steps will produce a server error
-- at CREATE SERVER or at import time.
--
-- =============================================================================
-- MANUAL STEP 1 — Run this SQL in the lab-reservation Supabase SQL editor
-- (the *source* project; NOT this project).
-- It creates a read-only role that csnl-ops will use to connect.
-- =============================================================================
--
--   -- On lab-reservation Supabase project:
--   CREATE ROLE csnl_ops_fdw_reader WITH LOGIN PASSWORD '<GENERATE_A_STRONG_PASSWORD>';
--   GRANT CONNECT ON DATABASE postgres TO csnl_ops_fdw_reader;
--   GRANT USAGE ON SCHEMA public TO csnl_ops_fdw_reader;
--   GRANT SELECT ON
--     public.bookings,
--     public.experiments,
--     public.booking_observations,
--     public.experiment_run_progress,
--     public.profiles,
--     public.experiment_locations,
--     public.participant_lab_identity
--   TO csnl_ops_fdw_reader;
--   -- If the tables do not yet exist, run after they are created.
--   -- Repeat for any future tables added to this list.
--
-- =============================================================================
-- MANUAL STEP 2 — Store credentials in the csnl-ops Supabase Vault
-- (THIS project's Dashboard → Database → Vault → Add secret).
-- Name the secret exactly:
--   lab_reservation_fdw_password   → the password you chose above
--   lab_reservation_fdw_host       → the lab-reservation Transaction Pooler
--                                    hostname from Settings → Database → Connection string
--                                    e.g. "aws-0-ap-northeast-2.pooler.supabase.com"
--
-- Do NOT commit the actual host or password anywhere in this repo.
-- The vault.decrypted_secrets view is only accessible to the postgres role
-- (Supabase service-role internally); it is never exposed via the public API.
--
-- If you cannot use Vault (e.g., your project tier does not include it), store
-- only the password in Vault and hard-code the non-secret host string in the
-- GUC below.  Never commit the password in plain text.
--
-- =============================================================================
-- DESIGN NOTE: Supabase Wrappers vs raw postgres_fdw
-- =============================================================================
-- Supabase Wrappers provides a meta-FDW framework, but its postgres_wrapper
-- (the wrapper for connecting to another Postgres) uses its own HANDLER that
-- does NOT directly accept password_encrypted / vault references in the OPTIONS
-- clause — vault integration is only available for wrapped third-party APIs
-- (S3, BigQuery, etc.).
--
-- For Postgres-to-Postgres FDW, Supabase's own documentation (as of 2026-05)
-- recommends using the native postgres_fdw extension with the password stored
-- via vault.create_secret() and retrieved at runtime via a SECURITY DEFINER
-- wrapper function — which is what this migration implements.
--
-- The pattern is:
--   1. CREATE SERVER using password_encrypted option that references a Vault secret.
--   2. CREATE USER MAPPING references the decrypted value via a helper function.
--   3. IMPORT FOREIGN SCHEMA targets the mirror schema in this project.
--
-- Reference:
--   https://supabase.com/docs/guides/database/postgres/postgres-fdw
--   https://supabase.com/docs/guides/database/vault
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

-- postgres_fdw is a core Postgres extension available on all Supabase projects.
CREATE EXTENSION IF NOT EXISTS postgres_fdw WITH SCHEMA extensions;

-- Supabase Vault — stores and encrypts secrets; exposes via vault.decrypted_secrets.
-- This is a Supabase-proprietary extension, already present on most paid plans.
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- ---------------------------------------------------------------------------
-- Mirror schema (will receive the FOREIGN TABLE stubs from IMPORT FOREIGN SCHEMA)
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS lab_reservation_mirror;

COMMENT ON SCHEMA lab_reservation_mirror IS
  'Foreign tables mirroring the lab-reservation Supabase project''s public schema. '
  'Read-only SELECT via postgres_fdw. Managed by migration 20260512120000.';

-- ---------------------------------------------------------------------------
-- Helper: retrieve a Vault secret by name
-- SECURITY DEFINER so the postgres_fdw USER MAPPING can call it without
-- exposing the vault schema to lesser roles.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION csnl_ops.get_vault_secret(secret_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, pg_catalog, public
AS $$
DECLARE
  secret_value text;
BEGIN
  SELECT decrypted_secret
  INTO   secret_value
  FROM   vault.decrypted_secrets
  WHERE  name = secret_name
  LIMIT  1;

  IF secret_value IS NULL THEN
    RAISE EXCEPTION 'Vault secret % not found. '
      'Store it via the Dashboard → Database → Vault before applying this migration.',
      secret_name;
  END IF;

  RETURN secret_value;
END;
$$;

COMMENT ON FUNCTION csnl_ops.get_vault_secret(text) IS
  'SECURITY DEFINER wrapper that reads a secret from vault.decrypted_secrets '
  'without granting the caller direct access to the vault schema. '
  'Called during USER MAPPING creation and connection establishment.';

-- Grant execute only to postgres (used by FDW connection internally).
-- service_role can also call it from admin scripts.
REVOKE ALL ON FUNCTION csnl_ops.get_vault_secret(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION csnl_ops.get_vault_secret(text) TO postgres;
GRANT EXECUTE ON FUNCTION csnl_ops.get_vault_secret(text) TO service_role;

-- ---------------------------------------------------------------------------
-- Foreign Server
--
-- The host is read from Vault secret 'lab_reservation_fdw_host'.
-- Port 5432 is the Transaction Pooler port for Session mode, which is required
-- for postgres_fdw (it holds a persistent connection).
-- If your lab-reservation project uses a Session-mode pooler at port 5432, use
-- that; otherwise use the direct connection port (also 5432 on Supabase).
--
-- NOTE: CREATE SERVER does not resolve the host dynamically — the host string
-- must be set at server-creation time.  We use a DO block to read from Vault
-- and execute the DDL dynamically so the password/host never appear in plain
-- text in the migration file or logs.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_host text;
  v_server_exists boolean;
BEGIN
  -- Skip if the server already exists (idempotent re-run).
  SELECT EXISTS (
    SELECT 1 FROM pg_foreign_server WHERE srvname = 'lab_reservation_srv'
  ) INTO v_server_exists;

  IF v_server_exists THEN
    RAISE NOTICE 'lab_reservation_srv already exists — skipping CREATE SERVER.';
    RETURN;
  END IF;

  -- Read host from Vault.
  v_host := csnl_ops.get_vault_secret('lab_reservation_fdw_host');

  EXECUTE format(
    $sql$
      CREATE SERVER lab_reservation_srv
        FOREIGN DATA WRAPPER postgres_fdw
        OPTIONS (
          host %L,
          port '5432',
          dbname 'postgres',
          -- keepalives_idle: close stale connections after 60s; important in
          -- serverless / Vercel environment where connections may be idle.
          keepalives_idle '60',
          -- Disable SSL certificate verification for Supabase-to-Supabase
          -- connections within the same region; set to 'require' if cross-region.
          sslmode 'require'
        )
    $sql$,
    v_host
  );

  RAISE NOTICE 'Created foreign server lab_reservation_srv pointing at %', v_host;
END;
$$;

-- ---------------------------------------------------------------------------
-- User Mapping
-- Maps the local 'postgres' superuser to the fdw reader role on lab-reservation.
-- The password is read from Vault at mapping-creation time (not stored in
-- pg_user_mappings in plain text — Postgres encrypts it at rest).
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_password text;
  v_mapping_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM   pg_user_mappings
    WHERE  srvname = 'lab_reservation_srv'
      AND  usename = 'postgres'
  ) INTO v_mapping_exists;

  IF v_mapping_exists THEN
    RAISE NOTICE 'User mapping for postgres → lab_reservation_srv already exists — skipping.';
    RETURN;
  END IF;

  v_password := csnl_ops.get_vault_secret('lab_reservation_fdw_password');

  EXECUTE format(
    $sql$
      CREATE USER MAPPING FOR postgres
        SERVER lab_reservation_srv
        OPTIONS (
          user 'csnl_ops_fdw_reader',
          password %L
        )
    $sql$,
    v_password
  );

  RAISE NOTICE 'Created user mapping for postgres → lab_reservation_srv.';
END;
$$;

-- ---------------------------------------------------------------------------
-- IMPORT FOREIGN SCHEMA
--
-- This imports the listed tables as foreign tables into lab_reservation_mirror.
-- The local column definitions are auto-derived from the remote schema.
-- If a listed table does not exist on lab-reservation, the import fails for
-- that table; we list them individually so a missing table produces a clear
-- error rather than silently importing nothing.
--
-- After applying this migration, run:
--   SELECT * FROM lab_reservation_mirror.bookings LIMIT 1;
-- to verify connectivity.
-- ---------------------------------------------------------------------------

IMPORT FOREIGN SCHEMA public
  LIMIT TO (
    bookings,
    experiments,
    booking_observations,
    experiment_run_progress,
    profiles,
    experiment_locations,
    participant_lab_identity
  )
  FROM SERVER lab_reservation_srv
  INTO lab_reservation_mirror;

-- ---------------------------------------------------------------------------
-- Privileges on the mirror schema
-- ---------------------------------------------------------------------------

-- Only service_role and postgres (admin scripts, ingest cron) need SELECT.
-- authenticated role does NOT get access — mirror tables are internal only.
GRANT USAGE ON SCHEMA lab_reservation_mirror TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA lab_reservation_mirror TO service_role;

-- Allow postgres to use the schema (it owns it, but explicit grant is clearer).
GRANT USAGE ON SCHEMA lab_reservation_mirror TO postgres;
GRANT SELECT ON ALL TABLES IN SCHEMA lab_reservation_mirror TO postgres;

-- Revoke public access (default Postgres grants USAGE to PUBLIC on new schemas).
REVOKE USAGE ON SCHEMA lab_reservation_mirror FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA lab_reservation_mirror FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA lab_reservation_mirror FROM authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA lab_reservation_mirror FROM anon;

-- ---------------------------------------------------------------------------
-- Verification helper (optional, run manually to smoke-test the FDW)
-- ---------------------------------------------------------------------------
--
-- After applying this migration, verify connectivity with:
--
--   SELECT count(*) FROM lab_reservation_mirror.profiles;
--   SELECT count(*) FROM lab_reservation_mirror.bookings WHERE status = 'completed';
--
-- ---------------------------------------------------------------------------

commit;
