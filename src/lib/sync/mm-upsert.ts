import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedMmRow } from "./parse-mm";

export interface UpsertCounts {
  inserted: number;
  updated: number;
  skipped: number;
}

/**
 * Idempotent upsert of parsed milestone-meeting rows into
 * csnl_ops.milestone_meetings.
 *
 * Conflict key: csnl_calendar_event_id (UNIQUE constraint).
 * Note: the table PK is composite (meeting_date, researcher_initial).
 * Supabase-js supports onConflict targeting a UNIQUE column even when it
 * is not the PK, so we rely on that here. If the PostgREST version in use
 * does not honour non-PK unique constraints via onConflict, the fallback
 * is a SELECT-then-INSERT/UPDATE loop (not currently needed).
 *
 * We do NOT touch slides_path or slides_submitted — those columns are
 * owned by the resolver script (Phase D part 2).
 */
export async function upsertMilestoneMeetings(
  rows: ParsedMmRow[],
  admin: SupabaseClient
): Promise<UpsertCounts> {
  if (rows.length === 0) {
    return { inserted: 0, updated: 0, skipped: 0 };
  }

  const records = rows.map((r) => ({
    csnl_calendar_event_id: r.csnl_calendar_event_id,
    meeting_date: r.meeting_date,
    researcher_initial: r.researcher_initial,
    notes: r.notes,
  }));

  const { data, error } = await admin
    .schema("csnl_ops")
    .from("milestone_meetings")
    .upsert(records, {
      onConflict: "csnl_calendar_event_id",
      ignoreDuplicates: false,
    })
    .select("csnl_calendar_event_id");

  if (error) {
    throw new Error(`upsertMilestoneMeetings failed: ${error.message}`);
  }

  // Supabase upsert returns all affected rows but does not distinguish
  // insert vs update. Report total as inserted, same caveat as slab-upsert.
  const total = data?.length ?? rows.length;
  return { inserted: total, updated: 0, skipped: rows.length - total };
}
