# CSNL × AI Harness — System Index

## 0. 이 문서의 목적 (Why this file)

A new Claude session reads this single page to know what every tool, policy, state file, and module exists for. Leak-prevention spec: if a piece of behaviour is real, it must be findable from this index. If you cannot find it here, assume it does not exist (or fix this file).

Companion entry points: `docs/HANDOFF.md` (next-session bootstrap), `docs/evolution-loop.md` (philosophy), `docs/snapshot.md` (live numbers).

---

## 1. Auto-memory (~/.claude/projects/.../memory/)

Order matches `MEMORY.md`. Auto-loaded into every session.

| File | One-line |
|---|---|
| `feedback_delegation.md` | Opus orchestrates only; delegate implementation to Sonnet sub-agents |
| `feedback_bash_autonomy.md` | Run bash directly without gates; only stop for interactive auth |
| `project_smj_pb_cwll.md` | csnl-ops does NOT send Paper Blitz or CWLL reminders (SMJ owns) |
| `feedback_supabase_config_push.md` | Never `supabase config push` on shared projects (destructive) |
| `feedback_first_run_external.md` | Dry-run + user approval before first external write; standing approval after |
| `project_csnl_v3_harness.md` | 7-researcher Slack interview campaign, mid-migration Mac mini→Mac Studio |
| `reference_harness_runtime_paths.md` | NAS paths, ledger.db schema, lock files, plist labels |
| `feedback_dual_fire_rule.md` | csnl.realtime+orchestrator+cron on exactly ONE Mac; dual-fire = duplicate DMs |
| `reference_mac_studio_runtime.md` | Mac Studio M2 Ultra is production runtime; full permissions granted |
| `feedback_keep_minimal.md` | Keep only memory/cron/DB/env; purge legacy v2 code/logs |
| `feedback_paper_rec_tone.md` | Academic Korean DMs; no emoji/affect/abstraction; signature `— Claude` |
| `feedback_paper_rec_date_rules.md` | Strict 1y journal / 3m preprint; relaxed 2y / 6m only after 3+ failed strict |
| `feedback_dm_feedback_loop.md` | Researcher reply → update member_uncertainty + re-run pipeline |
| `feedback_llm_key_policy.md` | Max 2x interactive only; no Anthropic API key; cron = local Ollama |
| `project_shared_supabase_topology.md` | csnl-ops + lab-reservation share ONE Supabase project (no FDW) |
| `project_ingest_experiments_pipeline.md` | Weekly cron mirrors public.bookings(completed) → csnl_ops.behavioral_experiments |
| `reference_active_harness_location.md` | Active harness lives at `/Users/csnl/csnl_on_ai/harness/`; NAS is mirror-only |
| `project_nas_first_priority.md` | Phase 1 = nas_sweep.py → state/nas_inventory.json; Slack is gap-fill secondary |
| `feedback_ollama_helper_role.md` | Local Ollama qwen3.6 35b/27b = default for helper/cleanup; Opus = orchestration |

---

## 2. Plugin skills (installed in this repo)

| Skill | When to invoke | Generates |
|---|---|---|
| `codex:setup` | Verify Codex CLI ready; toggle stop-time review gate | local Codex CLI runtime check |
| `codex:rescue` | Codex CLI hangs / token expired | restart instructions |
| `codex:codex-cli-runtime` | Run Codex headless from harness | Codex CLI runtime config |
| `codex:codex-result-handling` | Parse Codex output safely | result-handling boilerplate |
| `codex:gpt-5-4-prompting` | Compose Codex prompts | prompt templates |
| `vercel:bootstrap` / `vercel:deploy` | New Vercel project / push deploy | Vercel config |
| `vercel:env` / `vercel:env-vars` | Manage Vercel env | env CLI commands |
| `vercel:nextjs` / `vercel:next-upgrade` | Next.js framework work | Next config |
| `vercel:auth` / `vercel:verification` | Vercel auth gating | auth middleware |
| `vercel:vercel-functions` / `vercel:vercel-cli` | Edge/serverless / CLI | function scaffolding |

Other Vercel skills (`marketplace`, `shadcn`, `ai-sdk`, etc.) are available but not currently used by csnl-ops.

---

## 3. MCP servers

### 3.1 Configured in `/Users/csnl/Documents/claude/csnl-ops/.mcp.json`

