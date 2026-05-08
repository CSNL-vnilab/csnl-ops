-- =============================================================================
-- Migration: 20260504000001_csnl_ops_seed_initial.sql
-- Purpose  : Insert initial seed data for csnl_ops (researchers, grants, projects).
--
-- Source of data
--   researchers : Lab roster as known at 2026-05-01.
--                 Fields intentionally left NULL: email, joined_on, candidacy_on,
--                 defended_on — not on record; populate in a later migration once
--                 sourced from personnel files or the PI.
--   grants      : Two active grants identified from NAS folder names under
--                 /Volumes/CSNL_new-2/Grant/. Titles are folder-name placeholders;
--                 proper Korean titles must be sourced from each grant's
--                 최종제출본/ sub-directory and updated in a later migration.
--                 Fields intentionally left NULL: start_date, end_date.
--   projects    : Derived from active project folder names on the NAS and
--                 csnl_meta_knowledge.md. Fields intentionally left NULL: full_name,
--                 software — to be enriched from csnl_meta_knowledge.md later.
--
-- Idempotency : Every INSERT uses ON CONFLICT DO UPDATE so the migration can be
--               re-run safely. A second run is a no-op for unchanged rows.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. researchers (8 rows)
--    Conflict target: initial (primary key)
--    Updated columns: full_name, role, active
-- ---------------------------------------------------------------------------

insert into csnl_ops.researchers (initial, full_name, role, active)
values
  ('SL',  'Sang-Hun Lee', 'pi',      true),
  ('JSL', '임재섭',       'postdoc', true),
  ('JOP', '박준오',       'phd',     true),
  ('BYL', '이보연',       'phd',     true),
  ('JYK', '김정예',       'phd',     true),
  ('MSY', '여민수',       'phd',     true),
  ('SMJ', '정새미',       'phd',     true),
  ('SK',  '김성제',       'phd',     true)
on conflict (initial) do update
  set full_name = excluded.full_name,
      role      = excluded.role,
      active    = excluded.active;

-- ---------------------------------------------------------------------------
-- 2. grants (2 rows)
--    Conflict target: code (primary key)
--    Updated columns: category, pi_initial, status, title
--
--    NOTE: titles below are folder-name placeholders. Proper titles must be
--    sourced from the grant proposal documents located at:
--      /Volumes/CSNL_new-2/Grant/<code>/최종제출본/
--    Update via a subsequent migration once documents are reviewed.
-- ---------------------------------------------------------------------------

insert into csnl_ops.grants (code, title, category, pi_initial, status)
values
  ('대형장비구축_2024', '대형장비구축_2024', '대형장비구축', 'SL', 'active'),
  ('중견_2024',         '중견_2024',         '중견',         'SL', 'active')
on conflict (code) do update
  set category   = excluded.category,
      pi_initial = excluded.pi_initial,
      status     = excluded.status,
      title      = excluded.title;

-- ---------------------------------------------------------------------------
-- 3. projects (15 rows)
--    Conflict target: code (primary key)
--    Updated columns: lead_initial, active
--    full_name and software left NULL — to be enriched from csnl_meta_knowledge.md
-- ---------------------------------------------------------------------------

insert into csnl_ops.projects (code, lead_initial, full_name, software, active)
values
  ('Passive_navigation',        'JSL', null, null, true),
  ('SerialDep_Spatial',         'JSL', null, null, true),
  ('RingRepSca',                'JOP', null, null, true),
  ('Time',                      'JOP', null, null, true),
  ('Time2Dist',                 'JOP', null, null, true),
  ('GranNMDS',                  'JOP', null, null, true),
  ('GranRDT',                   'JOP', null, null, true),
  ('tDCS',                      'JOP', null, null, true),
  ('Uncertainty',               'JOP', null, null, true),
  ('biasVar',                   'BYL', null, null, true),
  ('RNN',                       'JYK', null, null, true),
  ('CatVsMag',                  'MSY', null, null, true),
  ('Concentricity',             'SMJ', null, null, true),
  ('Screen_Retinotopy',         'SK',  null, null, true),
  ('WMRepresentation_24_updated','SK', null, null, true)
on conflict (code) do update
  set lead_initial = excluded.lead_initial,
      active       = excluded.active;

-- =============================================================================
-- Row counts inserted / upserted
--   csnl_ops.researchers : 8 rows
--   csnl_ops.grants      : 2 rows
--   csnl_ops.projects    : 15 rows  (task brief said 14; actual data has 15 rows)
-- =============================================================================

commit;
