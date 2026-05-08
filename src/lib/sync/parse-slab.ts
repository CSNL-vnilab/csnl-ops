/**
 * TypeScript port of scripts/lib/parse-slab-event.mjs.
 * Preserves identical regex constants, branch order, and return shape.
 * All 8 regex branches (system_test, open_lab, admin meetings [3a-3d],
 * canonical 4a/4b/4c, korean cohort, pilot, bracket-only, unparseable)
 * are retained verbatim.
 */

import type { calendar_v3 } from "googleapis";

// ---------------------------------------------------------------------------
// Timezone note: all-day events on the Slab calendar originate in Asia/Seoul
// (KST, UTC+9). We anchor all-day start/end to T00:00:00+09:00 so that the
// timestamptz stored in Postgres correctly represents midnight KST.
// ---------------------------------------------------------------------------
const KST_SUFFIX = "T00:00:00+09:00";

export interface ParsedSlabRow {
  slab_calendar_event_id: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  raw_summary: string;
  event_kind: string;
  experimenter_initials: string[];
  exp_code: string | null;
  project_code: string | null;
  subject_no: number | null;
  day_no: number | null;
  participant_label: string | null;
  parse_status: "parsed" | "partial" | "unparseable";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveTimestamps(
  start: calendar_v3.Schema$EventDateTime | undefined,
  end: calendar_v3.Schema$EventDateTime | undefined
): { scheduled_start: string | null; scheduled_end: string | null } {
  const s =
    start?.dateTime ?? (start?.date ? start.date + KST_SUFFIX : null);
  const e = end?.dateTime ?? (end?.date ? end.date + KST_SUFFIX : null);
  return { scheduled_start: s ?? null, scheduled_end: e ?? null };
}

function parseInitials(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((t) => t.trim().toUpperCase())
    .filter((t) => /^[A-Z]{2,4}$/.test(t));
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
const RE_TA = /^\s*TA\s*Meeting/i;
// Step 3d — generic Meeting: INIT[, INIT…]
const RE_MEETING = /^\s*Meeting\s*:\s*([A-Za-z].*)$/i;

// Step 3 — initials after a colon in admin meeting titles
const RE_AFTER_COLON = /:(.+)$/;

// Step 4 — canonical experiment: [INIT] ExpCode / Sbj N / Day N
// Pattern 4a: Sbj before Day (canonical)
const RE_CANONICAL_SBJ_DAY =
  /^\s*\[([^\]]+)\]\s*(\S+?)\s*\/\s*Sbj\s*(\d+)\s*\/\s*Day\s*(\d+)/i;
// Pattern 4b: Day before Sbj (observed in real data)
const RE_CANONICAL_DAY_SBJ =
  /^\s*\[([^\]]+)\]\s*(\S+?)\s*\/\s*Day\s*(\d+)\s*\/?\s*Sbj\s*(\d+)/i;
// Pattern 4c: Sbj + label in parens + Day
const RE_CANONICAL_SBJ_LABEL_DAY =
  /^\s*\[([^\]]+)\]\s*(\S+?)\s+Sbj\s*(\d+)\s*\([^)]*\)\s*Day\s*(\d+)/i;

// Step 5 — Korean cohort variant: [INIT] ExpCode / Day N / 기간 N [/ name]
const RE_KOREAN =
  /^\s*\[([^\]]+)\]\s*(\S+?)\s*\/\s*Day\s*(\d+)\s*\/\s*기간\s*(\d+)/i;

// Step 6 — pilot/main-task variants after [INIT]
const RE_PILOT =
  /^\s*\[([^\]]+)\]\s*((?:Self[-\s]Pilot|Main\s+task\s+pilot|Pilot\s+with\s+Interns|Main\s+task|Pilot)\b.*)/i;
const RE_PAREN_LABEL = /\(([^)]+)\)/;

// Step 7 — bracket-only fallback
const RE_BRACKET = /^\s*\[([^\]]+)\]\s*(.*)$/;

// ---------------------------------------------------------------------------
// Core parser
// ---------------------------------------------------------------------------

