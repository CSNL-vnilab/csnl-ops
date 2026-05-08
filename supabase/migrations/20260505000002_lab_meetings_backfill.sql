-- =============================================================================
-- Migration: 20260505000002_lab_meetings_backfill.sql
-- Purpose  : Backfill csnl_ops.lab_meetings from NAS /Volumes/CSNL_new-2/GRM/
--
-- Walk methodology:
--   Three filename patterns matched:
--     1. PB_YYMMDD.ext            → paper_blitz, presenter_initial = NULL
--     2. INIT_YYMMDD.ext          → grm, presenter_initial = INIT
--     3. GRM_YYMMDD_INIT.ext      → grm, presenter_initial = INIT
--   De-duplicated by (date, type, presenter) before emitting SQL.
--   Skip list: lock files (~$*), hidden files, non-presentation extensions,
--              noise initials (GRM, REV, DY, HL, JWL, LBY, etc.),
--              impossible dates (< 2018-01 or > 2026-12).
--
-- Scan statistics (as of 2026-05-01):
--   Total files scanned                : 715
--   Matched rows emitted               : 112
--     paper_blitz rows                 : 52
--     grm rows                         : 60
--   Skipped — invalid date             : 2 (JOP_250439.pptx, SYJ_061825.pptx)
--   Skipped — noise / non-person token : 34
--   Date range covered                 : 2022-09-08 → 2026-04-29
--
-- Unknown presenter initials (not in current or known-past member list):
--   HJH : 1 file  — probable past/visiting member; emitted, researcher stub inserted
--
-- Implementation notes:
--   GRM rows (non-NULL presenter_initial): ON CONFLICT ... DO UPDATE handles idempotency
--     via the composite PK (meeting_date, type, presenter_initial).
--   PB rows (presenter_initial IS NULL): PostgreSQL PK treats NULL ≠ NULL, so
--     ON CONFLICT cannot match NULL-keyed rows. We achieve idempotency by deleting
--     any existing PB row for that (meeting_date, type) before inserting, all inside
--     the same transaction.
--
-- Source files:
--   slides_path is relative to the NAS root (strip '/Volumes/CSNL_new-2/').
--   slides_format is the file extension lowercased.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. Researcher stubs for past/unknown members referenced as presenters
--    Insert with active=false so they don't appear as current lab members.
--    ON CONFLICT DO NOTHING keeps the seed data for any already-seeded members.
-- ---------------------------------------------------------------------------

insert into csnl_ops.researchers (initial, full_name, active)
values
  ('MJC', 'MJC (past member)', false),
  ('JHR', 'JHR (past member)', false),
  ('SYJ', 'SYJ (past member)', false),
  ('HJH', 'HJH (unknown)',     false)
on conflict (initial) do nothing;

-- ---------------------------------------------------------------------------
-- 1. GRM rows (presenter_initial IS NOT NULL)
--    ON CONFLICT on PK (meeting_date, type, presenter_initial) → refresh path/format
-- ---------------------------------------------------------------------------

insert into csnl_ops.lab_meetings
  (meeting_date, type, presenter_initial, slides_path, slides_format)
