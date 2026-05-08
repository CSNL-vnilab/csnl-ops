import type { SupabaseClient } from "@supabase/supabase-js";

export interface AnomalyInput {
  kind: string;
  payload: Record<string, unknown>;
  sourceId?: string;
  sourceKind?: string;
}

/**
 * Best-effort insert into csnl_ops.sync_anomalies.
 * Never throws — logging failures must not crash the calling cron.
 */
export async function recordAnomaly(
  anomaly: AnomalyInput,
  admin: SupabaseClient
): Promise<void> {
  try {
    await admin.schema("csnl_ops").from("sync_anomalies").insert({
      kind: anomaly.kind,
      payload: anomaly.payload,
      source_id: anomaly.sourceId ?? null,
      source_kind: anomaly.sourceKind ?? null,
    });
  } catch {
    // Intentionally swallowed — anomaly recording is best-effort.
  }
}