| Server | Type | When to invoke | Safety |
|---|---|---|---|
| `supabase` | HTTP (project `qjhzjqkrbvsnwlbpilio`) | csnl_ops.* schema reads/writes, migration apply, logs, advisors | Read first via `list_tables` + `get_advisors`; never run `supabase config push` |
| `chrome-devtools` | stdio (`chrome-devtools-mcp@latest`) | DOM debug, deploy verify in Vercel preview | autoConnect=true; tier "read" for browsers means screenshot-only |

### 3.2 Available via deferred ToolSearch (not in .mcp.json but loadable)

| Server | When |
|---|---|
| `computer-use` | Native desktop apps (Finder, Notes, System Settings); tier-restricted per app |
| `claude_ai_Gmail` | Send/read Gmail via Claude.ai integration (interactive OAuth) |
| `claude_ai_Google_Drive` | Drive file ops (interactive OAuth) |
| `drawio` | Generate drawio diagrams from CSV / Mermaid / XML |

Note: `computer-use` calls tier "click" for terminals/IDEs (no type allowed); use Bash tool for shell. Never click email links via computer-use — use Chrome MCP.

---

## 4. csnl-ops modules (`/Users/csnl/Documents/claude/csnl-ops/`)

### 4.1 Vercel cron routes (`src/app/api/cron/*/route.ts`)

| Route | Schedule (UTC → KST) | Purpose | Gating |
|---|---|---|---|
| `sync-slab` | every 6h at :00 → q6h | Slab calendar → `csnl_ops.experiment_bookings` | x-cron-secret header |
| `sync-csnl-mm` | `5 */12 * * *` → q12h | CSNL calendar `Meeting: INIT` → `milestone_meetings` | x-cron-secret |
| `sync-lab-meetings` | `10 */12 * * *` → q12h | CSNL calendar GRM/PB → `lab_meetings` reconcile | x-cron-secret |
| `chase-mm-slides` | Fri 05:00 UTC = Fri 14:00 KST | Email MM slide chase for `slides_path IS NULL` rows | x-cron-secret |
| `ingest-experiments` | Sun 18:00 UTC = Mon 03:00 KST | `public.bookings(status=completed)` → `csnl_ops.behavioral_experiments` | x-cron-secret |

### 4.2 `src/lib/*`

| File | Purpose |
|---|---|
| `auth/cron-secret.ts` | sha256 + timingSafeEqual cron header verification |
| `google/auth.ts` | SA-based JWT auth for Google APIs (calendar.readonly) |
| `google/calendar.ts` | `fetchAllEvents` pagination wrapper |
| `mail/send.ts` | Thin wrapper around transport.ts — never throws |
| `mail/templates.ts` | Pure email template functions (subject, text, html) |
| `mail/transport.ts` | nodemailer smtp.gmail.com:587 transport |
| `supabase/admin.ts` | service_role client (bypasses RLS); server-only |
| `sync/parse-mm.ts` | Calendar event → MM row; matches `^Meeting: INIT$` only |
| `sync/parse-slab.ts` | TS port of parse-slab-event.mjs; 8 regex branches preserved |
| `sync/mm-upsert.ts` | Upsert milestone_meetings with insert/update/skip counts |
| `sync/slab-upsert.ts` | Upsert experiment_bookings with insert/update/skip counts |
| `sync/reconcile-grm.ts` | Bucket GRM/PB events; classifyDate per fiscal year |
| `sync/anomalies.ts` | `recordAnomaly` writer to `csnl_ops.sync_anomalies` |
| `ingest-experiments.ts` | Core ingest: completed bookings → behavioral_experiments via email→initial resolve |

### 4.3 `scripts/*` (one-off CLI + launchd helpers)

| Script | Purpose |
|---|---|
| `resolve-mm-slides.mjs` | Probe NAS for MM slide files; populate `slides_path` (launchd) |
| `export-anomalies-for-harness.mjs` | sync_anomalies → `state/csnl_ops_inbox.json` (+ NAS mirror) |
| `export-snapshot-for-harness.mjs` | Build full csnl_ops snapshot → `state/csnl_ops_snapshot.json` |
| `announce-mm-convention.mjs` | One-off Gmail to 7 recipients re MM slide naming |
| `announce-pb-recommendations.mjs` | One-off heads-up for the 18:00 PB DM autorun |
| `peek-csnl.mjs` / `peek-csnl-grm.mjs` / `peek-slab.mjs` | Read-only calendar inspection |
| `list-calendars.mjs` | List visible calendars for the service account |
| `sync-slab.mjs` | Manual sync-slab fetch + report or JSON/SQL export |
| `smoke-ingest-experiments.mjs` | Dry-run smoke test for ingest-experiments |
| `snapshot.py` | Generate `docs/snapshot.md` with live counts |
| `figures/render_panel.py` | Render figure panel (manual) |
| `lib/parse-slab-event.mjs` | Legacy mjs source (TS port in src/lib/sync/parse-slab.ts) |