values
  ('2022-09-08', 'grm'::csnl_ops.lab_meeting_type, 'SK',  'GRM/GRM Archive/2022_GRM/2022.09.08/GRM_220908_SK.key', 'key'),
  ('2022-09-29', 'grm'::csnl_ops.lab_meeting_type, 'SK',  'GRM/GRM Archive/2022_GRM/2022.09.29/GRM_220929_SK.key', 'key'),
  ('2022-10-20', 'grm'::csnl_ops.lab_meeting_type, 'SK',  'GRM/GRM Archive/2022_GRM/2022.10.20/GRM_221020_SK.key', 'key'),
  ('2022-11-17', 'grm'::csnl_ops.lab_meeting_type, 'SK',  'GRM/GRM Archive/2022_GRM/2022.11.17/GRM_221117_SK.key', 'key'),
  ('2022-12-08', 'grm'::csnl_ops.lab_meeting_type, 'SK',  'GRM/GRM Archive/2022_GRM/2022.12.08/GRM_221208_SK.key', 'key'),
  ('2022-12-29', 'grm'::csnl_ops.lab_meeting_type, 'SK',  'GRM/GRM Archive/2022_GRM/2022.12.29/GRM_221229_SK.key', 'key'),
  ('2023-02-16', 'grm'::csnl_ops.lab_meeting_type, 'SK',  'GRM/GRM Archive/2023_GRM/2023.02.16/wastes/GRM_230216_SK.pdf', 'pdf'),
  ('2023-04-05', 'grm'::csnl_ops.lab_meeting_type, 'SK',  'GRM/GRM Archive/2023_GRM/2023.04.05/GRM_230405_SK.key', 'key'),
  ('2023-04-26', 'grm'::csnl_ops.lab_meeting_type, 'SK',  'GRM/GRM Archive/2023_GRM/2023.04.26/GRM_230426_SK.key', 'key'),
  ('2023-05-24', 'grm'::csnl_ops.lab_meeting_type, 'SK',  'GRM/GRM Archive/2023_GRM/2023.05.24/GRM_230524_SK.key', 'key'),
  ('2023-06-14', 'grm'::csnl_ops.lab_meeting_type, 'SK',  'GRM/GRM Archive/2023_GRM/2023.06.14/GRM_230614_SK.key', 'key'),
  ('2023-07-12', 'grm'::csnl_ops.lab_meeting_type, 'SK',  'GRM/GRM Archive/2023_GRM/2023.07.12/GRM_230712_SK.key', 'key'),
  ('2023-08-02', 'grm'::csnl_ops.lab_meeting_type, 'SK',  'GRM/GRM Archive/2023_GRM/2023.08.02/GRM_230802_SK.pdf', 'pdf'),
  ('2023-08-23', 'grm'::csnl_ops.lab_meeting_type, 'SK',  'GRM/GRM Archive/2023_GRM/2023.08.23/GRM_230823_SK.key', 'key'),
  ('2023-09-06', 'grm'::csnl_ops.lab_meeting_type, 'SK',  'GRM/GRM Archive/2023_GRM/2023.09.07/GRM_230906_SK.key', 'key'),
  ('2023-11-01', 'grm'::csnl_ops.lab_meeting_type, 'JHR', 'GRM/GRM Archive/2023_GRM/2023.11.01/GRM_231101_jhr.pdf', 'pdf'),
  ('2023-11-29', 'grm'::csnl_ops.lab_meeting_type, 'SK',  'GRM/GRM Archive/2023_GRM/2023.11.29/GRM_231129_SK.key', 'key'),
  ('2024-01-24', 'grm'::csnl_ops.lab_meeting_type, 'SK',  'GRM/GRM Archive/2024_GRM/20240124/GRM_240124_SK.key', 'key'),
  ('2024-04-22', 'grm'::csnl_ops.lab_meeting_type, 'JSL', 'GRM/2026/20260422/JSL_240422.pptx', 'pptx'),
  ('2024-09-24', 'grm'::csnl_ops.lab_meeting_type, 'JSL', 'GRM/GRM Archive/2024_GRM/20240925/JSL_240924.pptx', 'pptx'),
  ('2025-02-26', 'grm'::csnl_ops.lab_meeting_type, 'MSY', 'GRM/GRM Archive/2025_GRM/20250226/MSY_250226.pptx', 'pptx'),
  ('2025-04-09', 'grm'::csnl_ops.lab_meeting_type, 'JOP', 'GRM/GRM Archive/2025_GRM/20250409/Paper Blitz/JOP_250409.pptx', 'pptx'),
  ('2025-04-09', 'grm'::csnl_ops.lab_meeting_type, 'JSL', 'GRM/GRM Archive/2025_GRM/20250409/Paper Blitz/JSL_250409.pptx', 'pptx'),
  ('2025-04-09', 'grm'::csnl_ops.lab_meeting_type, 'MSY', 'GRM/GRM Archive/2025_GRM/20250409/MSY_250409.pptx', 'pptx'),
  ('2025-04-15', 'grm'::csnl_ops.lab_meeting_type, 'JSL', 'GRM/GRM Archive/2025_GRM/20250416/Paper Blitz/JSL_250415.pptx', 'pptx'),
  ('2025-04-16', 'grm'::csnl_ops.lab_meeting_type, 'JOP', 'GRM/GRM Archive/2025_GRM/20250416/Paper Blitz/JOP_250416.pptx', 'pptx'),
  ('2025-04-23', 'grm'::csnl_ops.lab_meeting_type, 'JOP', 'GRM/GRM Archive/2025_GRM/20250423/Paper Blitz/JOP_250423.pptx', 'pptx'),
  ('2025-04-23', 'grm'::csnl_ops.lab_meeting_type, 'SMJ', 'GRM/GRM Archive/2025_GRM/20250423/SMJ_250423.pdf', 'pdf'),
  ('2025-05-06', 'grm'::csnl_ops.lab_meeting_type, 'SK',  'GRM/GRM Archive/2025_GRM/20250507/GRM_250506_SK.pdf', 'pdf'),
  ('2025-05-14', 'grm'::csnl_ops.lab_meeting_type, 'JOP', 'GRM/GRM Archive/2025_GRM/20250514/GRM_250514_JOP.pptx', 'pptx'),
  ('2025-05-28', 'grm'::csnl_ops.lab_meeting_type, 'JOP', 'GRM/GRM Archive/2025_GRM/20250528/Paper Blitz/JOP_250528.pptx', 'pptx'),
  ('2025-05-28', 'grm'::csnl_ops.lab_meeting_type, 'SYJ', 'GRM/GRM Archive/2025_GRM/20250528/Paper Blitz/SYJ_250528.pptx', 'pptx'),
  ('2025-06-11', 'grm'::csnl_ops.lab_meeting_type, 'MSY', 'GRM/GRM Archive/2025_GRM/20250611/MSY_250611.pptx', 'pptx'),
  ('2025-06-25', 'grm'::csnl_ops.lab_meeting_type, 'SMJ', 'GRM/GRM Archive/2025_GRM/20250625/SMJ_250625.pdf', 'pdf'),
  ('2025-06-25', 'grm'::csnl_ops.lab_meeting_type, 'SYJ', 'GRM/GRM Archive/2025_GRM/20250625/Paper Blitz/SYJ_250625.pptx', 'pptx'),
  ('2025-07-02', 'grm'::csnl_ops.lab_meeting_type, 'SYJ', 'GRM/GRM Archive/2025_GRM/20250702/Paper Blitz/SYJ_250702.pptx', 'pptx'),
  ('2025-07-09', 'grm'::csnl_ops.lab_meeting_type, 'SYJ', 'GRM/GRM Archive/2025_GRM/20250709/Paper Blitz/SYJ_250709.pptx', 'pptx'),
  ('2025-07-16', 'grm'::csnl_ops.lab_meeting_type, 'MJC', 'GRM/GRM Archive/2025_GRM/20250716/Paper Blitz/MJC_250716.pptx', 'pptx'),
  ('2025-07-16', 'grm'::csnl_ops.lab_meeting_type, 'SK',  'GRM/GRM Archive/2025_GRM/20250716/GRM_250716_SK.pdf', 'pdf'),
  ('2025-08-13', 'grm'::csnl_ops.lab_meeting_type, 'MSY', 'GRM/GRM Archive/2025_GRM/20250813/MSY_250813.pptx', 'pptx'),
  ('2025-09-09', 'grm'::csnl_ops.lab_meeting_type, 'HJH', 'GRM/GRM Archive/2025_GRM/20250910/Paper Blitz/HJH_250909.pptx', 'pptx'),
  ('2025-09-24', 'grm'::csnl_ops.lab_meeting_type, 'JHR', 'GRM/GRM Archive/2025_GRM/20250924/GRM_250924_JHR.pdf', 'pdf'),
  ('2025-10-01', 'grm'::csnl_ops.lab_meeting_type, 'SMJ', 'GRM/GRM Archive/2025_GRM/20251001/SMJ_251001.pdf', 'pdf'),
  ('2025-11-12', 'grm'::csnl_ops.lab_meeting_type, 'MSY', 'GRM/GRM Archive/2025_GRM/20251112/MSY_251112.pdf', 'pdf'),
  ('2025-12-03', 'grm'::csnl_ops.lab_meeting_type, 'SMJ', 'GRM/GRM Archive/2025_GRM/20251203/SMJ_251203.pdf', 'pdf'),
  ('2026-01-07', 'grm'::csnl_ops.lab_meeting_type, 'MSY', 'GRM/2026/20260107/MSY_260107.pptx', 'pptx'),
  ('2026-01-21', 'grm'::csnl_ops.lab_meeting_type, 'JOP', 'GRM/2026/20260121/GRM_260121_JOP.pptx', 'pptx'),
  ('2026-02-11', 'grm'::csnl_ops.lab_meeting_type, 'JHR', 'GRM/2026/20260211/JHR_260211.pdf', 'pdf'),
  ('2026-03-11', 'grm'::csnl_ops.lab_meeting_type, 'SMJ', 'GRM/GRM Archive/2026_AI_Workshop/20260311/SMJ_260311.pdf', 'pdf'),
  ('2026-03-18', 'grm'::csnl_ops.lab_meeting_type, 'JHR', 'GRM/2026/20260318/JHR_260318.key', 'key'),
  ('2026-03-18', 'grm'::csnl_ops.lab_meeting_type, 'SK',  'GRM/2026/20260318/SK_260318.key', 'key'),
  ('2026-04-01', 'grm'::csnl_ops.lab_meeting_type, 'JYK', 'GRM/2026/20260401/JYK_260401.pptx', 'pptx'),
  ('2026-04-07', 'grm'::csnl_ops.lab_meeting_type, 'JSL', 'GRM/2026/20260408/JSL_260407.key', 'key'),
  ('2026-04-08', 'grm'::csnl_ops.lab_meeting_type, 'BYL', 'GRM/2026/20260408/BYL_260408.pdf', 'pdf'),
  ('2026-04-08', 'grm'::csnl_ops.lab_meeting_type, 'JOP', 'GRM/2026/20260408/JOP_260408.pptx', 'pptx'),
  ('2026-04-08', 'grm'::csnl_ops.lab_meeting_type, 'MSY', 'GRM/2026/20260408/MSY_260408.pdf', 'pdf'),
  ('2026-04-15', 'grm'::csnl_ops.lab_meeting_type, 'JOP', 'GRM/2026/20260415/JOP_260415.pptx', 'pptx'),
  ('2026-04-22', 'grm'::csnl_ops.lab_meeting_type, 'JHR', 'GRM/2026/20260422/JHR_260422.pdf', 'pdf'),
  ('2026-04-22', 'grm'::csnl_ops.lab_meeting_type, 'SK',  'GRM/2026/20260422/SK_260422.key', 'key'),
  ('2026-04-29', 'grm'::csnl_ops.lab_meeting_type, 'SMJ', 'GRM/2026/20260429/SMJ_260429.pdf', 'pdf')
