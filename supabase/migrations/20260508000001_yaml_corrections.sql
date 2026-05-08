-- =============================================================================
-- Migration: 20260508000001_yaml_corrections.sql
-- Purpose  : Align csnl_ops data with the authoritative YAML roster provided
--            on 2026-05-08. Updates seeded rows in place and adds new ones.
--
-- Changes
--   1. role check constraint extended: adds 'master' alongside existing 'ms'
--   2. 8 existing researchers updated (full_name, role, email, active)
--   3. 4 new active researchers inserted (JHR, JWL, MJC, BHL)
--   4. 10 alumni inserted with active=false
--   5. 3 project code renames (UPDATE before upsert to avoid PK collisions)
--   6. 18 project rows upserted (full_name, lead_initial, active); software preserved
--
-- Idempotency : All INSERTs use ON CONFLICT DO UPDATE. RENAMEs are plain UPDATEs
--               guarded by WHERE code = '<old>'; a re-run hits zero rows if already done.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Role enum extension
--    Drop old check, add new one that includes 'master' alongside 'ms'.
--    Both tokens are valid; alumni rows may use either.
-- ---------------------------------------------------------------------------

alter table csnl_ops.researchers
  drop constraint researchers_role_check;

alter table csnl_ops.researchers
  add constraint researchers_role_check
  check (role in ('undergrad','ms','master','phd','postdoc','pi','staff'));

-- ---------------------------------------------------------------------------
-- 2. Update existing 8 researchers (full_name, role, email, active)
--    Conflict target: initial (primary key)
-- ---------------------------------------------------------------------------

insert into csnl_ops.researchers (initial, full_name, role, email, active)
values
  ('SL',  'Sang-hun Lee',  'pi',      'sanghun.lee.vni@gmail.com', true),
  ('JSL', 'Jaeseob Lim',   'postdoc', 'jasup1883@gmail.com',       true),
  ('JOP', 'Joonoh Park',   'phd',     'joonop99@snu.ac.kr',        true),
  ('SK',  'Sungje Kim',    'phd',     'ksemperor97@gmail.com',     true),
  ('SMJ', 'Saemi Jung',    'phd',     'jsaemi22@gmail.com',        true),
  ('JYK', 'Jungye Kim',    'phd',     'jy061100@gmail.com',        true),
  ('MSY', 'Minsu Yeo',     'master',  'mike1224@snu.ac.kr',        true),
  ('BYL', 'Boyun Lee',     'master',  'bolee0755@gmail.com',       true)
on conflict (initial) do update
  set full_name = excluded.full_name,
      role      = excluded.role,
      email     = excluded.email,
      active    = excluded.active;

-- ---------------------------------------------------------------------------
-- 3. Insert 4 new active researchers
--    Conflict target: initial (primary key)
-- ---------------------------------------------------------------------------

insert into csnl_ops.researchers (initial, full_name, role, email, active)
values
  ('JHR', 'Juhyoung Ryu', 'postdoc', 'jh67753737@gmail.com',    true),
  ('JWL', 'Joonwon Lee',  'phd',     'jwl89@snu.ac.kr',         true),
  ('MJC', 'Min Jin Choe', 'phd',     'minjin.choe@gmail.com',   true),
  ('BHL', 'Bohyun Lee',   'phd',     'leebohyun2002@gmail.com', true)
on conflict (initial) do update
  set full_name = excluded.full_name,
      role      = excluded.role,
      email     = excluded.email,
      active    = excluded.active;

-- ---------------------------------------------------------------------------
-- 4. Insert 10 alumni (active = false)
--    defended_on: YYYY → YYYY-12-31 where year is known; NULL otherwise.
--    Conflict target: initial (primary key)
-- ---------------------------------------------------------------------------

