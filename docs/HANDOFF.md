# CSNL Lab AI Harness — Handoff (2026-05-12)

> **Purpose**: single-page entrypoint for any Claude session resuming work.
> Cross-references the deeper docs but stands on its own.

## 0. Quick orientation

- **Host**: Mac Studio M2 Ultra (`csnls-Mac-Studio.local`), user `csnl`.
- **Live harness root**: `/Users/csnl/csnl_on_ai/harness/` (NOT git-tracked).
- **csnl-ops repo**: `/Users/csnl/Documents/claude/csnl-ops/` (this repo, git, GitHub `CSNL-vnilab/csnl-ops`).
- **Active PRs**:
  - PR #1 [meta-review-2026-05-11](https://github.com/CSNL-vnilab/csnl-ops/pull/1) — open (parrot guard + dual-write + 72h reminder)
  - PR #2 [uncertainty-pipeline-2026-W19](https://github.com/CSNL-vnilab/csnl-ops/pull/2) — open (closed-loop + (P1)~(P5) opt-out + autofire + pgvector + topic switcher; 8 commits)
  - **NOT YET MERGED** to main — requires user authorization
- **Date / current cycle**: 2026-W19, paperblitz campaign `paperblitz_2026_05_06`.

## 1. Researcher roster + current status

| Init | Name | Slack UID | DM Channel | Role | NAS folder | MM count | pgvector chunks |
|---|---|---|---|---|---|---|---|
| JOP | 박준오 | U06JGAX5HD5 | D0AMRACTLBH | senior researcher | `JOP/` (Time2Dist focus) | 41 | 219 |
| BYL | 이보연 | U07728304R5 | D0AN6PMLWCS | researcher | `BYL/biasVar/` | 0 (empty) | 0 |
| MSY | 여민수 | U06JA7D5XC7 | D0AP128V9DE | researcher | `MSY/Code/cat_mag_main/` | 46 | 76 |
| SMJ | 정새미 | U080KFS0TFZ | D0AN0CHTJP5 | researcher | `SMJ/Concentricity/` | 0 (empty) | 0 |
| JYK | 김정예 | U081CN9JVK3 | D0AN3B8K0CD | researcher | `JYK/RNN/` | 0 (empty) | 1 GRM only |
| BHL | 이보현 | U09DQQFB4E4 | D0AN6PXAESE | junior — learning SK | (no own; reads `SK/`) | n/a | n/a |
| SYJ | 조수영 | U09DQQHQGQ0 | D0AN4N0278E | junior — learning JSL | (no own; reads `JSL/`) | n/a | n/a |

Plus senior anchors (read-only for now): SK (김성제, `SK/WMRepresentation_24_updated/`, `SK/Screen_Retinotopy/`), JSL (임재석, `JSL/SerialDep_Spatial/`, `JSL/Passive_navigation/`).

## 2. Cron schedule (Mac Studio user crontab + launchd)

```
# user crontab
PATH=/sbin:/usr/sbin:/usr/bin:/bin:/opt/homebrew/bin
HARNESS_ROOT=/Users/csnl/csnl_on_ai/harness

*/10 9-21 * * 1-6  harness-runner.sh             # full-mode (ack drain + reminder + queue)
*/10 * * * *       memory-evolution.sh           # qwen2.5:14b delta + autofire route
*/10 * * * *       mirror-to-nas.sh              # afpfs-safe rsync, EPERM→errlog
0 4 * * *          meeting_indexer.py            # NAS GRM+MM scan → state/meeting_index.json
30 4 * * *         pgvector_grm_sync.py          # pptx/pdf → bge-m3 → csnl_v3
0 22 * * *         session_meta_review.py        # daily audit → docs/session_meta_reviews/
0 6 * * 0          memory_consolidator.py        # weekly Sun consolidation
30 9 * * 1-6       weekly_corpus_sync.py --mode=light
30 9 * * 0         weekly_corpus_sync.py --mode=digest

# launchd (~/Library/LaunchAgents/)
csnl.realtime      # Socket Mode listener, KeepAlive=Crashed (pid varies)
csnl.orchestrator  # */15 9-21 CalendarInterval, poll-only harness
csnl.health        # */60s health probe
```

