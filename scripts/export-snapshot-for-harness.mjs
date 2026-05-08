/**
 * export-snapshot-for-harness.mjs
 *
 * Builds a comprehensive csnl_ops SNAPSHOT and writes it to:
 *   /Volumes/CSNL_new-2/Memory/_lab_ai_harness/state/csnl_ops_snapshot.json
 *
 * The harness's weekly_corpus_sync.py reads state/ files. This snapshot is
 * the authoritative source for researchers / projects / grants / anomaly-stats
 * so the harness does not have to re-derive them from scratch.
 *
 * Requirements:
 *   - NAS mounted at /Volumes/CSNL_new-2
 *   - .env.local at the csnl-ops project root
 *   - Node 22+
 *
 * CLI flags:
 *   --dry-run           Fetch all data and print summary; don't write file.
 *   --target=<path>     Override default output path (useful for local testing).
 *
 * Exit codes:
 *   0  Success
 *   1  Env / auth / DB error
 *   2  NAS / harness state dir not mounted
 */

import { existsSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

const targetArg = args.find(a => a.startsWith('--target='));
const DEFAULT_SNAPSHOT_PATH =
  '/Volumes/CSNL_new-2/Memory/_lab_ai_harness/state/csnl_ops_snapshot.json';
const SNAPSHOT_PATH = targetArg
  ? targetArg.replace('--target=', '')
  : DEFAULT_SNAPSHOT_PATH;
const SNAPSHOT_TMP_PATH = SNAPSHOT_PATH + '.tmp';

if (DRY_RUN) console.log('[dry-run] No file writes will occur.');
if (targetArg) console.log(`[override] output target: ${SNAPSHOT_PATH}`);

// ---------------------------------------------------------------------------
// NAS / harness state pre-flight
// ---------------------------------------------------------------------------
const HARNESS_STATE_DIR = '/Volumes/CSNL_new-2/Memory/_lab_ai_harness/state';

// Only enforce NAS mount when writing to the default NAS path
const requiresNasMount = !targetArg || SNAPSHOT_PATH.startsWith('/Volumes/CSNL_new-2');

if (requiresNasMount && !existsSync(HARNESS_STATE_DIR)) {
  console.error(`ERROR: Harness state dir not found — ${HARNESS_STATE_DIR}`);
  console.error('Mount NAS with: open smb://147.47.70.15/CSNL_new');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// .env.local loader  (verbatim from export-anomalies-for-harness.mjs)
// ---------------------------------------------------------------------------
const ENV_FILE = resolve(new URL('.', import.meta.url).pathname, '../.env.local');

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  if (existsSync(ENV_FILE)) {
    const raw = readFileSync(ENV_FILE, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const k = trimmed.slice(0, eq).trim();
      let v = trimmed.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      v = v.replace(/\\n/g, '\n');
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_URL.trim()) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL not set');
  process.exit(1);
}
if (!SERVICE_KEY || !SERVICE_KEY.trim()) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY not set');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Supabase client (service-role, csnl_ops schema)
// ---------------------------------------------------------------------------
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  db: { schema: 'csnl_ops' },
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Throw a human-readable error if a Supabase response has an error.
 * @param {string} label
 * @param {{ data: unknown, error: unknown }} result
 */
function assertOk(label, { data, error }) {
  if (error) {
    console.error(`ERROR: Failed to fetch ${label}: ${error.message ?? JSON.stringify(error)}`);
    process.exit(1);
  }
  return data;
}

/**
 * Derive researcher status from DB fields.
 * @param {{ active: boolean, defended_on: string|null }} r
 * @returns {'active'|'alumni'|'inactive'}
 */
function deriveStatus(r) {
  if (r.active) return 'active';
  if (r.defended_on) return 'alumni';
  return 'inactive';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
console.log(`export-snapshot-for-harness (dry-run=${DRY_RUN})`);
console.log(`Snapshot target : ${SNAPSHOT_PATH}`);
console.log('─'.repeat(70));

// ---------------------------------------------------------------------------
// Parallel fetches — all seven queries fire at once
// ---------------------------------------------------------------------------
const [
  researchersResult,
  projectsResult,
  grantsResult,
  anomalyStatsResult,
  labMeetingRollupResult,
  milestoneMeetingRollupResult,
  experimentBookingRollupResult,
] = await Promise.all([
  // 1. Researchers — all rows
  supabase
    .from('researchers')
    .select('initial, full_name, role, email, active, joined_on, candidacy_on, defended_on'),

  // 2. Projects — all rows
  supabase
    .from('projects')
    .select('code, full_name, lead_initial, software, active'),

  // 3. Grants — all rows
  supabase
    .from('grants')
    .select('code, title, category, pi_initial, start_date, end_date, status'),

  // 4. Anomaly stats — unresolved, grouped by kind
  supabase
    .from('sync_anomalies')
    .select('kind')
    .is('resolved_at', null),

  // 5. Lab-meeting roll-up by type
  supabase
    .from('lab_meetings')
    .select('type'),

  // 6. Milestone-meeting roll-up
  supabase
    .from('milestone_meetings')
    .select('slides_path'),

  // 7. Experiment-booking roll-up by event_kind
  supabase
    .from('experiment_bookings')
    .select('event_kind'),
]);

// Assert all succeeded
const rawResearchers       = assertOk('researchers', researchersResult);
const rawProjects          = assertOk('projects', projectsResult);
const rawGrants            = assertOk('grants', grantsResult);
const rawAnomalyRows       = assertOk('sync_anomalies (stats)', anomalyStatsResult);
const rawLabMeetings       = assertOk('lab_meetings', labMeetingRollupResult);
const rawMilestoneMeetings = assertOk('milestone_meetings', milestoneMeetingRollupResult);
const rawExperimentBookings = assertOk('experiment_bookings', experimentBookingRollupResult);

// ---------------------------------------------------------------------------
// Transform researchers
// ---------------------------------------------------------------------------
const researchers = (rawResearchers ?? [])
  .map(r => ({
    initial:      r.initial,
    full_name:    r.full_name,
    role:         r.role,
    email:        r.email,
    status:       deriveStatus(r),
    active:       r.active,
    joined_on:    r.joined_on ?? null,
    candidacy_on: r.candidacy_on ?? null,
    defended_on:  r.defended_on ?? null,
  }))
  .sort((a, b) => {
    // Active first, then alumni/inactive; within each group sort by initial
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (a.status !== 'active' && b.status === 'active') return 1;
    return (a.initial ?? '').localeCompare(b.initial ?? '');
  });

// ---------------------------------------------------------------------------
// Transform projects
// ---------------------------------------------------------------------------
const projects = (rawProjects ?? [])
  .map(p => ({
    code:         p.code,
    full_name:    p.full_name,
    lead_initial: p.lead_initial,
    software:     p.software ?? [],
    active:       p.active,
  }))
  .sort((a, b) => {
    const li = (a.lead_initial ?? '').localeCompare(b.lead_initial ?? '');
    if (li !== 0) return li;
    return (a.code ?? '').localeCompare(b.code ?? '');
  });

// ---------------------------------------------------------------------------
// Transform grants
// ---------------------------------------------------------------------------
const grants = (rawGrants ?? [])
  .map(g => ({
    code:       g.code,
    title:      g.title,
    category:   g.category,
    pi_initial: g.pi_initial,
    start_date: g.start_date ?? null,
    end_date:   g.end_date ?? null,
    status:     g.status,
  }))
  .sort((a, b) => (a.code ?? '').localeCompare(b.code ?? ''));

// ---------------------------------------------------------------------------
// Build stats
// ---------------------------------------------------------------------------

// Anomalies by kind (client-side group-by — avoids needing RPC)
/** @type {Record<string, number>} */
const anomaliesByKind = {};
for (const row of rawAnomalyRows ?? []) {
  const k = row.kind ?? 'unknown';
  anomaliesByKind[k] = (anomaliesByKind[k] ?? 0) + 1;
}

// Lab meetings by type
/** @type {Record<string, number>} */
const labMeetingsByType = {};
for (const row of rawLabMeetings ?? []) {
  const t = row.type ?? 'unknown';
  labMeetingsByType[t] = (labMeetingsByType[t] ?? 0) + 1;
}

// Milestone meetings total + with_slides
const milestoneMeetingsTotal = (rawMilestoneMeetings ?? []).length;
const milestoneMeetingsWithSlides = (rawMilestoneMeetings ?? []).filter(
  r => r.slides_path != null
).length;

// Experiment bookings by event_kind
/** @type {Record<string, number>} */
const experimentBookingsByKind = {};
for (const row of rawExperimentBookings ?? []) {
  const k = row.event_kind ?? 'unknown';
  experimentBookingsByKind[k] = (experimentBookingsByKind[k] ?? 0) + 1;
}

const stats = {
  anomalies_by_kind:        anomaliesByKind,
  lab_meetings_by_type:     labMeetingsByType,
  milestone_meetings: {
    total:       milestoneMeetingsTotal,
    with_slides: milestoneMeetingsWithSlides,
  },
  experiment_bookings_by_kind: experimentBookingsByKind,
};

// ---------------------------------------------------------------------------
// Row counts for metadata
// ---------------------------------------------------------------------------
const rowCounts = {
  researchers:          researchers.length,
  projects:             projects.length,
  grants:               grants.length,
  lab_meetings:         (rawLabMeetings ?? []).length,
  milestone_meetings:   milestoneMeetingsTotal,
  experiment_bookings:  (rawExperimentBookings ?? []).length,
  sync_anomalies:       (rawAnomalyRows ?? []).length,
};

// ---------------------------------------------------------------------------
// Build final JSON payload
// ---------------------------------------------------------------------------
const snapshot = {
  generated_at:   new Date().toISOString(),
  schema_version: 1,
  source:         'csnl-ops',
  researchers,
  projects,
  grants,
  stats,
  metadata: {
    row_counts:                  rowCounts,
    csnl_ops_repo:               'csnl-ops',
    csnl_ops_supabase_project_ref: 'qjhzjqkrbvsnwlbpilio',
  },
};

const snapshotJson = JSON.stringify(snapshot, null, 2);
const snapshotBytes = Buffer.byteLength(snapshotJson, 'utf8');

// ---------------------------------------------------------------------------
// Print summary
// ---------------------------------------------------------------------------
console.log('');
console.log('='.repeat(70));
console.log('SNAPSHOT SUMMARY');
console.log('='.repeat(70));
console.log(`Researchers      : ${rowCounts.researchers} (active: ${researchers.filter(r => r.status === 'active').length}, alumni: ${researchers.filter(r => r.status === 'alumni').length})`);
console.log(`Projects         : ${rowCounts.projects}`);
console.log(`Grants           : ${rowCounts.grants}`);
console.log(`Lab meetings     : ${rowCounts.lab_meetings}`);
console.log(`Milestone mtgs   : ${rowCounts.milestone_meetings} (with slides: ${milestoneMeetingsWithSlides})`);
console.log(`Experiment bookings : ${rowCounts.experiment_bookings}`);
console.log(`Sync anomalies (unresolved) : ${rowCounts.sync_anomalies}`);
console.log('');
console.log('stats.anomalies_by_kind:');
if (Object.keys(anomaliesByKind).length === 0) {
  console.log('  (none)');
} else {
  for (const [kind, count] of Object.entries(anomaliesByKind)) {
    console.log(`  ${kind.padEnd(35)}: ${count}`);
  }
}
console.log('stats.lab_meetings_by_type:');
for (const [type, count] of Object.entries(labMeetingsByType)) {
  console.log(`  ${type.padEnd(35)}: ${count}`);
}
console.log('stats.milestone_meetings:');
console.log(`  total       : ${milestoneMeetingsTotal}`);
console.log(`  with_slides : ${milestoneMeetingsWithSlides}`);
console.log('stats.experiment_bookings_by_kind:');
if (Object.keys(experimentBookingsByKind).length === 0) {
  console.log('  (none)');
} else {
  for (const [kind, count] of Object.entries(experimentBookingsByKind)) {
    console.log(`  ${kind.padEnd(35)}: ${count}`);
  }
}
console.log('');
console.log(`Output           : ${SNAPSHOT_PATH}`);
console.log(`Size             : ${snapshotBytes.toLocaleString()} bytes`);

if (DRY_RUN) {
  console.log('');
  console.log('[dry-run] Would write:');
  console.log(snapshotJson);
  console.log('');
  console.log('[dry-run] No file written.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Atomic write: .tmp → rename, permissions 0o644
// ---------------------------------------------------------------------------
try {
  writeFileSync(SNAPSHOT_TMP_PATH, snapshotJson, { encoding: 'utf8', mode: 0o644 });
  chmodSync(SNAPSHOT_TMP_PATH, 0o644);
  renameSync(SNAPSHOT_TMP_PATH, SNAPSHOT_PATH);
  console.log(`\nWrote snapshot → ${SNAPSHOT_PATH}`);
  console.log(`Total bytes     : ${snapshotBytes.toLocaleString()}`);
} catch (err) {
  console.error(`ERROR: Failed to write snapshot JSON: ${err.message}`);
  process.exit(1);
}