insert into csnl_ops.researchers (initial, full_name, role, email, defended_on, active)
values
  ('HS',  'Hansem Sohn',      'phd',    null,                      '2013-12-31', false),
  ('SHP', 'Soo Hyun Park',    'phd',    'soohyunpark@kaist.ac.kr', '2013-12-31', false),
  ('JK',  'Jin Young Kim',    'phd',    null,                      '2022-12-31', false),
  ('HG',  'Hyunwoo Gu',       'master', null,                      '2022-12-31', false),
  ('HSL', 'Heeseung Lee',     'phd',    null,                      '2023-12-31', false),
  ('HJL', 'Hyang-Jung Lee',   'phd',    null,                      '2024-12-31', false),
  ('JYA', 'Jeong Yeol Ahn',   'phd',    null,                      '2024-12-31', false),
  ('DGY', 'Dong-gyu Yoo',     'master', null,                      '2024-12-31', false),
  ('JWR', 'Jungwon Ryu',      'phd',    null,                      null,         false),
  ('KWC', 'Kyoung Whan Choe', 'phd',    null,                      null,         false)
on conflict (initial) do update
  set full_name   = excluded.full_name,
      role        = excluded.role,
      email       = excluded.email,
      defended_on = excluded.defended_on,
      active      = excluded.active;

-- ---------------------------------------------------------------------------
-- 5. Project code renames
--    Must run BEFORE step 6 so ON CONFLICT targets in step 6 match new codes.
--    experiment_bookings.project_code is plain text (no FK) and currently NULL
--    on all rows, so these renames are safe.
-- ---------------------------------------------------------------------------

update csnl_ops.projects set code = 'BiasVar'          where code = 'biasVar';
update csnl_ops.projects set code = 'CatMag'           where code = 'CatVsMag';
update csnl_ops.projects set code = 'WMRepresentation' where code = 'WMRepresentation_24_updated';

-- ---------------------------------------------------------------------------
-- 6. Upsert 18 projects (full_name, lead_initial, active)
--    software is preserved via `software = csnl_ops.projects.software`
--    so enrichment data from 20260505000001_projects_enrichment.sql is not lost.
--    Conflict target: code (primary key)
-- ---------------------------------------------------------------------------

insert into csnl_ops.projects (code, full_name, lead_initial, active)
values
  ('CPS',                'Concentric Pattern Sensitivity — pRF Ellipticity and Visual Cortex',            'JHR', true),
  ('OM_WB',              'Orientation Map — Whole Brain (NSD-based)',                                     'JHR', true),
  ('Passive_navigation', 'Passive Navigation (Intersubject correlation, fMRI)',                            'JSL', true),
  ('SerialDep_Spatial',  'Serial Dependence in Relative Coordinates (Multiple Items)',                    'JSL', true),
  ('CatMag',             'Categorical vs. Magnitude Decision-Making',                                     'MSY', true),
  ('VWM_Contrast',       'Sequential Visual Working Memory Interaction Based on Contrast Difference',     'MJC', true),
  ('Screen_Retinotopy',  'Screen Retinotopy (pRF, voxel receptive field)',                               'SK',  true),
  ('WMRepresentation',   'WM Representation in Early Visual Cortex (2024 updated)',                      'SK',  true),
  ('RNN',                'Recurrent Neural Network Modeling',                                             'JYK', true),
  ('BiasVar',            'Bias-Variance Tradeoff in Working Memory Orientation',                         'BYL', true),
  ('Uncertainty',        'Posterior Uncertainty via Betting Range',                                      'JOP', true),
  ('RingRepSca',         'Ring Reproduction & Scaling: History Effect in Estimation',                    'JOP', true),
  ('Time',               'Duration Perception History Effect',                                            'JOP', true),
  ('Time2Dist',          'Duration Perception Distribution Learning',                                    'JOP', true),
  ('GranNMDS',           'Granularity Effect — NMDS & Shepardian Distance Analysis',                     'JOP', true),
  ('GranRDT',            'Granularity Effect — Rate-Distortion Theory Analysis',                         'JOP', true),
  ('tDCS',               'tDCS Study (metadata pending)',                                                 'JOP', true),
  ('Concentricity',      'Concentricity Prior in Visual Search & Oculomotor System',                    'SMJ', true)
on conflict (code) do update
  set full_name    = excluded.full_name,
      lead_initial = excluded.lead_initial,
      active       = excluded.active,
      software     = csnl_ops.projects.software;   -- preserve enrichment; do not overwrite

-- =============================================================================
-- Row count targets after this migration
--   researchers (active + alumni) : 22
--   projects (active)             : 18
-- =============================================================================

commit;
