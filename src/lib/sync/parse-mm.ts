/**
 * Parser for CSNL milestone meeting events from the CSNL Google Calendar.
 *
 * Only emits rows for events whose summary matches:
 *   /^\s*Meeting\s*:\s*([A-Z]{2,4})\s*$/i
 * (i.e. exactly "Meeting: INIT" with optional surrounding whitespace)
 *
 * All other events — admin meetings, GRM, lab hours, OOO — return null.
 */

import type { calendar_v3 } from "googleapis";

// ---------------------------------------------------------------------------
// Known researcher sets
// ---------------------------------------------------------------------------

// INVARIANT: every initial below MUST exist in csnl_ops.researchers.
// milestone_meetings.researcher_initial carries a FOREIGN KEY to that table, so
// a token this parser calls "parsed" but which has no researcher row makes the
// upsert fail with milestone_meetings_researcher_initial_fkey and 500s the whole
// sync. "known to the parser" therefore has to mean "FK-satisfiable".

/** Current lab members. */
const CURRENT_MEMBERS = new Set([
  // JWL (Joonwon Lee) was missing, so every "Meeting: JWL" was silently
  // discarded as unknown_initial despite him having a researcher row.
  "SL", "JSL", "JOP", "BYL", "JYK", "MSY", "SMJ", "SK", "JWL",
  "MJC", "JHR", "BHL",   // active per the lab registry, previously listed as past
]);

/** Past lab members whose initials may still appear in the calendar. */
const PAST_MEMBERS = new Set([
  // Removed: DG / KY / LS / BRL / CRC — none of these have a researcher row.
  // DG was a typo for DGY; KY is SK's old alias (both handled via ALIASES
  // below); LS / BRL / CRC are not people at all.
  "HSL", "JYA", "SYJ", "HJH", "HG", "HJL", "DGY",
  "HS", "SHP", "JK", "JWR", "KWC",
]);

/**
 * Calendar tokens that denote a member under a different name.
 *
 * The lab registry records that MJC appears on calendars as "MJ" or "MinJin",
 * and that SK historically appeared as "KY". Without this mapping those events
 * resolve to a token with no researcher row and are dropped (or, worse, are
 * treated as known and then violate the FK). Keys are upper-cased.
 */
const ALIASES = new Map<string, string>([
  ["MJ", "MJC"],
  ["MINJIN", "MJC"],
  ["KY", "SK"],
  ["DG", "DGY"],
]);

/** Resolve a raw calendar token to its canonical researcher initial. */
function canonicalInitial(token: string): string {
  const up = token.toUpperCase();
  return ALIASES.get(up) ?? up;
}

// ---------------------------------------------------------------------------
// Regex
// ---------------------------------------------------------------------------

/**
 * Matches "Meeting : INIT" — case-insensitive on the word "Meeting".
 * No extra tokens beyond the initials are allowed (strict $ anchor).
 *
 * Width is 2-8 letters, not 2-4: the registry documents "MinJin" (6) as a real
 * calendar token for MJC, and the old {2,4} bound meant "Meeting: MinJin" did
 * not match at all, so it was discarded as "not a milestone meeting" rather
 * than resolved. Tokens that are not members still fall through to
 * unknown_initial, which is no longer upserted.
 */
