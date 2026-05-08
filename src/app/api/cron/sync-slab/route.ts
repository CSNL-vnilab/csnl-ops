import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authorizeCronRequest } from "@/lib/auth/cron-secret";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGoogleAuth } from "@/lib/google/auth";
import { fetchAllEvents } from "@/lib/google/calendar";
import { parseSlabEvent } from "@/lib/sync/parse-slab";
import { upsertSlabBookings } from "@/lib/sync/slab-upsert";
import { recordAnomaly } from "@/lib/sync/anomalies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Calendar ID for the Slab booking calendar.
// Reads CSNL_OPS_SLAB_CALENDAR_ID per .env.example contract.
const SLAB_CALENDAR_ID =
  process.env.CSNL_OPS_SLAB_CALENDAR_ID ?? "primary";

// Default look-back window when ?since= is not supplied.
const DEFAULT_LOOKBACK_DAYS = 90;

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
    const timeMin =
      url.searchParams.get("since") ?? defaultSince.toISOString();
    const timeMax =
      url.searchParams.get("until") ?? now.toISOString();

    // 1. Fetch events from Google Calendar.
    const auth = getGoogleAuth();
    const events = await fetchAllEvents(
      SLAB_CALENDAR_ID,
      { timeMin, timeMax },
      auth
    );

    const fetched = events.length;

    // 2. Parse each event.
    const parsed: ReturnType<typeof parseSlabEvent>[] = [];
    const unparsedEvents: typeof events = [];

    for (const event of events) {
      const row = parseSlabEvent(event);
      parsed.push(row);
      if (row.parse_status === "unparseable") {
        unparsedEvents.push(event);
      }
    }

    const parsedCount = parsed.filter((r) => r.parse_status === "parsed").length;
    const partialCount = parsed.filter((r) => r.parse_status === "partial").length;
    const unparseableCount = parsed.filter((r) => r.parse_status === "unparseable").length;

    // 3. Record anomalies for unparseable events.
    const admin = createAdminClient();
    let anomalyCount = 0;

    if (!dryRun) {
      for (const event of unparsedEvents) {
        await recordAnomaly(
          {
            kind: "unparseable_slab_event",
            payload: {
              summary: event.summary ?? null,
              start: event.start ?? null,
              end: event.end ?? null,
            },
            sourceId: event.id ?? undefined,
            sourceKind: "slab_calendar_event",
          },
          admin
        );
        anomalyCount++;
      }

      // Also flag partial rows whose experimenter_initials are empty
      // (unknown initials = no bracket match or empty bracket content).
      for (const row of parsed) {
        if (
          row.parse_status === "partial" &&
          row.experimenter_initials.length === 0
        ) {
          await recordAnomaly(
            {
              kind: "unknown_initials",
              payload: {
                raw_summary: row.raw_summary,
                slab_calendar_event_id: row.slab_calendar_event_id,
              },
              sourceId: row.slab_calendar_event_id ?? undefined,
              sourceKind: "slab_calendar_event",
            },
            admin
          );
          anomalyCount++;
        }
      }
    }

    // 4. Upsert (skipped in dry-run mode).
    let upserted = { inserted: 0, updated: 0, skipped: 0 };

    if (!dryRun && parsed.length > 0) {
      upserted = await upsertSlabBookings(parsed, admin);
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      window: { timeMin, timeMax },
      fetched,
      parsed: parsedCount,
      partial: partialCount,
      unparseable: unparseableCount,
      upserted,
      anomalies: anomalyCount,
      duration_ms: Date.now() - started,
    });
  } catch (err) {
    console.error("[sync-slab] error:", err);
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
