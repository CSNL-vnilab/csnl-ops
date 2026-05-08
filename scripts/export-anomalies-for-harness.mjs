/**
 * export-anomalies-for-harness.mjs
 *
 * Reads unpushed, unresolved anomalies of kinds mm_slides_missing and
 * grm_presenter_missing from csnl_ops.sync_anomalies, groups them by
 * target_initial, and writes a structured JSON inbox to:
 *   /Volumes/CSNL_new-2/Memory/_lab_ai_harness/state/csnl_ops_inbox.json
 *
 * The file is written atomically (tmp → rename). After a successful write,
 * pushed_to_harness_at is stamped on every exported row.
 *
 * Requirements:
 *   - NAS mounted at /Volumes/CSNL_new-2
 *   - .env.local at the csnl-ops project root
 *   - Node 22+
 *
 * CLI flags:
 *   --dry-run               Do everything except write the JSON and update DB.
 *   --include-kinds=<csv>   Override the default kind filter (comma-separated).
 *
 * Exit codes:
 *   0  Success
 *   1  Env / auth / DB error
 *   2  NAS / harness state dir not mounted
 */

import { existsSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

const includeKindsArg = args.find(a => a.startsWith('--include-kinds='));
const DEFAULT_KINDS = ['mm_slides_missing', 'grm_presenter_missing'];
const TARGET_KINDS = includeKindsArg
  ? includeKindsArg.replace('--include-kinds=', '').split(',').map(k => k.trim()).filter(Boolean)
  : DEFAULT_KINDS;

if (DRY_RUN) console.log('[dry-run] No file writes or DB updates will occur.');
if (includeKindsArg) console.log(`[override] kinds filter: ${TARGET_KINDS.join(', ')}`);

// ---------------------------------------------------------------------------
// NAS / harness state pre-flight
// ---------------------------------------------------------------------------
const HARNESS_STATE_DIR = '/Volumes/CSNL_new-2/Memory/_lab_ai_harness/state';
const INBOX_PATH        = join(HARNESS_STATE_DIR, 'csnl_ops_inbox.json');
const INBOX_TMP_PATH    = join(HARNESS_STATE_DIR, 'csnl_ops_inbox.json.tmp');

if (!existsSync(HARNESS_STATE_DIR)) {
  console.error(`ERROR: Harness state dir not found — ${HARNESS_STATE_DIR}`);
  console.error('Mount NAS with: open smb://147.47.70.15/CSNL_new');
  process.exit(2);
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
    default:
      return payload;
  }
}

/**
 * Derive the target_initial for grouping.
 *   mm_slides_missing     → payload.researcher_initial  (string)
 *   grm_presenter_missing → null (unknown presenter → lab_wide bucket)
 */
function deriveTargetInitial(kind, payload) {
  if (kind === 'mm_slides_missing') {
    return payload.researcher_initial ?? null;
  }
  return null; // grm_presenter_missing: presenter not identifiable
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
console.log(`export-anomalies-for-harness (dry-run=${DRY_RUN})`);
console.log(`Kinds filter : ${TARGET_KINDS.join(', ')}`);
console.log(`Inbox target : ${INBOX_PATH}`);
console.log('─'.repeat(70));

// Fetch unpushed, unresolved anomalies
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

if (!rows || rows.length === 0) {
  console.log('No unpushed anomalies found — nothing to export.');
  process.exit(0);
}

console.log(`Fetched ${rows.length} anomaly row(s).`);

// ---------------------------------------------------------------------------
// Group by target_initial (null → 'lab_wide')
// ---------------------------------------------------------------------------
/** @type {Record<string, Array<object>>} */
const groups = {};
const totals = {};
const pushedIds = [];

for (const row of rows) {
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
  pushedIds.push(id);
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
// Build final JSON payload
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
console.log('EXPORT SUMMARY');
console.log('='.repeat(70));
console.log(`Total anomalies  : ${pushedIds.length}`);
for (const [kind, count] of Object.entries(totals)) {
  console.log(`  ${kind.padEnd(30)}: ${count}`);
}
console.log('By initial/bucket:');
for (const bucket of bucketKeys) {
  console.log(`  ${bucket.padEnd(12)}: ${groups[bucket].length}`);
}

if (DRY_RUN) {
  console.log('');
  console.log('[dry-run] Would write:');
  console.log(inboxJson);
  console.log('');
  console.log('[dry-run] No file written, no DB rows updated.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Atomic write: .tmp → rename
// ---------------------------------------------------------------------------
try {
  writeFileSync(INBOX_TMP_PATH, inboxJson, 'utf8');
  renameSync(INBOX_TMP_PATH, INBOX_PATH);
  console.log(`\nWrote inbox → ${INBOX_PATH}`);
} catch (err) {
  console.error(`ERROR: Failed to write inbox JSON: ${err.message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Stamp pushed_to_harness_at
// ---------------------------------------------------------------------------
const { error: updateErr } = await supabase
  .from('sync_anomalies')
  .update({ pushed_to_harness_at: new Date().toISOString() })
  .in('id', pushedIds);

if (updateErr) {
  console.error(`WARN: Inbox written but DB stamp failed: ${updateErr.message}`);
  console.error('Re-running will re-export the same rows — idempotent but noisy.');
} else {
  console.log(`Stamped pushed_to_harness_at on ${pushedIds.length} row(s).`);
}
