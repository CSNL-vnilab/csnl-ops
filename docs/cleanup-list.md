# Cleanup list — purge legacy/log/code, keep memory + cron + DB + env

User directive (2026-05-08): retain only the minimum needed for the
"lab on AI" Slack interview cycle. Apply *after* Mac Studio install
verifies and the next harness cycle confirms ack delivery (don't delete
files that an active cron is currently invoking).

## Layer 1 — safe to delete now (junk, scratch, redundant)

```
/Volumes/CSNL_new-2/Memory/_lab_ai_harness/
├── .DS_Store                              # Finder metadata
├── INSTALL.md                             # superseded by docs/automation-topology.md
├── MIGRATION_PROMPT.md                    # superseded by migration/HANDOFF_PROMPT.md
├── README.md                              # pre-migration human notes
├── code_v3/__pycache__/                   # Python bytecode cache
├── logs/_smb_test_write.log               # 54-byte test artifact
├── logs/v3_dispatcher.log                 # 0-byte stub
├── state/scratch/                         # ad-hoc scratch dir
├── state/ledger.test.db                   # test DB (real one is ledger.db)
└── state/.DS_Store (if present)

/Users/csnl/Documents/claude/csnl-ops/
├── tsconfig.tsbuildinfo                   # TS build cache
├── .next/                                 # Next.js build cache
└── MIGRATION_PROMPT.md                    # superseded by docs/automation-topology.md
```

Total estimated reclaim: ~5–10 MB (most space is in `.next/` + tsbuildinfo).

## Layer 2 — delete after Mac Studio verifies operating

Wait until: Mac Studio harness shows successful cycle in
`logs/orchestrator.log` AND a Slack DM was actually delivered to
SYJ/BHL/etc. Then:

```
/Volumes/CSNL_new-2/Memory/_lab_ai_harness/
├── logs/harness_log.md                    # operational history; ledger.db has it
├── logs/orchestrator.log                  # debug log; not source of truth
├── logs/realtime.log                      # listener log
├── logs/memory_evolution.log              # daily run log
├── logs/feedback_digest_2026-W19.md       # weekly digest snapshot
├── docs/                                  # architecture history
└── researcher_briefs/                     # rolling per-member briefs (verify not read at runtime first)
```

Note: ledger.db is the source of truth for inbound/outbound. logs are
debug breadcrumbs.

## Layer 3 — DO NOT delete

```
/Volumes/CSNL_new-2/Memory/_lab_ai_harness/
├── .env                                   # Slack tokens
├── .env.v3                                # PG role passwords
├── code/                                  # cron + plist still call code/{harness_runner,weekly_corpus_sync,realtime_listener,orchestrator_loop}.py
├── code_v3/                               # cron calls code_v3/memory_evolution.py
└── state/                                 # WHOLE TREE (member_uncertainty, ledger.db, _processed_ledger, csnl_meta_knowledge, dm_channel_map, csnl_ops_inbox, csnl_ops_snapshot, member_profiles_corpus, memory_evolution_log)

/Volumes/CSNL_new-2/Memory/_lab_ai_harness/migration/
├── postgres/csnl_v3_schema_data.sql       # DB recovery artifact
├── cron/crontab.template                  # cron source of truth
├── env/.env, env/.env.v3                  # env templates
├── launchd/{csnl.realtime,csnl.orchestrator}.plist.template
├── install/install.sh, install_phase1.sh, install_phase2.sh, teardown_old.sh
└── ollama/{models_needed.txt, pull.sh}

/Users/csnl/
├── Library/LaunchAgents/csnl.*.plist      # post-install plists (live launchd jobs)
├── Library/Logs/csnl/                     # local log dir (launchd writes here)
└── csnl_on_ai/slack-bot-mcp/.venv         # Python venv

/Users/csnl/Documents/claude/csnl-ops/
├── .env.local                             # secrets
├── src/                                   # all routes & lib
├── scripts/                               # NAS-touching launchd scripts
├── supabase/migrations/                   # DB schema source of truth
├── .github/workflows/csnl-*.yml           # GH Actions cron defs
├── docs/automation-topology.md            # this merged doc
├── docs/cleanup-list.md                   # this list
├── docs/HARNESS_BRIDGE.md                 # csnl_ops_inbox.json schema
└── docs/pi-briefing-2026-05-08.md         # PI briefing prose (already used for 2026-05-08 announcement)
```

## Layer 4 — re-evaluate later

The split between `code/` (v2) and `code_v3/` (v3) is an unfinished
migration inside the harness, separate from the Mac mini → Mac Studio
host migration. Do NOT collapse v2 → v3 in this session. Owner JOP needs
to review which v3 module replaces which v2 entry-point and update cron
+ plist references atomically.

## Execution

Layer 1 commands (idempotent, safe):

```bash
# NAS junk
cd /Volumes/CSNL_new-2/Memory/_lab_ai_harness
rm -f .DS_Store INSTALL.md MIGRATION_PROMPT.md README.md
rm -rf code_v3/__pycache__ state/scratch
rm -f logs/_smb_test_write.log logs/v3_dispatcher.log state/ledger.test.db state/.DS_Store

# csnl-ops junk
cd /Users/csnl/Documents/claude/csnl-ops
rm -rf .next tsconfig.tsbuildinfo
rm -f MIGRATION_PROMPT.md
```

Layer 2 commands — gate on harness alive on Mac Studio:

```bash
# Run AFTER `launchctl list | grep csnl.realtime` shows a PID and
# after at least one outbound DM was sent on Mac Studio.
cd /Volumes/CSNL_new-2/Memory/_lab_ai_harness
rm -rf logs docs
# researcher_briefs: ONLY after grepping code/*.py code_v3/*.py for path 'researcher_briefs' returns nothing
# rg -l researcher_briefs code code_v3   # if empty → safe
# rm -rf researcher_briefs
```
