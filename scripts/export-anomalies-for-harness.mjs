/**
 * export-anomalies-for-harness.mjs
 *
 * Reads unpushed, unresolved anomalies of kinds mm_slides_missing and
 * grm_presenter_missing from csnl_ops.sync_anomalies, groups them by
 * target_initial, and writes a structured JSON inbox to:
 *   $HARNESS_ROOT/state/csnl_ops_inbox.json          (primary — active harness)
 *   /Volumes/CSNL_new-2/Memory/_lab_ai_harness/state/csnl_ops_inbox.json  (NAS mirror)
 *
 * ALSO writes a per-researcher experiment activity snapshot to:
 *   $HARNESS_ROOT/state/experiments_snapshot.json     (primary — active harness)
 *   /Volumes/CSNL_new-2/Memory/_lab_ai_harness/state/experiments_snapshot.json  (NAS mirror)
 *
 * HARNESS_ROOT defaults to /Users/csnl/csnl_on_ai/harness. NAS mirror writes
 * are best-effort (skipped silently if /Volumes/CSNL_new-2 is not mounted).
 *
 * ALSO includes experiment_ingest_anomalies rows with pushed_to_harness_at IS NULL
 * in the csnl_ops_inbox.json groups (under each researcher's initial or 'lab_wide').
 *
 * Both files are written atomically (tmp → rename). After a successful write,
 * pushed_to_harness_at is stamped on every exported row.
 *
 * Requirements:
 *   - Active harness state dir at $HARNESS_ROOT/state (must exist)
 *   - NAS mounted at /Volumes/CSNL_new-2 (optional — NAS writes skipped if absent)
 *   - .env.local at the csnl-ops project root
 *   - Node 22+
 *
 * CLI flags:
 *   --dry-run               Do everything except write the JSON and update DB.
 *   --include-kinds=<csv>   Override the default kind filter (comma-separated).
 *   --skip-experiments      Skip the experiments_snapshot.json write.
 *   --lookback-days=N       Days of experiment history for snapshot (default: 30).
 *
 * Exit codes:
 *   0  Success
 *   1  Env / auth / DB error
 *   2  Local harness state dir not found (HARNESS_ROOT misconfigured)
 */