### 4.4 `supabase/migrations/*.sql`

| File | Purpose |
|---|---|
| `20260501000001_csnl_ops_schema.sql` | Creates csnl_ops schema with all initial tables and enums |
| `20260504000001_csnl_ops_seed_initial.sql` | Insert initial seed data (researchers, grants, projects) |
| `20260505000001_projects_enrichment.sql` | Enrich projects with full_name + software[] |
| `20260505000002_lab_meetings_backfill.sql` | Backfill lab_meetings from NAS GRM/ walk |
| `20260505000003_grants_enrichment.sql` | Enrich grants with title, code, dates |
| `20260505000004_lab_meetings_pk_fix.sql` | Surrogate uuid PK to allow PB rows (presenter NULL) |
| `20260505000005_csnl_ops_grants.sql` | Table privileges to service_role + authenticated |
| `20260508000001_yaml_corrections.sql` | Align with authoritative YAML roster 2026-05-08 |
| `20260508000002_anomaly_push_tracking.sql` | Adds `pushed_to_harness_at` to sync_anomalies |
| `20260512120001_behavioral_experiments_mirror.sql` | behavioral_experiments + experiment_ingest_anomalies tables |

### 4.5 `.github/workflows/*.yml`

| Workflow | Schedule (UTC) | Target route |
|---|---|---|
| `csnl-sync-slab-cron.yml` | `0 */6 * * *` | `/api/cron/sync-slab` |
| `csnl-sync-csnl-mm-cron.yml` | `5 */12 * * *` | `/api/cron/sync-csnl-mm` |
| `csnl-sync-lab-meetings-cron.yml` | `10 */12 * * *` | `/api/cron/sync-lab-meetings` |
| `csnl-chase-mm-slides-cron.yml` | `0 5 * * 5` (Fri 14:00 KST) | `/api/cron/chase-mm-slides` |
| `csnl-ingest-experiments-cron.yml` | `0 18 * * 0` (Mon 03:00 KST) | `/api/cron/ingest-experiments` |

---

## 5. _lab_ai_harness modules (live at `/Users/csnl/csnl_on_ai/harness/`)

### 5.1 `code/*.py` (v2)

| File | One-line | Status |
|---|---|---|
| `harness_runner.py` | CSNL Paper-Blitz Interview Harness v2 — single-cycle runner | active (cron `*/5 9-21 1-6`) |
| `realtime_listener.py` | Slack Socket Mode listener; durable INSERT before ack | active (launchd `csnl.realtime`) |
| `slack_outbound.py` | Single chokepoint for ALL Slack outbound; tone lint enforced | active |
| `agentic_responder.py` | Immediate-response responder invoked by listener | DISABLED (race vs memev) |
| `ledger.py` | SQLite D3 feedback ledger; LedgerSession ACL filter | active |
| `ledger_audit.py` | Ledger ↔ Slack audit (hourly during work hours) | active (cron `0 9-22`) |
| `meeting_indexer.py` | NAS GRM/MM walk → `state/meeting_index.json` | active (cron `0 4`) |
| `memory_consolidator.py` | Weekly consolidation of member_uncertainty + memev log | active (cron `0 6 * * 0`) |
| `nas_barrier.py` | NAS read wrapper with mount detection + snapshot fallback | active (called by readers) |
| `nas_optout.py` | (P1)..(P5) opt-out policy gate before NAS reads | active |
| `nas_sweep.py` | Phase 1 NAS sweep → `state/nas_inventory.json` (NEW 2026-05-12) | active (manual + weekly) |
| `orchestrator_loop.py` | Task queue dispatch wrapper around harness_runner | active (launchd `csnl.orchestrator`) |
| `pgvector_grm_sync.py` | Embed NAS GRM/MM via Ollama bge-m3 → csnl_v3 pgvector | active (cron `30 4`) |
| `session_meta_review.py` | Daily meta-review of memev + autofire + opt-out | active (cron `0 10,14,18,22`) |
| `topic_switcher.py` | Per-researcher topic queue + suspension detection | active |
| `weekly_corpus_sync.py` | Light/digest sweep of CWLL+GRM+PB corpus | active (cron Mon-Sat 9:30 light; Sun 9:30 digest) |
| `weekly_digest.py` | Sun 09:30 KST tabular ledger digest (operator-only) | active |
| `hypothesis_tree.py` | Per-researcher hypothesis tree with status + evidence | active (cron `30 10,14,18,22`) |
| `paper_rec_verifier.py` | DOI resolve + Crossref author verbatim | active (helper) |
| `_init_paperblitz_campaign.py` | One-off campaign init for 6 targets + SYJ/BHL | one-shot (idempotent) |
| `_send_bot.py` | CLI front for slack_outbound (operator) | manual |
| `task_runners/explore_path.py` | Deterministic NAS path scan; no Claude/Slack | task-dispatched |

