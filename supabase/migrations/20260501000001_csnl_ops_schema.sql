-- Migration: 20260501000001_csnl_ops_schema.sql
-- Creates the csnl_ops schema with all initial tables and enums.
-- Isolated from the public schema used by the lab-reservation app.

begin;

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

create schema if not exists csnl_ops;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type csnl_ops.lab_meeting_type as enum (
  'paper_blitz',
  'grm',
  'special_grm'
);

create type csnl_ops.annual_event_type as enum (
  'grant_proposal',
  'grant_report',
  'bcs_workshop',
  'candidacy_oral',
  'brainday_poster',
  'brainday_talk',
  'lab_year_summary'
);

-- Calendar event categorization. Slab + CSNL calendars host more than just
-- experiment bookings (TA/TAC/PDM meetings, open-lab events, E2E system test
-- artefacts). This enum lets experiment_bookings act as a calendar mirror
-- without forcing every row to be an actual experiment.
create type csnl_ops.calendar_event_kind as enum (
  'experiment',
  'meeting',
  'tac_meeting',
  'pdm_meeting',
  'ta_meeting',
  'open_lab',
  'system_test',
  'other'
);

-- ---------------------------------------------------------------------------
-- Tables (ordered so FK targets are created before referencing tables)
-- ---------------------------------------------------------------------------

-- 연구원 마스터 — no FK dependencies; referenced by all other tables
create table csnl_ops.researchers (
  initial         text primary key,                       -- 'JY', 'HK' 등
  full_name       text not null,
  email           text,
  role            text check (role in ('undergrad','ms','phd','postdoc','pi','staff')),
  joined_on       date,
  candidacy_on    date,                                   -- 논자시 통과일
  defended_on     date,
  active          boolean default true,
  created_at      timestamptz not null default now()
);

