-- Phase A verification — paste into Supabase Dashboard SQL Editor.
--
-- Returns a single result grid with sections:
--   schema     : 1 row if csnl_ops schema exists
--   enum       : 3 rows (lab_meeting_type, annual_event_type, calendar_event_kind)
--   table      : 12 rows (one per csnl_ops table)
--   rowcount   : 12 rows (per-table count). Expect:
--                  researchers=8, grants=2, projects=15
--                  experiment_bookings=lab_meetings=milestone_meetings=cwll_entries
--                    =annual_events=nas_datasets=sync_anomalies
--                    =grm_presenters_observed=special_grm_presenters=0
--   pi         : 1 row showing PI (SL · Sang-Hun Lee · pi · true)
--   collisions : 1 row, value = 0  (no public.* tables shadow csnl_ops names)

with
schema_check as (
  select 'schema'::text as section, nspname::text as detail, null::bigint as count, 1 as ord
  from pg_namespace where nspname = 'csnl_ops'
),
enum_check as (
  select 'enum'::text as section,
         t.typname::text || ' [' || array_to_string(array_agg(e.enumlabel order by e.enumsortorder), ', ') || ']' as detail,
         null::bigint as count, 2 as ord
  from pg_type t
  join pg_namespace n on n.oid = t.typnamespace
  join pg_enum e on e.enumtypid = t.oid
  where n.nspname = 'csnl_ops'
  group by t.typname
),
table_check as (
  select 'table'::text as section, table_name::text as detail, null::bigint as count, 3 as ord
  from information_schema.tables
  where table_schema = 'csnl_ops' and table_type = 'BASE TABLE'
),
rowcounts as (
  select 'rowcount'::text as section, 'researchers' as detail, count(*)::bigint, 4 as ord from csnl_ops.researchers
  union all select 'rowcount', 'grants',                     count(*)::bigint, 4 from csnl_ops.grants
  union all select 'rowcount', 'projects',                   count(*)::bigint, 4 from csnl_ops.projects
  union all select 'rowcount', 'experiment_bookings',        count(*)::bigint, 4 from csnl_ops.experiment_bookings
  union all select 'rowcount', 'lab_meetings',               count(*)::bigint, 4 from csnl_ops.lab_meetings
  union all select 'rowcount', 'milestone_meetings',         count(*)::bigint, 4 from csnl_ops.milestone_meetings
  union all select 'rowcount', 'cwll_entries',               count(*)::bigint, 4 from csnl_ops.cwll_entries
  union all select 'rowcount', 'annual_events',              count(*)::bigint, 4 from csnl_ops.annual_events
  union all select 'rowcount', 'nas_datasets',               count(*)::bigint, 4 from csnl_ops.nas_datasets
  union all select 'rowcount', 'sync_anomalies',             count(*)::bigint, 4 from csnl_ops.sync_anomalies
  union all select 'rowcount', 'grm_presenters_observed',    count(*)::bigint, 4 from csnl_ops.grm_presenters_observed
  union all select 'rowcount', 'special_grm_presenters',     count(*)::bigint, 4 from csnl_ops.special_grm_presenters
),
pi_check as (
  select 'pi'::text as section,
         initial || ' · ' || full_name || ' · ' || role || ' · active=' || active::text as detail,
         null::bigint as count, 5 as ord
  from csnl_ops.researchers where role = 'pi'
),
public_collision_check as (
  select 'collisions'::text as section,
         'public.* tables that collide with csnl_ops names' as detail,
         count(*)::bigint, 6 as ord
  from information_schema.tables
  where table_schema = 'public'
    and table_name in (
      'researchers','grants','projects','experiment_bookings',
      'lab_meetings','milestone_meetings','cwll_entries',
      'annual_events','nas_datasets','sync_anomalies',
      'grm_presenters_observed','special_grm_presenters'
    )
)
select section, detail, count
from (
  select * from schema_check
  union all select * from enum_check
  union all select * from table_check
  union all select * from rowcounts
  union all select * from pi_check
  union all select * from public_collision_check
) all_checks
order by ord, detail;