import { existsSync, writeFileSync, renameSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_EXPERIMENTS = args.includes('--skip-experiments');

const includeKindsArg = args.find(a => a.startsWith('--include-kinds='));
const lookbackDaysArg = args.find(a => a.startsWith('--lookback-days='));
const EXPERIMENT_LOOKBACK_DAYS = lookbackDaysArg
  ? Math.max(1, parseInt(lookbackDaysArg.split('=')[1], 10) || 30)
  : 30;

const DEFAULT_KINDS = ['mm_slides_missing', 'grm_presenter_missing'];
const TARGET_KINDS = includeKindsArg
  ? includeKindsArg.replace('--include-kinds=', '').split(',').map(k => k.trim()).filter(Boolean)
  : DEFAULT_KINDS;

if (DRY_RUN) console.log('[dry-run] No file writes or DB updates will occur.');
if (includeKindsArg) console.log(`[override] kinds filter: ${TARGET_KINDS.join(', ')}`);

// ---------------------------------------------------------------------------
// Harness state paths — write to BOTH active local dir AND NAS mirror.
// Active harness runs from HARNESS_ROOT (default: /Users/csnl/csnl_on_ai/harness).
// NAS gets a copy via next mirror-to-nas.sh run (every 10 min), so writing
// directly here ensures no lag between export and harness pickup.
// ---------------------------------------------------------------------------
const HARNESS_ROOT      = process.env.HARNESS_ROOT ?? '/Users/csnl/csnl_on_ai/harness';
const LOCAL_STATE_DIR   = join(HARNESS_ROOT, 'state');
const NAS_STATE_DIR     = '/Volumes/CSNL_new-2/Memory/_lab_ai_harness/state';

// Active local paths (primary — harness reads from here)
const INBOX_PATH        = join(LOCAL_STATE_DIR, 'csnl_ops_inbox.json');
const INBOX_TMP_PATH    = join(LOCAL_STATE_DIR, 'csnl_ops_inbox.json.tmp');
const EXPERIMENTS_PATH  = join(LOCAL_STATE_DIR, 'experiments_snapshot.json');
const EXPERIMENTS_TMP   = join(LOCAL_STATE_DIR, 'experiments_snapshot.json.tmp');

// NAS mirror paths (secondary — for backup and NAS-side tooling)
const NAS_INBOX_PATH        = join(NAS_STATE_DIR, 'csnl_ops_inbox.json');
const NAS_INBOX_TMP_PATH    = join(NAS_STATE_DIR, 'csnl_ops_inbox.json.tmp');
const NAS_EXPERIMENTS_PATH  = join(NAS_STATE_DIR, 'experiments_snapshot.json');
const NAS_EXPERIMENTS_TMP   = join(NAS_STATE_DIR, 'experiments_snapshot.json.tmp');
const NAS_AVAILABLE         = existsSync(NAS_STATE_DIR);

if (!existsSync(LOCAL_STATE_DIR)) {
  console.error(`ERROR: Local harness state dir not found — ${LOCAL_STATE_DIR}`);
  console.error(`Set HARNESS_ROOT env var if harness is at a non-default path.`);
  process.exit(2);
}
if (!NAS_AVAILABLE) {
  console.warn(`WARN: NAS state dir not found — ${NAS_STATE_DIR}`);
  console.warn('NAS mirror write will be skipped. Mount NAS with: open smb://147.47.70.15/CSNL_new');
}

// ---------------------------------------------------------------------------
// .env.local loader  (verbatim from resolve-mm-slides.mjs)
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
// Korean summary templates
// ---------------------------------------------------------------------------

/**
 * Format a meeting_date string (YYYY-MM-DD) to a display form (YYYY-MM-DD).
 * Kept as-is; harness can localise further.
 */
function fmtDate(isoDate) {
  return isoDate; // e.g. "2026-03-12"
}

/**
 * Derive the yymmdd token from a YYYY-MM-DD string.
 */
function toYymmdd(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return year.slice(2) + month + day;
}

/**
 * Build a Korean one-sentence summary for each anomaly kind.
 *
 * mm_slides_missing:
 *   "{date} Milestone Meeting 슬라이드 (MM_{yymmdd}.pptx) NAS 미업로드 —
 *    Memory/{INIT}/<project>/Results/ 에 올려주세요."
 *
 * grm_presenter_missing:
 *   "{date} GRM 발표자가 NAS 파일로 식별 안 됨 —
 *    발표자 알려주시면 lab_meetings 에 backfill 합니다."
 *
 * unmapped_email (experiment_ingest_anomalies):
 *   "{email} 이메일이 연구원 목록에 없어 실험 데이터 연결 불가 — 관리자 확인 필요."
 */
function buildSummaryKo(kind, payload) {
  switch (kind) {
    case 'mm_slides_missing': {
      const date   = fmtDate(payload.meeting_date ?? '');
      const yymmdd = toYymmdd(payload.meeting_date ?? '0000-00-00');
      const init   = (payload.researcher_initial ?? 'INIT').toUpperCase();
      return `${date} Milestone Meeting 슬라이드 (MM_${yymmdd}.pptx) NAS 미업로드 — Memory/${init}/<project>/Results/ 에 올려주세요.`;
    }
    case 'grm_presenter_missing': {
      const date = fmtDate(payload.meeting_date ?? payload.event_date ?? '');
      return `${date} GRM 발표자가 NAS 파일로 식별 안 됨 — 발표자 알려주시면 lab_meetings 에 backfill 합니다.`;
    }
    case 'unmapped_email': {
      const email = payload.unmapped_email ?? payload.email ?? '(unknown)';
      return `${email} 이메일이 연구원 목록에 없어 실험 데이터 연결 불가 — 관리자 확인 필요.`;
    }
    default:
      return `[${kind}] 이상 감지됨.`;
  }
}

/**
 * Extract a minimal context object from the payload (drop large arrays).
 */
function buildContext(kind, payload) {
  switch (kind) {
    case 'mm_slides_missing':
      return {
        meeting_date:        payload.meeting_date,
        researcher_initial:  payload.researcher_initial,
      };
    case 'grm_presenter_missing':
      return {
        meeting_date: payload.meeting_date ?? payload.event_date,
        event_title:  payload.event_title ?? null,
        calendar_id:  payload.calendar_id ?? null,
      };
    case 'unmapped_email':
      return {
        unmapped_email: payload.unmapped_email ?? payload.email ?? null,
        booking_count:  payload.booking_count ?? null,
      };
    default:
      return payload;
  }
}

/**
 * Derive the target_initial for grouping.
 *   mm_slides_missing     → payload.researcher_initial  (string)
 *   grm_presenter_missing → null (unknown presenter → lab_wide bucket)
 *   unmapped_email        → null (no initial known → lab_wide bucket)
 */
function deriveTargetInitial(kind, payload) {
  if (kind === 'mm_slides_missing') {
    return payload.researcher_initial ?? null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main — Part 1: sync_anomalies (original logic, unchanged)
// ---------------------------------------------------------------------------
console.log(`export-anomalies-for-harness (dry-run=${DRY_RUN})`);
console.log(`Kinds filter : ${TARGET_KINDS.join(', ')}`);
console.log(`Inbox target : ${INBOX_PATH} (local)`);
if (NAS_AVAILABLE) console.log(`              ${NAS_INBOX_PATH} (NAS mirror)`);
console.log('─'.repeat(70));

// Fetch unpushed, unresolved anomalies from sync_anomalies
const { data: rows, error: fetchErr } = await supabase
  .from('sync_anomalies')
  .select('id, kind, payload, source_id, source_kind, created_at')
  .in('kind', TARGET_KINDS)
  .is('pushed_to_harness_at', null)
  .is('resolved_at', null)
  .order('created_at', { ascending: false });

if (fetchErr) {
  console.error(`ERROR: Failed to fetch sync_anomalies: ${fetchErr.message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Part 1b: experiment_ingest_anomalies (pushed_to_harness_at IS NULL)
// ---------------------------------------------------------------------------
const { data: expAnomalyRows, error: expAnomalyErr } = await supabase
  .from('experiment_ingest_anomalies')
  .select('id, anomaly_type, source_booking_id, unmapped_email, details, first_seen_at')
  .is('pushed_to_harness_at', null)
  .is('resolved_at', null)
  .order('first_seen_at', { ascending: false });

if (expAnomalyErr) {
  console.warn(`WARN: Failed to fetch experiment_ingest_anomalies: ${expAnomalyErr.message}`);
  // Non-fatal — proceed with sync_anomalies only
}

const expAnomalies = expAnomalyRows ?? [];
console.log(`Fetched ${expAnomalies.length} experiment ingest anomaly row(s).`);

// Normalize experiment ingest anomalies into the same shape as sync_anomalies rows
const normalizedExpAnomalies = expAnomalies.map(r => ({
  id: r.id,
  kind: r.anomaly_type,
  payload: {
    ...(r.details ?? {}),
    unmapped_email: r.unmapped_email,
    source_booking_id: r.source_booking_id,
  },
  source_id: r.source_booking_id ?? null,
  source_kind: 'experiment_ingest',
  created_at: r.first_seen_at,
  _table: 'experiment_ingest_anomalies', // marker for stamp logic below
}));

const allRows = [...(rows ?? []), ...normalizedExpAnomalies];

if (allRows.length === 0 && SKIP_EXPERIMENTS) {
  console.log('No unpushed anomalies found and --skip-experiments set — nothing to export.');
  process.exit(0);
}

if (allRows.length > 0) {
  console.log(`Total anomaly rows to export: ${allRows.length}`);
}

// ---------------------------------------------------------------------------
// Group by target_initial (null → 'lab_wide')
// ---------------------------------------------------------------------------
/** @type {Record<string, Array<object>>} */
const groups = {};
const totals = {};
const pushedSyncIds = [];
const pushedExpIds = [];

for (const row of allRows) {
  const { id, kind, payload, created_at } = row;
  const initial = deriveTargetInitial(kind, payload ?? {});
  const bucket  = initial ?? 'lab_wide';

  if (!groups[bucket]) groups[bucket] = [];

  groups[bucket].push({
    id,
    kind,
    summary_ko: buildSummaryKo(kind, payload ?? {}),
    context:    buildContext(kind, payload ?? {}),
    created_at,
  });

  totals[kind] = (totals[kind] ?? 0) + 1;

  if (row._table === 'experiment_ingest_anomalies') {
    pushedExpIds.push(id);
  } else {
    pushedSyncIds.push(id);
  }
}

// Sort buckets: named initials first (alphabetical), then lab_wide last
const sortedGroups = {};
const bucketKeys = Object.keys(groups).sort((a, b) => {
  if (a === 'lab_wide') return 1;
  if (b === 'lab_wide') return -1;
  return a.localeCompare(b);
});
for (const k of bucketKeys) sortedGroups[k] = { anomalies: groups[k] };

// ---------------------------------------------------------------------------
// Build final inbox JSON payload
// ---------------------------------------------------------------------------
const inboxPayload = {
  generated_at:   new Date().toISOString(),
  schema_version: 1,
  source:         'csnl-ops',
  groups:         sortedGroups,
  totals,
};

const inboxJson = JSON.stringify(inboxPayload, null, 2);

// ---------------------------------------------------------------------------
// Print summary before writing
// ---------------------------------------------------------------------------
console.log('');
console.log('='.repeat(70));
console.log('EXPORT SUMMARY — inbox');
console.log('='.repeat(70));
console.log(`Total anomalies  : ${allRows.length}`);
for (const [kind, count] of Object.entries(totals)) {
  console.log(`  ${kind.padEnd(30)}: ${count}`);
}
console.log('By initial/bucket:');
for (const bucket of bucketKeys) {
  console.log(`  ${bucket.padEnd(12)}: ${groups[bucket].length}`);
}

// ---------------------------------------------------------------------------
// Main — Part 2: experiments_snapshot.json
// ---------------------------------------------------------------------------

let experimentsSnapshotJson = null;
let lastIngestAt = null;

if (!SKIP_EXPERIMENTS) {
  const cutoff = new Date(Date.now() - EXPERIMENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Find the most recent ingested_at across all experiments (not just lookback window)
  const { data: latestIngest } = await supabase
    .from('behavioral_experiments')
    .select('ingested_at')
    .order('ingested_at', { ascending: false })
    .limit(1);
  lastIngestAt = latestIngest?.[0]?.ingested_at ?? null;

  // Fetch experiments within lookback window
  const { data: experiments, error: expErr } = await supabase
    .from('behavioral_experiments')
    .select(
      'id, researcher_initial, experiment_id, experiment_title, experiment_mode, ' +
      'categories, protocol_version, parameter_schema, offline_code_analysis, ' +
      'condition_assignment, data_path, code_repo_url, subject_number, ' +
      'session_number, location_name, slot_start, slot_end, completed_at, ' +
      'online_verified_at, data_quality, exclusion_flag, exclusion_reason, ' +
      'is_pilot, blocks_submitted, attention_fail_count, was_auto_completed, ' +
      'notable_observations, source_booking_id, ingested_at'
    )
    .gte('completed_at', cutoff)
    .order('completed_at', { ascending: false });

  if (expErr) {
    console.warn(`WARN: Failed to fetch behavioral_experiments: ${expErr.message}`);
    console.warn('experiments_snapshot.json will be skipped.');
  } else {
    const expRows = experiments ?? [];
    console.log(`\nFetched ${expRows.length} behavioral_experiments row(s) in last ${EXPERIMENT_LOOKBACK_DAYS}d.`);

    // Count unmapped anomalies (for meta field)
    const { count: unmappedCount } = await supabase
      .from('experiment_ingest_anomalies')
      .select('id', { count: 'exact', head: true })
      .eq('anomaly_type', 'unmapped_email')
      .is('resolved_at', null);

    // Group by researcher_initial (skip rows with null initial — unmapped)
    /** @type {Record<string, { rows: object[], by_category: Record<string, number>, n_pilot: number, n_sessions: number, n_subjects: number, last_session_at: string | null }>} */
    const byResearcher = {};

    for (const exp of expRows) {
      const init = exp.researcher_initial;
      if (!init) continue; // unmapped — excluded from per-researcher rollup

      if (!byResearcher[init]) {
        byResearcher[init] = {
          rows:          [],
          by_category:   {},
          n_pilot:       0,
          n_sessions:    0,
          n_subjects:    0,
          last_session_at: null,
        };
      }

      const bucket = byResearcher[init];
      bucket.rows.push(exp);
      bucket.n_sessions++;
      if (exp.subject_number != null) bucket.n_subjects++;
      if (exp.is_pilot) bucket.n_pilot++;
      if (!bucket.last_session_at || exp.completed_at > bucket.last_session_at) {
        bucket.last_session_at = exp.completed_at;
      }

      // Accumulate category counts
      const cats = exp.categories ?? [];
      for (const cat of cats) {
        bucket.by_category[cat] = (bucket.by_category[cat] ?? 0) + 1;
      }
      // If no categories, bucket as 'uncategorized'
      if (cats.length === 0) {
        bucket.by_category['uncategorized'] = (bucket.by_category['uncategorized'] ?? 0) + 1;
      }
    }

    // Build output shape
    const researchersOutput = {};
    for (const [init, bucket] of Object.entries(byResearcher)) {
      researchersOutput[init] = {
        recent_experiments: bucket.rows.slice(0, 10), // newest first (already sorted)
        experiment_activity_30d: {
          n_sessions:      bucket.n_sessions,
          n_subjects:      bucket.n_subjects,
          by_category:     bucket.by_category,
          n_pilot:         bucket.n_pilot,
          last_session_at: bucket.last_session_at,
        },
      };
    }

    const snapshotPayload = {
      generated_at:             new Date().toISOString(),
      last_ingest_at:           lastIngestAt,
      lookback_days:            EXPERIMENT_LOOKBACK_DAYS,
      researchers:              researchersOutput,
      unmapped_anomalies_count: unmappedCount ?? 0,
    };

    experimentsSnapshotJson = JSON.stringify(snapshotPayload, null, 2);

    console.log('');
    console.log('='.repeat(70));
    console.log('EXPORT SUMMARY — experiments_snapshot');
    console.log('='.repeat(70));
    console.log(`Researchers with data : ${Object.keys(researchersOutput).length}`);
    console.log(`Unmapped anomalies    : ${unmappedCount ?? 0}`);
    for (const [init, data] of Object.entries(researchersOutput)) {
      console.log(`  ${init.padEnd(8)}: ${data.experiment_activity_30d.n_sessions} session(s)`);
    }
  }
}

// ---------------------------------------------------------------------------
// Dry-run exit
// ---------------------------------------------------------------------------

if (DRY_RUN) {
  console.log('');
  console.log('[dry-run] Would write inbox:');
  console.log(inboxJson);
  if (experimentsSnapshotJson) {
    console.log('');
    console.log('[dry-run] Would write experiments_snapshot:');
    console.log(experimentsSnapshotJson);
  }
  console.log('');
  console.log('[dry-run] No files written, no DB rows updated.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// If no anomalies AND no experiment snapshot, exit cleanly
// ---------------------------------------------------------------------------
if (allRows.length === 0 && !experimentsSnapshotJson) {
  console.log('No unpushed anomalies found and no experiments to snapshot — nothing to export.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Atomic write: inbox (only if there are anomalies)
// ---------------------------------------------------------------------------
if (allRows.length > 0) {
  // Primary: local active state dir
  try {
    writeFileSync(INBOX_TMP_PATH, inboxJson, 'utf8');
    renameSync(INBOX_TMP_PATH, INBOX_PATH);
    console.log(`\nWrote inbox → ${INBOX_PATH} (local)`);
  } catch (err) {
    console.error(`ERROR: Failed to write inbox JSON to local state: ${err.message}`);
    process.exit(1);
  }
  // Secondary: NAS mirror (best-effort)
  if (NAS_AVAILABLE) {
    try {
      writeFileSync(NAS_INBOX_TMP_PATH, inboxJson, 'utf8');
      renameSync(NAS_INBOX_TMP_PATH, NAS_INBOX_PATH);
      console.log(`Wrote inbox → ${NAS_INBOX_PATH} (NAS mirror)`);
    } catch (err) {
      console.warn(`WARN: NAS inbox write failed (non-fatal): ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Atomic write: experiments_snapshot
// ---------------------------------------------------------------------------
if (experimentsSnapshotJson) {
  // Primary: local active state dir
  try {
    writeFileSync(EXPERIMENTS_TMP, experimentsSnapshotJson, 'utf8');
    renameSync(EXPERIMENTS_TMP, EXPERIMENTS_PATH);
    console.log(`Wrote experiments_snapshot → ${EXPERIMENTS_PATH} (local)`);
  } catch (err) {
    console.error(`ERROR: Failed to write experiments_snapshot JSON to local state: ${err.message}`);
    // Non-fatal — inbox write already succeeded
  }
  // Secondary: NAS mirror (best-effort)
  if (NAS_AVAILABLE) {
    try {
      writeFileSync(NAS_EXPERIMENTS_TMP, experimentsSnapshotJson, 'utf8');
      renameSync(NAS_EXPERIMENTS_TMP, NAS_EXPERIMENTS_PATH);
      console.log(`Wrote experiments_snapshot → ${NAS_EXPERIMENTS_PATH} (NAS mirror)`);
    } catch (err) {
      console.warn(`WARN: NAS experiments_snapshot write failed (non-fatal): ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Stamp pushed_to_harness_at on sync_anomalies rows
// ---------------------------------------------------------------------------
if (pushedSyncIds.length > 0) {
  const { error: syncUpdateErr } = await supabase
    .from('sync_anomalies')
    .update({ pushed_to_harness_at: new Date().toISOString() })
    .in('id', pushedSyncIds);

  if (syncUpdateErr) {
    console.error(`WARN: Inbox written but sync_anomalies stamp failed: ${syncUpdateErr.message}`);
    console.error('Re-running will re-export the same rows — idempotent but noisy.');
  } else {
    console.log(`Stamped pushed_to_harness_at on ${pushedSyncIds.length} sync_anomalies row(s).`);
  }
}

// ---------------------------------------------------------------------------
// Stamp pushed_to_harness_at on experiment_ingest_anomalies rows
// ---------------------------------------------------------------------------
if (pushedExpIds.length > 0) {
  const { error: expUpdateErr } = await supabase
    .from('experiment_ingest_anomalies')
    .update({ pushed_to_harness_at: new Date().toISOString() })
    .in('id', pushedExpIds);

  if (expUpdateErr) {
    console.error(`WARN: Inbox written but experiment_ingest_anomalies stamp failed: ${expUpdateErr.message}`);
    console.error('Re-running will re-export the same rows — idempotent but noisy.');
  } else {
    console.log(`Stamped pushed_to_harness_at on ${pushedExpIds.length} experiment_ingest_anomalies row(s).`);
  }
}
