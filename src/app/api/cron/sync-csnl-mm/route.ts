import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authorizeCronRequest } from "@/lib/auth/cron-secret";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGoogleAuth } from "@/lib/google/auth";
import { fetchAllEvents } from "@/lib/google/calendar";
import { parseMmEvent } from "@/lib/sync/parse-mm";
import type { ParsedMmRow } from "@/lib/sync/parse-mm";
import { upsertMilestoneMeetings } from "@/lib/sync/mm-upsert";
import { recordAnomaly } from "@/lib/sync/anomalies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Calendar ID for the CSNL calendar (vnilab@gmail.com).
// Contract documented in .env.example as CSNL_OPS_CSNL_CALENDAR_ID.
const CSNL_CALENDAR_ID =
  process.env.CSNL_OPS_CSNL_CALENDAR_ID ?? "primary";

// Default look-back and look-ahead window when ?since= / ?until= are not supplied.
// 90d back catches past meetings; 30d forward catches upcoming ones already scheduled.
const DEFAULT_LOOKBACK_DAYS = 90;
const DEFAULT_LOOKAHEAD_DAYS = 30;

async function handle(request: NextRequest) {
  const started = Date.now();

  if (!authorizeCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const dryRun = url.searchParams.get("dry_run") === "1";

    // Resolve query window.
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

    // 1. Fetch events from CSNL Google Calendar.
    const auth = getGoogleAuth();
    const events = await fetchAllEvents(
      CSNL_CALENDAR_ID,
      { timeMin, timeMax },
      auth
    );

    const fetched = events.length;

    // 2. Parse each event; keep parsed rows and track nulls separately.
    const parsedRows: ParsedMmRow[] = [];
    let nonMmCount = 0;

    for (const event of events) {
      const row = parseMmEvent(event);
      if (row === null) {
        nonMmCount++;
      } else {
        parsedRows.push(row);
      }
    }

    const mmEvents = parsedRows.length;
    const parsedCount = parsedRows.filter(
      (r) => r.parse_status === "parsed"
    ).length;
    const unknownInitialCount = parsedRows.filter(
      (r) => r.parse_status === "unknown_initial"
    ).length;

    // 3. Upsert + anomaly recording (skipped in dry-run mode).
    const admin = createAdminClient();
    let upserted = { inserted: 0, updated: 0, skipped: 0 };
    let anomalyCount = 0;

    if (!dryRun) {
      // Upsert all parsed rows (both 'parsed' and 'unknown_initial' statuses
      // get written to DB so Phase F can resolve them).
      if (parsedRows.length > 0) {
        upserted = await upsertMilestoneMeetings(parsedRows, admin);
      }

      // Record an anomaly for each unknown_initial row so it surfaces in
      // the ops dashboard for manual review.
      for (const row of parsedRows) {
        if (row.parse_status === "unknown_initial") {
          await recordAnomaly(
            {
              kind: "unknown_initial",
              payload: {
                raw_summary: row.raw_summary,
                researcher_initial: row.researcher_initial,
              },
              sourceId: row.csnl_calendar_event_id,
              sourceKind: "csnl_calendar_event",
            },
            admin
          );
          anomalyCount++;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      window: { timeMin, timeMax },
      fetched,
      mm_events: mmEvents,
      parsed: parsedCount,
      unknown_initial: unknownInitialCount,
      non_mm: nonMmCount,
      upserted,
      anomalies: anomalyCount,
      duration_ms: Date.now() - started,
    });
  } catch (err) {
    console.error("[sync-csnl-mm] error:", err);
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
