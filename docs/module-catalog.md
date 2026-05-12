# Module Catalog — csnl-ops + _lab_ai_harness

> Inventory of the actual implementation (2026-05-12). Source-of-truth: file docstrings / header comments. Two repos, two halves of the same scientific workflow.

---

## A. `csnl-ops` repo (Next.js 16 + Supabase + Vercel)

Path: `/Users/csnl/Documents/claude/csnl-ops/`

### A.1 Vercel cron API routes — `src/app/api/cron/*/route.ts`

| Route | Purpose |
|---|---|
| `chase-mm-slides` | Friday 14:00 KST chase email when Milestone Meeting slides are missing on NAS (sends to per-researcher Gmail via `mail/send.ts`, records `sync_anomalies`). |
| `ingest-experiments` | Sunday 18:00 UTC ingest of completed behavioral experiments from lab-reservation FDW into `csnl_ops.behavioral_experiments` (look-back default 30 days; supports dry-run). |
| `sync-csnl-mm` | Every 12h CSNL Google Calendar pull for `Meeting: <INIT>` Milestone Meeting events; upserts into `csnl_ops.milestone_meetings` (90d back / 30d forward). |
| `sync-lab-meetings` | Every 12h calendar reconciliation for GRM events vs. NAS file set; classifies presenter/date and records `sync_anomalies` for missing presenters (365d back / 30d forward). |
| `sync-slab` | Every 6h Slab booking calendar pull; parses via `parseSlabEvent` 8-branch regex and upserts `slab_bookings` (90d back). |

All routes share `authorizeCronRequest` (HMAC of `CSNL_OPS_CRON_SECRET`), `createAdminClient` (service-role Supabase, RLS bypass), and `runtime = "nodejs"` + `dynamic = "force-dynamic"`.

### A.2 Library modules — `src/lib/*`

| Module | Purpose |
|---|---|
| `auth/cron-secret.ts` | SHA-256 + `timingSafeEqual` HMAC check on the `Authorization: Bearer` header for all cron routes (`MIN_SECRET_LENGTH = 32`). |
| `google/auth.ts` | SA-based JWT auth helper, reads `GOOGLE_SERVICE_ACCOUNT_EMAIL/_PRIVATE_KEY`, default scope `calendar.readonly`. |
| `google/calendar.ts` | Thin wrapper over `googleapis.calendar.v3` — `fetchAllEvents(...)` paginates with `timeMin/timeMax/pageToken`. |
| `mail/send.ts` | `sendOne({to, subject, text, html})` wrapper that never throws — returns `{ok, error}` so callers decide on anomaly recording. |
| `mail/templates.ts` | Pure email template functions (no transport side-effects). `mmSlidesChaseTemplate` etc. return `{subject, text, html}` with Korean DOW abbreviations. |
| `mail/transport.ts` | Nodemailer SMTP transport bound to Gmail (`smtp.gmail.com:587`, `GMAIL_USER` + `GMAIL_APP_PASSWORD`). |
| `supabase/admin.ts` | Service-role Supabase client (`createAdminClient`). Server-side only — bypasses RLS. |
| `sync/anomalies.ts` | `recordAnomaly({kind, payload, sourceId, sourceKind})` writes into `csnl_ops.sync_anomalies` for downstream chase/harness consumption. |
| `sync/mm-upsert.ts` | Idempotent upsert of `ParsedMmRow[]` into `csnl_ops.milestone_meetings`; returns `{inserted, updated, skipped}` counts. |
| `sync/parse-mm.ts` | Regex parser for Milestone Meeting calendar events — only emits rows matching `/^\s*Meeting\s*:\s*([A-Z]{2,4})\s*$/i`. |
| `sync/parse-slab.ts` | TypeScript port of `scripts/lib/parse-slab-event.mjs` — 8 regex branches (system_test / open_lab / admin 3a-d / canonical 4a-c / korean cohort / pilot / bracket-only / unparseable) preserved verbatim. |
| `sync/reconcile-grm.ts` | Reconciliation logic for calendar-side GRM events vs. NAS GRM files (`bucketCalendarGrmEvents`, `classifyDate`). |
| `sync/slab-upsert.ts` | Idempotent upsert of `ParsedSlabRow[]` into `csnl_ops.slab_bookings`. |
| `ingest-experiments.ts` (top-level) | Read lab-reservation FDW completed experiments → write `csnl_ops.behavioral_experiments` + per-row `experiment_ingest_anomalies`. |

### A.3 Launchd / one-off scripts — `scripts/*.mjs`

