-- =============================================================================
-- Migration: 20260505000004_lab_meetings_pk_fix.sql
-- Purpose  : Allow Paper Blitz rows (presenter_initial = NULL) by replacing
--            the composite PK with a surrogate uuid PK and a uniqueness
--            constraint that uses NULLS NOT DISTINCT.
--
-- Why      : The 2026-05-04 lab_meetings_backfill walker found 52 PB files
--            (PB_yymmdd.pdf) where the calendar/filename does not surface
--            individual presenters. Those rows must store as
--            (date, 'paper_blitz', NULL). PostgreSQL treats columns referenced
--            by PRIMARY KEY as implicitly NOT NULL → INSERT fails.
--
--            Switching to a surrogate uuid PK + UNIQUE NULLS NOT DISTINCT
--            preserves idempotency (one row per [date, type, presenter] tuple,
--            including the NULL-presenter PB tuples) without forcing a
--            sentinel value on the presenter column.
--
-- Postgres  : Requires 15+ for NULLS NOT DISTINCT. We are on 17.
-- Safe to   : re-run; uses IF EXISTS / IF NOT EXISTS guards.
-- =============================================================================

begin;

-- 1. Drop the old composite PK (named lab_meetings_pkey by default).
alter table csnl_ops.lab_meetings
  drop constraint if exists lab_meetings_pkey;

-- 1b. Postgres retains the implicit NOT NULL on presenter_initial after a PK
--     drop (documented behaviour — preserved as a safety net). Drop it
--     explicitly so PB rows can carry presenter_initial = NULL.
alter table csnl_ops.lab_meetings
  alter column presenter_initial drop not null;

-- 2. Add a surrogate uuid PK. Existing rows (none yet) would get unique uuids.
alter table csnl_ops.lab_meetings
  add column if not exists id uuid not null default gen_random_uuid();

alter table csnl_ops.lab_meetings
  add constraint lab_meetings_pkey primary key (id);

-- 3. Replace the natural-key uniqueness with NULLS NOT DISTINCT semantics so
--    (date, 'paper_blitz', NULL) collisions are still detected (and so the
--    walker's ON CONFLICT clause continues to function).
alter table csnl_ops.lab_meetings
  add constraint lab_meetings_unique_natural_key
  unique nulls not distinct (meeting_date, type, presenter_initial);

commit;

-- After this migration, the lab_meetings_backfill walker (migration
-- 20260505000002) can be re-run. ON CONFLICT (meeting_date, type,
-- presenter_initial) DO UPDATE will resolve against the new unique constraint.
