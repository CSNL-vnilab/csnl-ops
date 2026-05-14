---
description: Resume an in-progress archive session by reading the most recent handoff-*.md and presenting the next pending question. Use when bootstrap was already run earlier today.
---

## /csnl-archive:continue

직전 세션에서 `/csnl-archive:handoff` 로 작성한 prompt 를 읽어 그 자리에서 이어간다.

### 동작 순서

1. `~/.claude/csnl-archive/<INIT>/` 에서 가장 최근 `handoff-*.md` 찾기
2. 파일이 없으면 → `/csnl-archive:bootstrap <INIT>` 안내
3. 파일이 있으면:
   - 그 내용 (current row_version, unresolved nodes, next Q draft) 을 context 에 로드
   - "직전 세션에서 멈춘 지점: <axis>" 안내
   - 다음 Q draft 가 있으면 lint 통과 후 출력
   - 없으면 새로 Stage-1 map 갱신부터

### 출력 예시

```
직전 세션 (<handoff date>) 에서 멈춘 지점:
- 마지막 axis: cat_mag_main.experiment_design.n_trials_per_session
- confidence_avg: 0.82 → 0.85 목표
- 다음 Q (draft):

[grounded Q]
```

### 차이 — bootstrap 과의

| | bootstrap | continue |
|---|---|---|
| Postgres pull | yes (full) | no (캐시만) |
| handoff 읽기 | optional | required |
| 첫 Q 출처 | missing_or_ambiguous scan | handoff next Q draft |