| Script | Purpose |
|---|---|
| `announce-mm-convention.mjs` | One-off lab announcement asking 7 recipients to upload all past + future MM slides to NAS using `MM_yymmdd_INIT.{pdf,pptx}` filename convention. |
| `announce-pb-recommendations.mjs` | One-off 18:00 KST heads-up email warning that an automated workflow will Slack-DM 7 researchers a Paper Blitz paper rec + DM PI the briefing. |
| `export-anomalies-for-harness.mjs` | Reads unpushed unresolved `mm_slides_missing` + `grm_presenter_missing` anomalies, groups by `target_initial`, writes `/Volumes/CSNL_new-2/Memory/_lab_ai_harness/state/csnl_ops_inbox.json` + `experiments_snapshot.json`. |
| `export-snapshot-for-harness.mjs` | Builds full csnl_ops SNAPSHOT (researchers/projects/grants/anomaly-stats) and writes `state/csnl_ops_snapshot.json` for harness `weekly_corpus_sync.py` consumption. |
| `list-calendars.mjs` | One-shot SA JWT diagnostic — lists all calendars visible to the service account. |
| `peek-csnl.mjs` / `peek-csnl-grm.mjs` / `peek-slab.mjs` | One-shot calendar inspectors for the CSNL / CSNL-GRM-specific / Slab calendars (debugging aid). |
| `resolve-mm-slides.mjs` | NAS probe — populates `csnl_ops.milestone_meetings.slides_path` + `slides_submitted` for rows where `slides_path IS NULL` (requires NAS mounted at `/Volumes/CSNL_new-2`). |
| `smoke-ingest-experiments.mjs` | Dry-run smoke test for the experiment-ingest pipeline (verifies FDW reachability + local Supabase). |
| `sync-slab.mjs` | Local CLI variant of the `sync-slab` cron — fetches Slab events, parses, prints summary or writes `--out-json=<path>`. |

### A.4 Supabase migrations — `supabase/migrations/*.sql`

| File | Purpose |
|---|---|
| `20260501000001_csnl_ops_schema.sql` | Creates the `csnl_ops` schema with all initial tables and enums (isolated from public schema used by lab-reservation). |
| `20260504000001_csnl_ops_seed_initial.sql` | Insert initial seed data for csnl_ops (researchers, grants, projects). |
| `20260505000001_projects_enrichment.sql` | Enrich `csnl_ops.projects` with `full_name` and `software[]` for each project. |
| `20260505000002_lab_meetings_backfill.sql` | Backfill `csnl_ops.lab_meetings` from NAS `/Volumes/CSNL_new-2/GRM/`. |
| `20260505000003_grants_enrichment.sql` | Enrich `csnl_ops.grants` with official title, grant code, and dates. |
| `20260505000004_lab_meetings_pk_fix.sql` | Allow Paper Blitz rows (`presenter_initial = NULL`) by replacing the prior PK. |
| `20260505000005_csnl_ops_grants.sql` | Grant table privileges to `service_role` and `authenticated`. |
| `20260508000001_yaml_corrections.sql` | Align csnl_ops data with the authoritative YAML roster. |
| `20260508000002_anomaly_push_tracking.sql` | Adds `pushed_to_harness_at` to `csnl_ops.sync_anomalies` — handshake stamp so the harness never receives the same anomaly twice. |
| `20260512120000_lab_reservation_fdw.sql` | Sets up Foreign Data Wrapper pointing at the lab-reservation Supabase project so csnl-ops can `SELECT` directly without API duplication (gated on two manual steps). |
| `20260512120001_behavioral_experiments_mirror.sql` | Creates `csnl_ops.behavioral_experiments` (mirror of completed experiment runs via FDW) + `experiment_ingest_anomalies` (no PII columns stored). |

### A.5 GitHub Actions cron triggers — `.github/workflows/csnl-*.yml`

| Workflow | Schedule (UTC) | Local KST | Triggers |
|---|---|---|---|
| `csnl-chase-mm-slides-cron.yml` | `0 5 * * 5` | Fri 14:00 | `/api/cron/chase-mm-slides` |
| `csnl-ingest-experiments-cron.yml` | `0 18 * * 0` | Mon 03:00 | `/api/cron/ingest-experiments` |
| `csnl-sync-csnl-mm-cron.yml` | `5 */12 * * *` | every 12h | `/api/cron/sync-csnl-mm` |
| `csnl-sync-lab-meetings-cron.yml` | `10 */12 * * *` | every 12h | `/api/cron/sync-lab-meetings` |
| `csnl-sync-slab-cron.yml` | `0 */6 * * *` | every 6h | `/api/cron/sync-slab` |

All workflows expose `workflow_dispatch` for manual trigger.

