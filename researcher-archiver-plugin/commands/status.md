---
description: Show current DB progress for this INIT — number of rows, confidence per project, missing nodes count, last sync timestamp. Read-only.
---

## /csnl-archive:status

읽기 전용 진척 점검.

### 출력 예시

```
=== <INIT> archive status (2026-05-14T14:35:00+09:00) ===

Postgres rows: 4 (last sync 14:20)
Local cache:   4 rows (none pending_sync)

projects/<INIT>/
  - time2dist    | confidence 0.91 | missing 1 | row_v=4 | last_updated 12:48
  - ringrepsca   | confidence 0.87 | missing 2 | row_v=2 | last_updated 12:18
  - granrdt      | confidence 0.84 | missing 3 | row_v=2 | last_updated 12:18
  - grannmds     | confidence 0.82 | missing 3 | row_v=2 | last_updated 12:18

전체 missing/ambiguous: 9 노드
가장 시급: ringrepsca.manuscript.collaborator_status (HSL 협업 시작 시점 미확정)

다음 권장 action:
  - 위 axis 한 줄 답신 → row_version 갱신
  - /csnl-archive:sync-db (중앙 DB 반영)
```

### 동작

1. 로컬 캐시 row 별 metadata 추출 (no Postgres 호출)
2. `_meta.confidence_avg`, `missing_or_ambiguous` count, `row_version`, `last_updated_at`
   집계
3. 다음 권장 action 1 개 제시
