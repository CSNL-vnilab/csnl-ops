import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authorizeCronRequest } from "@/lib/auth/cron-secret";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGoogleAuth } from "@/lib/google/auth";
import { fetchAllEvents } from "@/lib/google/calendar";
import { recordAnomaly } from "@/lib/sync/anomalies";
import {
  bucketCalendarGrmEvents,
  classifyDate,
} from "@/lib/sync/reconcile-grm";
import type { LabMeetingRow } from "@/lib/sync/reconcile-grm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// CSNL calendar (vnilab@gmail.com) — hosts both Milestone Meetings and GRM.
// Same calendar used by sync-csnl-mm.
const CSNL_CALENDAR_ID =
  process.env.CSNL_OPS_CSNL_CALENDAR_ID ?? "primary";

// Default window: 365d back (capture full historical NAS file set) +
// 30d forward (catch upcoming GRMs already on calendar).
const DEFAULT_LOOKBACK_DAYS = 365;
const DEFAULT_LOOKAHEAD_DAYS = 30;

async function handle(request: NextRequest) {
  const started = Date.now();

  if (!authorizeCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const dryRun = url.searchParams.get("dry_run") === "1";

    // -----------------------------------------------------------------------
    // 1. Resolve window.
    // -----------------------------------------------------------------------
    const now = new Date();
    const defaultSince = new Date(
      now.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
    );
    const defaultUntil = new Date(
      now.getTime() + DEFAULT_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000
    );
    const timeMin =
      url.searchParams.get("since") ?? defaultSince.toISOString();
    const timeMax =
      url.searchParams.get("until") ?? defaultUntil.toISOString();

    // -----------------------------------------------------------------------
    // 2. Fetch all CSNL calendar events and bucket GRM ones.
    // -----------------------------------------------------------------------
    const auth = getGoogleAuth();
    const events = await fetchAllEvents(
      CSNL_CALENDAR_ID,
      { timeMin, timeMax },
      auth
    );

    const { dates: calGrmDates, special: calSpecialDates } =
      bucketCalendarGrmEvents(events);

    const calendarGrmEvents = calGrmDates.size;

    // -----------------------------------------------------------------------
    // 3. Load all lab_meetings rows in the window from the DB.
    // -----------------------------------------------------------------------
    const admin = createAdminClient();

    const { data: dbRowsRaw, error: dbError } = await admin
      .schema("csnl_ops")
      .from("lab_meetings")
      .select("id, meeting_date, type, presenter_initial, slides_path")
      .in("type", ["grm", "special_grm"])
      .gte("meeting_date", timeMin.slice(0, 10))
      .lte("meeting_date", timeMax.slice(0, 10));

    if (dbError) {
      throw new Error(`lab_meetings query failed: ${dbError.message}`);
    }

    const dbRows: LabMeetingRow[] = (dbRowsRaw ?? []) as LabMeetingRow[];
    const labMeetingsInWindow = dbRows.length;

    // Group DB rows by meeting_date for O(1) lookup.
    const dbByDate = new Map<string, LabMeetingRow[]>();
    for (const row of dbRows) {
      const bucket = dbByDate.get(row.meeting_date) ?? [];
      bucket.push(row);
      dbByDate.set(row.meeting_date, bucket);
    }

    // -----------------------------------------------------------------------
    // 4. Reconcile calendar GRM events vs DB rows.
    // -----------------------------------------------------------------------
    let matched = 0;
    let missingInserted = 0;
    let specialGrmPromoted = 0;
    const anomalies: object[] = [];

    for (const [date, calEvents] of calGrmDates) {
      const rows = dbByDate.get(date) ?? [];
      const classification = classifyDate(calEvents, rows);

      if (classification === "matched") {
        matched++;
        continue;
      }

      if (classification === "missing") {
        // No NAS file found for this calendar date.
        const eventId = calEvents[0]?.id ?? null;
        const isSpecial = calSpecialDates.has(date);

        if (!dryRun) {
          const { error: insertError } = await admin
            .schema("csnl_ops")
            .from("lab_meetings")
            .insert({
              meeting_date: date,
              type: isSpecial ? "special_grm" : "grm",
              presenter_initial: null,
              slides_path: null,
              slides_format: null,
              paper_doi: null,
              notes: "cal-only — no NAS file found",
            });

          if (insertError) {
            throw new Error(
              `lab_meetings insert failed for ${date}: ${insertError.message}`
            );
          }

          await recordAnomaly(
            {
              kind: "grm_presenter_missing",
              payload: { meeting_date: date, calendar_event_id: eventId },
              sourceId: eventId ?? undefined,
              sourceKind: "csnl_calendar_event",
            },
            admin
          );
        }

        missingInserted++;
        anomalies.push({
          kind: "grm_presenter_missing",
          meeting_date: date,
          calendar_event_id: eventId,
        });
        continue;
      }

      if (classification === "special_grm_promote") {
        // Multiple presenter rows on the same date — promote all to special_grm
        // and mirror into special_grm_presenters side table.
        const presenterInitials = rows.map((r) => r.presenter_initial);
        const rowIds = rows.map((r) => r.id);

        if (!dryRun) {
          const { error: updateError } = await admin
            .schema("csnl_ops")
            .from("lab_meetings")
            .update({ type: "special_grm" })
            .in("id", rowIds);

          if (updateError) {
            throw new Error(
              `lab_meetings promote failed for ${date}: ${updateError.message}`
            );
          }

          // Upsert one row per presenter into the side table.
          const sideRows = rows.map((r) => ({
            meeting_date: date,
            presenter_initial: r.presenter_initial,
          }));

          const { error: sideError } = await admin
            .schema("csnl_ops")
            .from("special_grm_presenters")
            .upsert(sideRows, {
              onConflict: "meeting_date,presenter_initial",
              ignoreDuplicates: true,
            });

          if (sideError) {
            throw new Error(
              `special_grm_presenters upsert failed for ${date}: ${sideError.message}`
            );
          }

          await recordAnomaly(
            {
              kind: "special_grm_promoted",
              payload: { meeting_date: date, presenters: presenterInitials },
              sourceKind: "csnl_calendar_event",
            },
            admin
          );
        }

        specialGrmPromoted++;
        anomalies.push({
          kind: "special_grm_promoted",
          meeting_date: date,
          presenters: presenterInitials,
        });
      }
    }

    // -----------------------------------------------------------------------
    // 5. Detect orphan DB rows (file exists, no corresponding calendar event).
    // -----------------------------------------------------------------------
    let orphanFiles = 0;

    for (const [date, rows] of dbByDate) {
      if (calGrmDates.has(date)) continue; // already reconciled above

      // Date is within the window but has no calendar GRM event.
      orphanFiles++;

      if (!dryRun) {
        for (const row of rows) {
          await recordAnomaly(
            {
              kind: "grm_orphan_file",
              payload: {
                meeting_date: date,
                lab_meeting_id: row.id,
                slides_path: row.slides_path,
              },
              sourceKind: "lab_meetings",
            },
            admin
          );
        }
      }

      anomalies.push({
        kind: "grm_orphan_file",
        meeting_date: date,
        rows: rows.map((r) => ({ id: r.id, presenter_initial: r.presenter_initial })),
      });
    }

    // -----------------------------------------------------------------------
    // 6. Respond.
    // -----------------------------------------------------------------------
    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      window: { timeMin, timeMax },
      calendar_grm_events: calendarGrmEvents,
      lab_meetings_in_window: labMeetingsInWindow,
      matched,
      missing_inserted: missingInserted,
      special_grm_promoted: specialGrmPromoted,
      orphan_files: orphanFiles,
      anomalies,
      duration_ms: Date.now() - started,
    });
  } catch (err) {
    console.error("[sync-lab-meetings] error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Internal server error",
        duration_ms: Date.now() - started,
      },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
