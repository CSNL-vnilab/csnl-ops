---
description: Push local project row changes to central Supabase csnl_research.projects. Uses row_version conflict resolution. Recommended every 5-10 substantive Q/A turns.
---

## /csnl-archive:sync-db

로컬 변경분을 중앙 DB (Supabase) 에 push.

### 동작 순서

1. **변경 row 식별**: `projects/<INIT>/<slug>.json` 중 `_meta.row_version !=
   _meta.last_synced_version` 인 row 만 (per-row drift detection)
2. **로컬 row_version 증가**: 변경 row 의 `_meta.row_version` = `max(central, local) + 1`
   (sync 직전, optimistic CAS)
3. **UPSERT 호출**: `scripts/sync_to_supabase.py --init <INIT>` 실행
   - 세션마다 `SET search_path TO csnl_research, public;` + `SET app.my_init`
     (RLS scoping)
   - `WHERE init=<INIT>` row 만 조회 (cross-init 차단)
   - 충돌 (central row_version > local) 시: local rename → `conflict-<UTC>.json`,
     central 그대로 두고 사용자에게 안내
4. **`last_synced_version` 갱신**: DB COMMIT 성공 후에만 로컬 메타에 기록
   (two-phase commit — 네트워크 끊김 시 다음 sync 재시도)
5. **출력**:
   ```
   sync 결과
   - <slug> v<N> → upserted (rowsAffected=1)
   - <slug> v<M> → conflict (central v<M+1> 존재; conflict-<UTC>.json 으로 backup)
   ```

### 실행 contract

```
~/.claude/csnl-archive/run-python.sh \
  ~/.claude/plugins/csnl-archive/scripts/sync_to_supabase.py \
  --init <INIT>
```

### 충돌 해결

같은 INIT 이 두 PC 에서 동시 작업 시:
- 더 늦은 `last_updated_at` 가 winner
- loser 의 변경분은 `conflict-<UTC>.json` 으로 보존 (수동 머지)
- 충돌 1 회 발생 시 사용자에게 *다른 PC 와 동기화 필요* 안내

### 빈도

- 5-10 Q/A 턴마다 또는
- 한 row 의 confidence_avg 가 ≥0.85 도달했을 때 또는
- `/csnl-archive:handoff` 직전 자동

### 실패 케이스

- Supabase 연결 불가 → 로컬에 변경분 보존 (last_synced_version 갱신 안 함),
  다음 시도까지 자동 재시도 대상
- 프로젝트 일시정지 (paused) → 운영자에게 wake-up 요청 안내
- 권한 거부 → `.env` 의 `SUPABASE_DB_PASSWORD` 확인 안내

### 보안

- 다른 INIT 의 row 절대 쓰기 시도 금지 (`scripts/sync_to_supabase.py` 내 assert)
- 본인 row 만 UPDATE/INSERT, RLS 가 cross-INIT read 도 차단
- service_role JWT 미사용 — DB password 만 사용
