import { google } from '/Users/csnl/Documents/claude/lab-reservation/node_modules/googleapis/build/src/index.js';

const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

if (!email || !email.trim()) {
  console.error('ERROR: GOOGLE_SERVICE_ACCOUNT_EMAIL is not set or empty.');
  process.exit(1);
}
if (!rawKey || !rawKey.trim()) {
  console.error('ERROR: GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is not set or empty.');
  process.exit(1);
}

// Replace literal \n escapes with real newlines
const privateKey = rawKey.replace(/\\n/g, '\n');

const auth = new google.auth.JWT({
  email,
  key: privateKey,
  scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
});

const calendar = google.calendar({ version: 'v3', auth });

try {
  const res = await calendar.calendarList.list({ maxResults: 250, showHidden: true });
  const items = res.data.items ?? [];

  console.log('');
  console.log('SUMMARY'.padEnd(50) + 'ID'.padEnd(60) + 'ACCESS ROLE'.padEnd(15) + 'PRIMARY');
  console.log('-'.repeat(130));

  for (const cal of items) {
    const summary = (cal.summary ?? '(no title)').substring(0, 48).padEnd(50);
    const id = (cal.id ?? '').padEnd(60);
    const role = (cal.accessRole ?? '').padEnd(15);
    const primary = cal.primary ? 'yes' : '';
    console.log(`${summary}${id}${role}${primary}`);
  }

  console.log('-'.repeat(130));
  console.log(`Total: ${items.length} calendar(s)`);
} catch (err) {
  console.error('ERROR calling calendarList.list:', err.message);
  process.exit(1);
}
