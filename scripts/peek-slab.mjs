import { google } from '/Users/csnl/Documents/claude/lab-reservation/node_modules/googleapis/build/src/index.js';

// ── Auth ────────────────────────────────────────────────────────────────────
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

// ── Config ──────────────────────────────────────────────────────────────────
const CALENDAR_ID = process.env.CSNL_OPS_SLAB_CALENDAR_ID
  ?? 'dvjmpc33e56l0euaq4c0dekvu4@group.calendar.google.com';

const KNOWN_INITIALS = new Set([
  'SL','JSL','JOP','BYL','JYK','MSY','SMJ','SK',   // registered
  'KY','MJC','JHR',                                  // active but unregistered
  'HSL','DG','BRL','CRC','HG','HJL','JYA','LS',     // alumni
]);
const KNOWN_PROJECTS = new Set([
  'Passive_navigation','SerialDep_Spatial','RingRepSca','Time','Time2Dist',
  'GranNMDS','GranRDT','tDCS','Uncertainty','biasVar','RNN','CatVsMag',
  'Concentricity','Screen_Retinotopy','WMRepresentation_24_updated',
]);

// ── Regex parsers ────────────────────────────────────────────────────────────
// Pattern A: [INIT] [Project] [Sbj#N] [Session#N]  (brackets canonical)
const RE_A = /^\s*\[([A-Z]{2,4})\]\s*\[([^\]]+)\]\s*\[?(?:Sbj)?\s*(\d+)\]?\s*\[?(?:Session)?\s*(\d+)\]?\s*$/i;
// Pattern B: INIT Project Sbj#N Session#N           (no brackets)
const RE_B = /^\s*([A-Z]{2,4})\s+(\S+)\s+(?:Sbj)?(\d+)\s+(?:Session)?(\d+)\s*$/i;

// ── Fetch all events (paginate) ──────────────────────────────────────────────
const now      = new Date();
const timeMin  = new Date(now - 90 * 86_400_000).toISOString();
const timeMax  = new Date(now + 90 * 86_400_000).toISOString();

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
      start:   e.start?.dateTime ?? e.start?.date ?? '',
      summary: e.summary ?? '',
    });
  }
  pageToken = res.data.nextPageToken;
} while (pageToken);

// ── Parse ────────────────────────────────────────────────────────────────────
const pA = [], pB = [], unparseable = [];
const allInitials = new Set(), allProjects = new Set();

for (const ev of allEvents) {
  const s = ev.summary;
  let m;
  if ((m = RE_A.exec(s))) {
    pA.push({ summary: s, init: m[1].toUpperCase(), project: m[2], sbj: m[3], session: m[4] });
    allInitials.add(m[1].toUpperCase());
    allProjects.add(m[2]);
  } else if ((m = RE_B.exec(s))) {
    pB.push({ summary: s, init: m[1].toUpperCase(), project: m[2], sbj: m[3], session: m[4] });
    allInitials.add(m[1].toUpperCase());
    allProjects.add(m[2]);
  } else {
    unparseable.push(s);
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
const unknownInitials  = [...allInitials].filter(i => !KNOWN_INITIALS.has(i)).sort();
const unknownProjects  = [...allProjects].filter(p => !KNOWN_PROJECTS.has(p)).sort();

console.log('='.repeat(70));
console.log('SLAB CALENDAR PEEK');
console.log('='.repeat(70));
console.log(`Total events fetched : ${allEvents.length}`);
console.log(`Pattern A matches    : ${pA.length}`);
console.log(`Pattern B matches    : ${pB.length}`);
console.log(`Unparseable          : ${unparseable.length}`);
console.log('');

console.log('── Pattern A (first 5) ─────────────────────────────────────────');
pA.slice(0, 5).forEach(x => console.log(`  ${JSON.stringify(x.summary)}`));
console.log('');

console.log('── Pattern B (first 5) ─────────────────────────────────────────');
pB.slice(0, 5).forEach(x => console.log(`  ${JSON.stringify(x.summary)}`));
console.log('');

console.log('── Unparseable (first 10) ──────────────────────────────────────');
unparseable.slice(0, 10).forEach(s => console.log(`  ${JSON.stringify(s)}`));
console.log('');

console.log('── Distinct initials seen ──────────────────────────────────────');
console.log(`  Known   : ${[...allInitials].filter(i => KNOWN_INITIALS.has(i)).sort().join(', ')}`);
console.log(`  UNKNOWN : ${unknownInitials.join(', ') || '(none)'}`);
console.log('');

console.log('── Distinct project tokens seen ────────────────────────────────');
console.log(`  Known   : ${[...allProjects].filter(p => KNOWN_PROJECTS.has(p)).sort().join(', ')}`);
console.log(`  UNKNOWN : ${unknownProjects.join(', ') || '(none)'}`);
console.log('='.repeat(70));
