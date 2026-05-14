---
name: grounded-interview-rule
description: Every researcher-facing Q must reference real NAS file path / code variable / date / value / DOI from the project artifacts. Generic abstract Qs are forbidden.
---

## Grounded-ness 룰

매 Q 본문에 *최소 1 개* 의 verifiable artifact reference 가 있어야 함.

### 인정되는 grounding 형태

1. **백틱 NAS 경로** — ``\`Code/Experiment/main_duration.m\`\``, ``\`Data/results/timeExp1/\`\``
2. **코드 변수명 / 함수명** — `ANALYSIS_SPATIAL_SIGMA`, `mask_em`, `compute_concentricity_map()`
3. **실 날짜 / mtime** — `2026-03-23 마감`, `2025-11-08 코드 동결`
4. **실 값 / 조건 리스트** — `Refs=[-45,-20,-10,10,20,45]`, `n_hidden1=48`
5. **문헌 DOI** — `Lim 2023 doi 10.1038/s41598-023-45505-5`

### 차단 — abstract solo 사용 금지

- `current_stage`, `main output`, `framework`, `axis`, `pipeline` 단독
- `데이터`, `분석`, `결과` 단독 (어느 파일/날짜인지 명시 안 됨)
- researcher 가 자기 노트/코드에 *쓴 적 없는* 단어 (e.g., `embedding`, `paradigm`
  을 그가 안 쓰면 금지)

### Self-check (fire 직전)

1. 본문 backtick (`...`) 개수 ≥ 1 이고 안에 *실* path/변수명/값인가?
2. 본문에 yyyy-mm-dd 형태 날짜 또는 수치 ≥ 1 있는가?
3. multi-choice 옵션이 *해당 연구자 어휘* (NAS 또는 Slack 답신 에서 관찰된 것)인가?
4. 추상 분류 단어 단독 사용 0 건인가?

위 4 개 중 *최소 3 개* 통과해야 fire.

### Grounded ness 의 3 단계

1. **추측 (forbidden)** — "current_stage 가 무엇인가요?" (file 0, value 0)
2. **약한 grounding** — "데이터 수집 / 분석 / 초고 중 어느 단계?" (label 만)
3. **강한 grounding (target)** — "`Data/OnlineProject/2ndBatch/` 최종 CSV mtime
   2026-03-23 인데 이후 추가 raw 가 있으십니까?"

### 예시

**BAD** (artifact 0):
```
이보연 연구원께,

현재 분석 단계가 어떻게 되시나요?
```

**GOOD** (artifact 3):
```
이보연 연구원께,

`Data/OnlineProject/2ndBatch/durSec_Project_v2/data/` 의 32 세션 CSV 파일에서,
다음 분석 단계가 다음 중 무엇입니까 — (1) RSA/MDS pipeline 적용 / (2) heterogeneous
loss 가설 검정 / (3) draft 작성 시작 / (4) 다른 단계 (한 줄)
```

— end of 02_grounded.md
