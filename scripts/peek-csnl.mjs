import { google } from '/Users/csnl/Documents/claude/lab-reservation/node_modules/googleapis/build/src/index.js';

// ── Auth ─────────────────────────────────────────────────────────────────────
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

const KNOWN_INITIALS = new Set(['SL','JSL','JOP','BYL','JYK','MSY','SMJ','SK']);

// ── Regex patterns ────────────────────────────────────────────────────────────
// P1: exactly "Meeting: XX" (originally assumed format)
const RE_P1 = /^Meeting:\s*([A-Z]{2,4})\s*$/;
// P2: initials followed by meeting/MM/미팅/회의 (looser, case-insensitive)
const RE_P2 = /^([A-Z]{2,4})\s*(?:meeting|MM|미팅|회의)/i;
// P3: "Meeting:" anywhere followed by initials (broadest)
const RE_P3 = /Meeting:\s*([A-Z]{2,4})/;

// ── calendars.get — prove SA can see the calendar ─────────────────────────────
console.log('='.repeat(70));
console.log('CSNL MILESTONE MEETING CALENDAR PEEK');
console.log('='.repeat(70));

let calInfo;
try {
  const res = await calendar.calendars.get({ calendarId: CALENDAR_ID });
  calInfo = res.data;
} catch (err) {
  const code = err?.response?.status ?? err?.code ?? '?';
  console.error(`ERROR ${code} on calendars.get: ${err?.message}`);
  process.exit(1);
}

console.log(`calendars.get result:`);
console.log(`  summary    : ${calInfo.summary}`);
console.log(`  timeZone   : ${calInfo.timeZone}`);
console.log(`  accessRole : ${calInfo.accessRole}`);
console.log('');

// ── Fetch all events (paginate) ───────────────────────────────────────────────
const now     = new Date();
const timeMin = new Date(now - 90 * 86_400_000).toISOString();
const timeMax = new Date(now + 90 * 86_400_000).toISOString();

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
      start:      e.start?.dateTime ?? e.start?.date ?? '',
      summary:    e.summary ?? '',
      attendees:  (e.attendees ?? []).length,
      recurring:  !!(e.recurringEventId ?? e.recurrence),
    });
  }
  pageToken = res.data.nextPageToken;
} while (pageToken);

// ── Tally patterns ────────────────────────────────────────────────────────────
const pP1 = [], pP2 = [], pP3 = [], unparseable = [];
const allInitials = new Set();

for (const ev of allEvents) {
  const s = ev.summary;
  let m;
  if ((m = RE_P1.exec(s))) {
    pP1.push(s);
    allInitials.add(m[1].toUpperCase());
  }
  // P2: independent check (not else-if — an event can match both)
  if ((m = RE_P2.exec(s))) {
    pP2.push(s);
    allInitials.add(m[1].toUpperCase());
  }
  if ((m = RE_P3.exec(s))) {
    pP3.push(s);
    allInitials.add(m[1].toUpperCase());
  }
  // Unparseable: matches none of the three
  if (!RE_P1.test(s) && !RE_P2.test(s) && !RE_P3.test(s)) {
    unparseable.push(s);
  }
}

const recurringCount    = allEvents.filter(e => e.recurring).length;
const nonRecurringCount = allEvents.length - recurringCount;
const unknownInitials   = [...allInitials].filter(i => !KNOWN_INITIALS.has(i)).sort();

// ── Report ────────────────────────────────────────────────────────────────────
console.log(`Total events fetched : ${allEvents.length}`);
console.log(`Recurring            : ${recurringCount}`);
console.log(`Non-recurring        : ${nonRecurringCount}`);
console.log(`Pattern P1 hits      : ${pP1.length}`);
console.log(`Pattern P2 hits      : ${pP2.length}`);
console.log(`Pattern P3 hits      : ${pP3.length}`);
console.log(`Unparseable          : ${unparseable.length}`);
console.log('');

console.log('── Pattern P1 (first 5) — ^Meeting: [INIT]$ ───────────────────');
pP1.slice(0, 5).forEach(s => console.log(`  ${JSON.stringify(s)}`));
console.log('');

console.log('── Pattern P2 (first 5) — [INIT] meeting/MM/미팅/회의 ─────────');
pP2.slice(0, 5).forEach(s => console.log(`  ${JSON.stringify(s)}`));
console.log('');

console.log('── Pattern P3 (first 5) — Meeting: [INIT] anywhere ────────────');
pP3.slice(0, 5).forEach(s => console.log(`  ${JSON.stringify(s)}`));
console.log('');

console.log('── Unparseable (first 10) ──────────────────────────────────────');
unparseable.slice(0, 10).forEach(s => console.log(`  ${JSON.stringify(s)}`));
console.log('');

console.log('── Distinct initials (via P3) ──────────────────────────────────');
console.log(`  Known   : ${[...allInitials].filter(i => KNOWN_INITIALS.has(i)).sort().join(', ') || '(none)'}`);
console.log(`  UNKNOWN : ${unknownInitials.join(', ') || '(none)'}`);
console.log('='.repeat(70));
