/**
 * parse-slab-event.mjs
 *
 * Pure ESM module — no googleapis, no Node built-ins required.
 * Exports parseSlabEvent(event) → row matching csnl_ops.experiment_bookings columns.
 *
 * event shape: { id, summary, start: {dateTime?|date?}, end: {dateTime?|date?} }
 */

// ---------------------------------------------------------------------------
// Timezone note: all-day events on the Slab calendar originate in Asia/Seoul
// (KST, UTC+9). We anchor all-day start/end to T00:00:00+09:00 so that the
// timestamptz stored in Postgres correctly represents midnight KST rather than
// drifting to the server's local timezone.
// ---------------------------------------------------------------------------
const KST_SUFFIX = 'T00:00:00+09:00';

/**
 * Resolve start/end ISO strings from a Google Calendar event object.
 * Timed events carry dateTime; all-day events carry date (YYYY-MM-DD).
 */
function resolveTimestamps(start, end) {
  const s = start?.dateTime ?? (start?.date ? start.date + KST_SUFFIX : null);
  const e = end?.dateTime   ?? (end?.date   ? end.date   + KST_SUFFIX : null);
  return { scheduled_start: s, scheduled_end: e ?? null };
}

/**
 * Tokenise the inside of a bracket, e.g. "BHL SYJ" or "BHL, SYJ".
 * Keeps only tokens that look like initials (2–4 uppercase ASCII letters).
 */
function parseInitials(raw) {
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map(t => t.trim().toUpperCase())
    .filter(t => /^[A-Z]{2,4}$/.test(t));
}

// ---------------------------------------------------------------------------
// Regex constants (ordered most-specific to most-general)
// ---------------------------------------------------------------------------

// Step 1 — system_test artefacts
const RE_SYSTEM_TEST = /\[E2E-/i;

// Step 2 — open lab
const RE_OPEN_LAB = /^\s*OpenLab\b/i;

// Step 3a — TAC meeting
const RE_TAC = /^\s*TAC\s*meeting/i;
// Step 3b — PDM meeting
const RE_PDM = /^\s*PDM\s*Meeting/i;
// Step 3c — TA meeting
const RE_TA  = /^\s*TA\s*Meeting/i;
// Step 3d — generic Meeting: INIT[, INIT…]
const RE_MEETING = /^\s*Meeting\s*:\s*([A-Za-z].*)$/i;

// Step 3 — initials after a colon in admin meeting titles
//   e.g. "TA Meeting: JOP, SMJ, BYL"  →  ["JOP","SMJ","BYL"]
const RE_AFTER_COLON = /:(.+)$/;

// Step 4 — canonical experiment: [INIT] ExpCode / Sbj N / Day N
// Real corpus shows: optional spaces around /, Sbj and Day order may vary.
// Pattern 4a: Sbj before Day (canonical)
const RE_CANONICAL_SBJ_DAY = /^\s*\[([^\]]+)\]\s*(\S+?)\s*\/\s*Sbj\s*(\d+)\s*\/\s*Day\s*(\d+)/i;
// Pattern 4b: Day before Sbj (observed in real data: [JOP] Exp1 / Day 1 / Sbj7 이보현)
const RE_CANONICAL_DAY_SBJ = /^\s*\[([^\]]+)\]\s*(\S+?)\s*\/\s*Day\s*(\d+)\s*\/?\s*Sbj\s*(\d+)/i;
// Pattern 4c: Sbj + label in parens + Day (e.g. [JOP] Exp1 Sbj9 (김서연) Day1)
const RE_CANONICAL_SBJ_LABEL_DAY = /^\s*\[([^\]]+)\]\s*(\S+?)\s+Sbj\s*(\d+)\s*\([^)]*\)\s*Day\s*(\d+)/i;

// Step 5 — Korean cohort variant: [INIT] ExpCode / Day N / 기간 N [/ 이름]
// 기간 (期間) is the cohort / batch number used instead of Sbj#.
// Convention: we store it in subject_no so queries can treat it uniformly.
// Real corpus shows spaces around slashes are variable (/ Day1 / or / Day 1 /).
const RE_KOREAN = /^\s*\[([^\]]+)\]\s*(\S+?)\s*\/\s*Day\s*(\d+)\s*\/\s*기간\s*(\d+)/i;

// Step 6 — pilot/main-task variants after [INIT]
// Covers: Pilot, Self-Pilot, self pilot, Main task pilot, Pilot with Interns, Main task
// The "Main task" variant (without pilot) is also used as a standalone pilot-equivalent.
const RE_PILOT = /^\s*\[([^\]]+)\]\s*((?:Self[-\s]Pilot|Main\s+task\s+pilot|Pilot\s+with\s+Interns|Main\s+task|Pilot)\b.*)/i;
const RE_PAREN_LABEL = /\(([^)]+)\)/;

// Step 7 — bracket-only fallback
const RE_BRACKET = /^\s*\[([^\]]+)\]\s*(.*)$/;

// ---------------------------------------------------------------------------
// Core parser
// ---------------------------------------------------------------------------

/**
 * @param {{ id: string, summary: string, start: object, end: object }} event
 * @returns {object} row matching csnl_ops.experiment_bookings columns
 */
