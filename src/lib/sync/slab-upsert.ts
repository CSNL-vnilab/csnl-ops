import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedSlabRow } from "./parse-slab";

export interface UpsertCounts {
  inserted: number;
  updated: number;
  skipped: number;
}

/**
 * Idempotent upsert of parsed slab rows into csnl_ops.experiment_bookings.
 * Conflict key: slab_calendar_event_id.
 * On conflict: updates all mutable columns and sets updated_at = now().
 */
export async function upsertSlabBookings(
  rows: ParsedSlabRow[],
  admin: SupabaseClient
): Promise<UpsertCounts> {
  if (rows.length === 0) {
    return { inserted: 0, updated: 0, skipped: 0 };
  }

  const records = rows.map((r) => ({
    slab_calendar_event_id: r.slab_calendar_event_id,
    scheduled_start: r.scheduled_start,
    scheduled_end: r.scheduled_end,
    raw_summary: r.raw_summary,
    event_kind: r.event_kind,
    experimenter_initials: r.experimenter_initials,
    exp_code: r.exp_code,
    project_code: r.project_code,
    subject_no: r.subject_no,
    day_no: r.day_no,
    participant_label: r.participant_label,
    parse_status: r.parse_status,
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await admin
    .schema("csnl_ops")
    .from("experiment_bookings")
    .upsert(records, {
      onConflict: "slab_calendar_event_id",
      ignoreDuplicates: false,
    })
    .select("slab_calendar_event_id, updated_at");

  if (error) {
    throw new Error(`upsertSlabBookings failed: ${error.message}`);
  }

  // Supabase upsert returns all affected rows regardless of insert vs update.
  // We approximate: rows returned = upserted total; we cannot distinguish
  // insert vs update from the upsert response alone without a before-image,
  // so we report total as upserted and leave updated=0 / inserted=total.
  // Callers that need precise insert/update counts should use the DB trigger
  // approach or a separate SELECT before upsert.
  const total = data?.length ?? rows.length;
  return { inserted: total, updated: 0, skipped: rows.length - total };
}
