-- =============================================================================
-- Migration: 20260505000005_csnl_ops_grants.sql
-- Purpose  : Grant table privileges to service_role and authenticated.
--
-- Why      : The schema migration revokes anon/public USAGE and grants USAGE
--            only to authenticated + service_role, but it does NOT grant
--            table-level SELECT/INSERT/UPDATE/DELETE. PostgREST returns 403
--            "permission denied" on first attempts. This migration fixes that.
--
--            csnl-ops is a server-side ops domain — no user-facing UI. Only
--            the cron route handlers (which use service_role) and admin tools
--            (also service_role) need access. authenticated gets read-only so
--            ad-hoc Studio / staff-tool queries work without bumping to
--            service_role.
-- =============================================================================

begin;

-- service_role: full privileges (server workers + maintenance tools)
grant all on all tables    in schema csnl_ops to service_role;
grant all on all sequences in schema csnl_ops to service_role;
grant all on all functions in schema csnl_ops to service_role;

-- authenticated: read-only by default (dashboards, ad-hoc Studio)
grant select on all tables    in schema csnl_ops to authenticated;
grant usage  on all sequences in schema csnl_ops to authenticated;

-- Default privileges so NEW objects (later migrations) inherit the grants
-- without needing per-migration plumbing.
alter default privileges in schema csnl_ops
  grant all on tables to service_role;
alter default privileges in schema csnl_ops
  grant all on sequences to service_role;
alter default privileges in schema csnl_ops
  grant all on functions to service_role;
alter default privileges in schema csnl_ops
  grant select on tables to authenticated;
alter default privileges in schema csnl_ops
  grant usage on sequences to authenticated;

commit;