export function parseSlabEvent(event) {
  const { id, summary = '', start, end } = event;
  const { scheduled_start, scheduled_end } = resolveTimestamps(start, end);

  // Base row — all parsed fields null until a pattern fires.
  const base = {
    slab_calendar_event_id: id,
    scheduled_start,
    scheduled_end,
    raw_summary:           summary,
    event_kind:            'other',
    experimenter_initials: [],
    exp_code:              null,
    project_code:          null, // mapping deferred — always null for now
    subject_no:            null,
    day_no:                null,
    participant_label:     null,
    parse_status:          'unparseable',
  };

  const s = summary;

  // ── 1. System-test artefact ─────────────────────────────────────────────
  if (RE_SYSTEM_TEST.test(s)) {
    return { ...base, event_kind: 'system_test', parse_status: 'parsed' };
  }

  // ── 2. OpenLab ──────────────────────────────────────────────────────────
  if (RE_OPEN_LAB.test(s)) {
    return { ...base, event_kind: 'open_lab', parse_status: 'parsed' };
  }

  // ── 3. Admin meetings ───────────────────────────────────────────────────
  {
    let meetingKind = null;
    if      (RE_TAC.test(s))     meetingKind = 'tac_meeting';
    else if (RE_PDM.test(s))     meetingKind = 'pdm_meeting';
    else if (RE_TA.test(s))      meetingKind = 'ta_meeting';
    else if (RE_MEETING.test(s)) meetingKind = 'meeting';

    if (meetingKind) {
      const afterColon = RE_AFTER_COLON.exec(s);
      const initials = afterColon ? parseInitials(afterColon[1]) : [];
      return {
        ...base,
        event_kind:            meetingKind,
        experimenter_initials: initials,
        parse_status:          'parsed',
      };
    }
  }

  // ── 4. Canonical experiment variants ─────────────────────────────────────
  // 4a: [INIT] ExpCode / Sbj N / Day N  (original canonical)
  {
    const m = RE_CANONICAL_SBJ_DAY.exec(s);
    if (m) {
      return {
        ...base,
        event_kind:            'experiment',
        experimenter_initials: parseInitials(m[1]),
        exp_code:              m[2],
        subject_no:            parseInt(m[3], 10),
        day_no:                parseInt(m[4], 10),
        parse_status:          'parsed',
      };
    }
  }
  // 4b: [INIT] ExpCode / Day N / Sbj N [name]  (Day-first order, observed in corpus)
  {
    const m = RE_CANONICAL_DAY_SBJ.exec(s);
    if (m) {
      return {
        ...base,
        event_kind:            'experiment',
        experimenter_initials: parseInitials(m[1]),
        exp_code:              m[2],
        day_no:                parseInt(m[3], 10),
        subject_no:            parseInt(m[4], 10),
        parse_status:          'parsed',
      };
    }
  }
  // 4c: [INIT] ExpCode Sbj N (label) DayN  (Sbj+label+Day inline, no slashes)
  {
    const m = RE_CANONICAL_SBJ_LABEL_DAY.exec(s);
    if (m) {
      const labelMatch = RE_PAREN_LABEL.exec(s);
      return {
        ...base,
        event_kind:            'experiment',
        experimenter_initials: parseInitials(m[1]),
        exp_code:              m[2],
        subject_no:            parseInt(m[3], 10),
        day_no:                parseInt(m[4], 10),
        participant_label:     labelMatch ? labelMatch[1].trim() : null,
        parse_status:          'parsed',
      };
    }
  }

  // ── 5. Korean cohort variant: [INIT] ExpCode / Day N / 기간 N ───────────
  // 기간 (cohort/batch number) is mapped to subject_no so downstream queries
  // can use a single column for "which participant slot this is".
  {
    const m = RE_KOREAN.exec(s);
    if (m) {
      return {
        ...base,
        event_kind:            'experiment',
        experimenter_initials: parseInitials(m[1]),
        exp_code:              m[2],
        day_no:                parseInt(m[3], 10),
        subject_no:            parseInt(m[4], 10), // 기간 → subject_no (cohort #)
        parse_status:          'parsed',
      };
    }
  }

  // ── 6. Pilot / Main-task variants ────────────────────────────────────────
  {
    const m = RE_PILOT.exec(s);
    if (m) {
      const labelMatch = RE_PAREN_LABEL.exec(m[2]);
      return {
        ...base,
        event_kind:            'experiment',
        experimenter_initials: parseInitials(m[1]),
        participant_label:     labelMatch ? labelMatch[1].trim() : null,
        parse_status:          'partial',
      };
    }
  }

  // ── 7. Bracket-only fallback ─────────────────────────────────────────────
  {
    const m = RE_BRACKET.exec(s);
    if (m) {
      const initials = parseInitials(m[1]);
      if (initials.length > 0) {
        return {
          ...base,
          event_kind:            'experiment',
          experimenter_initials: initials,
          parse_status:          'partial',
        };
      }
    }
  }

  // ── 8. Unparseable ───────────────────────────────────────────────────────
  return base;
}

