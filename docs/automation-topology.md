# CSNL Lab AI — Automation Topology (post-merge, 2026-05-08)

> **Why this doc exists.** Two automation tracks (`csnl-ops` and `_lab_ai_harness`)
> grew up side-by-side and were diagnosed as "정돈 안된 채로 따로 작동" on
> 2026-05-08. This is the merged operating model after the Mac mini → Mac Studio
> migration: who fires what, who reads what, and what dies when something breaks.

## 1. Two layers, one purpose

The whole stack exists to drive an automated **Slack-DM interview cycle**
with 7 active researchers (campaign `paperblitz_2026_05_06`, members
`JOP / MSY / JYK / BYL / SYJ / BHL / SMJ`) so meta-knowledge about each
project gets captured, reviewed, and refined without manual chasing by JOP.

Two layers cooperate:

| Layer | Repo | Runtime | Touches |
|---|---|---|---|
| **csnl-ops** | `~/Documents/claude/csnl-ops/` | Vercel (Fluid Compute, Next.js 16 App Router) + GH Actions cron | Supabase `csnl_ops.*` schema, Google Calendar (Slab + CSNL), Gmail SMTP, NAS read (only via local launchd scripts) |
| **_lab_ai_harness** | `/Volumes/CSNL_new-2/Memory/_lab_ai_harness/` | Mac Studio M2 Ultra, launchd + user crontab + venv + Postgres17 + Ollama | Slack Socket Mode, NAS read/write (state/ ledger/ briefs/), local Postgres `csnl_v3`, Ollama qwen3.6 / bge-m3 |

They share **one user identity** (lab member initials) and meet at exactly
**three NAS files** plus the Supabase + Postgres databases.

## 2. Data flow

```
                    Google Calendars (Slab + CSNL)
                              │
                              ▼  (sync-slab, sync-csnl-mm, sync-lab-meetings — every 6/12h)
                    ┌─────────────────┐
                    │ Supabase        │
                    │ csnl_ops.*      │
                    │   experiment_   │
                    │   bookings,     │
                    │   milestone_    │
                    │   meetings,     │
                    │   lab_meetings, │
                    │   sync_anomalies│
                    └────────┬────────┘
                             │
        ┌────────────────────┴────────────────────┐
        ▼                                         ▼
  chase-mm-slides                        export-anomalies-for-harness
  (Vercel cron, Fri 14:00 KST)           (launchd, daily 03:00 KST)
        │                                         │
        ▼                                         ▼
   Gmail SMTP                          /Volumes/.../state/csnl_ops_inbox.json
   (KO chase email per                          │
    researcher, BCC PI)                         ▼
                                       ┌─────────────────┐
                                       │ _lab_ai_harness │
                                       │ harness_runner  │ ◄── Slack Socket
                                       │ (cron */30,     │     listener
                                       │  full mode)     │     (launchd realtime)
                                       └────────┬────────┘
                                                │ outbound DM
                                                ▼
                                    Slack DMs to 7 researchers
                                                │
                                                ▼
                                    Inbound replies → ledger.db
                                                │
                                                ▼
                                  memory_evolution.py (cron */30)
                                                │
                                                ▼
                                  Postgres csnl_v3 + state/member_uncertainty.json
                                                │
                                                ▼
                                  next_question regenerated → next cron fires it
```

## 3. Cron matrix (who runs where)

| Schedule (KST) | Job | Layer | Effect |
|---|---|---|---|
| `*/6h` | `csnl-sync-slab-cron` (GH Actions) | csnl-ops | Slab events → `experiment_bookings` |
| `*/12h +5m` | `csnl-sync-csnl-mm-cron` (GH Actions) | csnl-ops | CSNL "Meeting: INIT" → `milestone_meetings` |
| `*/12h +10m` | `csnl-sync-lab-meetings-cron` (GH Actions) | csnl-ops | CSNL GRM ⨝ `lab_meetings` reconcile + presenter inference |
| Fri 14:00 | `csnl-chase-mm-slides-cron` (GH Actions → Vercel) | csnl-ops | KO chase email to researchers with `slides_path IS NULL` after 3-day grace |
| 02:00 daily | `resolve-mm-slides.mjs` (launchd) | csnl-ops scripts | NAS slide existence probe → `milestone_meetings.slides_path` upsert |
| 03:00 daily | `export-anomalies-for-harness.mjs` (launchd) | csnl-ops scripts | Supabase `sync_anomalies WHERE pushed_to_harness_at IS NULL` → `state/csnl_ops_inbox.json` |
| 04:00 Sun | `export-snapshot-for-harness.mjs` (launchd) | csnl-ops scripts | full Supabase view → `state/csnl_ops_snapshot.json` |
| 09:00–21:30 every 15m, Mon–Sat | `csnl.orchestrator` (launchd) | harness | poll-only step — replan blocked_paths, dispatch tasks |
| Continuous | `csnl.realtime` (launchd) | harness | Slack Socket Mode listener — every DM lands in `ledger.inbound_messages` |
| `*/30 09:00–21:00 Mon–Sat` | `harness_runner.py` (cron) | harness | full mode — generate ack + next_question, send Slack DM, mark `pending_acks` cleared |
| `*/30 24h` | `memory_evolution.py` (cron) | harness | extract state delta from new inbound, update `member_uncertainty.json` |
| 09:30 Mon–Sat | `weekly_corpus_sync --mode=light` (cron) | harness | light NAS corpus dedup |
| 09:30 Sun | `weekly_corpus_sync --mode=digest` (cron) | harness | weekly digest into `feedback_digest_*.md` |

