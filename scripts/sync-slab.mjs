/**
 * sync-slab.mjs
 *
 * Fetches all events from the Slab Google Calendar, parses them via
 * parseSlabEvent, and either prints a summary report or writes output files.
 *
 * CLI flags:
 *   --time-min=<ISO>      default: 90 days ago
 *   --time-max=<ISO>      default: 90 days from now
 *   --out-json=<path>     write parsed rows as JSON array
 *   --out-sql=<path>      write idempotent INSERT...ON CONFLICT batch SQL
 *   --self-test           run parser self-test and exit
 *
 * NEVER prints service-account email, private key, or any secret to stdout.
 */

import fs from 'fs';
import { google } from '/Users/csnl/Documents/claude/lab-reservation/node_modules/googleapis/build/src/index.js';
import { parseSlabEvent, runSelfTest } from './lib/parse-slab-event.mjs';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const flag = (name) => {
  const prefix = `--${name}=`;
  const found = args.find(a => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
};
const hasFlag = (name) => args.includes(`--${name}`);

if (hasFlag('self-test')) {
  console.log('Running parser self-test...\n');
  const { failures } = runSelfTest();
  process.exit(failures.length > 0 ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Auth — mirrors peek-slab.mjs exactly. Secrets never echo'd to stdout.
// ---------------------------------------------------------------------------

// Load .env.local from lab-reservation if the vars are not already in env.
// Handles values that are double-quoted strings (e.g. private key with \n escapes).
const ENV_FILE = '/Users/csnl/Documents/claude/lab-reservation/.env.local';
if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
  if (fs.existsSync(ENV_FILE)) {
    const raw = fs.readFileSync(ENV_FILE, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const k = trimmed.slice(0, eq).trim();
      let v = trimmed.slice(eq + 1).trim();
      // Strip surrounding double or single quotes
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      // Unescape \n sequences (used in private key lines)
      v = v.replace(/\\n/g, '\n');
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

const email  = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

if (!email  || !email.trim())  { console.error('ERROR: GOOGLE_SERVICE_ACCOUNT_EMAIL not set');  process.exit(1); }
if (!rawKey || !rawKey.trim()) { console.error('ERROR: GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY not set'); process.exit(1); }

const privateKey = rawKey.replace(/\\n/g, '\n');
const auth = new google.auth.JWT({
  email,
  key: privateKey,
  scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
});
const calendar = google.calendar({ version: 'v3', auth });

// ---------------------------------------------------------------------------
// Time range
// ---------------------------------------------------------------------------
const now = new Date();
const timeMin = flag('time-min') ?? new Date(now - 90 * 86_400_000).toISOString();
const timeMax = flag('time-max') ?? new Date(now + 90 * 86_400_000).toISOString();

const CALENDAR_ID = process.env.CSNL_OPS_SLAB_CALENDAR_ID
  ?? 'dvjmpc33e56l0euaq4c0dekvu4@group.calendar.google.com';

// ---------------------------------------------------------------------------
// Fetch all events (paginated)
// ---------------------------------------------------------------------------
console.error(`Fetching events from ${timeMin} to ${timeMax} …`);

const allEvents = [];
let pageToken;
do {
  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250,
    pageToken,
  });
  const items = res.data.items ?? [];
  for (const e of items) {
    allEvents.push({
      id:      e.id,
      summary: e.summary ?? '',
      start:   e.start ?? {},
      end:     e.end   ?? {},
    });
  }
  pageToken = res.data.nextPageToken;
} while (pageToken);

console.error(`Fetched ${allEvents.length} events. Parsing…`);

// ---------------------------------------------------------------------------
// Parse all events
// ---------------------------------------------------------------------------
const rows = allEvents.map(parseSlabEvent);

// ---------------------------------------------------------------------------
// Output: --out-json
// ---------------------------------------------------------------------------
const outJson = flag('out-json');
if (outJson) {
  fs.writeFileSync(outJson, JSON.stringify(rows, null, 2), 'utf8');
  console.error(`JSON written to ${outJson} (${rows.length} rows)`);
}

// ---------------------------------------------------------------------------
// Output: --out-sql
// ---------------------------------------------------------------------------
const outSql = flag('out-sql');
if (outSql) {
  const lines = [];
  lines.push('begin;');
  lines.push('');

  for (const r of rows) {
    const esc = (v) => {
      if (v === null || v === undefined) return 'null';
      return `'${String(v).replace(/'/g, "''")}'`;
    };
    const escInt = (v) => (v === null || v === undefined ? 'null' : String(v));
    const escArr = (arr) => {
      if (!arr || arr.length === 0) return "'{}'::text[]";
      const inner = arr.map(s => `'${String(s).replace(/'/g, "''")}'`).join(',');
      return `array[${inner}]::text[]`;
    };

    const cols = [
      'slab_calendar_event_id',
      'scheduled_start',
      'scheduled_end',
      'raw_summary',
      'event_kind',
      'experimenter_initials',
      'exp_code',
      'project_code',
      'subject_no',
      'day_no',
      'participant_label',
      'parse_status',
    ].join(', ');

    const vals = [
      esc(r.slab_calendar_event_id),
      esc(r.scheduled_start),
      r.scheduled_end ? esc(r.scheduled_end) : 'null',
      esc(r.raw_summary),
      esc(r.event_kind),
      escArr(r.experimenter_initials),
      esc(r.exp_code),
      esc(r.project_code),
      escInt(r.subject_no),
      escInt(r.day_no),
      esc(r.participant_label),
      esc(r.parse_status),
    ].join(', ');

    const update = [
      `scheduled_start = excluded.scheduled_start`,
      `scheduled_end = excluded.scheduled_end`,
      `raw_summary = excluded.raw_summary`,
      `event_kind = excluded.event_kind`,
      `experimenter_initials = excluded.experimenter_initials`,
      `exp_code = excluded.exp_code`,
      `project_code = excluded.project_code`,
      `subject_no = excluded.subject_no`,
      `day_no = excluded.day_no`,
      `participant_label = excluded.participant_label`,
      `parse_status = excluded.parse_status`,
      `updated_at = now()`,
    ].join(', ');

    lines.push(
      `insert into csnl_ops.experiment_bookings (${cols}) values (${vals}) on conflict (slab_calendar_event_id) do update set ${update};`
    );
  }

  lines.push('');
  lines.push('commit;');

  fs.writeFileSync(outSql, lines.join('\n'), 'utf8');
  console.error(`SQL written to ${outSql} (${rows.length} INSERT statements)`);
}

// ---------------------------------------------------------------------------
// Default: summary report + sample rows
// ---------------------------------------------------------------------------
if (!outJson && !outSql) {
  // Stats by parse_status
  const byStatus = {};
  for (const r of rows) {
    byStatus[r.parse_status] = (byStatus[r.parse_status] ?? 0) + 1;
  }

  // Stats by event_kind
  const byKind = {};
  for (const r of rows) {
    byKind[r.event_kind] = (byKind[r.event_kind] ?? 0) + 1;
  }

  // All initials seen
  const initialCount = {};
  for (const r of rows) {
    for (const init of (r.experimenter_initials ?? [])) {
      initialCount[init] = (initialCount[init] ?? 0) + 1;
    }
  }

  // All exp_codes seen
  const expCodes = {};
  for (const r of rows) {
    if (r.exp_code) expCodes[r.exp_code] = (expCodes[r.exp_code] ?? 0) + 1;
  }

  const KNOWN = new Set(['SL','JSL','JOP','BYL','JYK','MSY','SMJ','SK']);
  const unknownInitials = Object.entries(initialCount)
    .filter(([k]) => !KNOWN.has(k))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const top10ExpCodes = Object.entries(expCodes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  console.log('='.repeat(70));
  console.log('SYNC-SLAB SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total events     : ${rows.length}`);
  console.log('');
  console.log('── By parse_status ─────────────────────────────────────────────');
  for (const [status, count] of Object.entries(byStatus)) {
    console.log(`  ${status.padEnd(14)}: ${count}`);
  }
  console.log('');
  console.log('── By event_kind ───────────────────────────────────────────────');
  for (const [kind, count] of Object.entries(byKind)) {
    console.log(`  ${kind.padEnd(14)}: ${count}`);
  }
  console.log('');
  console.log('── Top 5 unknown initials (not in KNOWN set) ───────────────────');
  if (unknownInitials.length === 0) {
    console.log('  (none)');
  } else {
    for (const [init, count] of unknownInitials) {
      console.log(`  ${init.padEnd(8)} ${count}x`);
    }
  }
  console.log('');
  console.log('── Top 10 exp_code values ──────────────────────────────────────');
  if (top10ExpCodes.length === 0) {
    console.log('  (none)');
  } else {
    for (const [code, count] of top10ExpCodes) {
      console.log(`  ${code.padEnd(30)} ${count}x`);
    }
  }
  console.log('');
  console.log('── First 10 parsed rows ────────────────────────────────────────');
  rows
    .filter(r => r.parse_status === 'parsed')
    .slice(0, 10)
    .forEach(r => console.log('  ' + JSON.stringify({
      kind: r.event_kind,
      initials: r.experimenter_initials,
      exp_code: r.exp_code,
      sbj: r.subject_no,
      day: r.day_no,
      label: r.participant_label,
      summary: r.raw_summary.slice(0, 60),
    })));
  console.log('');
  console.log('── First 10 unparseable rows ───────────────────────────────────');
  rows
    .filter(r => r.parse_status === 'unparseable')
    .slice(0, 10)
    .forEach(r => console.log(`  ${JSON.stringify(r.raw_summary)}`));
  console.log('='.repeat(70));
}
