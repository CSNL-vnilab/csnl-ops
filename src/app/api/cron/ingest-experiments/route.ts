import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authorizeCronRequest } from "@/lib/auth/cron-secret";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestExperiments } from "@/lib/ingest-experiments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Default look-back window when lookback_days is not supplied.
const DEFAULT_LOOKBACK_DAYS = 30;

async function handle(request: NextRequest) {
  const started = Date.now();

  if (!authorizeCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Resolve params from query string (GET) or JSON body (POST, from GH Actions).
    const url = new URL(request.url);
    let lookbackDays = DEFAULT_LOOKBACK_DAYS;
    let dryRun = false;

    // Check query params first
    const qLookback = url.searchParams.get("lookback_days");
    if (qLookback) lookbackDays = Math.max(1, parseInt(qLookback, 10) || DEFAULT_LOOKBACK_DAYS);
    if (url.searchParams.get("dry_run") === "1") dryRun = true;

    // Then check JSON body (POST from workflow_dispatch with inputs)
    if (request.method === "POST") {
      try {
        const body = await request.json().catch(() => null);
        if (body && typeof body === "object") {
          if (typeof body.lookback_days === "number") {
            lookbackDays = Math.max(1, body.lookback_days);
          } else if (typeof body.lookback_days === "string") {
            lookbackDays = Math.max(1, parseInt(body.lookback_days, 10) || DEFAULT_LOOKBACK_DAYS);
          }
          if (body.dry_run === true || body.dry_run === "true") {
            dryRun = true;
          }
        }
      } catch {
        // Body not JSON — ignore, use query param defaults
      }
    }

    const supabase = createAdminClient();

    const result = await ingestExperiments({
      supabase,
      lookbackDays,
      dryRun,
    });

    return NextResponse.json({
      ok: true,
      dry_run: result.dryRun,
      lookback_days: lookbackDays,
      ingested: result.ingested,
      updated: result.updated,
      anomalies: result.anomalies,
      emails_sent: result.emailsSent,
      duration_ms: result.durationMs,
    });
  } catch (err) {
    console.error("[ingest-experiments] error:", err);
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