## 4. Ownership boundaries (do not cross)

- **csnl-ops never writes to harness state files except `csnl_ops_inbox.json` and `csnl_ops_snapshot.json`.** It never touches `ledger.db`, `member_uncertainty.json`, `_processed_ledger.json`, or any other harness file.
- **harness never writes to Supabase `csnl_ops.*`.** It only reads NAS JSON files produced by csnl-ops.
- **Slack outbound is exclusively the harness's job.** csnl-ops sends email (Gmail SMTP) and never opens Slack APIs.
- **NAS-touching code lives only under `csnl-ops/scripts/` (run via launchd) or harness modules.** Vercel runtime cannot reach NAS — any function that needs `existsSync('/Volumes/CSNL_new-2/Memory')` exits cleanly with code 2 if the NAS is unmounted.

## 5. The single host rule (dual-fire prevention)

Until further notice, **exactly one Mac** runs the harness layer at a time.
The migration sequence is:

1. Mac Studio: `bash migration/install/install_phase1.sh` — Postgres + venv + Ollama + plist files (no cron, no launchctl bootstrap).
2. User closes Mac mini m4 session — `crontab -r` and `launchctl bootout` for `csnl.realtime` + `csnl.orchestrator`.
3. Mac Studio: `bash migration/install/install_phase2.sh` — appends crontab lines, `launchctl bootstrap` both labels, smoke verifies.
4. Verify only Mac Studio has the labels: `launchctl list | grep csnl`.

Any overlap of step 3 with the Mac mini still active would send every Slack DM
twice. The split-phase install is the architectural guarantee that this can't
happen accidentally.

## 6. Failure modes & recovery

| Symptom | Likely cause | Fix |
|---|---|---|
| `harness_runner` cron returns `rc=2 Another harness cycle in progress; aborting` for >1h | stale `state/_harness.lock` (process crashed without releasing) | `rm /Volumes/CSNL_new-2/.../state/_harness.lock` — next cron re-enters |
| Slack DMs duplicated | both Macs running `csnl.realtime` | `launchctl bootout` on the older one immediately |
| Vercel cron 401/403 | `CRON_SECRET` mismatch between GH Actions and Vercel env | re-run `gh secret set CRON_SECRET -b "$value"` from the value in `.env.local` |
| `chase-mm-slides` chases the wrong people | `slides_path` not refreshed (resolve-mm-slides launchd not running) | `launchctl list \| grep work.csnl.resolve-mm-slides` and tail its log |
| harness has nothing to ack but `pending_acks` queue grows | `harness_runner` cron stopped (crontab cleared, machine asleep) | `crontab -l` to verify, restart machine, check `~/Library/Logs/csnl/cron.log` |

## 7. Local secrets inventory

| File | Mode | Holds |
|---|---|---|
| `csnl-ops/.env.local` | 600 (NOT in git) | Supabase service-role, Google SA, Gmail SMTP, CRON_SECRET, NAS_ROOT |
| `_lab_ai_harness/.env` | 600 | `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `ANTHROPIC_API_KEY` (not used; balance $0), HMAC keys |
| `_lab_ai_harness/.env.v3` | 600 | 4 Postgres role passwords (`harness_listener`, `harness_worker`, `harness_dispatcher`, `harness_admin`) |
| Vercel project envs (encrypted) | n/a | mirrors of `csnl-ops/.env.local` for Production environment |
| GH Actions repo secrets | n/a | `CRON_SECRET` + `CSNL_OPS_VERCEL_URL` |

Rotation: Gmail and Supabase service-role are shared with sibling repo
`lab-reservation`; document in both repos when rotating. Slack tokens are
harness-only.

## 8. Out of scope (deliberately)

- Paper Blitz / CWLL reminders — owned by SMJ manually (locked decision §8 in `MIGRATION_PROMPT.md`).
- LLM calls from Vercel runtime — none. Anthropic credit balance is $0; cron-context LLM calls go through local Ollama on the Mac Studio.
- Notion sync of csnl-ops anomalies — sibling `lab-reservation` writes Notion; csnl-ops does not.
- Multi-user UI — there is no human-facing UI. All operations are scheduled or triggered manually via `gh workflow run` / `vercel` CLI.