---

## B. `_lab_ai_harness` (Mac Studio + Postgres17 + Ollama, NOT git-tracked)

Path: `/Users/csnl/csnl_on_ai/harness/`

### B.1 v2 harness — `code/*.py`

| Module | Purpose |
|---|---|
| `_init_paperblitz_campaign.py` | Initialize Paper-Blitz `2026-05-06` campaign on top of existing `member_uncertainty.json` + `dm_channel_map.json` without losing prior state. Idempotent. |
| `_send_bot.py` | CLI front-end for `slack_outbound` — send as bot from a shell (`python _send_bot.py <channel_id> "<text>"`, supports `--thread`). |
| `harness_runner.py` | CSNL Paper-Blitz Interview Harness v2 single-cycle runner — file lock + atomic state writes, post-Slack ledger update, differentiated ack templates per intent, abandon-after-2 reminder logic. |
| `ledger.py` | CSNL Lab D3 Feedback Ledger (SQLite MVP) — DB file mode 600, `LedgerSession(caller_init=...)` context manager silently filters cross-researcher reads (no info leak via exceptions). |
| `ledger_audit.py` | Ledger ↔ Slack audit — for every `bot_outbound_messages` row in the window, verify recorded `slack_ts` is reachable via `chat.getPermalink` and that thread-vs-top-level mode matches. Catches fabricated `slack_ts`, mode drift, thread mismatches. |
| `meeting_indexer.py` | Meeting metadata indexer — scans NAS `GRM/` + `MM/`, classifies by naming convention (`PB_yymmdd / [INIT]_yymmdd / MM_yymmdd_[INIT]`), produces `state/meeting_index.json` for uncertainty-Q generation. |
| `memory_consolidator.py` | Memory consolidation loop (weekly Sun 06:00 KST) — compresses `member_uncertainty.json` + 30d `memory_evolution_log.jsonl` into a canonical per-researcher summary, ages out stale claims, detects contradictions, writes `docs/researcher_summaries/<INIT>.md`. |
| `nas_barrier.py` | NAS access barrier — wraps NAS reads with mount detection, retry, and graceful fallback to last-known-good snapshot. Handles 4 failure modes (no mount, missing path, EPERM entry, slow open >5s); cache in `state/nas_snapshot/`. |
| `nas_optout.py` | NAS opt-out policy helper — gates every NAS-reading code path through `(P1)~(P5)` policy levels. P1 = reads allowed but no long-lived persistence; …; consulted by carry_over, paper rec, memev NAS-augmented mode, explore_path. |
| `orchestrator_loop.py` | CSNL Orchestrator Loop wrapper around `harness_runner` — reclaim stale tasks, run `harness_runner --poll-only`, reply matcher (TODO Day 5), replan blocked paths, dispatch top-K deterministic tasks. |
| `pgvector_grm_sync.py` | pgvector GRM sync — extract text from NAS GRM/MM presentation files, embed via Ollama `bge-m3` (1024-dim), upsert into `csnl_v3.lab_meeting_metadata` + `grm_history_embeddings`. Idempotent on `source_path` + `file_sha256`. |
| `realtime_listener.py` | CSNL Realtime DM Catch — Slack Socket Mode listener. Idem-keyed `inbound_messages` insert, then spawns `harness_runner.py --poll-only` to process. Logs to `logs/realtime.log`. |
| `session_meta_review.py` | Daily session meta-review (22:00 cron) — compensating control for memev_autofire standing approval. Writes `docs/session_meta_reviews/YYYY-MM-DD.md` with inbound/outbound/memev/autofire summaries. |
| `slack_outbound.py` | Single chokepoint for ALL Slack outbound — asserts `xoxb-*` token at import, records ledger, idempotency dedup, **academic-tone content lint** (rejects emoji/flattery/intensifiers/emotive punctuation), import-time scan to forbid other modules from calling `requests.post('chat.postMessage')`. |
| `topic_switcher.py` | Per-researcher topic queue + answer-suspension detection. When a researcher pauses (`awaiting_deadline`), switches to next-priority topic in `state/researcher_topics.json` instead of idle blocking. |
| `weekly_corpus_sync.py` | CSNL Weekly Corpus Sync v3 — auto-update per-member research signal from CWLL + GRM + Paper Blitz. Split state `observed_seen` vs `digested_seen`, event-id sha1 (per init/source/file/ts), anchored-pattern `detect_initial`. |
| `weekly_digest.py` | Weekly D3 ledger digest (Sun 09:30 KST) — operator-only `logs/feedback_digest_<YYYY-WW>.md`. No model, no inference; k-anon floor k≥3 aggregates, raw payload text never included. |
| `task_runners/explore_path.py` | NAS scan task with opt-out gate (sub-task of orchestrator). |

