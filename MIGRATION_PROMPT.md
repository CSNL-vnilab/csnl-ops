# csnl-ops migration prompt — 2026-05-08 handoff

> Paste this as the first user message in a fresh Claude Code session inside
> `/Users/csnl/Documents/claude/csnl-ops/`. Self-contained: covers state,
> locked decisions, pending work, and how to resume.

## Mission (one line)

Operate CSNL lab meta-data (researchers / projects / calendars / NAS slides)
on the same Supabase as `lab-reservation`, isolated in the `csnl_ops`
schema. Drive Slab + CSNL calendar sync, NAS slide reconciliation, anomaly
detection, and chase emails. Hand off curated state to the sibling
`_lab_ai_harness` Slack-DM interview system.

## Sibling systems on this Mac

| Repo | Path | Purpose | csnl-ops touches it? |
|---|---|---|---|
| `lab-reservation` | `/Users/csnl/Documents/claude/lab-reservation/` | Booking + payments + Notion sync. Same Supabase project. | **No** — never modify its tree, migrations, or auth config. |
| `csnl-ops` | `/Users/csnl/Documents/claude/csnl-ops/` | This repo. | **Yes** |
| `_lab_ai_harness` | `/Volumes/CSNL_new-2/Memory/_lab_ai_harness/` | Slack-DM interview cycle, owned by JOP. Python. | **Read-only** to its `state/` dir, **write** only `state/csnl_ops_inbox.json` and `state/csnl_ops_snapshot.json`. |

## Locked decisions (do not relitigate)

1. **Same Supabase instance, schema isolation only.** Project ref:
   `qjhzjqkrbvsnwlbpilio`. csnl-ops migrations only ever touch `csnl_ops.*`.
   No `public.*` writes.
2. **Migrations applied via `supabase db query --linked --file <path>`,
   NOT `supabase db push`.** lab-reservation owns the
   `supabase_migrations.schema_migrations` history; csnl-ops's migrations
   live as plain SQL applied directly. Don't run `supabase db push` from
   csnl-ops.
3. **Borrowed `SUPABASE_SERVICE_ROLE_KEY`** from lab-reservation. Mint
   separate only if csnl-ops gains a webhook needing independent rotation.
4. **Separate `CRON_SECRET`** for csnl-ops (32-hex). In `.env.local`.
5. **Sync runtime: GH Actions cron → Vercel endpoint** with
   `x-cron-secret`. Pattern mirrors lab-reservation's `notion-health-cron`.
6. **Gmail SMTP via `vnilab@gmail.com`**, shared with lab-reservation.
7. **`exp_code` ↔ `project_code` mapping deferred** — unknown exp codes
   land in `sync_anomalies kind='unmapped_exp_code'` (not auto-mapped).
8. **chase-pb intentionally absent** — SMJ owns Paper Blitz / CWLL
   reminders manually. Do not add a chase-pb route.
9. **First-run external actions (email, Slack DM, calendar writes) need
   user pre-check.** Always dry-run, show preview, wait for approval
   before the first send. Subsequent scheduled runs are fine.
10. **Never `supabase config push`** on this shared project — overwrites
    auth/storage settings from local config.toml.

## Current state (2026-05-08)

### Database (Supabase project ref `qjhzjqkrbvsnwlbpilio`, schema `csnl_ops`)

| Table | Rows | Note |
|---|---:|---|
| researchers | 24 | 12 active (incl. PI SL) + 8 alumni + 4 inactive (incl. SYJ/HJH stubs) |
| projects | 18 | enriched with full_name + software arrays |
| grants | 2 | 대형장비구축_2024, 중견_2024 (active) |
| experiment_bookings | 165 | Slab calendar mirror, 152 experiment kind |
| milestone_meetings | 47 | 4 with slides_path (all JOP), 43 NULL |
| lab_meetings | 159 | 94 grm + 52 paper_blitz + 13 special_grm |
| special_grm_presenters | 13 | side table for >1-presenter dates |
| sync_anomalies | ~110 | 47 grm_presenter_missing + 43 mm_slides_missing + …; 90 already pushed to harness |
| grm_presenters_observed | 0 | staging (unused — walker direct-inserted to lab_meetings) |
| cwll_entries, annual_events, nas_datasets | 0 | not yet seeded |

### Code (tree highlights)

