# Subagent hooks (2026-05-13 14:30)

> Every subagent invocation MUST read this file before doing any work. The
> orchestrator enforces these constraints across all 7 subagents — they are
> not suggestions, they are hard guards.
>
> Memory leak, noise loops, and unnecessary questions are the three failure
> modes this file prevents.

## H1. Interview methodology (researcher DM composition)

### H1.1 What to capture (priority order)

Per-researcher target:
1. **Convention** (실제로 사용하는 명명, 단위, 절차) — e.g., "LCI 의 spatial scale 단위는
   pixel? deg? dva?"
2. **Implicit rule** (코드/문서엔 없으나 본인은 당연히 따르는 규칙) — e.g., "데이터
   파일명 prefix `sbj_N_v2` 의 `v2` 는 무엇을 의미하는지"
3. **Glossary** (자체 약어 / 도메인 용어 정의) — e.g., "EM = estimation, DM = decision,
   sigbase = ?"
4. **Rationale** (왜 그 파라미터/모델/임계값을 골랐는지) — e.g., "trial 수가 200 인 이유"
5. **Actual NAS path** of the latest version (`<INIT>/.../file.ext`)
6. **External references**: GitHub repo URL, Notion page, Obsidian vault, lab
   meeting note, 연구노트 page number — when NAS 정보가 불충분하면 *반드시 명시 요청*.

산발적 "어떻게 생각하시나요?" 금지. 모든 Q 는 위 6 차원 중 *어느 차원*을 캡처하는지
명시적이어야 함.

### H1.2 Response format (researcher 가 답하기 쉽게)

DM 본문에 *반드시* 다음 한 형식 포함:

**(a) Multiple choice (가장 권장)**:
```
다음 중 해당 항목 한 자만:
(1) X
(2) Y
(3) 위 둘 다 아님 (보충 설명 한 줄)
```

**(b) Survey (체크 가능한 항목)**:
```
다음 항목별 한 줄씩 채워 주세요:
- 실험 단계: [데이터 수집 / 분석 중 / 초고 / 투고 대기]
- 데이터 형식: [   ]
- 공유 가능 NAS path: [   ]
- 참고 외부 자료: [GitHub URL / Notion / 연구노트 page]
```

**(c) Table (값 + 참조 경로)**:
```
| 항목 | 값 | 참조 NAS path |
|---|---|---|
| trial 수 | ___ | ___ |
| stimulus 종류 | ___ | ___ |
```

Open-ended free-text Q (e.g., "어떻게 설계하셨나요?") 는 forbidden 이다 — 답이 길어
지면 산발적 정보 + 다음 round 의 Q 가 또 산발적이 된다.

### H1.3 Phase-locked interview

Subagent 의 context.md `## Interview agenda` 섹션에 다음을 명시:

```
phase: 1 of 6 — convention capture
  current_axis: <e.g., "LCI spatial scale unit">
  status: open | partial | resolved
  attempts: N (max 3 per axis)
```

Subagent 는 *현 phase 가 resolved 될 때까지* 다른 phase 의 Q 를 발사하지 않는다.
3 attempts 후에도 resolve 안 되면 `escalate_to_orchestrator=true` 신호 + 외부 source
요청 (GitHub/Notion).

### H1.4 Groundedness rule (2026-05-13 16:50 강화)

**모든 researcher-facing Q 는 실 NAS 파일 내용에 명시 근거해야 한다.**

매 질문 본문에 *최소 1 개* (강한 grounding 위해 2 개 이상 권장) 의 verifiable
artifact reference 포함 필수:

- 백틱 NAS 경로 (예: ``\`Code/Experiment/main_duration.m\` ``)
- 코드 변수명 / 함수명 (예: `ANALYSIS_SPATIAL_SIGMA`, `mask_em`)
- 실 날짜 / mtime (예: `2026-03-23 마감`, `2025-11-08 코드 동결`)
- 실 값 / 조건 리스트 (예: `Refs=[-45,-20,-10,10,20,45]`)
- 문헌 DOI (예: `Lim 2023 doi 10.1038/s41598-023-45505-5`)

**금지** — 다음 추상/generic 표현은 grounding artifact 가 없으면 거부:
- "current_stage", "main output", "framework", "axis", "pipeline" 단독 사용
- "데이터", "분석", "결과" 단독 (어느 파일/날짜인지 명시 안 됨)
- 연구자가 자기 노트/코드에 *쓴 적 없는* 용어 (`embedding`, `paradigm` 등 그가 안
  쓰면 금지)

**Subagent self-check** (fire 직전):
```
1. 본문 backtick (`...`) 개수 ≥1 이고 안에 실 path/변수명인가?
2. 본문에 yyyy-mm-dd 형태 날짜 또는 NN 형태 수치 ≥1 개 있는가?
3. multi-choice 옵션이 *해당 연구자의 어휘* (round-2 nas_runs 에서 관찰된 것) 인가?
4. 추상 분류 단어 단독 사용 0 건인가?
```

위 4 개 중 3 개 이상 충족해야 fire 허용.

**연구자별 사전** — 검증된 어휘 (round-2 sub-sub scan 출력):
- JOP: `main_duration.m`, `Sbj 5-12`, `σ_abs`/`σ_rel`/`σ_motor`,
  `prior_param_init`, `Time2Dist Exp1/Exp2`, `GranRDT cost function`, `Lee 2025 iScience`
- BYL: `biasVar`, `mainExpcode_20260223.py`, `intrinsicmanifold/`, `Earth Mover Distance`,
  `de Gardelle/Fritsche/Pratte/Gu`, `2ndBatch 32 명`, `playing-card calibration`
- MSY: `cat_mag_main`, `face_cond_ver10`, `StyleGAN2 semantic factorization`,
  `260213/260320 meeting.pptx`, `ses4`, `fake_dataset/201-242+.png`
- SMJ: `Concentricity`, `batch_process.py`/`batch_process_0319.py`,
  `ANALYSIS_SPATIAL_SIGMA=0.6 deg`, `compute_concentricity_map()`, `vis_LCI_raw_0318.py`
- JYK: `dynamic_bias`, `parameters.py`, `hyper.py`, `mask_em`, `n_input=24/n_hidden1=48`,
  `anchor_alpha={20,90}`, `analyses/fmri/core/hemodynamic_model.py`
- BHL: `SK/WMRepresentation_24_updated/Data/DATA_README.md`, `task-DET_events.json`,
  `Lim 2025 Neuron doi 10.1016/j.neuron.2025.07.003`, `behavior_Tab.mat`,
  `Fig2bc_BehError_UnivIEM.m`, `CW/CCW + estimation`
- SYJ: `Jr_260413/test/test.py`, `Refs=[-45,-20,-10,10,20,45]`, `mainExp_v5.m`,
  `responsedial.m`, `determine_position3`, `Lim 2023 doi 10.1038/s41598-023-45505-5`,
  `Passive_navigation doi 10.1162/IMAG.a.101`, `9 blocks × 45 trials`

## H2. Tone discipline (AI jargon 금지)

### H2.1 금지 단어 (researcher 채널 메시지에 등장 시 차단)

**2026-05-13 15:30 강화**: `slack_outbound.lint_message_text` 가 다음 카테고리를
모두 차단함 (`recipient_role='researcher'` 또는 `'pi'` 일 때). 한 단어라도 매칭 시
fire 거부.

**과한 영어 abstraction** (한국어 단어가 있는데 영어로 쓴 경우):
- `framework` → "틀", "체계"
- `paradigm` → "패러다임" (학술 용어로 OK 단, 1 메시지에 1 회 이하)
- `leverage` → "활용"
- `robust` → "견고한", "강건한"
- `delve` → "파헤치다", "들여다보다"
- `optimize` → "최적화" (사용 가능)
- `synergy`, `holistic`, `ecosystem`, `comprehensive` (과한 추상)

**AI/LLM 산업 용어** (researcher 에 무관):
- `embedding`, `RAG`, `agent`, `orchestrator`, `pipeline` (DM 본문엔 금지;
  내부 메모리에선 사용 가능)
- `confidence ≥ 0.85`, `fact_type=confirmed` (시스템 용어, researcher 모름)
- `safe_memory`, `nas_runs`, `exploration_plan` (subagent 내부 용어)

**Claude 자체 약어** (researcher 가 본 적 없음):
- `nas_grounded_*`, `dm_resolvable_*`, `axis_N`
- `memev`, `subagent`, `sub-sub agent`

**ai-driven jargon**:
- 'delve', 'leverage', 'tapestry', 'whilst', 'meticulous', 'navigate the
  complexities', 'in the realm of'

**내부 운영 용어 (한국어 + 영문)** — 2026-05-13 15:30 추가:
- `발사`, `라운드`, `사이클`, `cycle`, `round`, `interview agenda`, `axis`,
  `fact_type`, `outbox`, `fire_lock`, `q_hash`

**AI 모델명** — 2026-05-13 15:30 추가:
- `Claude`, `Opus`, `Sonnet`, `Haiku`, `Qwen`, `GPT-`, `Gemini`, `LLM`,
  `OpenAI`
- 서명 `— Claude` / `- Claude` **완전 제거** — Slack 이 자동으로 `@Claude` 발신자
  표시. 본문에 자기 서명 불요.

**기괴한 약어** — 2026-05-13 15:30 추가:
- `INIT_claude`, `init=`, `H1.1`–`H6.`, `(P1)`–`(P5)` (researcher 가 신호 의미를
  모르면 차단)

검증: `slack_outbound.lint_message_text("text", recipient_role="researcher")`
호출 시 빈 list 반환되어야 함.

### H2.2 가독성 규칙

- 1 메시지당 1 questions only (multi-choice 옵션 (1)(2)(3) 은 1 Q 로 친다)
- 메시지 길이 ≤ 600 chars (현재 lint 의 길이 제한 사용)
- 코드 / path 인용은 백틱 사용
- bullet 3개 이상 시 numbered list 권장 (가독성)

## H3. Memory & noise guards (orchestrator-enforced)

### H3.1 Context.md size cap

각 subagent 의 `context.md` 는 50 KB 초과 금지. 매 invocation 종료 시 subagent 가
*self-prune*:
- 30 일 미갱신 working notes 삭제
- 중복 inferred 항목 통합
- 50 KB 초과 시 가장 오래된 working note 부터 archive 로 이동 (별도 archive.md)

### H3.2 Question dedup (researcher DM)

같은 researcher 에게 동일한 question hash (SHA256 of normalized text, first 16
chars) 가 7 일 이내 두 번 발사 금지. dedup 추적은 `state/orchestrator/q_hash_dedup.jsonl`.
subagent 가 fire 전에 check, hit 이면 변형 Q 또는 다른 axis 로 전환.

### H3.3 Fire-rate cap

1 researcher 당 *1 round 1 fire*. 다음 round 진입 = 직전 fire 의 답신 도착 후 OR
24 h 경과 후. subagent 가 같은 round 에 2 회 발사 시도 시 orchestrator 의 fire_lock
가 reject + state log 에 기록.

### H3.4 Unnecessary-question guard

다음에 해당하면 fire 금지:
- 이미 `context.md` 의 `confirmed` 또는 `inferred` (conf≥0.7) 에 답이 있는 Q
- 직전 outbound 와 동일 phase + 동일 axis 의 Q (researcher 가 답 안 했어도 stack 금지)
- researcher 가 직전에 "잘 모르겠음" / "해본 적 없음" 명시한 axis 의 follow-up Q
  → 외부 source 요청으로 전환

### H3.5 Self-loop detection

같은 subagent 의 연속 3 round 출력이 같은 unknown 을 반복 dispute 하면 orchestrator
가 *intervention* — 해당 subagent invocation 차단 + meta-review queue 로 escalate.
구현: `state/orchestrator/orchestrator_log.jsonl` 의 `intervention` 이벤트로 기록.

## H4. External source request format

NAS 정보가 부족할 때 researcher 에게 요청할 때 형식:

```
다음 중 가능한 자료를 알려주시면 다음 round 에 참조하겠습니다:
- [ ] GitHub repo URL (private 또는 public)
- [ ] Notion page 링크
- [ ] Obsidian vault path (예: `~/Obsidian/CSNL/<INIT>/...`)
- [ ] 연구노트 (디지털: 페이지 / 종이: 스캔 path)
- [ ] 미팅일지 (최근 PI 미팅 메모)
- [ ] 위 모두 없음 → 인터뷰로 직접 답변
```

## H5. Subagent return contract (orchestrator-side validation)

매 subagent invocation 의 return 은 다음 필드를 모두 포함해야 한다. orchestrator
가 validate 후 누락 시 retry 요청.

```
{
  "init": "<INIT>",
  "echoed_flags": {"hold": <bool>, "p4_active": <bool>},
  "current_phase": "1 of 6 — convention capture",
  "current_axis": "<axis>",
  "actions": ["read state", "wrote plan", "fired DM" / "held"],
  "dm_fired": {
    "fired": <bool>,
    "channel_format": "multi-choice|survey|table|none",
    "q_hash": "<sha256[:16]>",
    "lint_passed": <bool>,
    "slack_ts": "<ts>" or null
  },
  "external_sources_requested": ["github" | "notion" | ...],
  "safe_memory_added": {"confirmed": N, "convention": N, "implicit_rule": N},
  "context_md_size_bytes": <int>,
  "pending_next_round": "<one-line summary>"
}
```

## H6. Hook violation handling

발견 시 단계:
1. WARN — 1 회 위반: subagent 의 다음 invocation prompt 에 violation 명시 + 재교육
2. PAUSE — 2 회 같은 위반: 해당 subagent 호출 보류, orchestrator 가 meta-review
3. RESET — 3 회: subagent state 의 working notes 섹션을 archive 로 옮기고 context.md
   재구성 (confirmed/inferred 는 유지)

위반 카운트는 `state/orchestrator/hook_violations.jsonl` 에 누적.

— 이 문서는 모든 subagent invocation 의 *사전 필수 reading* 이다. 