### 5.2 `code_v3/*.py`

| File | One-line | Status |
|---|---|---|
| `canary.py` | ACL canary — Week 2 P3; tests RLS deny-by-default | tested |
| `cost.py` | Cost guard — token cap + daily 5x + monthly $150 + static fallback | active |
| `dispatcher.py` | Day 5 idempotent Slack outbox dispatcher with HMAC | active |
| `listener.py` | Day 3 spec listener; durable INSERT before ack | active |
| `llm.py` | Two-tier LLM: Opus (claude -p subprocess) + Ollama qwen3.6:35b transport | active |
| `memory_evolution.py` | Continuous self-evolving memory loop (every 10/3 min) | active (autofire DISABLED→standing-approval per 05-12) |
| `shadow_replay.py` | Day 6 replay v2 ledger.db → csnl_v3 inbound_events | manual |
| `worker.py` | Day 4 worker stub; static-template (no LLM yet) | shadow |

### 5.3 `bin/*.sh`

| Script | Purpose |
|---|---|
| `harness-env.sh` | Exports HARNESS_ROOT, NAS_ROOT, tokens (source from wrappers) |
| `harness-runner.sh` | Cron wrapper for `harness_runner.py` |
| `memory-evolution.sh` | Cron wrapper for `code_v3/memory_evolution.py --since-min 15` |
| `mirror-to-nas.sh` | rsync local state/ → NAS (skips chmod/utime; smbfs-safe) |
| `nas-find.sh` | Print path to NAS-mounted _lab_ai_harness or empty |
| `health-check.sh` | Verify csnl.realtime liveness; bootout+bootstrap on stall |

### 5.4 `state/*` (key files)

| File | Owner | Cadence | Purpose |
|---|---|---|---|
| `ledger.db` | ledger.py | event | SQLite D3 ledger (18 tables) |
| `member_uncertainty.json` | memev + harness_runner | event/cron | Per-researcher confirmed/inferred/unknown + next_question |
| `meeting_index.json` | meeting_indexer | daily 04:00 | NAS GRM/MM file index |
| `nas_inventory.json` | nas_sweep | weekly+manual | Phase-1 exhaustive NAS project graph (NEW 2026-05-12) |
| `nas_optout.json` | operator + memev | event | (P1)..(P4) opt-out declarations per researcher |
| `researcher_topics.json` | topic_switcher | event | Topic queue per researcher with suspension state |
| `researcher_hypotheses.json` | hypothesis_tree | event/4h | Per-researcher claims with status + evidence |
| `csnl_ops_inbox.json` | export-anomalies-for-harness | weekly cron | Anomaly inbox from csnl_ops.sync_anomalies |
| `csnl_ops_snapshot.json` | export-snapshot-for-harness | weekly cron | Authoritative researchers/projects/grants/anomalies |
| `experiments_snapshot.json` | export-anomalies-for-harness | weekly cron | Per-researcher experiment activity snapshot |
| `dm_channel_map.json` | _init_paperblitz_campaign | one-shot | INIT → Slack channel_id mapping |
| `consolidated_memory_<INIT>.json` | memory_consolidator | weekly Sun 06:00 | Canonical per-researcher summary |
| `autofire_log.jsonl` | memev | event | Auto-fired next_question audit trail |
| `memory_evolution_log.jsonl` | memev | event | All applied state deltas |
| `memev_processed_msgs.json` | memev | event | Inbound msg dedup hashes |
| `needs_operator_review.jsonl` | memev | event | Items kicked to operator review |
| `member_profiles_corpus.json` | weekly_corpus_sync | weekly | Per-member observed signal accumulator |
| `_harness.lock` / `_orchestrator.lock` / `member_uncertainty.lock` | fcntl | event | Concurrent write locks |
| `_last_sync.json` | weekly_corpus_sync | weekly | observed_seen / digested_seen checkpoints |
| `_processed_ledger.json` | harness_runner | event | Idempotent ack ledger keyed by message_ts |
| `csnl_carry_over.json` | carry_over generator | event | NAS-derived facts carried into next cycle |
| `csnl_last_processed.json` | harness_runner | event | Per-target last processed message_ts |
| `csnl_meta_knowledge.md` | operator | manual | Operator-curated meta-knowledge (markdown) |
| `nas_snapshot/` | nas_barrier | event | Per-path cached listing for NAS-unavailable fallback |

