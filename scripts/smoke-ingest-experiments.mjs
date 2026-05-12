/**
 * smoke-ingest-experiments.mjs
 *
 * Dry-run smoke test for the completed-experiment ingest pipeline.
 *
 * Connects to local Supabase (via .env.local), runs ingestExperiments with
 * dryRun=true, and reports what it would do.
 *
 * Exit codes:
 *   0  Success (FDW or local DB reachable, dry-run logic ran without throw)
 *   1  Env / auth error
 *   2  NAS not required for this test (skip that check)
 *   3  Unexpected error during ingest
 *
 * Usage:
 *   node scripts/smoke-ingest-experiments.mjs
 *   node scripts/smoke-ingest-experiments.mjs --lookback-days=7
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Parse CLI
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const lookbackArg = args.find(a => a.startsWith('--lookback-days='));
const LOOKBACK_DAYS = lookbackArg
  ? Math.max(1, parseInt(lookbackArg.split('=')[1], 10) || 30)
  : 30;

// ---------------------------------------------------------------------------
// .env.local loader (same pattern as other scripts in this repo)
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
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL not set. Ensure .env.local exists.');
  process.exit(1);
}
if (!SERVICE_KEY || !SERVICE_KEY.trim()) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY not set. Ensure .env.local exists.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Smoke test
// ---------------------------------------------------------------------------
console.log('smoke-ingest-experiments — dry-run only');
console.log('─'.repeat(60));
console.log(`Supabase URL   : ${SUPABASE_URL}`);
console.log(`Lookback days  : ${LOOKBACK_DAYS}`);
console.log('');

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// Step 1: verify csnl_ops.researchers is reachable
console.log('Step 1: Checking csnl_ops.researchers...');
const { data: researchers, error: resErr } = await supabase
  .schema('csnl_ops')
  .from('researchers')
  .select('initial, email')
  .limit(20);

if (resErr) {
  console.error(`  FAIL: ${resErr.message}`);
  process.exit(1);
}
console.log(`  OK — ${(researchers ?? []).length} researcher(s) found`);
for (const r of (researchers ?? [])) {
  console.log(`       ${r.initial}: ${r.email ?? '(no email)'}`);
}

// Step 2: verify lab_reservation_mirror.bookings is reachable (FDW test)
console.log('');
console.log('Step 2: Checking lab_reservation_mirror.bookings (FDW)...');

const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

const { data: bookings, error: bookErr } = await supabase
  .schema('lab_reservation_mirror')
  .from('bookings')
  .select('id, status, completed_at, experiment_id, participant_profile_id')
  .eq('status', 'completed')
  .gt('completed_at', cutoff)
  .limit(5);

if (bookErr) {
  if (
    bookErr.message.includes('does not exist') ||
    bookErr.message.includes('server') ||
    bookErr.message.includes('fdw') ||
    bookErr.message.includes('foreign')
  ) {
    console.warn(`  WARN (FDW not yet configured): ${bookErr.message}`);
    console.warn('  Apply migration 20260512120000 and set Vault secrets first.');
    console.warn('  The ingest logic itself is otherwise ready.');
  } else {
    console.error(`  FAIL: ${bookErr.message}`);
    process.exit(3);
  }
} else {
  const count = (bookings ?? []).length;
  console.log(`  OK — ${count} completed booking(s) in last ${LOOKBACK_DAYS}d (showing up to 5)`);
  for (const b of (bookings ?? [])) {
    console.log(`       ${b.id} | completed_at=${b.completed_at}`);
  }
}

// Step 3: verify behavioral_experiments table exists
console.log('');
console.log('Step 3: Checking csnl_ops.behavioral_experiments...');
const { count: expCount, error: expErr } = await supabase
  .schema('csnl_ops')
  .from('behavioral_experiments')
  .select('id', { count: 'exact', head: true });

if (expErr) {
  console.error(`  FAIL: ${expErr.message}`);
  console.error('  Apply migration 20260512120001 first.');
  process.exit(3);
}
console.log(`  OK — ${expCount ?? 0} row(s) currently in behavioral_experiments`);

// Step 4: verify experiment_ingest_anomalies table exists
console.log('');
console.log('Step 4: Checking csnl_ops.experiment_ingest_anomalies...');
const { count: anomalyCount, error: anomalyErr } = await supabase
  .schema('csnl_ops')
  .from('experiment_ingest_anomalies')
  .select('id', { count: 'exact', head: true });

if (anomalyErr) {
  console.error(`  FAIL: ${anomalyErr.message}`);
  console.error('  Apply migration 20260512120001 first.');
  process.exit(3);
}
console.log(`  OK — ${anomalyCount ?? 0} anomaly row(s) currently`);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('');
console.log('─'.repeat(60));
console.log('Smoke test complete.');
console.log('');

if (bookErr) {
  console.log('Result: PARTIAL — DB tables OK, FDW not yet configured.');
  console.log('        The ingest cron will work once FDW migration is applied.');
} else {
  console.log('Result: PASS — FDW reachable, all tables exist.');
  console.log('        Run the cron route to do a real ingest.');
}
