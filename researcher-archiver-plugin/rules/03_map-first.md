---
name: map-first-rule
description: Build broad project map (directory tree + libraries + main code + purpose + period + meeting links) BEFORE drilling into granular parameters. Forbidden to ask granular code constants while the broad map is incomplete.
---

## Map-first 룰

### Stage 우선순위

**Stage 1 — Broad map (먼저)**:
1. 디렉토리 트리 (depth 2 highlights)
2. 라이브러리 인벤토리 (`import` / `library()` 호출)
3. main 코드 식별 (experiment / analysis / model 각 1 후보)
4. 연구 목적 (README/summary 1-3 문장)
5. 기간 (mtime 최소~최대)
6. 미팅 연결 (Context/, GRM/, MM/ 파일 + 날짜)

**Stage 2 — Subagent map 구축**:
sub-sub 출력 → `projects/<INIT>/<slug>.json` 의 *map* 섹션 (top-level 새 필드
`directory_map`, `libraries`, `meeting_connections`, `missing_or_ambiguous`)

**Stage 3 — Interview drill**:
*지도 위에서 missing/ambiguous node 만* 인터뷰 Q. 구체적 코드 상수 / 파라미터
sweep / 정량 값은 Stage 4 (선택적 sub-sub drill 패스) 이후에만.

### Project row schema 의 map 섹션

```json
"directory_map": {
  "depth_1": ["Code/", "Data/", "Context/", "Results/", "README.md"],
  "depth_2_highlights": {
    "Code/": ["Experiment/", "Analysis/", "Plotting/"]
  },
  "file_counts": {"code": 174, "data": 10, "slides": 7}
},
"libraries": [
  {"lang": "MATLAB", "imports": ["Psychtoolbox", "MGL"]}
],
"main_code_candidates": [
  {"role": "experiment", "path": "Code/Experiment/main_duration.m"}
],
"period": {
  "oldest_mtime_iso": "2024-11-01T...",
  "newest_mtime_iso": "2026-05-12T..."
},
"meeting_connections": [
  {"path": "Context/JOP_20250714.pdf", "date_in_filename": "2025-07-14", "guess": "GRM"}
],
"missing_or_ambiguous": [
  {"node": "main_analysis_canonical", "why": "3 candidates, no canonical pick"}
]
```

### 금지

- `ANALYSIS_SPATIAL_SIGMA = 0.6 이 픽셀인가 도인가?` 같은 *granular constant Q*
  를 map 미완성 상태에서 묻기
- `anchor_alpha = {20, 90} 중 main 채택은?` 도 map 위에 sweep 매트릭스 구조가 있어야
  제대로 답할 수 있는 Q

### 선호하는 Q (map 위 missing link)

- "Code/Experiment/ 에 `main_duration.m` 과 `main_duration_mock.m` 두 파일이 있는데,
  실 실험 본체는 어느 쪽?"
- "Context/JOP_20240813.pdf 가 MM 자료인지 GRM 자료인지?"
- "README.md 에 fit toolbox 가 명시 안 됐는데, Bayesian fit 에 어느 라이브러리?"

### 적용 순서

1. Bootstrap 시 → Stage 1 map 으로 sub-sub 호출 (또는 researcher 가 NAS 접근 가능
   하면 직접 read 도 OK)
2. map 채워지면 `projects/<INIT>/<slug>.json` 의 `directory_map`/`libraries`/`meeting_connections`/`missing_or_ambiguous` 필드 갱신
3. `missing_or_ambiguous` 노드 중 가장 시급 한 1 개 골라 Stage 3 인터뷰
4. Stage 4 drill 은 명시 필요 시에만

— end of 03_map-first.md