```
src/app/api/cron/
  sync-slab/route.ts            ← Slab calendar → experiment_bookings
  sync-csnl-mm/route.ts         ← CSNL "Meeting: INIT" → milestone_meetings
  sync-lab-meetings/route.ts    ← CSNL GRM ⨝ lab_meetings reconcile
  chase-mm-slides/route.ts      ← Friday 14:00 KST nag (3-day grace)
src/lib/
  auth/cron-secret.ts           ← timing-safe, x-cron-secret + Bearer
  google/{auth,calendar}.ts     ← SA JWT + paginating listEvents
  mail/{transport,send,templates}.ts  ← Gmail SMTP wrapper + KO templates
  supabase/admin.ts             ← service-role client (csnl_ops schema)
  sync/{parse-slab,slab-upsert,anomalies,reconcile-grm}.ts

scripts/
  resolve-mm-slides.mjs         ← /MM/{INIT}/ probe + date-flex matching (NAS, local)
  walk-{memory-projects,grm-presenters,grant-finals}.mjs  ← Phase B walkers
  sync-slab.mjs / peek-slab.mjs / peek-csnl{,-grm}.mjs    ← prototypes
  list-calendars.mjs            ← SA → calendar inventory
  export-anomalies-for-harness.mjs  ← writes _lab_ai_harness/state/csnl_ops_inbox.json
  export-snapshot-for-harness.mjs   ← writes _lab_ai_harness/state/csnl_ops_snapshot.json
  announce-mm-convention.mjs    ← one-off: NAS upload convention (sent 2026-05-08)
  announce-pb-recommendations.mjs   ← one-off: 18:00 heads-up (sent 2026-05-08)

supabase/migrations/  (applied via `supabase db query --linked`, NOT push)
  20260501000001_csnl_ops_schema.sql            (12 tables, 3 enums)
  20260504000001_csnl_ops_seed_initial.sql      (initial 8/2/15)
  20260505000001_projects_enrichment.sql
  20260505000002_lab_meetings_backfill.sql
  20260505000003_grants_enrichment.sql
  20260505000004_lab_meetings_pk_fix.sql        (uuid surrogate + NULLS NOT DISTINCT)
  20260505000005_csnl_ops_grants.sql            (table privileges)
  20260508000001_yaml_corrections.sql           (24 researchers, 18 projects)
  20260508000002_anomaly_push_tracking.sql      (pushed_to_harness_at column)

.github/workflows/  (NOT yet merged into a Vercel-deployed app — see Pending §1)
  csnl-sync-slab-cron.yml          (every 6h)
  csnl-sync-csnl-mm-cron.yml       (every 12h, +5min)
  csnl-sync-lab-meetings-cron.yml  (every 12h, +10min)
  csnl-chase-mm-slides-cron.yml    (Fri 05:00 UTC = 14:00 KST)
```

### Vercel state

- Linked: `vnilab-9610s-projects/csnl-ops` (created 2026-05-08).
- **Env vars: NOT yet set on Vercel.** All values exist in `.env.local`.
- **No deploy yet.** No production URL yet.
- GitHub auto-link failed during `vercel link` — manual deploy via
  `vercel deploy --prod` works.

### Emails sent

- **2026-05-08** — NAS upload convention announcement to 5 BCC + 3 CC
  (accepted=9). Subject: `[CSNL] Milestone Meeting 자료 NAS 업로드 요청`.
- **2026-05-08** — 18:00 KST heads-up to 7 BCC + 1 CC (accepted=9, sent
  twice — first had malformed subject, resent with corrected subject
  `오늘(2026-05-08) 18시 KST 자동화 안내 — Paper Blitz 후보 논문 추천 및 교수님 브리핑`).

### PI briefing prose

`docs/pi-briefing-2026-05-08.md` — to be sent via Slack DM at 18:00 KST.
csnl-ops doesn't deliver Slack itself; either harness picks it up or
user manually pastes. Includes (1) Notion delay apology, (2) Mac mini
recording status, (3) progress so far, (4) who-being-DM'd, (5)
data-collected, (6) **architect-perspective severity warnings** on 4
risks (Slack-resistance + interview decline / local-only data + low
AI use / sparse explicit docs + JOP single point of failure / no
visual interface + Notion stalled), (7) short+mid plans.

## Pending work (in priority order)

### 1. Cron activation — IN PROGRESS, blocked on env-var push

User must run from `/Users/csnl/Documents/claude/csnl-ops/`:

```bash
# Push 9 env vars from .env.local to Vercel production
for k in NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY \
         GOOGLE_SERVICE_ACCOUNT_EMAIL GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY \
         CSNL_OPS_SLAB_CALENDAR_ID CSNL_OPS_CSNL_CALENDAR_ID \
         CRON_SECRET GMAIL_USER GMAIL_APP_PASSWORD; do
  v=$(awk -v key="$k" -F= '$1==key {sub(/^[^=]*=/,""); gsub(/^"|"$/,""); print; exit}' .env.local)
  printf '%s' "$v" | vercel env add "$k" production
done

# First production deploy
vercel deploy --prod

# Capture deploy URL (e.g. https://csnl-ops-xxxxx.vercel.app)
DEPLOY_URL=$(vercel ls --json 2>/dev/null | jq -r '.[0].url' | head -1)
echo "Deploy URL: https://$DEPLOY_URL"

# Set GH Actions secrets so workflows can curl Vercel
CRON_SECRET_VAL=$(awk -F= '$1=="CRON_SECRET" {sub(/^[^=]*=/,""); gsub(/^"|"$/,""); print; exit}' .env.local)
gh secret set CRON_SECRET -b "$CRON_SECRET_VAL" -R CSNL-vnilab/csnl-ops
gh secret set CSNL_OPS_VERCEL_URL -b "https://$DEPLOY_URL" -R CSNL-vnilab/csnl-ops

# Trigger first runs to verify
gh workflow run csnl-sync-slab-cron.yml -R CSNL-vnilab/csnl-ops
```