-- 캘린더 이벤트 미러 (Slab calendar) — references researchers via experimenter_initials[]
-- Stores both experiment bookings and adjacent calendar entries (meetings, open-lab,
-- TAC/PDM/TA admin meetings, system-test artefacts). The raw event title is preserved
-- in raw_summary so the parser can be re-run if rules change.
create table csnl_ops.experiment_bookings (
  id                      uuid primary key default gen_random_uuid(),
  slab_calendar_event_id  text unique not null,                                       -- Google Calendar event id (mandatory: this table is a calendar mirror)
  scheduled_start         timestamptz not null,
  scheduled_end           timestamptz,
  raw_summary             text not null,                                              -- original calendar event title; never destructively edited
  event_kind              csnl_ops.calendar_event_kind not null default 'experiment',
  experimenter_initials   text[] not null default '{}',                               -- e.g. {'JOP'} or {'BHL','SYJ'}; convention: [0] = lead
  exp_code                text,                                                       -- experiment cohort token from calendar (TimeExp1, Exp1, ...) — NOT the research project code
  project_code            text,                                                       -- mapped research project (csnl_ops.projects.code); nullable until manual mapping
  subject_no              int,
  day_no                  int,                                                        -- replaces the original session_no — calendar uses /Day N/, not /Session N/
  participant_label       text,                                                       -- free-text, typically the parenthesised participant name
  parse_status            text not null default 'pending'
                          check (parse_status in ('pending','parsed','partial','unparseable')),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index experiment_bookings_scheduled_start_idx on csnl_ops.experiment_bookings (scheduled_start);
create index experiment_bookings_event_kind_idx       on csnl_ops.experiment_bookings (event_kind);
create index experiment_bookings_experimenter_gin_idx on csnl_ops.experiment_bookings using gin (experimenter_initials);

-- Append-only addition for Phase C sync idempotency.
alter table csnl_ops.experiment_bookings
  add column google_etag text;

-- Lab meeting (PB / GRM / special-GRM) — references researchers
create table csnl_ops.lab_meetings (
  meeting_date        date not null,
  type                csnl_ops.lab_meeting_type not null,
  presenter_initial   text references csnl_ops.researchers,
  slides_path         text,                               -- NAS / Drive / 로컬
  slides_format       text,                               -- 'pdf','pptx','keynote'
  paper_doi           text,                               -- PB 전용
  notes               text,
  created_at          timestamptz not null default now(),
  primary key (meeting_date, type, presenter_initial)
);

-- Milestone Meeting (개인 미팅, CSNL calendar) — references researchers
create table csnl_ops.milestone_meetings (
  meeting_date            date not null,
  researcher_initial      text references csnl_ops.researchers,
  slides_path             text,                           -- MM_yymmdd.pptx
  slides_submitted        boolean default false,
  csnl_calendar_event_id  text unique,
  notes                   text,
  created_at              timestamptz not null default now(),
  primary key (meeting_date, researcher_initial)
);

-- CWLL 주간 글 — references researchers
create table csnl_ops.cwll_entries (
  due_date              date not null,                    -- 화요일 자정 마감
  researcher_initial    text references csnl_ops.researchers,
  paper_apa             text not null,
  keywords              text[],
  summary               text,
  submitted_at          timestamptz,
  created_at            timestamptz not null default now(),
  primary key (due_date, researcher_initial)
);

-- 연간 행사 — references researchers
create table csnl_ops.annual_events (
  id              uuid primary key default gen_random_uuid(),
  year            int not null,
  type            csnl_ops.annual_event_type not null,
  deadline        timestamptz,
  owner_initial   text references csnl_ops.researchers,
  status          text default 'pending',
  notes           text
);

-- NAS 데이터 lineage — references experiment_bookings and researchers
create table csnl_ops.nas_datasets (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid references csnl_ops.experiment_bookings,
  nas_path            text not null,
  software            text check (software in ('ptb','psychopy','jspsych','other')),
  has_eyetracking     boolean default false,
  uploaded_at         timestamptz,
  uploader_initial    text references csnl_ops.researchers
);

-- Grant / 과제 — references researchers
create table csnl_ops.grants (
  code         text primary key,                          -- 'NRF-2024-...'
  title        text not null,
  category     text,                                      -- '기초연구실','중견' 등
  pi_initial   text references csnl_ops.researchers,
  start_date   date,
  end_date     date,
  status       text,
  created_at   timestamptz not null default now()
);

-- 프로젝트 — references researchers
create table csnl_ops.projects (
  code         text primary key,                          -- Slab calendar 의 [Project]
  full_name    text,
  lead_initial text references csnl_ops.researchers,
  software     text[],                                    -- ['ptb','jspsych']
  active       boolean default true,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Operational tables (Phase C+ — sync, anomaly logging, GRM reconciliation)
-- ---------------------------------------------------------------------------

-- Append-only anomaly log. Mirrors the lab-reservation `notion_health_state`
-- pattern (see lab-reservation/supabase/migrations/00031_notion_health_state.sql).
-- Cron jobs and sync workers insert one row per detected anomaly. Read-side
-- dashboards group by `kind` and `created_at` window.
create table csnl_ops.sync_anomalies (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null,                                   -- e.g. unparseable_title, unknown_initial, unmapped_exp_code, mm_slides_missing, mm_ambiguous_project, grm_presenter_missing, chase_sent, date_outside_grant
  payload      jsonb not null default '{}'::jsonb,              -- structured detail; safe to extend
  source_id    text,                                             -- e.g. google_event_id, lab_meeting (date,type,initial) tuple, milestone_meeting id
  source_kind  text,                                             -- e.g. 'slab_calendar_event','csnl_calendar_event','milestone_meeting','lab_meeting'
  resolved_at  timestamptz,                                      -- nullable; admin can mark resolved
  created_at   timestamptz not null default now()
);
create index sync_anomalies_kind_idx       on csnl_ops.sync_anomalies (kind);
create index sync_anomalies_created_at_idx on csnl_ops.sync_anomalies (created_at desc);
create index sync_anomalies_unresolved_idx on csnl_ops.sync_anomalies (kind, created_at desc) where resolved_at is null;

-- Staging table populated by Phase B `scripts/walk-grm-presenters.mjs`. Each
-- row = one GRM-style file observed on NAS (e.g. JOP_250903.pdf). Phase E's
-- `lab_meetings` reconciler joins this against CSNL calendar GRM event dates.
-- Multiple rows per (meeting_date) → special_grm signal.
create table csnl_ops.grm_presenters_observed (
  id            uuid primary key default gen_random_uuid(),
  meeting_date  date not null,
  initial       text not null,
  file_path     text not null,                                   -- relative to /Volumes/CSNL_new-2/GRM/
  file_kind     text,                                             -- 'pdf','pptx','key','keynote'
  file_mtime    timestamptz,                                      -- modified time on NAS
  observed_at   timestamptz not null default now(),
  unique (meeting_date, initial, file_path)
);
create index grm_presenters_observed_date_idx on csnl_ops.grm_presenters_observed (meeting_date);

-- Side table holding multi-presenter lists for special_grm meetings. Phase E
-- emits one row per (meeting_date, presenter) when more than one
-- grm_presenters_observed row matches a date.
create table csnl_ops.special_grm_presenters (
  meeting_date       date not null,
  presenter_initial  text not null,
  source_file_path   text,                                        -- the NAS file that contributed this presenter
  primary key (meeting_date, presenter_initial)
);
create index special_grm_presenters_date_idx on csnl_ops.special_grm_presenters (meeting_date);

-- ---------------------------------------------------------------------------
-- Schema ownership and privilege lock-down
--
-- We transfer schema ownership to the postgres role (Supabase superuser) and
-- revoke the default PUBLIC usage grant. Access is then granted only to
-- authenticated (for app users) and service_role (for Edge Functions / GH
-- Actions / admin scripts).
--
-- Specific table-level grants and RLS policies will be added in a subsequent
-- migration once roles and row-security rules are finalised. This intentional
-- two-step approach avoids shipping a half-baked permission model while still
-- ensuring the schema is not world-readable on deploy.
-- ---------------------------------------------------------------------------

alter schema csnl_ops owner to postgres;

revoke usage on schema csnl_ops from anon;
revoke usage on schema csnl_ops from public;

grant usage on schema csnl_ops to authenticated;
grant usage on schema csnl_ops to service_role;

-- ---------------------------------------------------------------------------
-- Summary
--
-- Enums created (3):
--   csnl_ops.lab_meeting_type      — paper_blitz, grm, special_grm
--   csnl_ops.annual_event_type     — grant_proposal, grant_report, bcs_workshop,
--                                    candidacy_oral, brainday_poster,
--                                    brainday_talk, lab_year_summary
--   csnl_ops.calendar_event_kind   — experiment, meeting, tac_meeting, pdm_meeting,
--                                    ta_meeting, open_lab, system_test, other
--
-- Tables created (12):
--   csnl_ops.researchers              — researcher master list (PK: initial)
--   csnl_ops.experiment_bookings      — Slab calendar mirror; experiments + meetings + open_lab (PK: id uuid)
--                                       [gained google_etag text column for Phase C sync idempotency]
--   csnl_ops.lab_meetings             — PB / GRM / special-GRM (PK: meeting_date, type, presenter_initial)
--   csnl_ops.milestone_meetings       — CSNL calendar 1:1 meetings (PK: meeting_date, researcher_initial)
--   csnl_ops.cwll_entries             — weekly written paper notes (PK: due_date, researcher_initial)
--   csnl_ops.annual_events            — annual milestone events (PK: id uuid)
--   csnl_ops.nas_datasets             — NAS data lineage (PK: id uuid)
--   csnl_ops.grants                   — research grants / 과제 (PK: code)
--   csnl_ops.projects                 — project registry (PK: code)
--   csnl_ops.sync_anomalies           — append-only anomaly/health log (PK: id uuid)
--   csnl_ops.grm_presenters_observed  — NAS-derived GRM file mirror (PK: id uuid)
--   csnl_ops.special_grm_presenters   — multi-presenter side-table (PK: meeting_date, presenter_initial)
-- ---------------------------------------------------------------------------

commit;
