import type { calendar_v3 } from "googleapis";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LabMeetingRow {
  id: string;
  meeting_date: string; // YYYY-MM-DD
  type: string; // 'grm' | 'special_grm' | …
  presenter_initial: string | null;
  slides_path: string | null;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Return the YYYY-MM-DD date string for a calendar event in Asia/Seoul time.
 * Handles both date-only events and datetime events.
 */
export function eventDateSeoul(event: calendar_v3.Schema$Event): string | null {
  // All-day events carry `date`; timed events carry `dateTime`.
  const raw = event.start?.date ?? event.start?.dateTime ?? null;
  if (!raw) return null;

  // If it's already a plain date string (YYYY-MM-DD) use it directly.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // Otherwise parse the ISO datetime and convert to Asia/Seoul wall-clock date.
  const d = new Date(raw);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }); // "YYYY-MM-DD"
}

// ---------------------------------------------------------------------------
// bucketCalendarGrmEvents
// ---------------------------------------------------------------------------

export interface GrmBucket {
  /** Map from YYYY-MM-DD → array of matching calendar events */
  dates: Map<string, calendar_v3.Schema$Event[]>;
  /** Set of YYYY-MM-DD dates whose event summary contains 'special' */
  special: Set<string>;
}

/**
 * Filter a raw calendar event list down to GRM events and bucket them by date.
 *
 * Matching rules:
 *   - Summary matches /^\s*(?:special[-\s]?)?GRM\s*$/i   (standalone GRM / special GRM)
 *   - OR summary matches /\bGRM\b/i                      (GRM anywhere in title)
 *
 * A date is added to `special` when the summary contains the word "special"
 * (case-insensitive).
 */
export function bucketCalendarGrmEvents(
  events: calendar_v3.Schema$Event[]
): GrmBucket {
  const dates = new Map<string, calendar_v3.Schema$Event[]>();
  const special = new Set<string>();

  const standaloneGrm = /^\s*(?:special[-\s]?)?GRM\s*$/i;
  const containsGrm = /\bGRM\b/i;
  const containsSpecial = /\bspecial\b/i;

  for (const event of events) {
    const summary = event.summary ?? "";
    if (!standaloneGrm.test(summary) && !containsGrm.test(summary)) continue;

    const date = eventDateSeoul(event);
    if (!date) continue;

    const bucket = dates.get(date) ?? [];
    bucket.push(event);
    dates.set(date, bucket);

    if (containsSpecial.test(summary)) {
      special.add(date);
    }
  }

  return { dates, special };
}

// ---------------------------------------------------------------------------
// classifyDate
// ---------------------------------------------------------------------------

export type DateClassification =
  | "matched"
  | "missing"
  | "special_grm_promote"
  | "orphan";

/**
 * Classify a single date given its calendar events and existing DB rows.
 *
 * | calendarEvents | dbRows | result              |
 * |----------------|--------|---------------------|
 * | present        | 0      | 'missing'           |
 * | present        | 1      | 'matched'           |
 * | present        | 2+     | 'special_grm_promote'|
 * | absent         | 1+     | 'orphan'            |
 *
 * NOTE: When calendarEvents is an empty array AND dbRows is non-empty, the
 * caller is checking an orphan date (file exists but no calendar event). Pass
 * an empty array for calendarEvents in that scenario.
 */
export function classifyDate(
  calendarEvents: calendar_v3.Schema$Event[],
  dbRows: LabMeetingRow[]
): DateClassification {
  const hasCalEvent = calendarEvents.length > 0;

  if (!hasCalEvent) {
    // DB row(s) exist but no calendar event in the window.
    return "orphan";
  }

  if (dbRows.length === 0) return "missing";
  if (dbRows.length === 1) return "matched";
  return "special_grm_promote";
}
