---
description: Write a self-contained handoff-<YYYY-MM-DD-HHMM>.md so the next session can resume exactly where this one stopped. Run before closing the terminal.
---

## /csnl-archive:handoff

세션 종료 직전 실행. 다음 세션 부팅용 prompt 자동 작성.

### 동작 순서

1. 자동으로 `/csnl-archive:sync-db` 1 회 실행 (pending 변경분 push)
2. `~/.claude/csnl-archive/<INIT>/handoff-<YYYY-MM-DD-HHMM>.md` 생성
3. 내용 (templates/handoff.md.template 기반):

```markdown
# Handoff — <INIT> archive session
Generated: <ISO>

## Last sync
- Supabase row_versions: <slug>=<v>, ...
- Local cache size: <KB>

## Resolved this session
- <slug>.<field> → <value> (confidence <c>)
- ...

## Unresolved missing/ambiguous (top 5)
- <slug>.<node> — <why> — <next Q draft>
- ...

## Next session prompt (copy-paste)

```
/csnl-archive:continue
```

위 명령 1 줄이면 됨.

## 환경 변수 (변경 없으면 생략 가능)

- MY_INIT=<INIT>
- SUPABASE_DB_HOST, SUPABASE_DB_USER, SUPABASE_DB_PASSWORD: .env 그대로

## 다음 한 가지 우선

<top-priority axis + draft Q>
```

4. context.md, interview_log.jsonl 의 활성 줄 회전 (rules/05_memory-cap.md)
5. 출력:
   ```
   handoff 작성됨: ~/.claude/csnl-archive/<INIT>/handoff-<datetime>.md
   다음 세션에 /csnl-archive:continue 만 입력하면 됩니다.
   ```

### 자동 실행

`hooks/auto-handoff.sh` (SessionEnd hook) 가 명시적 `/csnl-archive:handoff` 없이도
세션 종료 시 자동 실행. 단 명시적 호출이 더 안전 (rotation 명시).

### 실패 시

- Supabase sync 실패 → handoff 는 작성, sync 는 다음 세션에 재시도 (`pending_sync`)
- 디스크 가득 → context.md 회전 우선 + 사용자 안내
