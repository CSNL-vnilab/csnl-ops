/**
 * ingest-experiments.ts
 *
 * Core ingest logic for the completed-experiment pipeline.
 *
 * Pulls completed bookings from lab-reservation via the postgres_fdw mirror
 * (lab_reservation_mirror.*), resolves researcher initials by email, upserts
 * into csnl_ops.behavioral_experiments, and records anomalies for unmapped
 * emails.  After processing, sends a one-shot notification email for each new
 * unmapped-email anomaly.
 *
 * Usage (called from the cron route):
 *   const result = await ingestExperiments({ supabase, lookbackDays: 30 });
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendOne } from "@/lib/mail/send";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IngestOptions {
  /** Service-role Supabase client (bypasses RLS). */
  supabase: SupabaseClient;
  /** How many days back to scan for completed bookings. Default: 30. */
  lookbackDays?: number;
  /** If true, do all SELECTs but skip all upserts and email sends. */
  dryRun?: boolean;
}

export interface IngestResult {
  ingested: number;
  updated: number;
  anomalies: number;
  emailsSent: number;
  dryRun: boolean;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Row shapes (minimal — only fields we use in the mapping logic)
// ---------------------------------------------------------------------------

interface ProfileRow {
  id: string;
  email: string | null;
}

interface ExperimentRow {
  id: string;
  title: string | null;
  mode: string | null;
  categories: string[] | null;
  protocol_version: string | null;
  parameter_schema: unknown | null;
  offline_code_analysis: unknown | null;
  data_path: string | null;
  code_repo_url: string | null;
}

interface LocationRow {
  id: string;
  name: string | null;
}

interface ObservationRow {
  booking_id: string;
  observation_text: string | null;
}

interface RunProgressRow {
  booking_id: string;
  blocks_submitted: number | null;
  attention_fail_count: number | null;
  was_auto_completed: boolean | null;
  condition_assignment: string | null;
  online_verified_at: string | null;
}

interface BookingRow {
  id: string;
  experiment_id: string | null;
  participant_profile_id: string | null;
  location_id: string | null;
  subject_number: number | null;
  session_number: number | null;
  slot_start: string | null;
  slot_end: string | null;
  status: string | null;
  completed_at: string | null;
  updated_at: string | null;
  data_quality: string | null;
  exclusion_flag: boolean | null;
  exclusion_reason: string | null;
  is_pilot: boolean | null;
}

interface ResearcherRow {
  initial: string;
  email: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the cutoff ISO string for the lookback window.
 */
function lookbackCutoff(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Normalize an email for case-insensitive comparison.
 * Returns '' for null/undefined inputs so Map lookups degrade gracefully.
 */
function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/**
 * Build the upsert payload for csnl_ops.behavioral_experiments.
 * Maps fields from the joined lab-reservation rows to the mirror schema.
 * Returns null if required fields (slot_start, completed_at, experiment_id)
 * are missing — caller records a parse_error anomaly.
 */
function buildMirrorRow(
  booking: BookingRow,
  experiment: ExperimentRow | undefined,
  profile: ProfileRow | undefined,
  location: LocationRow | undefined,
  observation: ObservationRow | undefined,
  runProgress: RunProgressRow | undefined,
  researcherInitial: string | null
): Record<string, unknown> | null {
  if (!booking.slot_start || !booking.completed_at || !booking.experiment_id) {
    return null;
  }

  return {
    source_booking_id:     booking.id,
    researcher_initial:    researcherInitial,

    experiment_id:         booking.experiment_id,
    experiment_title:      experiment?.title ?? null,
    experiment_mode:       experiment?.mode ?? null,
    categories:            experiment?.categories ?? null,
    protocol_version:      experiment?.protocol_version ?? null,

    parameter_schema:      experiment?.parameter_schema ?? null,
    offline_code_analysis: experiment?.offline_code_analysis ?? null,
    condition_assignment:  runProgress?.condition_assignment ?? null,

    data_path:             experiment?.data_path ?? null,
    code_repo_url:         experiment?.code_repo_url ?? null,

    subject_number:        booking.subject_number ?? null,
    session_number:        booking.session_number ?? null,
    location_name:         location?.name ?? null,
    slot_start:            booking.slot_start,
    slot_end:              booking.slot_end ?? null,
    completed_at:          booking.completed_at,
    online_verified_at:    runProgress?.online_verified_at ?? null,

    data_quality:          booking.data_quality ?? null,
    exclusion_flag:        booking.exclusion_flag ?? false,
    exclusion_reason:      booking.exclusion_reason ?? null,
    is_pilot:              booking.is_pilot ?? false,
    blocks_submitted:      runProgress?.blocks_submitted ?? null,
    attention_fail_count:  runProgress?.attention_fail_count ?? null,
    was_auto_completed:    runProgress?.was_auto_completed ?? false,

    notable_observations:  observation?.observation_text ?? null,

    source_updated_at:     booking.updated_at ?? booking.slot_end ?? booking.completed_at,
    // ingested_at intentionally left out — DB DEFAULT now() on first insert;
    // on UPDATE the existing ingested_at is preserved.
  };
}

// ---------------------------------------------------------------------------
// Unmapped-email notification email template
// ---------------------------------------------------------------------------

interface UnmappedEmailContext {
  email: string;
  sourceBookingIds: string[];
}

function buildUnmappedEmailTemplate(ctx: UnmappedEmailContext): {
  subject: string;
  text: string;
  html: string;
} {
  const subject =
    "[csnl-ops] 등록되지 않은 이메일로 실험이 완료되었습니다";

  const text = `안녕하세요.

CSNL 연구 자동화 시스템(csnl-ops)에서 발송된 메일입니다.

귀하의 이메일(${ctx.email})로 lab-reservation 시스템에서 실험이 완료 처리되었으나,
해당 이메일이 csnl-ops 연구원 목록에 등록되어 있지 않아 연구원 코드와 연결할 수 없었습니다.

데이터는 시스템에 저장되었지만, 연구원 코드와의 연결이 완료되지 않은 상태입니다.
이 메일을 받으셨다면 관리자(jy061100@gmail.com)에게 문의해 주세요.

관련 예약 ID: ${ctx.sourceBookingIds.join(", ")}

— Claude`;

  const html = `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"></head>
<body style="font-family:sans-serif;color:#111;line-height:1.6;max-width:600px;margin:0 auto;padding:24px;">
  <p>안녕하세요.</p>
  <p>CSNL 연구 자동화 시스템(csnl-ops)에서 발송된 메일입니다.</p>
  <p>
    귀하의 이메일(<strong>${ctx.email}</strong>)로 lab-reservation 시스템에서 실험이 완료 처리되었으나,<br>
    해당 이메일이 csnl-ops 연구원 목록에 등록되어 있지 않아 연구원 코드와 연결할 수 없었습니다.
  </p>
  <p>
    데이터는 시스템에 저장되었지만, 연구원 코드와의 연결이 완료되지 않은 상태입니다.<br>
    이 메일을 받으셨다면 관리자(<a href="mailto:jy061100@gmail.com">jy061100@gmail.com</a>)에게 문의해 주세요.
  </p>
  <p style="color:#555;font-size:0.9em;">관련 예약 ID: ${ctx.sourceBookingIds.join(", ")}</p>
  <p>&mdash; Claude</p>
</body>
</html>`;

  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function ingestExperiments({
  supabase,
  lookbackDays = 30,
  dryRun = false,
}: IngestOptions): Promise<IngestResult> {
  const started = Date.now();

  console.log(
    `[ingest-experiments] starting (lookbackDays=${lookbackDays}, dryRun=${dryRun})`
  );

  // -------------------------------------------------------------------------
  // 1. Load researcher email → initial map from csnl_ops.researchers
  // -------------------------------------------------------------------------

  const { data: researchers, error: researchersErr } = await supabase
    .schema("csnl_ops")
    .from("researchers")
    .select("initial, email");

  if (researchersErr) {
    throw new Error(`researchers query failed: ${researchersErr.message}`);
  }

  // Build case-insensitive lookup map: lowercase email → initial
  const emailToInitial = new Map<string, string>();
  for (const r of (researchers ?? []) as ResearcherRow[]) {
    const norm = normalizeEmail(r.email);
    if (norm) emailToInitial.set(norm, r.initial);
  }

  console.log(
    `[ingest-experiments] loaded ${emailToInitial.size} researcher email mappings`
  );

  // -------------------------------------------------------------------------
  // 2. Fetch completed bookings from the FDW mirror
  // -------------------------------------------------------------------------

  const cutoff = lookbackCutoff(lookbackDays);

  // We fetch related tables separately and join in JS because the Supabase JS
  // client's schema() targeting does not support cross-schema foreign key joins,
  // and the lab_reservation_mirror tables are foreign (no FK metadata for
  // auto-join). Raw SQL via rpc would be cleaner but requires a DB function;
  // we keep it in application code per the "no premature abstractions" principle.

  const { data: bookings, error: bookingsErr } = await supabase
    .schema("lab_reservation_mirror" as never)
    .from("bookings" as never)
    .select("*")
    .eq("status", "completed")
    .gt("completed_at", cutoff)
    .order("completed_at", { ascending: false });

  if (bookingsErr) {
    throw new Error(
      `lab_reservation_mirror.bookings query failed: ${bookingsErr.message}. ` +
      "Has the FDW migration been applied and the Vault secrets set?"
    );
  }

  const completedBookings = (bookings ?? []) as BookingRow[];
  console.log(
    `[ingest-experiments] found ${completedBookings.length} completed booking(s) in last ${lookbackDays}d`
  );

  if (completedBookings.length === 0) {
    return {
      ingested: 0,
      updated: 0,
      anomalies: 0,
      emailsSent: 0,
      dryRun,
      durationMs: Date.now() - started,
    };
  }

  // -------------------------------------------------------------------------
  // 3. Fetch related rows in bulk (one query per related table)
  // -------------------------------------------------------------------------

  const bookingIds = completedBookings.map((b) => b.id);
  const experimentIds = [
    ...new Set(completedBookings.map((b) => b.experiment_id).filter(Boolean)),
  ] as string[];
  const profileIds = [
    ...new Set(
      completedBookings.map((b) => b.participant_profile_id).filter(Boolean)
    ),
  ] as string[];
  const locationIds = [
    ...new Set(completedBookings.map((b) => b.location_id).filter(Boolean)),
  ] as string[];

  // Experiments
  const { data: experiments, error: expErr } = await supabase
    .schema("lab_reservation_mirror" as never)
    .from("experiments" as never)
    .select("*")
    .in("id", experimentIds);

  if (expErr) {
    throw new Error(`experiments query failed: ${expErr.message}`);
  }
  const experimentMap = new Map<string, ExperimentRow>(
    ((experiments ?? []) as ExperimentRow[]).map((e) => [e.id, e])
  );

  // Profiles
  const { data: profiles, error: profErr } = await supabase
    .schema("lab_reservation_mirror" as never)
    .from("profiles" as never)
    .select("id, email")
    .in("id", profileIds);

  if (profErr) {
    throw new Error(`profiles query failed: ${profErr.message}`);
  }
  const profileMap = new Map<string, ProfileRow>(
    ((profiles ?? []) as ProfileRow[]).map((p) => [p.id, p])
  );

  // Locations
  const { data: locations, error: locErr } = await supabase
    .schema("lab_reservation_mirror" as never)
    .from("experiment_locations" as never)
    .select("id, name")
    .in("id", locationIds);

  if (locErr) {
    throw new Error(`experiment_locations query failed: ${locErr.message}`);
  }
  const locationMap = new Map<string, LocationRow>(
    ((locations ?? []) as LocationRow[]).map((l) => [l.id, l])
  );

  // Observations (first observation per booking)
  const { data: observations, error: obsErr } = await supabase
    .schema("lab_reservation_mirror" as never)
    .from("booking_observations" as never)
    .select("booking_id, observation_text")
    .in("booking_id", bookingIds);

  if (obsErr) {
    throw new Error(`booking_observations query failed: ${obsErr.message}`);
  }
  // Keep only the first observation per booking (most recent)
  const observationMap = new Map<string, ObservationRow>();
  for (const obs of (observations ?? []) as ObservationRow[]) {
    if (!observationMap.has(obs.booking_id)) {
      observationMap.set(obs.booking_id, obs);
    }
  }

  // Run progress
  const { data: runProgressRows, error: rpErr } = await supabase
    .schema("lab_reservation_mirror" as never)
    .from("experiment_run_progress" as never)
    .select(
      "booking_id, blocks_submitted, attention_fail_count, was_auto_completed, condition_assignment, online_verified_at"
    )
    .in("booking_id", bookingIds);

  if (rpErr) {
    throw new Error(
      `experiment_run_progress query failed: ${rpErr.message}`
    );
  }
  const runProgressMap = new Map<string, RunProgressRow>(
    ((runProgressRows ?? []) as RunProgressRow[]).map((r) => [r.booking_id, r])
  );

  // -------------------------------------------------------------------------
  // 4. Process each booking: map → upsert or record anomaly
  // -------------------------------------------------------------------------

  let ingested = 0;
  let updated = 0;
  let anomalyCount = 0;

  // Track new unmapped emails so we can send a single email per address
  // (not one per booking row).
  const newUnmappedEmails = new Map<string, string[]>(); // email → bookingIds[]

  for (const booking of completedBookings) {
    const experiment = booking.experiment_id
      ? experimentMap.get(booking.experiment_id)
      : undefined;
    const profile = booking.participant_profile_id
      ? profileMap.get(booking.participant_profile_id)
      : undefined;
    const location = booking.location_id
      ? locationMap.get(booking.location_id)
      : undefined;
    const observation = observationMap.get(booking.id);
    const runProgress = runProgressMap.get(booking.id);

    // Resolve researcher initial by profile email
    const profileEmail = normalizeEmail(profile?.email);
    const researcherInitial = profileEmail
      ? (emailToInitial.get(profileEmail) ?? null)
      : null;

    // Track unmapped emails for anomaly/notification
    if (profileEmail && !researcherInitial) {
      const existing = newUnmappedEmails.get(profileEmail) ?? [];
      existing.push(booking.id);
      newUnmappedEmails.set(profileEmail, existing);
    }

    // Build mirror row
    const mirrorRow = buildMirrorRow(
      booking,
      experiment,
      profile,
      location,
      observation,
      runProgress,
      researcherInitial
    );

    if (!mirrorRow) {
      // Required fields missing — record parse_error anomaly
      console.warn(
        `[ingest-experiments] booking ${booking.id} missing required fields — recording parse_error anomaly`
      );

      if (!dryRun) {
        await upsertIngestAnomaly(supabase, {
          anomaly_type: "parse_error",
          source_booking_id: booking.id,
          details: {
            booking_id: booking.id,
            missing_fields: [
              !booking.slot_start ? "slot_start" : null,
              !booking.completed_at ? "completed_at" : null,
              !booking.experiment_id ? "experiment_id" : null,
            ].filter(Boolean),
          },
        });
      } else {
        console.log(
          `[dry-run] Would record parse_error anomaly for booking ${booking.id}`
        );
      }
      anomalyCount++;
      continue;
    }

    if (dryRun) {
      console.log(
        `[dry-run] Would upsert booking ${booking.id} → researcher=${researcherInitial ?? "(unmapped)"}`
      );
      ingested++;
      continue;
    }

    // Upsert into behavioral_experiments
    const { error: upsertErr, data: upsertData } = await supabase
      .schema("csnl_ops")
      .from("behavioral_experiments")
      .upsert(mirrorRow, {
        onConflict: "source_booking_id",
        // Return the upserted row so we can distinguish insert vs update
        // by checking ingested_at vs source_updated_at.
        ignoreDuplicates: false,
      })
      .select("id, ingested_at, source_updated_at");

    if (upsertErr) {
      console.error(
        `[ingest-experiments] upsert failed for booking ${booking.id}: ${upsertErr.message}`
      );
      await upsertIngestAnomaly(supabase, {
        anomaly_type: "parse_error",
        source_booking_id: booking.id,
        details: { upsert_error: upsertErr.message },
      });
      anomalyCount++;
      continue;
    }

    // Heuristic: if ingested_at === now (within 1s), it was a fresh insert;
    // otherwise it was an update. The upsert always touches source_updated_at
    // so any re-run that touches the same row counts as "updated".
    const row = (upsertData ?? [])[0] as
      | { id: string; ingested_at: string; source_updated_at: string }
      | undefined;
    if (row) {
      const ingestedAt = new Date(row.ingested_at).getTime();
      if (Date.now() - ingestedAt < 2000) {
        ingested++;
      } else {
        updated++;
      }
    } else {
      ingested++;
    }
  }

  // -------------------------------------------------------------------------
  // 5. Record unmapped_email anomalies
  // -------------------------------------------------------------------------

  for (const [email, bookingIdList] of newUnmappedEmails) {
    console.log(
      `[ingest-experiments] unmapped email: ${email} (${bookingIdList.length} booking(s))`
    );

    if (!dryRun) {
      // Upsert one anomaly row per unmapped email (dedup by unique index)
      await upsertIngestAnomaly(supabase, {
        anomaly_type: "unmapped_email",
        source_booking_id: bookingIdList[0], // most recent booking
        unmapped_email: email,
        details: {
          booking_ids: bookingIdList,
          booking_count: bookingIdList.length,
        },
      });
    } else {
      console.log(
        `[dry-run] Would record unmapped_email anomaly for ${email}`
      );
    }
    anomalyCount++;
  }

  // -------------------------------------------------------------------------
  // 6. Send notification emails for new unmapped_email anomalies
  //    (notified_at IS NULL = not yet sent)
  // -------------------------------------------------------------------------

  let emailsSent = 0;

  if (!dryRun) {
    const { data: pendingNotifications, error: pendingErr } = await supabase
      .schema("csnl_ops")
      .from("experiment_ingest_anomalies")
      .select("id, unmapped_email, details")
      .eq("anomaly_type", "unmapped_email")
      .is("notified_at", null)
      .is("resolved_at", null);

    if (pendingErr) {
      console.error(
        `[ingest-experiments] failed to fetch pending notifications: ${pendingErr.message}`
      );
    } else {
      for (const notif of pendingNotifications ?? []) {
        const email = notif.unmapped_email as string | null;
        if (!email) continue;

        const bookingIds: string[] =
          (notif.details as { booking_ids?: string[] } | null)?.booking_ids ??
          [];

        const template = buildUnmappedEmailTemplate({
          email,
          sourceBookingIds: bookingIds,
        });

        const sendResult = await sendOne({
          to: email,
          subject: template.subject,
          text: template.text,
          html: template.html,
        });

        if (sendResult.ok) {
          emailsSent++;
          // Stamp notified_at
          await supabase
            .schema("csnl_ops")
            .from("experiment_ingest_anomalies")
            .update({ notified_at: new Date().toISOString() })
            .eq("id", notif.id);
          console.log(
            `[ingest-experiments] sent unmapped-email notification to ${email}`
          );
        } else {
          console.error(
            `[ingest-experiments] failed to send notification to ${email}: ${sendResult.error}`
          );
        }
      }
    }
  } else {
    // In dry-run, count how many would be sent
    const { data: pendingDry } = await supabase
      .schema("csnl_ops")
      .from("experiment_ingest_anomalies")
      .select("id, unmapped_email")
      .eq("anomaly_type", "unmapped_email")
      .is("notified_at", null)
      .is("resolved_at", null);

    const dryCount = (pendingDry ?? []).length;
    if (dryCount > 0) {
      console.log(
        `[dry-run] Would send ${dryCount} unmapped-email notification(s)`
      );
    }
  }

  const durationMs = Date.now() - started;
  console.log(
    `[ingest-experiments] done: ingested=${ingested} updated=${updated} anomalies=${anomalyCount} emailsSent=${emailsSent} duration=${durationMs}ms`
  );

  return { ingested, updated, anomalies: anomalyCount, emailsSent, dryRun, durationMs };
}

// ---------------------------------------------------------------------------
// Anomaly upsert helper
// ---------------------------------------------------------------------------

interface AnomalyUpsertInput {
  anomaly_type: string;
  source_booking_id?: string | null;
  unmapped_email?: string | null;
  details?: Record<string, unknown>;
}

/**
 * Upsert an experiment_ingest_anomaly row.
 * On conflict (anomaly_type, unmapped_email, source_booking_id) updates
 * last_seen_at to now().  Never throws.
 */
async function upsertIngestAnomaly(
  supabase: SupabaseClient,
  input: AnomalyUpsertInput
): Promise<void> {
  try {
    const { error } = await supabase
      .schema("csnl_ops")
      .from("experiment_ingest_anomalies")
      .upsert(
        {
          anomaly_type:      input.anomaly_type,
          source_booking_id: input.source_booking_id ?? null,
          unmapped_email:    input.unmapped_email ?? null,
          details:           input.details ?? {},
          last_seen_at:      new Date().toISOString(),
        },
        {
          onConflict:       "anomaly_type,unmapped_email,source_booking_id",
          ignoreDuplicates: false,
        }
      );

    if (error) {
      console.error(
        `[ingest-experiments] anomaly upsert failed (${input.anomaly_type}): ${error.message}`
      );
    }
  } catch (err) {
    // Best-effort — anomaly recording must not crash the caller.
    console.error(
      "[ingest-experiments] anomaly upsert threw:",
      err instanceof Error ? err.message : err
    );
  }
}
