import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedMmRow } from "./parse-mm";

export interface UpsertCounts {
  inserted: number;
  updated: number;
  skipped: number;
}

interface MmRecord {
  csnl_calendar_event_id: string;
  meeting_date: string;
  researcher_initial: string;
  notes: string | null;
}

/** Identity of a row under the table's PRIMARY KEY. */
function pkOf(row: { meeting_date: string; researcher_initial: string }): string {
  return `${row.meeting_date}|${row.researcher_initial}`;
}

/**
 * Idempotent upsert of parsed milestone-meeting rows into
 * csnl_ops.milestone_meetings.
 *
 * The table carries TWO unique constraints:
 *   - PRIMARY KEY (meeting_date, researcher_initial)   -> milestone_meetings_pkey
 *   - UNIQUE      (csnl_calendar_event_id)
 *
 * An incoming row can collide on either, so the conflict target must be the PK.
 * Conflicting on csnl_calendar_event_id (the previous behaviour) meant that a
 * calendar event which was deleted-and-recreated — or simply duplicated — showed
 * up with a NEW event id for an EXISTING (meeting_date, researcher_initial)
 * slot: ON CONFLICT never fired, the INSERT proceeded, and Postgres rejected it
 * with `duplicate key value violates unique constraint "milestone_meetings_pkey"`.
 * That made every scheduled run fail (30/30 runs, 2026-07-06 .. 2026-07-21).
 *
 * Handling, in order:
 *   1. De-duplicate the batch by PK (last occurrence wins), so one statement can
 *      never affect the same row twice.
 *   2. Release the unique event id from any stored row holding an incoming event
 *      id at a DIFFERENT slot (a rescheduled meeting) by setting it to NULL.
 *      Non-destructive: the old row and its slides_* columns survive; only the
 *      calendar linkage moves.
 *   3. Upsert on the real PK, so a recreated event refreshes the existing slot.
 *
 * slides_path / slides_submitted are still NEVER touched — they are owned by the
 * resolver script (Phase D part 2) and are absent from the payload, so
 * ON CONFLICT DO UPDATE leaves them untouched.
 */
export async function upsertMilestoneMeetings(
  rows: ParsedMmRow[],
  admin: SupabaseClient
): Promise<UpsertCounts> {
  if (rows.length === 0) {
    return { inserted: 0, updated: 0, skipped: 0 };
  }

  // 1. De-duplicate the batch by PK; the last occurrence wins.
  const byPk = new Map<string, MmRecord>();
  for (const r of rows) {
    byPk.set(pkOf(r), {
      csnl_calendar_event_id: r.csnl_calendar_event_id,
      meeting_date: r.meeting_date,
      researcher_initial: r.researcher_initial,
      notes: r.notes,
    });
  }
  const records = [...byPk.values()];

  // 2. Release the unique event id from rows whose meeting moved to another slot.
  const incomingIds = records
    .map((r) => r.csnl_calendar_event_id)
    .filter((id): id is string => Boolean(id));

  if (incomingIds.length > 0) {
    const { data: storedData, error: selectError } = await admin
      .schema("csnl_ops")
      .from("milestone_meetings")
      .select("meeting_date, researcher_initial, csnl_calendar_event_id")
      .in("csnl_calendar_event_id", incomingIds);

    if (selectError) {
      throw new Error(`upsertMilestoneMeetings failed: ${selectError.message}`);
    }

    const stored = (storedData ?? []) as Array<{
      meeting_date: string;
      researcher_initial: string;
      csnl_calendar_event_id: string;
    }>;

    // Built with an explicit loop: `new Map(arr.map(() => [a, b]))` infers
    // string[][] rather than a tuple and fails `tsc --noEmit`.
    const wantedSlot = new Map<string, string>();
    for (const r of records) {
      wantedSlot.set(r.csnl_calendar_event_id, pkOf(r));
    }

    for (const row of stored) {
      // Already parked in the slot the calendar says it belongs to.
      if (wantedSlot.get(row.csnl_calendar_event_id) === pkOf(row)) continue;

      const { error: releaseError } = await admin
        .schema("csnl_ops")
        .from("milestone_meetings")
        .update({ csnl_calendar_event_id: null })
        .eq("meeting_date", row.meeting_date)
        .eq("researcher_initial", row.researcher_initial);

      if (releaseError) {
        throw new Error(
          `upsertMilestoneMeetings failed releasing event ` +
            `${row.csnl_calendar_event_id}: ${releaseError.message}`
        );
      }
    }
  }

  // 3. Upsert on the real primary key.
  const { data, error } = await admin
    .schema("csnl_ops")
    .from("milestone_meetings")
    .upsert(records, {
      onConflict: "meeting_date,researcher_initial",
      ignoreDuplicates: false,
    })
    .select("csnl_calendar_event_id");

  if (error) {
    throw new Error(`upsertMilestoneMeetings failed: ${error.message}`);
  }

  // Supabase upsert returns all affected rows but does not distinguish
  // insert vs update. Report total as inserted, same caveat as slab-upsert.
  // `skipped` now reports intra-batch duplicates collapsed in step 1.
  const total = data?.length ?? records.length;
  return {
    inserted: total,
    updated: 0,
    skipped: rows.length - records.length,
  };
}