export function parseSlabEvent(
  event: calendar_v3.Schema$Event
): ParsedSlabRow {
  // googleapis types each of these as `string | null | undefined`; normalize
  // here so the rest of the parser can treat `summary` as plain string.
  const id: string | null = event.id ?? null;
  const summary: string = event.summary ?? "";
  const { scheduled_start, scheduled_end } = resolveTimestamps(
    event.start ?? undefined,
    event.end ?? undefined
  );

  const base: ParsedSlabRow = {
    slab_calendar_event_id: id,
    scheduled_start,
    scheduled_end,
    raw_summary: summary,
    event_kind: "other",
    experimenter_initials: [],
    exp_code: null,
    project_code: null,
    subject_no: null,
    day_no: null,
    participant_label: null,
    parse_status: "unparseable",
  };

  const s = summary;

  // ── 1. System-test artefact ─────────────────────────────────────────────
  if (RE_SYSTEM_TEST.test(s)) {
    return { ...base, event_kind: "system_test", parse_status: "parsed" };
  }

  // ── 2. OpenLab ──────────────────────────────────────────────────────────
  if (RE_OPEN_LAB.test(s)) {
    return { ...base, event_kind: "open_lab", parse_status: "parsed" };
  }

  // ── 3. Admin meetings ───────────────────────────────────────────────────
  {
    let meetingKind: string | null = null;
    if (RE_TAC.test(s)) meetingKind = "tac_meeting";
    else if (RE_PDM.test(s)) meetingKind = "pdm_meeting";
    else if (RE_TA.test(s)) meetingKind = "ta_meeting";
    else if (RE_MEETING.test(s)) meetingKind = "meeting";

    if (meetingKind) {
      const afterColon = RE_AFTER_COLON.exec(s);
      const initials = afterColon ? parseInitials(afterColon[1]) : [];
      return {
        ...base,
        event_kind: meetingKind,
        experimenter_initials: initials,
        parse_status: "parsed",
      };
    }
  }

  // ── 4. Canonical experiment variants ────────────────────────────────────
  // 4a: [INIT] ExpCode / Sbj N / Day N
  {
    const m = RE_CANONICAL_SBJ_DAY.exec(s);
    if (m) {
      return {
        ...base,
        event_kind: "experiment",
        experimenter_initials: parseInitials(m[1]),
        exp_code: m[2],
        subject_no: parseInt(m[3], 10),
        day_no: parseInt(m[4], 10),
        parse_status: "parsed",
      };
    }
  }
  // 4b: [INIT] ExpCode / Day N / Sbj N [name]
  {
    const m = RE_CANONICAL_DAY_SBJ.exec(s);
    if (m) {
      return {
        ...base,
        event_kind: "experiment",
        experimenter_initials: parseInitials(m[1]),
        exp_code: m[2],
        day_no: parseInt(m[3], 10),
        subject_no: parseInt(m[4], 10),
        parse_status: "parsed",
      };
    }
  }
  // 4c: [INIT] ExpCode Sbj N (label) DayN
  {
    const m = RE_CANONICAL_SBJ_LABEL_DAY.exec(s);
    if (m) {
      const labelMatch = RE_PAREN_LABEL.exec(s);
      return {
        ...base,
        event_kind: "experiment",
        experimenter_initials: parseInitials(m[1]),
        exp_code: m[2],
        subject_no: parseInt(m[3], 10),
        day_no: parseInt(m[4], 10),
        participant_label: labelMatch ? labelMatch[1].trim() : null,
        parse_status: "parsed",
      };
    }
  }

  // ── 5. Korean cohort variant: [INIT] ExpCode / Day N / 기간 N ───────────
  {
    const m = RE_KOREAN.exec(s);
    if (m) {
      return {
        ...base,
        event_kind: "experiment",
        experimenter_initials: parseInitials(m[1]),
        exp_code: m[2],
        day_no: parseInt(m[3], 10),
        subject_no: parseInt(m[4], 10), // 기간 → subject_no (cohort #)
        parse_status: "parsed",
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
        event_kind: "experiment",
        experimenter_initials: parseInitials(m[1]),
        participant_label: labelMatch ? labelMatch[1].trim() : null,
        parse_status: "partial",
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
          event_kind: "experiment",
          experimenter_initials: initials,
          parse_status: "partial",
        };
      }
    }
  }

  // ── 8. Unparseable ───────────────────────────────────────────────────────
  return base;
}