const RE_MM = /^\s*Meeting\s*:\s*([A-Za-z]{2,8})\s*$/i;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedMmRow {
  csnl_calendar_event_id: string;
  meeting_date: string;            // YYYY-MM-DD in Asia/Seoul
  researcher_initial: string;      // always uppercase
  notes: string | null;
  raw_summary: string;
  parse_status: "parsed" | "unknown_initial";
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Convert an ISO dateTime string to a YYYY-MM-DD date in Asia/Seoul (KST, UTC+9).
 */
function dateTimeToSeoulDate(dateTime: string): string {
  // Intl.DateTimeFormat is available in all modern Node.js runtimes.
  const dt = new Date(dateTime);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(dt);

  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const mo = parts.find((p) => p.type === "month")?.value ?? "";
  const d = parts.find((p) => p.type === "day")?.value ?? "";
  return `${y}-${mo}-${d}`;
}

/**
 * Resolve an event start to a YYYY-MM-DD string in Asia/Seoul.
 * - start.dateTime present → convert to Seoul date.
 * - start.date present (all-day event) → use as-is (already YYYY-MM-DD).
 * - Neither → return null.
 */
function resolveSeoulDate(
  start: calendar_v3.Schema$EventDateTime | null | undefined
): string | null {
  if (!start) return null;
  if (start.dateTime) return dateTimeToSeoulDate(start.dateTime);
  if (start.date) return start.date; // all-day date string
  return null;
}

// ---------------------------------------------------------------------------
// Core parser
// ---------------------------------------------------------------------------

/**
 * Attempt to parse a Google Calendar event as a CSNL milestone meeting row.
 * Returns null if the event is NOT a milestone meeting.
 */
export function parseMmEvent(
  event: calendar_v3.Schema$Event
): ParsedMmRow | null {
  const summary = event.summary ?? "";
  const m = RE_MM.exec(summary);

  // Not a milestone meeting event at all — caller should skip or route elsewhere.
  if (!m) return null;

  // event.id is required for upsert; treat missing id as non-parseable.
  const id = event.id;
  if (!id) return null;

  // Canonicalise first (MJ/MinJin -> MJC, KY -> SK) so an aliased token is
  // recognised as its real member and stored under the FK-valid initial.
  const initial = canonicalInitial(m[1]);
  const meetingDate = resolveSeoulDate(event.start);

  // Malformed event with no usable date — skip rather than insert bad data.
  if (!meetingDate) return null;

  const isKnown = CURRENT_MEMBERS.has(initial) || PAST_MEMBERS.has(initial);

  return {
    csnl_calendar_event_id: id,
    meeting_date: meetingDate,
    researcher_initial: initial,
    notes: null,
    raw_summary: summary,
    parse_status: isKnown ? "parsed" : "unknown_initial",
  };
}

// ---------------------------------------------------------------------------
// Self-test (run with: npx tsx src/lib/sync/parse-mm.ts)
// ---------------------------------------------------------------------------

if (process.env.NODE_ENV !== "production" && require.main === module) {
  function fakeEvent(
    summary: string,
    dateOrDateTime: string,
    isAllDay = false
  ): calendar_v3.Schema$Event {
    return {
      id: `evt-${summary.replace(/\s/g, "_")}`,
      summary,
      start: isAllDay ? { date: dateOrDateTime } : { dateTime: dateOrDateTime },
    };
  }

  const cases: [string, calendar_v3.Schema$Event, "parsed" | "unknown_initial" | null][] = [
    // 1. Canonical Meeting:JOP — parsed (current member)
    ["Meeting:JOP canonical", fakeEvent("Meeting:JOP", "2026-05-14T10:00:00+09:00"), "parsed"],
    // 2. Meeting: SK with extra space — parsed (current member)
    ["Meeting: SK extra space", fakeEvent("Meeting: SK", "2026-05-14T11:00:00+09:00"), "parsed"],
    // 3. Meeting:UNKNOWN — unknown_initial
    ["Meeting:UNKNOWN unknown_initial", fakeEvent("Meeting:UNKNOWN", "2026-05-14T12:00:00+09:00"), "unknown_initial"],
    // 4. Meeting: SL all-day event — parsed (current member)
    ["Meeting: SL all-day", fakeEvent("Meeting: SL", "2026-05-15", true), "parsed"],
    // 5. TAC meeting: JOP — returns null (admin meeting, not MM)
    ["TAC meeting: JOP → null", fakeEvent("TAC meeting: JOP", "2026-05-14T09:00:00+09:00"), null],
    // 6. GRM — returns null (unparseable)
    ["GRM → null", fakeEvent("GRM", "2026-05-14T14:00:00+09:00"), null],
  ];

  let passed = 0;
  let failed = 0;
  for (const [label, event, expectedStatus] of cases) {
    const result = parseMmEvent(event);
    const actualStatus = result ? result.parse_status : null;
    const ok = actualStatus === expectedStatus;
    console.log(`${ok ? "PASS" : "FAIL"} [${label}]: expected=${String(expectedStatus)} got=${String(actualStatus)}`);
    if (ok) passed++; else failed++;
  }
  console.log(`\n${passed} passed, ${failed} failed`);
}
