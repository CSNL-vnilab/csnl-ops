---
name: archive-tone-rule
description: Strict academic Korean tone for researcher-facing text. No AI jargon, no Claude/Opus/Sonnet mentions, no internal-ops terms, no flattery, no signature lines.
---

## 톤 룰

### 허용 — researcher 친화적 학술 한국어

- 평서문 + 단답 요구
- multi-choice (1)(2)(3) 또는 table 형식
- 백틱 안에 실 NAS 경로 / 코드 변수명 / 파일명
- 1 문장 ≤ 60 자 권장, 메시지 전체 ≤ 600 자

### 금지 — 차단되어야 할 패턴

**AI 영문 jargon** (한국어 단어 있는데 영문 abstract):
- `delve`, `leverage`, `robust`, `comprehensive`, `holistic`, `synergy`,
  `tapestry`, `meticulous`, `paradigm` (1 회 초과), `framework` (1 회 초과)
- "navigate the complexities", "in the realm of"

**내부 운영 용어** (researcher 가 모름):
- `발사`, `라운드`, `사이클`, `cycle`, `round`, `interview agenda`
- `axis`, `fact_type`, `outbox`, `fire_lock`, `q_hash`
- `subagent`, `Subagent`, `sub-sub agent`, `orchestrator`, `Orchestrator`
- `nas_runs`, `safe_memory`, `member_uncertainty`, `exploration_plan`
- `confidence ≥`, `≥0.85`

**AI 모델명**:
- `Claude`, `Opus`, `Sonnet`, `Haiku`, `Qwen`, `GPT-`, `Gemini`, `LLM`,
  `OpenAI`, `AI agent`
- 서명 `— Claude`, `- Claude`, `(opus...)` 등 *완전 금지*

**기괴한 약어**:
- `INIT_claude`, `init=`, `H1.1`–`H6.`, `(P1)`–`(P5)`

**감정 표현**:
- `감사합니다`, `훌륭`, `멋지`, `최고`, `정말`, `엄청`, `너무` (강조사)
- 감탄사 / `!!` / `??` / `ㅎㅎ` / `~~`

## 검증

`hooks/pre-fire-lint.py` 가 매 Q 본문에 위 패턴을 grep. 매칭 시 fire 거부.
researcher 가 직접 보는 메시지이므로 lint 가 *반드시* clean.

## 예시

**BAD** (lint 위반 6 건):
```
정새미 연구원께,

오늘 라운드의 다음 단계 발사 준비 완료. subagent 가 fact_type=confirmed 로
적재. 감사합니다.

— Claude
```

**GOOD** (lint clean):
```
정새미 연구원께,

다음 항목 한 자만 회신 부탁드립니다 — (1) A (2) B (3) 둘 다 아님 (한 줄 보충)
```

— end of 01_tone.md