Wrappers in `bin/`: harness-env.sh sources .env; memory-evolution.sh now also echoes env + script sha to stderr (Codex R1#3).

## 3. Storage layout

### Filesystem
```
/Users/csnl/csnl_on_ai/harness/
├── .env, .env.v3                          # Slack tokens, PG creds (0600)
├── bin/                                   # cron wrappers + harness-env.sh
├── code/                                  # v2 harness + new modules (this session)
│   ├── harness_runner.py                  # full-mode ack/reminder
│   ├── realtime_listener.py               # Socket Mode + opt-out detect + immediate memev spawn
│   ├── slack_outbound.py                  # chokepoint + tone lint
│   ├── ledger.py                          # sqlite session
│   ├── _send_bot.py, _init_paperblitz_campaign.py
│   ├── orchestrator_loop.py
│   ├── weekly_corpus_sync.py
│   ├── nas_optout.py                      # (P1)~(P5) policy helper
│   ├── nas_barrier.py                     # NAS access timeout + snapshot cache
│   ├── meeting_indexer.py                 # GRM/MM scan
│   ├── pgvector_grm_sync.py               # bge-m3 embed + upsert
│   ├── ledger_audit.py                    # Slack chat.getPermalink reality check
│   ├── session_meta_review.py             # daily audit doc generator
│   ├── memory_consolidator.py             # weekly consolidation
│   ├── topic_switcher.py                  # per-init topic queue + suspension detect
│   └── task_runners/explore_path.py       # NAS scan with opt-out gate
├── code_v3/                               # v3 brain
│   ├── memory_evolution.py                # qwen delta + parrot guard + flock + dedup + autofire
│   ├── llm.py                             # Ollama wrapper, MODEL_QWEN_TRANSPORT
│   ├── cost.py, dispatcher.py, worker.py, listener.py
│   └── migrations/2026_05_12_grm_embeddings.sql
├── state/
│   ├── ledger.db                          # SQLite — see §3 schema
│   ├── member_uncertainty.json            # current confirmed/inferred/unknown/next_question per init
│   ├── memory_evolution_log.jsonl         # append-only memev audit (~750KB)
│   ├── memev_processed_msgs.json          # dedup set (≤2000 msg ids)
│   ├── nas_optout.json                    # (P1)~(P5) per init, status active|pending_senior_consent
│   ├── nas_snapshot/                      # nas_barrier cache (14d gc)
│   ├── needs_operator_review.jsonl        # stale researchers queue (day-bucket dedup)
│   ├── autofire_log.jsonl                 # memev_autofire audit (nq_hash for 7d block)
│   ├── researcher_topics.json             # 18 topics across 7 researchers
│   ├── meeting_index.json                 # cron 04:00 output
│   ├── consolidated_memory_<INIT>.json    # weekly Sun cron output
│   ├── csnl_carry_over.json               # weekly paper rec carry-over
│   ├── dm_channel_map.json                # uid → DM channel
│   └── _harness.lock, _orchestrator.lock  # filelock guards
├── logs/                                  # local logs (mirror.log goes to ~/Library/Logs/csnl/)
└── researcher_briefs/                     # human-curated notes (legacy)
```

### Postgres `csnl_v3`
```sql
-- pgvector extension active
lab_meeting_metadata (
  id SERIAL PRIMARY KEY,
  researcher_init TEXT NOT NULL,
  kind TEXT CHECK (kind IN ('PB','GRM','MM','CWLL','RAW_PB','OTHER')),
  presentation_date DATE,
  source_path TEXT UNIQUE,
  filename TEXT,
  weekly_folder TEXT,
  naming_ok BOOLEAN DEFAULT false,
  file_mtime TIMESTAMPTZ,
  file_size_bytes BIGINT,
  file_sha256 TEXT,
  indexed_at TIMESTAMPTZ DEFAULT NOW(),
  raw_metadata JSONB
);
-- indexes: init, kind, date DESC

grm_history_embeddings (
  id SERIAL PRIMARY KEY,
  metadata_id INT REFERENCES lab_meeting_metadata(id) ON DELETE CASCADE,
  chunk_idx INT,
  chunk_text TEXT,
  embedding vector(1024),
  embed_model TEXT DEFAULT 'bge-m3',
  embedded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (metadata_id, chunk_idx)
);
-- IVFFlat cosine index recommended once row count > 1000
-- Current: 296 chunks (87 files)
```

### SQLite `state/ledger.db`
Tables (created by `code/ledger.py` migrations):
- `inbound_messages` — id, idem_key(channel:ts), researcher_init, user_id, channel_id, message_ts, thread_ts, text, intent, raw_json, received_at, processed_at, harness_state
- `bot_outbound_messages` — cycle, member, channel, thread_ts, slack_ts, text, kind, sent_at
- `outbound_questions` — campaign_id, researcher_init, channel_id, message_ts, question_text, status (currently unused; Codex Issue 3 next)
- `recommendation_messages`, `feedback_events`, `notion_paper_mentions`
- `pi_candidates`, `cluster_proposals`, `exclusion_rules`, `schema_observations`
- `scheduled_outbound`, `blocked_paths`, `verification_audit`, `exploration_tasks`, `task_dependencies`

## 4. Active automation routes + standing approvals

| Route | Trigger | Guard | Standing approval |
|---|---|---|---|
| `realtime_listener` ingest | inbound DM | none (read-only ingest) | yes |
| `harness_runner --poll-only` spawn | realtime_listener after ingest | poll-only mode (no outbound) | yes |
| `harness_runner` full ack/reminder | `*/10 9-21 1-6` cron | 24h silence, 72h→operator queue, 2-reminder abandon | yes |
| `memev` delta | `*/10` cron + listener spawn | parrot guard + flock + dedup | yes |
| `memev_autofire` next_question | memev post-save | tone lint, parrot guard, 1h throttle, 30min cooldown, 7d nq-hash, pending-review halt | **yes (2026-05-12 amendment)** |
| `mirror-to-nas` | `*/10` cron | afpfs-safe flags | yes (observational) |
| `meeting_indexer` | `0 4 * * *` cron | read-only NAS | yes |
| `pgvector_grm_sync` | `30 4 * * *` cron | sha-based no-change skip, nas_optout gate | yes |
| `session_meta_review` | `0 22 * * *` cron | read-only | yes (compensating control) |
| `memory_consolidator` | `0 6 * * 0` cron | atomic write to docs/researcher_summaries/ | yes |
| `topic_switcher` | called by memev (next iter) | classify_inbound_text + react_to_inbound | yes |
| Other Slack DMs (PI/email/calendar) | manual | first-run external pre-check | NO |

## 5. Topic queue (`state/researcher_topics.json`)

18 topics seeded 2026-05-12. Priority 1 = active focus, 5 = dormant project.
```
JOP (7): Time2Dist*, RingRepSca, Time, GranRDT, GranNMDS, Uncertainty
BYL (2): biasVar*, BL_uncert
BHL (2): SK_WMRep_learning*, SK_retinotopy_learning
MSY (2): cat_mag_main*, HSL_MSY_collab
SMJ (1): Concentricity*
JYK (2): RNN_anchor_models*, JYK_modeling_general
SYJ (2): JSL_SerialDep_learning*, JSL_passive_nav_learning
(* = priority 1)
```

JOP `time2dist_general` currently `awaiting_deadline=2026-05-16` per JOP's 15:14 reply.

## 6. Memory rules (persistent across sessions)

Located in `/Users/csnl/.claude/projects/-Users-csnl-Documents-claude-csnl-ops/memory/`:

- `feedback_first_run_external.md` — **2026-05-12 amendment**: memev_autofire is standing-approved with compensating controls (periodic meta-review + memory DB feedback)
- `feedback_llm_key_policy.md` — Max 2x plan only; no direct Anthropic API; cron LLM = Ollama local only; Codex via ChatGPT OAuth
- `feedback_delegation.md` — Opus orchestrates, delegate impl to Sonnet subagents
- `feedback_bash_autonomy.md` — bash without gates except OAuth
- `feedback_dual_fire_rule.md` — never run harness on two Macs
- `feedback_keep_minimal.md` — purge legacy v2 after parity
- `feedback_paper_rec_tone.md` — researcher-DM academic Korean
- `feedback_paper_rec_date_rules.md` — 1y/3m strict
- `feedback_dm_feedback_loop.md`
- `feedback_supabase_config_push.md` — never `supabase config push` on shared
- `project_csnl_v3_harness.md`, `project_smj_pb_cwll.md`
- `reference_harness_runtime_paths.md`, `reference_mac_studio_runtime.md`

`MEMORY.md` index keeps each line ≤150 chars.

## 7. Slack DMs sent today (2026-05-12)

13 outbound, all top-level, all ledger-audit verified:
- 14:18 (×7) `nas_grounded_uncertainty_Q` to all 7 researchers
- 14:33 JOP `nas_grounded_followup_Q` (Sbj5-12 schema)
- 14:52 SMJ `meeting_material_and_grm_db_request`
- 14:53 JYK, BYL `meeting_material_request`
- 15:10 JOP `memev_autofire_Q` (Time2Dist 일정) — first autofire route success
- 15:28 JOP `meeting_aligned_followup_Q` (RingRepSca+Time limitation cross-project, pgvector cite)

Inbound today: JOP × 3 (14:21 Sbj5-12 valid, 15:14 5/16 deadline + 5/19 PI, plus implicit). Others 0 — operator queue holds them.

## 8. Codex 3-round review (2026-05-12) verdict

Round 1 (autofire/cron): 5 findings → all fixed (flock, dedup, nq-hash, probe, cadence)
Round 2 (async): 6 findings → sequential Qwen 3.6 MoE recommended; signal.alarm thread-fragility flagged for next PR
Round 3 (consolidation): 7 findings → memory_consolidator partial; conflict-detect + saturation signal deferred

Forward-looking risk: "polite hallucination amplifier" if untouched 1 month. consolidator + 30d aging mitigates partially.

## 9. Pending work (next-session priority)

1. **memev/autofire ↔ topic_switcher integration** (highest value): `_autofire_next_questions` should call `react_to_inbound` then `select_next_topic_for_autofire` to switch topics on suspension/deadline.
2. **BYL/SMJ MM upload** — waiting on researcher reply (M1-M4 sent 14:52-14:53)
3. **BHL/SYJ MM folder creation** — deferred per user "나중에 추가예정"
4. **Codex Issue 3** — `outbound_questions` table population + canonical opt-out metadata column (regex parsing → ledger metadata)
5. **`_COMPLETION_RE` IGNORECASE fix** for English "Done"
6. **Senior consent flow** — SK/JSL DM when junior P3 触blocking senior folder
7. **NAS broad scan per topic.nas_paths** — per-topic uncertainty surface (currently only top-level project name seeded)
8. **PR merge** — PR1 + PR2 to main (requires user `gh pr merge` permission)
9. **Hypothesis tree per researcher** (Codex R3#6) — long-term

## 10. Critical "do NOT" list for next session

- DO NOT run `supabase config push` on shared
- DO NOT add `ANTHROPIC_API_KEY` to .env or invoke Anthropic API directly (Max 2x interactive only)
- DO NOT skip pre-check for FIRST external action on a new route (memev_autofire is the only standing-approved external route)
- DO NOT run harness on two Macs simultaneously (Mac mini was decommissioned 2026-05-08~11)
- DO NOT `git push --force` or `gh pr merge` to main without explicit user OK
- DO NOT delete `state/*` or `.env` files
- DO NOT `rsync -a` to afpfs NAS (will EPERM-spam) — use `mirror-to-nas.sh` flags
