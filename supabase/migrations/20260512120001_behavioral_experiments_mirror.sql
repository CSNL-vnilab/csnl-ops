-- =============================================================================
-- 20260512120001_behavioral_experiments_mirror.sql
--
-- Creates:
--   csnl_ops.behavioral_experiments       — mirror of completed experiment runs
--                                           ingested from lab-reservation via FDW
--   csnl_ops.experiment_ingest_anomalies  — per-row ingest anomalies (unmapped
--                                           email, parse errors, etc.)
--
-- PII policy: NO participant identity columns are stored here.
--   • participant_public_code  — excluded (per spec §D2 PII decision, 2026-05-12)
--   • participant name/email   — excluded
--   • Only subject_number (per-experiment ordinal, no identity link) is kept.
--
-- RLS policy: service_role only (matches base schema pattern — see
--   20260501000001_csnl_ops_schema.sql §schema ownership).
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- csnl_ops.behavioral_experiments
-- ---------------------------------------------------------------------------

CREATE TABLE csnl_ops.behavioral_experiments (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- -----------------------------------------------------------
  -- Cross-project identity
  -- -----------------------------------------------------------
  -- source_booking_id is the bookings.id PK in lab-reservation.
  -- UNIQUE enforces one mirror row per booking (upsert key).
  source_booking_id     uuid        UNIQUE NOT NULL,

  -- researcher_initial references csnl_ops.researchers.initial.
  -- NULL is allowed: the ingest job records an anomaly if email
  -- resolution fails, but still writes the row.
  researcher_initial    text        REFERENCES csnl_ops.researchers(initial),

  -- -----------------------------------------------------------
  -- Experiment definition (from lab-reservation experiments table)
  -- -----------------------------------------------------------
  experiment_id         uuid        NOT NULL,
  experiment_title      text,
  experiment_mode       text        CHECK (experiment_mode IN ('offline', 'online', 'hybrid')),
  categories            text[],
  protocol_version      text,

  -- -----------------------------------------------------------
  -- Variables / parameters
  -- -----------------------------------------------------------
  -- JSON blobs kept opaque — schema evolves in lab-reservation independently.
  parameter_schema      jsonb,
  offline_code_analysis jsonb,
  condition_assignment  text,

  -- -----------------------------------------------------------
  -- Paths / repos
  -- -----------------------------------------------------------
  data_path             text,
  code_repo_url         text,

  -- -----------------------------------------------------------
  -- Session metadata
  -- -----------------------------------------------------------
  -- subject_number: ordinal within the experiment (1, 2, 3 ...).
  -- No identity link — participant_public_code deliberately excluded.
  subject_number        int,
  session_number        int,
  location_name         text,
  slot_start            timestamptz NOT NULL,
  slot_end              timestamptz,
  completed_at          timestamptz NOT NULL,
  online_verified_at    timestamptz,

  -- -----------------------------------------------------------
  -- Quality flags
  -- -----------------------------------------------------------
  data_quality          text,
  exclusion_flag        boolean     NOT NULL DEFAULT false,
  exclusion_reason      text,
  is_pilot              boolean     NOT NULL DEFAULT false,
  blocks_submitted      int,
  attention_fail_count  int,
  was_auto_completed    boolean     NOT NULL DEFAULT false,

  -- -----------------------------------------------------------
  -- Notes (free-form, from booking_observations)
  -- -----------------------------------------------------------
  notable_observations  text,

  -- -----------------------------------------------------------
  -- Sync bookkeeping
  -- -----------------------------------------------------------
  source_updated_at     timestamptz NOT NULL,
  ingested_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE csnl_ops.behavioral_experiments IS
  'Mirror of completed experiment booking records from the lab-reservation '
  'Supabase project. Populated weekly by the ingest-experiments cron. '
  'No participant PII — participant_public_code deliberately omitted (D2 decision).';

COMMENT ON COLUMN csnl_ops.behavioral_experiments.source_booking_id IS
  'PK of the source bookings row in lab-reservation. Upsert key.';

COMMENT ON COLUMN csnl_ops.behavioral_experiments.researcher_initial IS
  'Resolved 2-4 char researcher key. NULL if lab-reservation email could not be '
  'matched to csnl_ops.researchers.email (anomaly recorded separately).';

COMMENT ON COLUMN csnl_ops.behavioral_experiments.subject_number IS
  'Per-experiment ordinal (1st subject = 1, 2nd = 2, ...). '
  'NOT a participant identity — participant_public_code is excluded per PII policy.';

COMMENT ON COLUMN csnl_ops.behavioral_experiments.parameter_schema IS
  'Opaque JSON from lab-reservation experiments.parameter_schema. '
  'Schema is owned by lab-reservation; csnl-ops treats it as a blob.';

-- Indexes
CREATE INDEX ON csnl_ops.behavioral_experiments (researcher_initial, completed_at DESC);
CREATE INDEX ON csnl_ops.behavioral_experiments (completed_at DESC);
CREATE INDEX ON csnl_ops.behavioral_experiments (experiment_id);
CREATE INDEX ON csnl_ops.behavioral_experiments (researcher_initial)
  WHERE researcher_initial IS NOT NULL;
CREATE INDEX ON csnl_ops.behavioral_experiments (source_booking_id);

-- ---------------------------------------------------------------------------
-- csnl_ops.experiment_ingest_anomalies
-- ---------------------------------------------------------------------------

CREATE TABLE csnl_ops.experiment_ingest_anomalies (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Vocabulary of anomaly_type values (open, not an enum, to allow new kinds
  -- without a migration):
  --   'unmapped_email'      — profiles.email not in csnl_ops.researchers.email
  --   'parse_error'         — field mapping failed (e.g. unexpected null in NOT NULL)
  --   'duplicate_subject'   — same (experiment_id, subject_number) already exists with
  --                           a different source_booking_id
  --   'stale_completed_at'  — completed_at is in the future (clock skew)
  anomaly_type          text        NOT NULL,

  source_booking_id     uuid,
  unmapped_email        text,

  -- Structured detail; extend freely without migration.
  details               jsonb,

  -- Lifecycle
  first_seen_at         timestamptz NOT NULL DEFAULT now(),
  last_seen_at          timestamptz NOT NULL DEFAULT now(),
  notified_at           timestamptz,   -- NULL until first notification email is sent
  resolved_at           timestamptz,
  pushed_to_harness_at  timestamptz    -- mirrors sync_anomalies.pushed_to_harness_at pattern
);

COMMENT ON TABLE csnl_ops.experiment_ingest_anomalies IS
  'Per-row ingest anomalies detected during the ingest-experiments cron. '
  'Deduplicated on (anomaly_type, unmapped_email, source_booking_id). '
  'Rows with notified_at IS NULL are pending first-notification email. '
  'Rows with pushed_to_harness_at IS NULL are pending NAS snapshot push.';

COMMENT ON COLUMN csnl_ops.experiment_ingest_anomalies.anomaly_type IS
  'One of: unmapped_email | parse_error | duplicate_subject | stale_completed_at';

COMMENT ON COLUMN csnl_ops.experiment_ingest_anomalies.notified_at IS
  'Timestamp of first notification email to the unmapped address. '
  'NULL = not yet sent. Set by ingest-experiments cron after successful send.';

COMMENT ON COLUMN csnl_ops.experiment_ingest_anomalies.pushed_to_harness_at IS
  'Mirrors csnl_ops.sync_anomalies.pushed_to_harness_at. '
  'Set by export-anomalies-for-harness.mjs after inbox JSON write.';

-- Deduplication index: one row per (anomaly_type, email, booking_id) triple.
-- COALESCE converts NULL to empty string so the unique constraint works.
CREATE UNIQUE INDEX ON csnl_ops.experiment_ingest_anomalies (
  anomaly_type,
  COALESCE(unmapped_email, ''),
  COALESCE(source_booking_id::text, '')
);

-- Hot path: find anomalies pending notification
CREATE INDEX ON csnl_ops.experiment_ingest_anomalies (notified_at)
  WHERE notified_at IS NULL;

-- Hot path: find anomalies pending NAS push
CREATE INDEX ON csnl_ops.experiment_ingest_anomalies (pushed_to_harness_at)
  WHERE pushed_to_harness_at IS NULL;

-- Ordered reads in the export script
CREATE INDEX ON csnl_ops.experiment_ingest_anomalies (first_seen_at DESC)
  WHERE resolved_at IS NULL;

-- ---------------------------------------------------------------------------
-- RLS: service_role only (consistent with base schema pattern)
-- ---------------------------------------------------------------------------

ALTER TABLE csnl_ops.behavioral_experiments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE csnl_ops.experiment_ingest_anomalies   ENABLE ROW LEVEL SECURITY;

-- behavioral_experiments: read via service_role only
CREATE POLICY "service_role_all"
  ON csnl_ops.behavioral_experiments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "postgres_all"
  ON csnl_ops.behavioral_experiments
  FOR ALL
  TO postgres
  USING (true)
  WITH CHECK (true);

-- experiment_ingest_anomalies: same
CREATE POLICY "service_role_all"
  ON csnl_ops.experiment_ingest_anomalies
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "postgres_all"
  ON csnl_ops.experiment_ingest_anomalies
  FOR ALL
  TO postgres
  USING (true)
  WITH CHECK (true);

-- No authenticated / anon access.

-- ---------------------------------------------------------------------------
-- Schema grants (new tables must be explicitly granted)
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON csnl_ops.behavioral_experiments
  TO service_role;
GRANT SELECT, INSERT, UPDATE ON csnl_ops.experiment_ingest_anomalies
  TO service_role;

commit;