### 5.5 launchd labels (`code/launchd/*.plist`)

| Label | When | What |
|---|---|---|
| `csnl.realtime` | always-on | `realtime_listener.py` — Slack Socket Mode daemon |
| `csnl.orchestrator` | always-on | `orchestrator_loop.py` — task queue dispatch |
| `csnl.health` | minutely | `health-check.sh` — verify realtime PID + log freshness; bootout+bootstrap on stall |

### 5.6 User crontab (KST = UTC+9)

```
*/3   * * * *       memory-evolution.sh                        # memev hot loop
*/5   9-21 * * 1-6  harness-runner.sh                          # interview cycle (work hours)
*/10  * * * *       mirror-to-nas.sh                           # local→NAS state mirror
30 9  * * 1-6       weekly_corpus_sync.py --mode=light         # Mon-Sat 09:30 light
30 9  * * 0         weekly_corpus_sync.py --mode=digest        # Sun 09:30 digest
0 4   * * *         meeting_indexer.py                         # NAS GRM/MM walk
30 4  * * *         pgvector_grm_sync.py                       # embed → csnl_v3
0 10,14,18,22 * * * session_meta_review.py                     # 4h meta-review (work hours)
0 6   * * 0         memory_consolidator.py                     # weekly Sun 06:00
30 10,14,18,22 * * * hypothesis_tree.py render                 # 4h hypothesis re-render
0 9-22 * * *        ledger_audit.py --since -2h                # hourly Slack-ledger reconciliation
```

---

## 6. Postgres + SQLite schemas

### 6.1 Supabase `csnl_ops.*` (shared project `qjhzjqkrbvsnwlbpilio`)

| Table | Purpose |
|---|---|
| `researchers` | Lab roster (initial, full_name, role, email, active) |
| `experiment_bookings` | Slab calendar → equipment bookings |
| `lab_meetings` | GRM/PB/special_grm with surrogate uuid PK |
| `milestone_meetings` | Per-researcher MM with slides_path |
| `cwll_entries` | CWLL log entries |
| `annual_events` | Annual lab events (retreat, etc.) |
| `nas_datasets` | NAS dataset registry |
| `grants` | Grant title + code + dates |
| `projects` | 15 seeded projects with full_name + software[] |
| `sync_anomalies` | Calendar/NAS sync anomalies (`pushed_to_harness_at`) |
| `grm_presenters_observed` | Calendar-observed GRM presenter inits |
| `special_grm_presenters` | Curated special-GRM presenters |
| `behavioral_experiments` | Mirror of completed runs from `public.bookings` |
| `experiment_ingest_anomalies` | Per-row ingest anomalies |

### 6.2 Local Postgres `csnl_v3` (Mac Studio, pgvector active)

| Table | Purpose |
|---|---|
| `lab_meeting_metadata` | (init, date, file_path, file_sha256) for each indexed presentation |
| `grm_history_embeddings` | bge-m3 1024-dim chunk embeddings keyed by file_sha256 |

### 6.3 SQLite `state/ledger.db` (18 tables)

