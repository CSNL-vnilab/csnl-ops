---
name: memory-cap-rule
description: Hard caps on local cache files to prevent unbounded growth. context.md ≤ 50KB with archive rotation, interview_log.jsonl weekly rotation, project rows individually capped.
---

## 메모리 cap 룰

세션 메모리 폭발 방지 + 한 PC 의 디스크 사용 통제.

### context.md (running memory)

- Hard cap: **50 KB**
- 초과 시: 가장 오래된 "Round N" 섹션부터 `~/.claude/csnl-archive/<INIT>/archive/context-YYYY-MM-DD.md` 로 이동
- 항상 유지되는 섹션:
  - `## 0. Identity` (init, name, role, flags)
  - `## 1. Current uncertainty snapshot` (confirmed 요약 — top 20)
  - `## 2. NAS-grounded facts` (project roots)
  - `## 3. DM thread state` (latest only)
  - `## 5. Next planned actions` (active)

### interview_log.jsonl

- 매주 일요일 00:00 KST: `interview_log-YYYY-WW.jsonl.gz` 로 회전
- 활성 파일은 마지막 7 일만 유지

### project rows (`projects/<INIT>/<slug>.json`)

- 한 row ≤ 30 KB
- 초과 시: 오래된 `timeline[]` 엔트리부터 `_meta.archived_events[]` 로 이동
- `_grounding` pointers 압축 (중복 ledger ref 제거)

### dm_outbox.jsonl

- 매일 자정 KST: `status="sent"` 또는 `status="abandoned"` 인 row 는
  `dm_outbox-archived.jsonl.gz` 로 이동
- 활성 파일은 `pending` 만

### safe_memory.jsonl

- Cap: 200 줄 또는 100 KB (whichever first)
- 초과 시: 오래된 줄부터 `safe_memory-YYYY-MM-DD.jsonl.gz` 회전

### archive 디렉토리 자동 정리

`~/.claude/csnl-archive/<INIT>/archive/` 의 90 일 이상 오래된 압축 파일은
`scripts/clean_archive.sh` (월 1 회 cron) 가 삭제.

### Self-check (매 session-end)

- `du -sh ~/.claude/csnl-archive/<INIT>/` 결과 ≤ 50 MB
- 초과 시 rotate / prune

### 예외

- `handoff-*.md` 파일은 회전 대상 아님 (사용자가 명시 삭제할 때까지 유지)
- `projects/<INIT>/<slug>.json` 의 `_grounding` 은 회전 대상 아님 (DB integrity)

— end of 05_memory-cap.md
