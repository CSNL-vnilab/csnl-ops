---
name: past-focus-rule
description: Questions target past/current NAS files, code, parameters, data — not future plans. "Next GRM slide composition" type future-plan Qs are forbidden; ask "which existing slide most recently used" instead.
---

## Past-focus 룰

### 선호 — past artifact 기반

- "`Code/Analysis/main_fit.m` 의 입력/출력 변수는?"
- "`Data/results/timeExp1/` 의 Sbj 5–12 각 trial 수는?"
- "`hyper.py` 의 `anchor_alpha = {20, 90}` 두 값 중 main 분석 채택은?"
- "`260320 meeting_catmag.pptx` ses4 결과 그래프 y 축 단위는?"

### 자제 — future plans / hypothesis-only

- "다음 GRM 에 어떤 그래프 들어갈 예정?" → *현재 가지고 있는 슬라이드* 위주
- "5/19 PI 미팅 슬라이드 구성은?" → *이미 완성된 슬라이드 NAS 어디?*
- "앞으로 어떤 분석 계획?" → *이미 진행한 분석 스크립트* 위주
- "manuscript 단계 (초고/투고/리비전)" → *NAS 에 현재 어떤 draft 파일* 이 있는지

### 예외 (미래 plan Q 허용 케이스)

- 데이터 수집/분석 단계 단답 (이미 했는지 안 했는지)
- 한 줄 미만의 timeline 정보 ("5/14 마감")
- past 정보로 채울 수 없는 hypothesis-level Q (researcher 머릿속만, NAS 미존재)

### Phase 1 DB 구축 우선순위

1. `purpose` (research question + hypothesis) — past hypothesis statement
2. `apparatus` (PsychoPy/PsychToolbox/jsPSych) — current code
3. `modalities` (behavior/eyetracker/fMRI/EEG/MEG) — observed in code/data
4. `experiment_design` (timing, trials, subjects, conditions) — NAS values
5. `manipulation_variables` (independent + dependent + fitted) — code variables
6. `code_artifacts` (canonical_root, main_experiment, key_scripts) — NAS paths
7. `data_artifacts` (raw_path, processed_path, format, size) — NAS paths
8. `analysis_pipeline` (steps, current_blocker) — observed past
9. `results.summary` + `key_findings` — past observed
10. `connected_graph` (related projects same lab) — past references
11. `external_refs` (GitHub/Notion/Obsidian) — past documents

### Anti-pattern 예시

**BAD** (future-plan Q):
```
정새미 연구원께,

다음 GRM 에 LCI 결과를 어떻게 정리해서 발표하실 계획인가요?
```

**GOOD** (past artifact Q):
```
정새미 연구원께,

`Context/` 의 `260213 meeting.pptx` 와 `260320 meeting_catmag.pptx` 중 LCI 결과
첫 등장이 어느 쪽입니까? — (1) 260213 / (2) 260320 / (3) 둘 외 다른 자료
```

— end of 04_past-focus.md