on conflict (meeting_date, type, presenter_initial) do update
  set slides_path   = excluded.slides_path,
      slides_format = excluded.slides_format;

-- ---------------------------------------------------------------------------
-- 2. Paper-Blitz rows (presenter_initial IS NULL)
--    PostgreSQL PK: NULL ≠ NULL → ON CONFLICT cannot match NULL-keyed rows.
--    Idempotency strategy: DELETE existing row for (date, paper_blitz, NULL) first,
--    then INSERT. All inside this transaction so the operation is atomic.
-- ---------------------------------------------------------------------------

-- Delete any pre-existing PB rows for these dates (idempotent guard)
delete from csnl_ops.lab_meetings
 where type = 'paper_blitz'
   and presenter_initial is null
   and meeting_date in (
     '2025-02-26', '2025-03-05', '2025-03-12', '2025-03-19', '2025-03-26',
     '2025-04-02', '2025-04-09', '2025-04-16', '2025-04-23', '2025-04-30',
     '2025-05-07', '2025-05-14', '2025-05-28', '2025-06-04', '2025-06-11',
     '2025-06-18', '2025-06-25', '2025-07-02', '2025-07-08', '2025-07-09',
     '2025-07-16', '2025-07-23', '2025-07-30', '2025-08-06', '2025-08-13',
     '2025-08-20', '2025-08-27', '2025-09-03', '2025-09-10', '2025-09-17',
     '2025-09-24', '2025-10-01', '2025-10-15', '2025-10-22', '2025-10-29',
     '2025-11-12', '2025-11-19', '2025-11-26', '2025-12-03', '2025-12-10',
     '2025-12-17', '2025-12-24', '2025-12-31',
     '2026-01-07', '2026-01-14', '2026-01-21', '2026-01-28',
     '2026-02-04', '2026-02-11', '2026-04-01', '2026-04-15', '2026-04-29'
   );