| Table | Purpose |
|---|---|
| `inbound_messages` | Idempotent inbound (channel:ts) with harness_state machine |
| `outbound_questions` | Sent Qs with status (awaiting/answered/superseded/abandoned) |
| `bot_outbound_messages` | Generic bot outbound log |
| `recommendation_messages` | Paper-rec posts with (channel, ts) unique |
| `paper_recommendations` | Per-cycle, per-member recommended paper |
| `paper_recommendations_read` | Marked-read state |
| `feedback_events` | Reactions/replies/saves keyed by recommendation_id |
| `notion_paper_mentions` | Notion-side mentions of paper_id |
| `pi_candidates` | Proposed PI items (pending/approved/rejected) |
| `cluster_proposals` | Cluster add/remove/rename proposals |
| `exclusion_rules` | Per-researcher excluded_term blocklist |
| `schema_observations` | observed_by/field_name/proposed_action audit |
| `scheduled_outbound` | Scheduled future Slack sends |
| `blocked_paths` | (researcher, path) paused_pending_reply blockers |
| `verification_audit` | Claim audit queue (pending/confirmed/refuted/etc.) |
| `exploration_tasks` | Task queue (P0..P4, lease/heartbeat/scratch_dir) |
| `task_dependencies` | task_id ← depends_on_task_id |

---

## 7. Leak-prevention map (정책 누수 방지)

For each policy or piece of state, document both authoritative source and runtime enforcement point. If only one exists, a future session will leak.

| Concern | Documented | Enforced |
|---|---|---|
| Routing decisions | `docs/HANDOFF.md` §0 | `code_v3/memory_evolution.py` header comment |
| (P1)..(P5) opt-out policy | `docs/uncertainty-pipeline-2026-W19.md` | `code/nas_optout.py` + `state/nas_optout.json` |
| DM tone (academic Korean) | `feedback_paper_rec_tone.md` | `code/slack_outbound.py` ContentPolicyViolation lint |
| Paper-rec date filter | `feedback_paper_rec_date_rules.md` | `code/paper_rec_verifier.py` + topic_switcher |
| LLM key policy (no API key) | `feedback_llm_key_policy.md` | `code_v3/llm.py` (subprocess `claude -p` only) |
| Mentor mapping (BHL→SK, SYJ→JSL) | `project_nas_first_priority.md` | `code/nas_sweep.py` mentor roster |
| NAS-first priority | `project_nas_first_priority.md` | `code/nas_sweep.py` + `docs/evolution-loop.md` |
| Dual-fire prevention | `feedback_dual_fire_rule.md` | launchd plist on exactly ONE Mac (csnl.realtime/orchestrator) |
| First-run external pre-check | `feedback_first_run_external.md` | dry-run flag in announce-* scripts; memev autofire has standing approval (05-12 amendment) |
| Cross-researcher read filter | `code/ledger.py` docstring (privacy posture) | `LedgerSession(caller_init=...)` k>=3 floor |
| Tone enforcement at runtime | `code/slack_outbound.py` import-time scan | rejects emoji/intensifiers/emotive punctuation |
| Cost cap ($150/mo) | `code_v3/cost.py` header | `CostGuard.allow_call` → static fallback |
| SMJ owns PB/CWLL announcements | `project_smj_pb_cwll.md` | csnl-ops has NO chase-pb route |
| Shared Supabase topology | `project_shared_supabase_topology.md` | `<initial>@vnilab.local` pseudo-emails resolve in ingest-experiments.ts |
| Active harness location | `reference_active_harness_location.md` | mirror-to-nas.sh is local→NAS only |
| Operator-only weekly digest | `code/weekly_digest.py` docstring | Sun 09:30 KST cron writes `logs/feedback_digest_<YW>.md` (not Slack) |

---

## 8. How a new session bootstraps (< 5 min to working state)

1. `~/.claude/projects/-Users-csnl-Documents-claude-csnl-ops/memory/MEMORY.md` — auto-loaded; 19 entries reference 18 .md files
2. `docs/HANDOFF.md` — single-page next-session entrypoint
3. `docs/evolution-loop.md` — philosophy (memev↔topic_switcher integrated loop)
4. `docs/system-index.md` — **this file** (every module/policy/state in one page)
5. `docs/snapshot.md` — latest numbers (counts go stale fast; regen via `scripts/snapshot.py`)
6. `docs/uncertainty-pipeline-2026-W19.md` — current operational pipeline spec
7. Dive into the relevant module via §5 (harness) or §4 (csnl-ops)

Sanity checks before any external write:

- `crontab -l | head` — confirm runtime cadences match §5.6
- `launchctl list | grep csnl` — confirm csnl.realtime/orchestrator/health
- `sqlite3 /Users/csnl/csnl_on_ai/harness/state/ledger.db ".tables"` — 18 tables
- `ls /Volumes/CSNL_new-2/Memory/_lab_ai_harness/state/` — NAS mirror reachable
- Read `state/nas_optout.json` before any NAS-read code path
