import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authorizeCronRequest } from "@/lib/auth/cron-secret";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAnomaly } from "@/lib/sync/anomalies";
import { mmSlidesChaseTemplate } from "@/lib/mail/templates";
import { sendOne } from "@/lib/mail/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ISO week string: e.g. "2026-W18"
function isoWeek(d: Date): string {
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const dayOfYear =
    (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) -
      Date.UTC(d.getUTCFullYear(), 0, 0)) /
    86_400_000;
  const weekNum = Math.ceil(
    (dayOfYear + jan4.getUTCDay()) / 7
  );
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(from: string, to: Date): number {
  const fromMs = new Date(`${from}T00:00:00Z`).getTime();
  const toMs = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.max(0, Math.floor((toMs - fromMs) / 86_400_000));
}

interface MissingRow {
  meeting_date: string;
  researcher_initial: string;
  email: string;
  full_name: string;
}

interface ResearcherGroup {
  initial: string;
  email: string;
  full_name: string;
  missing: { meeting_date: string; days_overdue: number }[];
}

async function handle(request: NextRequest): Promise<NextResponse> {
  const started = Date.now();

  if (!authorizeCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const dryRun = url.searchParams.get("dry_run") === "1";

    const admin = createAdminClient();
    const now = new Date();
    const weekOf = isoWeek(now);

    // 1. Query milestone meetings with missing slides within the last 14 days.
    //    Use two-step approach (no PostgREST join) — FK relationships across
    //    the csnl_ops schema were unreliable via .schema('csnl_ops').
    const { data: mmRows, error: mmErr } = await admin
      .schema("csnl_ops")
      .from("milestone_meetings")
      .select("meeting_date, researcher_initial")
      .is("slides_path", null)
      // 3-day grace period: don't nag until 3 days after the meeting.
      // Window: [today - 14d, today - 3d]
      .gte("meeting_date", new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10))
      .lte("meeting_date", new Date(now.getTime() - 3 * 86_400_000).toISOString().slice(0, 10));

    if (mmErr) {
      return NextResponse.json(
        { error: mmErr.message, duration_ms: Date.now() - started },
        { status: 500 }
      );
    }

    const initialsNeeded = Array.from(
      new Set((mmRows ?? []).map((r) => r.researcher_initial as string))
    );

    let researcherMap = new Map<string, { email: string; full_name: string }>();
    if (initialsNeeded.length > 0) {
      const { data: rRows, error: rErr } = await admin
        .schema("csnl_ops")
        .from("researchers")
        .select("initial, email, full_name, active")
        .in("initial", initialsNeeded)
        .eq("active", true)
        .not("email", "is", null);

      if (rErr) {
        return NextResponse.json(
          { error: rErr.message, duration_ms: Date.now() - started },
          { status: 500 }
        );
      }

      for (const r of rRows ?? []) {
        if (r.email && r.full_name) {
          researcherMap.set(r.initial as string, {
            email: r.email as string,
            full_name: r.full_name as string,
          });
        }
      }
    }

    const missing: MissingRow[] = [];
    for (const raw of mmRows ?? []) {
      const r = raw as { meeting_date: string; researcher_initial: string };
      const researcher = researcherMap.get(r.researcher_initial);
      if (!researcher) continue;     // inactive / no-email researchers are dropped here
      missing.push({
        meeting_date: r.meeting_date,
        researcher_initial: r.researcher_initial,
        email: researcher.email,
        full_name: researcher.full_name,
      });
    }

    // 3. Group by researcher_initial.
    const grouped = new Map<string, ResearcherGroup>();
    for (const row of missing) {
      if (!grouped.has(row.researcher_initial)) {
        grouped.set(row.researcher_initial, {
          initial: row.researcher_initial,
          email: row.email,
          full_name: row.full_name,
          missing: [],
        });
      }
      grouped.get(row.researcher_initial)!.missing.push({
        meeting_date: row.meeting_date,
        days_overdue: daysBetween(row.meeting_date, now),
      });
    }

    const candidates = grouped.size;
    let sent = 0;
    let skippedAlreadyChased = 0;
    let errors = 0;

    // 4. Fetch PI email for CC.
    const { data: piRows } = await admin
      .schema("csnl_ops")
      .from("researchers")
      .select("email")
      .eq("role", "pi")
      .eq("active", true)
      .limit(1);

    const piEmail: string | undefined = piRows?.[0]?.email ?? undefined;

    // 5. Per-researcher: idempotency → template → send → record.
    for (const group of grouped.values()) {
      // Idempotency: was a chase already sent this week for this researcher?
      const { data: existing } = await admin
        .schema("csnl_ops")
        .from("sync_anomalies")
        .select("id")
        .eq("kind", "chase_sent")
        .eq("source_kind", "mm_slides_chase")
        .filter("payload->>researcher_initial", "eq", group.initial)
        .filter("payload->>week_of", "eq", weekOf)
        .limit(1);

      if (existing && existing.length > 0) {
        skippedAlreadyChased++;
        continue;
      }

      const template = mmSlidesChaseTemplate({
        recipient: {
          initial: group.initial,
          full_name: group.full_name,
          email: group.email,
        },
        missing: group.missing,
      });

      if (dryRun) {
        // Dry-run: count as "would send" without actually sending or recording.
        sent++;
        continue;
      }

      const result = await sendOne({
        to: group.email,
        cc: piEmail,
        subject: template.subject,
        text: template.text,
        html: template.html,
      });

      if (result.ok) {
        sent++;
        await recordAnomaly(
          {
            kind: "chase_sent",
            payload: {
              researcher_initial: group.initial,
              week_of: weekOf,
              meeting_dates: group.missing.map((m) => m.meeting_date),
              email: group.email,
            },
            sourceKind: "mm_slides_chase",
          },
          admin
        );
      } else {
        errors++;
        await recordAnomaly(
          {
            kind: "chase_send_failed",
            payload: {
              researcher_initial: group.initial,
              week_of: weekOf,
              error: result.error ?? "unknown",
            },
            sourceKind: "mm_slides_chase",
          },
          admin
        );
      }
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      candidates,
      sent,
      skipped_already_chased: skippedAlreadyChased,
      errors,
      duration_ms: Date.now() - started,
    });
  } catch (err) {
    console.error("[chase-mm-slides] error:", err);
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
