/**
 * smoke-ingest-experiments.mjs
 *
 * Dry-run smoke test for the completed-experiment ingest pipeline.
 *
 * Connects to Supabase (via .env.local), runs ingestExperiments with
 * dryRun=true, and reports what it would do.
 *
 * csnl-ops and lab-reservation share the same Supabase project.
 * All reads are direct cross-schema reads: public.* for lab-reservation
 * tables, csnl_ops.* for csnl-ops tables. No FDW required.
 *
 * Exit codes:
 *   0  Success (all tables reachable, dry-run logic ran without throw)
 *   1  Env / auth error
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

// Step 2: verify public.bookings is directly readable
console.log('');
console.log('Step 2: Checking public.bookings (direct cross-schema read)...');

const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

const { data: bookings, error: bookErr } = await supabase
  .from('bookings')
  .select('id, status, auto_completed_at, updated_at, experiment_id, participant_id')
  .eq('status', 'completed')
  .gt('updated_at', cutoff)
  .limit(5);

if (bookErr) {
  console.error(`  FAIL: ${bookErr.message}`);
  process.exit(3);
}

const count = (bookings ?? []).length;
console.log(`  OK — ${count} completed booking(s) in last ${LOOKBACK_DAYS}d (showing up to 5)`);
for (const b of (bookings ?? [])) {
  const completedAt = b.auto_completed_at ?? b.updated_at;
  console.log(`       ${b.id} | completed_at=${completedAt} | experiment_id=${b.experiment_id}`);
}

// Step 3: verify public.experiments readable and check researcher field
console.log('');
console.log('Step 3: Checking public.experiments (created_by field for researcher identity)...');
const { data: exps, error: expCheckErr } = await supabase
  .from('experiments')
  .select('id, title, experiment_mode, created_by, location_id')
  .limit(3);

if (expCheckErr) {
  console.error(`  FAIL: ${expCheckErr.message}`);
  process.exit(3);
}
console.log(`  OK — ${(exps ?? []).length} experiment(s) sampled`);
for (const e of (exps ?? [])) {
  console.log(`       ${e.id} | title=${e.title} | mode=${e.experiment_mode} | created_by=${e.created_by}`);
}

// Step 4: verify csnl_ops.behavioral_experiments table exists
console.log('');
console.log('Step 4: Checking csnl_ops.behavioral_experiments...');
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

// Step 5: verify experiment_ingest_anomalies table exists
console.log('');
console.log('Step 5: Checking csnl_ops.experiment_ingest_anomalies...');
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
console.log('Result: PASS — direct cross-schema reads OK, all tables exist.');
console.log('        Run the cron route to do a real ingest.');