insert into csnl_ops.lab_meetings
  (meeting_date, type, presenter_initial, slides_path, slides_format)
values
  ('2025-02-26', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250226/PB_250226.pdf', 'pdf'),
  ('2025-03-05', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250305/PB_250305.pdf', 'pdf'),
  ('2025-03-12', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250312/PB_250312.pdf', 'pdf'),
  ('2025-03-19', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250319/PB_250319.pdf', 'pdf'),
  ('2025-03-26', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250326/PB_250326.pdf', 'pdf'),
  ('2025-04-02', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250402/PB_250402.pdf', 'pdf'),
  ('2025-04-09', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250409/PB_250409.pdf', 'pdf'),
  ('2025-04-16', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250416/PB_250416.pdf', 'pdf'),
  ('2025-04-23', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250423/PB_250423.pdf', 'pdf'),
  ('2025-04-30', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250430/PB_250430.pdf', 'pdf'),
  ('2025-05-07', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250507/PB_250507.pdf', 'pdf'),
  ('2025-05-14', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250514/PB_250514.pdf', 'pdf'),
  ('2025-05-28', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250528/PB_250528.pdf', 'pdf'),
  ('2025-06-04', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250604/PB_250604.pdf', 'pdf'),
  ('2025-06-11', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250611/PB_250611.pdf', 'pdf'),
  ('2025-06-18', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250618/PB_250618.pdf', 'pdf'),
  ('2025-06-25', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250625/PB_250625.pdf', 'pdf'),
  ('2025-07-02', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250702/PB_250702.pdf', 'pdf'),
  ('2025-07-08', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250709/PB_250708.pptx', 'pptx'),
  ('2025-07-09', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250709/PB_250709.pdf', 'pdf'),
  ('2025-07-16', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250716/PB_250716.pdf', 'pdf'),
  ('2025-07-23', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250723/PB_250723.pdf', 'pdf'),
  ('2025-07-30', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250730/PB_250730.pdf', 'pdf'),
  ('2025-08-06', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250806/PB_250806.pdf', 'pdf'),
  ('2025-08-13', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250813/PB_250813.pdf', 'pdf'),
  ('2025-08-20', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250820/PB_250820.pdf', 'pdf'),
  ('2025-08-27', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250827/PB_250827.pdf', 'pdf'),
  ('2025-09-03', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250903/PB_250903.pdf', 'pdf'),
  ('2025-09-10', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250910/PB_250910.pdf', 'pdf'),
  ('2025-09-17', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250917/PB_250917.pdf', 'pdf'),
  ('2025-09-24', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20250924/PB_250924.pdf', 'pdf'),
  ('2025-10-01', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20251001/PB_251001.pdf', 'pdf'),
  ('2025-10-15', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20251015/PB_251015.pdf', 'pdf'),
  ('2025-10-22', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20251022/PB_251022.pdf', 'pdf'),
  ('2025-10-29', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20251029/PB_251029.pdf', 'pdf'),
  ('2025-11-12', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20251112/PB_251112.pdf', 'pdf'),
  ('2025-11-19', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20251119/PB_251119.pdf', 'pdf'),
  ('2025-11-26', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20251126/PB_251126.pdf', 'pdf'),
  ('2025-12-03', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20251203/PB_251203.pdf', 'pdf'),
  ('2025-12-10', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20251210/PB_251210.pdf', 'pdf'),
  ('2025-12-17', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20251217/PB_251217.pdf', 'pdf'),
  ('2025-12-24', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20251224/PB_251224.pdf', 'pdf'),
  ('2025-12-31', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/GRM Archive/2025_GRM/20251231/PB_251231.pdf', 'pdf'),
  ('2026-01-07', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/2026/20260107/PB_260107.pdf', 'pdf'),
  ('2026-01-14', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/2026/20260114/PB_260114.pdf', 'pdf'),
  ('2026-01-21', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/2026/20260121/PB_260121.pdf', 'pdf'),
  ('2026-01-28', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/2026/20260128/PB_260128.pdf', 'pdf'),
  ('2026-02-04', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/2026/20260204/PB_260204.pdf', 'pdf'),
  ('2026-02-11', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/2026/20260211/PB_260211.pdf', 'pdf'),
  ('2026-04-01', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/2026/20260401/PB_260401.pdf', 'pdf'),
  ('2026-04-15', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/2026/20260415/PB_260415.pdf', 'pdf'),
  ('2026-04-29', 'paper_blitz'::csnl_ops.lab_meeting_type, NULL, 'GRM/2026/20260429/PB_260429.pdf', 'pdf');

-- =============================================================================
-- Final row counts
--   GRM rows   : 60
--   PB rows    : 52
--   Total      : 112
--
-- Top-5 unknown presenter initials:
--   HJH : 1  (probable past/visiting member)
--   (no others found)
-- =============================================================================

commit;