After verifying first runs, the cron schedules run themselves. Smoke check
each via `gh run list -R CSNL-vnilab/csnl-ops`.

### 2. Phase G — annual events seed

Hand-typed migration `20260509000001_annual_events_seed.sql`:
- BCS Summer Workshop (학과 여름 워크샵) — date TBD
- Brainday (학과 학술대회) — date TBD
- 대형장비구축_2024 final report due — date TBD
- 중견_2024 mid-term — date TBD

Source: ask user for the four dates. Schema is already in place
(`csnl_ops.annual_events` with `annual_event_type` enum).

Future: `src/app/api/cron/grant-deadline-nag/route.ts` — T-30/T-7/T-1
nag using existing Gmail transport. Build only when a deadline
approaches.

### 3. launchd for NAS-bound scripts

Three scripts must run on the user's Mac (NAS access, not Vercel):

| Script | Cadence (proposed) |
|---|---|
| `scripts/resolve-mm-slides.mjs` | daily 02:00 KST |
| `scripts/export-anomalies-for-harness.mjs` | daily 03:00 KST |
| `scripts/export-snapshot-for-harness.mjs` | weekly Sunday 04:00 KST |

Write `~/Library/LaunchAgents/work.csnl.{name}.plist` files; load with
`launchctl load`. NAS pre-flight (`existsSync('/Volumes/CSNL_new-2/Memory')`)
already implemented; skips cleanly when NAS not mounted.

### 4. 18:00 KST Slack DM workflow (separate channel)

Email of 2026-05-08 promised:
- 7 researchers each get a Slack DM with one paper recommendation
- PI gets a Slack DM with the briefing in `docs/pi-briefing-2026-05-08.md`

**csnl-ops does NOT send Slack today.** Owner = harness or manual. If a
future task requires csnl-ops to send Slack: add a `src/lib/slack/`
wrapper around `@slack/web-api`, store `SLACK_BOT_TOKEN` as a new env
var, and add a uid mapping table. Coordinate with harness owner (JOP)
to avoid duplicating its `dm_channel_map.json`.

### 5. Open data-quality items

- 7 fully-unparseable Slab events (kind=other) in `sync_anomalies` —
  human review.
- 4 inactive researchers with NULL role: SYJ, HJH (Phase B walker stubs);
  JWR, KWC (alumni without defended_on year). Either fill or leave.
- 5 calendar-only GRM dates with no NAS file → presenter unknown. Ask
  participants directly; once filled, `sync-lab-meetings` will resolve.

## Auto-loaded memory entries (for the next session's context)

These already exist at `~/.claude/projects/-Users-csnl-Documents-claude/memory/`:

- `feedback_delegation.md` — Opus orchestrates only, delegate to Sonnet
- `feedback_bash_autonomy.md` — run bash directly, only stop for
  interactive auth
- `feedback_supabase_config_push.md` — never run `supabase config push`
  on the shared project
- `feedback_first_run_external.md` — dry-run + user approval before
  first email/DM/external write
- `project_smj_pb_cwll.md` — SMJ owns Paper Blitz / CWLL announcements;
  csnl-ops does NOT send PB/CWLL reminders

## How to resume

1. `cd /Users/csnl/Documents/claude/csnl-ops`
2. `git fetch && git status` — should be clean. If behind, pull.
3. Read this file (`MIGRATION_PROMPT.md`) and `DEPLOY.md` and `AGENTS.md`.
4. Pick a Pending §N item, surface decisions to user, execute.

## Critical "do not" reminders

- Do not modify anything under `/Users/csnl/Documents/claude/lab-reservation/`.
- Do not commit `.env.local` or any file containing real secrets.
- Do not auto-send emails/Slack on first-of-kind action without dry-run + approval.
- Do not run `supabase config push` or `supabase db push` from csnl-ops.
- Do not name-blame individual researchers in PI-facing communications;
  describe systemic issues (e.g. "Notion 산출물 자체에 …" not "X가 …").
- Do not assume next-session has chat history. This file is the
  handoff; supplement only with what the user explicitly says next.
