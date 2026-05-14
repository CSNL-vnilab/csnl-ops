# Phase 1 prior-session state upload (2026-05-14 13:29 KST)

> One-time upload of pre-CLI subagent state into `csnl_v3.public.projects`
> so the new researcher-archiver plugin can bootstrap with full continuity.

## Background

Before 2026-05-14 14:00 KST transition to per-researcher terminal CLI, the
3-tier orchestration (single operator-Opus + 7 subagents + N sub-sub agents)
accumulated rich state per researcher:

- `safe_memory.jsonl` × 7 (146 lines total — ≥0.85 confidence facts)
- `context.md` × 7 (~90 KB total — running memory)
- `dm_log.jsonl` × 7 (26 lines — DM audit)
- `nas_runs/*.jsonl` × 11 files (sub-sub agent NAS exploration output)
- `pending_drafts.md` × 7 (un-fired DM drafts)
- `dm_outbox.jsonl` × 7 (durable outbox)

11 distilled project rows were already in `csnl_v3.public.projects` as the
canonical archive. But the raw subagent state was Mac-Studio-only — new
PC plugin sessions would not see the rich working notes.

## Upload performed

A one-shot script enriched each existing project row with three new
`_meta` fields, then re-synced to Postgres:

| Field | Source | Purpose |
|---|---|---|
| `_meta.prior_session_facts[]` | `safe_memory.jsonl` entries mapped to project slug | Confirmed facts not yet promoted to top-level row fields |
| `_meta.prior_session_orphan_facts[]` | `safe_memory.jsonl` entries unmappable | Attached to first row per INIT for manual review |
| `_meta.prior_session_nas_runs[]` | `nas_runs/*.jsonl` filenames | Pointers (NOT content); actual files stay on Mac Studio + NAS mirror |
| `_meta._prior_session_upload_at` | upload timestamp | Audit |

## Result (after upload)

```
init | project_slug              | row_v | facts | nas_runs | orphans
-----+---------------------------+-------+-------+----------+--------
BHL  | bhl_paradigm_pilot        |   3   |   0   |    2     |   21
BHL  | bhl_sk_organization       |   2   |   1   |    2     |    0
BYL  | biasvar                   |   5   |   0   |    1     |   30
JOP  | grannmds                  |   3   |   1   |    1     |    0
JOP  | granrdt                   |   3   |   2   |    1     |    8
JOP  | ringrepsca                |   3   |   2   |    1     |    0
JOP  | time2dist                 |   5   |   9   |    1     |    0
JYK  | dynamic_bias              |   3   |   0   |    2     |   22
MSY  | cat_mag_main              |   2   |   1   |    2     |   10
MSY  | face_cond_ver10           |   2   |   3   |    2     |    0
SMJ  | concentricity             |   4   |   0   |    2     |   21
SYJ  | syj_jsl_sd_onboarding     |   4   |   8   |    1     |    7
```

Total: **12 rows in central DB** (previously 11 — BHL gained
`bhl_sk_organization` from the SK delegation track). row_version bumped
across all by +1-+2.

## What was NOT uploaded (and why)

- `context.md` raw text — contains operator-internal terminology
  (subagent / round / orchestrator) that violates `rules/01_tone.md` and
  is not useful for researcher-facing CLI. Mac Studio backup is
  authoritative.
- `dm_log.jsonl` — Slack thread audit; redundant with `ledger.db` and
  not needed by per-researcher CLI.
- `nas_runs/*.jsonl` content — only filenames pushed. Files live at
  `/Users/csnl/csnl_on_ai/harness/state/subagents/<INIT>/nas_runs/`
  on Mac Studio + NAS mirror `/Volumes/CSNL_new-2/Memory/_lab_ai_harness/`.
  Researchers who need the raw NAS exploration can request from operator.

## Plugin behavior post-upload

`scripts/bootstrap.py` pulls all rows for the requested INIT including
the new `_meta` fields. The `archiver` agent should:

1. Surface `prior_session_facts[]` as background context (1-2 lines summary
   in first Q): "이전 Slack 인터뷰에서 정리된 N 가지 사실 — 검토 후 confirmed
   로 promote 또는 수정 부탁드립니다."
2. Surface `prior_session_orphan_facts[]` for manual project-slug
   assignment: "다음 N 가지 사실의 소속 project 가 모호합니다. 어느 project
   row 로 분류할지 알려주세요."
3. NAS runs are *pointers* — if researcher needs the actual sub-sub agent
   output content, they request via operator (Mac Studio only).

## Verification queries

자연어-스타일 쿼리 동작 검증:

```sql
-- prior_session 가 가장 많이 풍부한 row
SELECT init, project_slug, row_version,
       jsonb_array_length(meta_jsonb->'prior_session_facts') AS facts,
       jsonb_array_length(meta_jsonb->'prior_session_orphan_facts') AS orphans
FROM public.projects
WHERE meta_jsonb ? 'prior_session_facts'
ORDER BY facts DESC NULLS LAST;

-- 첫 facts 의 grounding pointer 확인
SELECT init, project_slug,
       jsonb_path_query_array(
         meta_jsonb->'prior_session_facts',
         '$[*].grounding'
       ) AS groundings
FROM public.projects
LIMIT 3;
```

## 다음 단계

플러그인 첫 사용자 (예 JOP) 가 다음 명령으로 시작:

```bash
git clone https://github.com/CSNL-vnilab/csnl-ops.git
cd csnl-ops/researcher-archiver-plugin
./scripts/install.sh
vi ~/.claude/csnl-archive/.env  # MY_INIT=JOP, PG_WORKER_PASSWORD=...
claude code
> /archive:doctor               # 환경 점검
> /archive:bootstrap JOP        # 12 rows 중 JOP 4개 + prior facts 자동 로드
```