### B.2 v3 brain — `code_v3/*.py`

| Module | Purpose |
|---|---|
| `canary.py` | CSNL v3 ACL canary (Week 2 P3) — tests Postgres RLS deny-by-default for interaction + asset tables. 7 researchers × 3 share_scope = 21 setup rows; 7×7×3 = 147 visibility checks. |
| `cost.py` | CSNL v3 cost guard (Week 2 P1) — per-event token cap (5K/1K), daily rolling 5x breaker, monthly hard cap ($150 default + 1-day manual override), static fallback gate. |
| `dispatcher.py` | CSNL v3 dispatcher (Day 5) — idempotent Slack outbound. Polls outbox WHERE status='pending', re-verifies via `conversations.history`, posts with `metadata.event_payload.message_id` for dedup. |
| `listener.py` | CSNL v3 Slack listener (Day 3) — durable INSERT BEFORE ack (Codex G5 fix). Socket Mode envelope handling per Codex Round 3 H2/H5. |
| `llm.py` | CSNL v3 LLM module — two-tier (Opus headless via `claude -p` for heavy reasoning; local Ollama `qwen3.6:35b-a3b` think:false for transport-tier intent labeling/summarize/format conversion). No Anthropic API SDK per J directive. |
| `memory_evolution.py` | CSNL v3 Memory Evolution Loop — continuous self-evolving knowledge. Every N minutes, per researcher with new inbound: read recent inbound, read confirmed/inferred/unknown, call Ollama `qwen2.5:14b` to propose state delta. |
| `shadow_replay.py` | CSNL v3 shadow replay (Day 6) — replays v2 `ledger.db` inbound history into `csnl_v3.inbound_events` with `source='v2_replay'`. Read-only on v2 ledger. Subsequent worker run validates invariants I1/I2/I3. |
| `worker.py` | CSNL v3 worker (Day 4 stub) — static-template only (no LLM yet). 3-step CAS flow: claim (short tx <50ms), infer (no tx), commit (short CAS tx <100ms) with state_version check. |

### B.3 Wrappers — `bin/*.sh`

| Script | Purpose |
|---|---|
| `harness-env.sh` | Exports `HARNESS_ROOT`, `NAS_ROOT` (best-effort via `nas-find.sh`), tokens. Sourced by every wrapper. |
| `harness-runner.sh` | Wrapper for cron `*/30 harness_runner.py` — local-primary, never blocks on NAS, logs to `$HARNESS_ROOT/logs`. |
| `health-check.sh` | Launchd-driven (every minute) — verify `csnl.realtime` listener PID alive + logged within 30 min; bootout + bootstrap if dead/stuck; stamp heartbeat. |
| `memory-evolution.sh` | Wrapper for cron `*/10 memory_evolution.py`. Codex R1#3 (HIGH) addition: echoes env + script sha256 to stderr to diagnose cron-vs-manual env gaps. |
| `mirror-to-nas.sh` | rsync local workspace → NAS. Idempotent. Skips silently if `$NAS_ROOT` empty (NAS unmounted). |
| `nas-find.sh` | Prints path to NAS-mounted `_lab_ai_harness`, or empty. Verifies actual write capability (afpfs/smbfs falsely report writable in `stat()` even when server ACL rejects writes — caused EPERM rsync flood 2026-05-08+). |

---

## Cross-repo handshake

```
                 ┌─────────────────────────────┐
                 │  csnl-ops (Vercel + GH)     │
                 │  - cron routes + scripts    │
                 │  - csnl_ops Supabase schema │
                 └──────────────┬──────────────┘
                                │ writes
                                ▼
                  /Volumes/CSNL_new-2/Memory/
                   _lab_ai_harness/state/
                  csnl_ops_inbox.json          ─── handshake stamp:
                  csnl_ops_snapshot.json            sync_anomalies.pushed_to_harness_at
                  experiments_snapshot.json
                                │ reads
                                ▼
                 ┌─────────────────────────────┐
                 │  _lab_ai_harness (Mac Studio)│
                 │  - realtime_listener daemon │
                 │  - memory_evolution */10    │
                 │  - harness_runner */30      │
                 │  - csnl_v3 Postgres17       │
                 │  - Ollama bge-m3/qwen2.5    │
                 └─────────────────────────────┘
```

The harness never writes back to `csnl_ops`; the inbox/snapshot files are the sole one-way channel. The harness's own state (`ledger.db`, `member_uncertainty.json`, etc.) is authoritative inside the harness boundary.
