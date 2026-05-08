/**
 * resolve-mm-slides.mjs
 *
 * Probes the NAS for Milestone Meeting slide files and populates
 * csnl_ops.milestone_meetings.slides_path + slides_submitted for rows
 * where slides_path IS NULL.
 *
 * Requirements:
 *   - NAS mounted at /Volumes/CSNL_new-2 (smb://147.47.70.15/CSNL_new)
 *   - .env.local at the csnl-ops project root
 *   - Node 22+ (uses fs/promises or sync FS APIs)
 *
 * CLI flags:
 *   --dry-run          Print what WOULD happen; no DB writes.
 *   --initial=<INIT>   Limit processing to one researcher's rows.
 *
 * Probe order:
 *   1. (canonical) /Volumes/CSNL_new-2/MM/{INIT}/  — direct + 1-level deep
 *   2. (legacy)    /Volumes/CSNL_new-2/Memory/{INIT}/asterisk/Results/  — only if (1) empty
 *
 * Exit codes:  0 Success  |  1 Env/auth error  |  2 NAS not mounted
 */

import { existsSync, statSync, readdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { resolve, join, basename, dirname } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const initialFlag = (() => {
  const f = args.find(a => a.startsWith('--initial='));
  return f ? f.slice('--initial='.length).trim() : null;
})();

if (DRY_RUN)      console.log('[dry-run] No DB writes will occur.');
if (initialFlag)  console.log(`[filter] Processing only researcher: ${initialFlag}`);

// ---------------------------------------------------------------------------
// NAS pre-flight
// ---------------------------------------------------------------------------
const NAS_ROOT    = '/Volumes/CSNL_new-2';
const MM_ROOT     = join(NAS_ROOT, 'MM');
const MEMORY_ROOT = join(NAS_ROOT, 'Memory');

if (!existsSync(NAS_ROOT) || (!existsSync(MM_ROOT) && !existsSync(MEMORY_ROOT))) {
  console.error(`ERROR: NAS not mounted — ${NAS_ROOT} not accessible.`);
  console.error('Mount with: open smb://147.47.70.15/CSNL_new');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// .env.local loader
// ---------------------------------------------------------------------------
const ENV_FILE = resolve(new URL('.', import.meta.url).pathname, '../.env.local');

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  if (existsSync(ENV_FILE)) {
    for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      v = v.replace(/\\n/g, '\n');
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL?.trim()) { console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL not set'); process.exit(1); }
if (!SERVICE_KEY?.trim())  { console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY not set'); process.exit(1); }

// ---------------------------------------------------------------------------
// Supabase client (service-role, csnl_ops schema)
// ---------------------------------------------------------------------------
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  db:   { schema: 'csnl_ops' },
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Date extraction
// ---------------------------------------------------------------------------
const SLIDE_EXTS = new Set(['pptx', 'pdf', 'key', 'keynote']);

/**
 * Extract a date string from a file basename. Returns "YYYY-MM-DD" or null.
 *
 * Patterns tried IN ORDER:
 *   1. (?<![0-9])(\d{4})-(\d{2})-(\d{2})(?![0-9])   YYYY-MM-DD
 *   2. (?<![0-9])(\d{4})(\d{2})(\d{2})(?![0-9])      YYYYMMDD  (2018-2030)
 *   3. (?<![0-9])(\d{2})(\d{2})(\d{2})(?![0-9])      YYMMDD    (20YY, 2018-2030)
 */
function extractDate(name) {
  let m;
  if ((m = /(?<![0-9])(\d{4})-(\d{2})-(\d{2})(?![0-9])/.exec(name))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = /(?<![0-9])(\d{4})(\d{2})(\d{2})(?![0-9])/.exec(name))) {
    const yr = +m[1];
    if (yr >= 2018 && yr <= 2030) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  if ((m = /(?<![0-9])(\d{2})(\d{2})(\d{2})(?![0-9])/.exec(name))) {
    const yr = 2000 + +m[1];
    if (yr >= 2018 && yr <= 2030) return `${yr}-${m[2]}-${m[3]}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// FS helpers
// ---------------------------------------------------------------------------
// Office/editor temp-lock prefixes: PowerPoint/Word use `~$`, LibreOffice
// uses `.~lock.`, and macOS Finder leaves `._` AppleDouble shadows.
const LOCK_PREFIXES = ['~$', '.~lock.', '._'];

function isLockFile(name) {
  return LOCK_PREFIXES.some(p => name.startsWith(p));
}

function listFiles(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isFile() && !isLockFile(e.name) && SLIDE_EXTS.has(e.name.split('.').pop().toLowerCase()))
      .map(e => join(dir, e.name));
  } catch { return []; }
}

function listDirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => join(dir, e.name));
  } catch { return []; }
}

function nasRel(absPath) { return absPath.slice(NAS_ROOT.length + 1); }

function getMtime(rel) {
  try { return statSync(join(NAS_ROOT, rel)).mtimeMs; } catch { return 0; }
}

// ---------------------------------------------------------------------------
// Probe
// ---------------------------------------------------------------------------
/**
 * Returns array of { nasRel: string, source: 'mm'|'legacy' } matching meetingDate.
 */
function probeNas(init, meetingDate) {
  const results = [];

  // a. Canonical: MM/{INIT}/ — direct + one subdirectory level
  const mmDir = join(MM_ROOT, init);
  if (existsSync(mmDir)) {
    const scanDirs = [mmDir, ...listDirs(mmDir)];
    for (const d of scanDirs) {
      for (const f of listFiles(d)) {
        if (extractDate(basename(f)) === meetingDate) results.push({ nasRel: nasRel(f), source: 'mm' });
      }
    }
  }
  if (results.length > 0) return results;

  // b. Legacy: Memory/{INIT}/*/Results/
  const memDir = join(MEMORY_ROOT, init);
  if (existsSync(memDir)) {
    for (const proj of listDirs(memDir)) {
      for (const f of listFiles(join(proj, 'Results'))) {
        if (extractDate(basename(f)) === meetingDate) results.push({ nasRel: nasRel(f), source: 'legacy' });
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Co-located support files
// ---------------------------------------------------------------------------
const SUPPORT_PAT = [/^note/i, /_notes\./i, /^script/i, /^research_note/i, /^comment/i];

function findSupportFiles(slideNasRel, meetingDate) {
  const dir = dirname(join(NAS_ROOT, slideNasRel));
  const slideAbs = join(NAS_ROOT, slideNasRel);
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isFile() && !isLockFile(e.name) && join(dir, e.name) !== slideAbs)
      .filter(e => extractDate(e.name) === meetingDate || SUPPORT_PAT.some(r => r.test(e.name)))
      .map(e => nasRel(join(dir, e.name)));
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// DB update (handles optional support_files column gracefully)
// ---------------------------------------------------------------------------
let supportFilesColWarned = false;

async function updateRow(meeting_date, researcher_initial, slidesPath, supportFiles) {
  const payload = { slides_path: slidesPath, slides_submitted: true };
  if (supportFiles.length > 0) payload.support_files = supportFiles;

  const { error } = await supabase
    .from('milestone_meetings')
    .update(payload)
    .eq('meeting_date', meeting_date)
    .eq('researcher_initial', researcher_initial);

  if (error) {
    if (error.message.includes('support_files') || error.code === '42703') {
      if (!supportFilesColWarned) {
        console.warn('  WARN: support_files column does not exist yet — skipping that field.');
        supportFilesColWarned = true;
      }
      delete payload.support_files;
      const { error: e2 } = await supabase
        .from('milestone_meetings')
        .update(payload)
        .eq('meeting_date', meeting_date)
        .eq('researcher_initial', researcher_initial);
      if (e2) throw new Error(e2.message);
    } else {
      throw new Error(error.message);
    }
  }
}

async function insertAnomaly(kind, payload) {
  if (DRY_RUN) { console.log(`  [dry-run] anomaly: kind=${kind} payload=${JSON.stringify(payload)}`); return; }
  const { error } = await supabase.from('sync_anomalies').insert({ kind, payload }).select();
  if (error) console.error(`  WARN: failed to insert anomaly kind=${kind}: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const graceCutoff = new Date();
graceCutoff.setDate(graceCutoff.getDate() - 3);
const graceCutoffIso = graceCutoff.toISOString().slice(0, 10);

console.log(`Resolving MM slides paths (dry-run=${DRY_RUN})`);
console.log(`NAS root    : ${NAS_ROOT}`);
console.log(`Grace cutoff: ${graceCutoffIso}`);
console.log('─'.repeat(70));

let query = supabase
  .from('milestone_meetings')
  .select('meeting_date, researcher_initial')
  .is('slides_path', null)
  .order('meeting_date', { ascending: false });
if (initialFlag) query = query.eq('researcher_initial', initialFlag);

const { data: rows, error: fetchErr } = await query;
if (fetchErr) { console.error(`ERROR: Failed to fetch milestone_meetings: ${fetchErr.message}`); process.exit(1); }
if (!rows?.length) { console.log('No rows with slides_path IS NULL — nothing to do.'); process.exit(0); }

console.log(`Rows to process: ${rows.length}\n`);

let cntSingle = 0, cntAmbiguous = 0, cntMissing = 0, cntGrace = 0, cntError = 0;
let cntMmPath = 0, cntLegacy = 0;

for (const row of rows) {
  const { meeting_date, researcher_initial } = row;
  const label = `${meeting_date} / ${researcher_initial}`;

  let matches;
  try { matches = probeNas(researcher_initial, meeting_date); }
  catch (err) { console.error(`  ERROR probing NAS for ${label}: ${err.message}`); cntError++; continue; }

  if (matches.length === 0) {
    if (meeting_date < graceCutoffIso) {
      console.log(`  MISSING  ${label}  (past grace period → anomaly)`);
      await insertAnomaly('mm_slides_missing', { meeting_date, researcher_initial });
      cntMissing++;
    } else {
      console.log(`  GRACE    ${label}  (within grace period, skipping)`);
      cntGrace++;
    }
    continue;
  }

  let chosen;
  if (matches.length > 1) {
    const ranked = matches.slice().sort((a, b) => getMtime(b.nasRel) - getMtime(a.nasRel));
    chosen = ranked[0];
    console.log(`  AMBIG    ${label}  →  chosen: ${chosen.nasRel}  [${chosen.source}]`);
    for (const m of matches) console.log(`    candidate: ${m.nasRel}  [${m.source}]`);
    await insertAnomaly('mm_multiple_files', {
      meeting_date, researcher_initial,
      chosen: chosen.nasRel,
      all_matches: matches.map(m => m.nasRel),
    });
    cntAmbiguous++;
  } else {
    chosen = matches[0];
    console.log(`  FOUND    ${label}  →  ${chosen.nasRel}  [${chosen.source}]`);
    cntSingle++;
  }

  const supportFiles = findSupportFiles(chosen.nasRel, meeting_date);

  if (!DRY_RUN) {
    try { await updateRow(meeting_date, researcher_initial, chosen.nasRel, supportFiles); }
    catch (err) { console.error(`    WARN: update failed: ${err.message}`); cntError++; continue; }
  } else {
    console.log(`    [dry-run] would UPDATE slides_path=${chosen.nasRel}, slides_submitted=true`);
    if (supportFiles.length) console.log(`    [dry-run] support_files=${JSON.stringify(supportFiles)}`);
  }

  if (chosen.source === 'mm') cntMmPath++; else cntLegacy++;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(70));
console.log('SUMMARY');
console.log('='.repeat(70));
console.log(`Total rows checked  : ${rows.length}`);
console.log(`Found (single)      : ${cntSingle}`);
console.log(`Found (ambiguous)   : ${cntAmbiguous}`);
console.log(`  ↳ from /MM/ path  : ${cntMmPath}`);
console.log(`  ↳ from /Memory/   : ${cntLegacy}`);
console.log(`Missing + anomaly   : ${cntMissing}`);
console.log(`Grace-period skip   : ${cntGrace}`);
console.log(`Errors              : ${cntError}`);
if (DRY_RUN) console.log('(dry-run — no DB changes were made)');