// ---------------------------------------------------------------------------
// Self-test cases (10 branches — one per major code path)
// ---------------------------------------------------------------------------

export const __test__ = [
  // 1. system_test
  {
    label: 'system_test',
    input: { id: 'e1', summary: '[E2E-Exclude-A] @ some host', start: { dateTime: '2026-03-01T10:00:00+09:00' }, end: { dateTime: '2026-03-01T11:00:00+09:00' } },
    expect: { event_kind: 'system_test', parse_status: 'parsed' },
  },
  // 2. open_lab
  {
    label: 'open_lab',
    input: { id: 'e2', summary: 'OpenLab', start: { dateTime: '2026-03-02T13:00:00+09:00' }, end: { dateTime: '2026-03-02T17:00:00+09:00' } },
    expect: { event_kind: 'open_lab', parse_status: 'parsed' },
  },
  // 3a. tac_meeting
  {
    label: 'tac_meeting',
    input: { id: 'e3', summary: 'TAC meeting: JOP, SMJ', start: { dateTime: '2026-03-03T14:00:00+09:00' }, end: null },
    expect: { event_kind: 'tac_meeting', parse_status: 'parsed', experimenter_initials: ['JOP', 'SMJ'] },
  },
  // 3b. pdm_meeting
  {
    label: 'pdm_meeting',
    input: { id: 'e4', summary: 'PDM Meeting: BYL', start: { dateTime: '2026-03-04T10:00:00+09:00' }, end: null },
    expect: { event_kind: 'pdm_meeting', parse_status: 'parsed', experimenter_initials: ['BYL'] },
  },
  // 3c. ta_meeting
  {
    label: 'ta_meeting',
    input: { id: 'e5', summary: 'TA Meeting: JYK BYL SMJ', start: { dateTime: '2026-03-05T09:00:00+09:00' }, end: null },
    expect: { event_kind: 'ta_meeting', parse_status: 'parsed', experimenter_initials: ['JYK', 'BYL', 'SMJ'] },
  },
  // 4. canonical experiment (Sbj before Day)
  {
    label: 'canonical experiment Sbj/Day',
    input: { id: 'e6', summary: '[JOP] TimeExp1/Sbj 12/Day 5', start: { dateTime: '2026-03-06T10:00:00+09:00' }, end: { dateTime: '2026-03-06T12:00:00+09:00' } },
    expect: { event_kind: 'experiment', parse_status: 'parsed', exp_code: 'TimeExp1', subject_no: 12, day_no: 5, experimenter_initials: ['JOP'] },
  },
  // 4b. joint experimenter + Day-first order
  {
    label: 'joint experimenter Day/Sbj order',
    input: { id: 'e7', summary: '[BHL SYJ] Exp1 / Day 3 / Sbj7 이보현', start: { dateTime: '2026-03-07T13:00:00+09:00' }, end: { dateTime: '2026-03-07T15:00:00+09:00' } },
    expect: { event_kind: 'experiment', parse_status: 'parsed', exp_code: 'Exp1', day_no: 3, subject_no: 7, experimenter_initials: ['BHL', 'SYJ'] },
  },
  // 5. Korean cohort variant (기간)
  {
    label: 'korean cohort',
    input: { id: 'e8', summary: '[MSY] Exp1 / Day 2 / 기간3 / 이름', start: { date: '2026-03-08' }, end: { date: '2026-03-09' } },
    expect: { event_kind: 'experiment', parse_status: 'parsed', day_no: 2, subject_no: 3 },
  },
  // 6. pilot with parens label
  {
    label: 'pilot with label',
    input: { id: 'e9', summary: '[SMJ] Pilot (홍길동)', start: { dateTime: '2026-03-09T10:00:00+09:00' }, end: null },
    expect: { event_kind: 'experiment', parse_status: 'partial', participant_label: '홍길동', experimenter_initials: ['SMJ'] },
  },
  // 7. bracket-only fallback
  {
    label: 'bracket-only fallback',
    input: { id: 'e10', summary: '[JYK] some unrecognised format xyz', start: { dateTime: '2026-03-10T10:00:00+09:00' }, end: null },
    expect: { event_kind: 'experiment', parse_status: 'partial', experimenter_initials: ['JYK'] },
  },
];

/**
 * Run self-test and return { passed, total, failures }.
 * Prints results to stdout.
 */
export function runSelfTest() {
  let passed = 0;
  const failures = [];

  for (const tc of __test__) {
    const row = parseSlabEvent(tc.input);
    const mismatches = [];
    for (const [key, expected] of Object.entries(tc.expect)) {
      const actual = row[key];
      const ok = JSON.stringify(actual) === JSON.stringify(expected);
      if (!ok) mismatches.push(`  ${key}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
    if (mismatches.length === 0) {
      passed++;
      console.log(`  PASS  ${tc.label}`);
    } else {
      failures.push({ label: tc.label, mismatches });
      console.log(`  FAIL  ${tc.label}`);
      mismatches.forEach(m => console.log(m));
    }
  }

  console.log(`\nSelf-test: ${passed}/${__test__.length} passing`);
  return { passed, total: __test__.length, failures };
}
