---
name: archive:sync-db
description: Push local project row changes to central Postgres csnl_v3.public.projects. Uses row_version conflict resolution. Recommended every 5-10 substantive Q/A turns.
---

## /archive:sync-db

로컬 변경분을 중앙 Postgres 에 push.

### 동작 순서

1. **변경 row 식별**: `projects/<INIT>/<slug>.json` 중 `_meta.last_updated_at` 이
   `~/.claude/csnl-archive/<INIT>/.last_sync` 보다 최신인 row 만
2. **로컬 row_version 증가**: 변경 row 의 `_meta.row_version` += 1 (sync 직전)
3. **UPSERT 호출**: `scripts/sync_to_postgres.py --init <INIT>` 실행
   - Postgres 의 `WHERE init=<INIT>` row 만 조회 (cross-init 차단)
   - 충돌 (central row_version > local) 시: local rename → `conflict-<UTC>.json`,
     central 그대로 두고 사용자에게 안내
4. **`.last_sync` 갱신**: 성공한 row 의 last_updated_at 기록
5. **출력**:
   ```
   sync 결과
   - <slug> v<N> → upserted (rowsAffected=1)
   - <slug> v<M> → conflict (central v<M+1> 존재; conflict-<UTC>.json 으로 backup)
   ```

### 충돌 해결

같은 INIT 이 두 PC 에서 동시 작업 시:
- 더 늦은 `last_updated_at` 가 winner
- loser 의 변경분은 `conflict-<UTC>.json` 으로 보존 (수동 머지)
- 충돌 1 회 발생 시 사용자에게 *다른 PC 와 동기화 필요* 안내

### 빈도

- 5-10 Q/A 턴마다 또는
- 한 row 의 confidence_avg 가 ≥0.85 도달했을 때 또는
- `/archive:handoff` 직전 자동

### 실패 케이스

- Postgres 연결 불가 → 로컬에 변경분 보존, 다음 시도까지 `pending_sync` 마킹
- 권한 거부 → `.env` 의 `PG_WORKER_PASSWORD` 확인 안내

### 보안

- 다른 INIT 의 row 절대 쓰기 시도 금지 (`scripts/sync_to_postgres.py` 내 assert)
- 본인 row 만 UPDATE/INSERT, 다른 INIT row 조회는 read-only
