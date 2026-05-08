import { google } from '/Users/csnl/Documents/claude/lab-reservation/node_modules/googleapis/build/src/index.js';

// ── Auth ──────────────────────────────────────────────────────────────────────
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

// ── Config ────────────────────────────────────────────────────────────────────
const CALENDAR_ID = process.env.CSNL_OPS_CSNL_CALENDAR_ID ?? 'vnilab@gmail.com';

const now     = new Date();
const timeMin = new Date(now - 365 * 86_400_000).toISOString(); // 1 year back
const timeMax = new Date(now + 30  * 86_400_000).toISOString(); // 30 days ahead

// ── Regex patterns ─────────────────────────────────────────────────────────────
const RE_GRM  = /\bGRM\b|\bspecial[-\s]?GRM\b/i;
const RE_PB   = /\bPaper\s*Blitz\b|\bPB\b/i;
const RE_LM   = /\bLab\s*Meeting\b|\b랩\s*미팅\b|\b수요일\b/i;
// Presenter heuristic patterns
const RE_INIT_FILE    = /^([A-Z]{2,4})_\d{6}/;          // e.g. JYK_250430
const RE_INIT_PB      = /^Paper\s*Blitz[:\s]+([A-Z]{2,4})\b/i;
const RE_CAPS_TOKEN   = /\b([A-Z]{2,4})\b/;             // first all-caps token

// ── Fetch all events (paginate) ───────────────────────────────────────────────
console.log('='.repeat(70));
console.log('CSNL GRM / PAPER BLITZ RECONNAISSANCE');
console.log(`Window: ${timeMin.slice(0,10)} → ${timeMax.slice(0,10)}`);
console.log('='.repeat(70));

const allEvents = [];
let pageToken;
do {
  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 2500,
    pageToken,
  });
  for (const e of (res.data.items ?? [])) {
    allEvents.push({
      id:               e.id ?? '',
      summary:          e.summary ?? '',
      start:            e.start?.dateTime ?? e.start?.date ?? '',
      recurring:        !!(e.recurringEventId ?? e.recurrence),
      recurringEventId: e.recurringEventId ?? null,
    });
  }
  pageToken = res.data.nextPageToken;
} while (pageToken);

// ── Helper: format a date string as YYYY-MM-DD ────────────────────────────────
function fmtDate(startStr) {
  if (!startStr) return '????-??-??';
  // dateTime includes T; date is plain
  return startStr.slice(0, 10);
}

// ── Helper: get KST hour + weekday from an ISO dateTime string ─────────────────
function kstInfo(startStr) {
  if (!startStr || !startStr.includes('T')) return { hour: null, dow: null };
  const d = new Date(startStr);
  // Asia/Seoul offset is UTC+9
  const kstMs = d.getTime() + 9 * 3600 * 1000;
  const kst   = new Date(kstMs);
  return { hour: kst.getUTCHours(), dow: kst.getUTCDay() }; // 0=Sun,3=Wed
}

// ── Bucket events ─────────────────────────────────────────────────────────────
const bucketA = []; // GRM
const bucketB = []; // Paper Blitz
const bucketC = []; // Lab Meeting umbrella
const bucketD = []; // Wed 10:00 KST, not in A or B
const allInitials = new Set();

function extractInitials(summary) {
  let m;
  if ((m = RE_INIT_FILE.exec(summary)))  return m[1].toUpperCase();
  if ((m = RE_INIT_PB.exec(summary)))    return m[1].toUpperCase();
  if ((m = RE_CAPS_TOKEN.exec(summary))) return m[1].toUpperCase();
  return null;
}

for (const ev of allEvents) {
  const s = ev.summary;
  const inA = RE_GRM.test(s);
  const inB = RE_PB.test(s);
  const inC = RE_LM.test(s);
  const { hour, dow } = kstInfo(ev.start);
  const isWed10 = (hour === 10 && dow === 3);

  if (inA) bucketA.push(ev);
  if (inB) bucketB.push(ev);
  if (inC) bucketC.push(ev);
  if (isWed10 && !inA && !inB) bucketD.push(ev);

  const init = extractInitials(s);
  if (init && init.length >= 2) allInitials.add(init);
}

// ── Print helper ──────────────────────────────────────────────────────────────
function printBucket(label, bucket, limit = 20) {
  console.log(`\n── ${label} (count: ${bucket.length}) ${'─'.repeat(Math.max(0, 50 - label.length))}`);
  bucket.slice(0, limit).forEach(ev => {
    const d  = fmtDate(ev.start);
    const ri = ev.recurring ? ' [rec]' : '';
    console.log(`  ${d}  ${ev.summary}${ri}`);
  });
  if (bucket.length > limit) console.log(`  ... and ${bucket.length - limit} more`);
}

// ── Report ────────────────────────────────────────────────────────────────────
console.log(`\nTOTAL events scanned : ${allEvents.length}`);
console.log(`Window               : ${timeMin.slice(0,10)} to ${timeMax.slice(0,10)}`);

printBucket('A. GRM  (/\\bGRM\\b/i)',               bucketA);
printBucket('B. Paper Blitz  (/PB|Paper Blitz/i)', bucketB);
printBucket('C. Lab Meeting umbrella',              bucketC);
printBucket('D. Wed 10:00 KST (not in A or B)',    bucketD);

console.log(`\n── Distinct presenter initials (heuristic) ${'─'.repeat(28)}`);
console.log(`  ${[...allInitials].sort().join(', ') || '(none found)'}`);
console.log('='.repeat(70));
