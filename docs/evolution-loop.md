# Evolution Loop — Researcher Knowledge Co-Construction

> Operator directive (2026-05-12): "탐사하고, 불확실한 부분을 질문하고, 답변을
> 받고, 답변을 기반으로 탐사 계획을 수정하거나 새로운 질문을 생성하고, 답변을
> 기반으로 메모리를 업데이트하고, ... 이 evolution loop 에 대한 철학을 전문적인
> 수준으로 구현하고 harness, hook, skill 을 체계적으로 기록해두어 leak 없도록
> 명시." 본 문서는 그 명세이다.

## 0. 한 문장

이 시스템은 7 명의 능동 연구원 (active cohort) 의 머릿속에 흩어진 사실, 추측,
모름을 NAS 전수조사 (exhaustive sweep) 와 학술 한국어 Slack 대화로 점진적으로
정련 (精鍊) 하는 닫힌 회로 (closed loop) 다.

## 1. 철학적 배경

### 1.1 왜 이 설계인가

세 가지 단순 대안을 모두 거부하고 본 회로가 선택된 이유는 다음과 같다.

| 대안 | 약점 |
|---|---|
| (a) Slack-only 추궁 (chasing) | 답신이 짧고 모호 (ambiguous), 최근편향 (recency bias) 강함. 사실 출처로 불안정. 작은 답신 한 줄을 "확정 사실" 로 오인할 위험 (hallucination risk). |
| (b) NAS-only 스크래핑 (scraping) | 파일 존재 ≠ 연구원의 mental model. 가설 (hypothesis), 막힘 (blocker), 다음 계획은 파일에 드러나지 않음. |
| (c) 정기 설문지 (periodic survey form) | 응답률 낮음. 연구원의 사고 흐름 (thought flow) 과 동기화되지 않음. UI friction 큼. |

### 1.2 인식론적 가정 (epistemological assumption)

"explore → ask → receive → revise → update → loop" 는 단순한 워크플로우가
아니라, 인간-LLM-NAS 세 그라운딩 (grounding) 의 비대칭 강도에 기반한 정련
순서다.

**강도 순서**: NAS file 존재 (강) > 본인의 학술 한국어 대화 (중) > 짧은 Slack
답신 (약) > LLM 의 단독 추정 (가장 약).

본 시스템의 핵심 invariant 는 위 순서를 항상 보존하는 것이다. 약한 신호로
강한 사실을 덮어쓰지 않는다.

### 1.3 지식의 휘발성 (volatility) 가정

연구원의 mental model 은 일주일 단위로 갱신된다 (실험 결과 도착, 발표 준비,
PI 피드백). 한 달 갱신 없는 confirmed 항목은 점진 demotion (강등) 대상이며,
세 달 갱신 없는 항목은 stale flag 가 붙는다. 즉 본 시스템은 한 번 적재된
사실을 *영구* 로 다루지 않는다.

## 2. 두 단계 우선순위 (정정 2026-05-12)

### Phase 1 — NAS 전수조사 (현재)

구현체: `harness/code/nas_sweep.py` (373 lines).
출력: `state/nas_inventory.json` (2026-05-12 19:03 sweep, 9 init × 18 projects,
2076 files scanned).

스키마 핵심: `researchers.<INIT>.projects.<Project>.{file_count, kinds,
mtime_oldest_iso, mtime_newest_iso, samples[≤5]}`. 각 sample 은 head 500 chars
까지만 적재한다 (NAS read budget 보호).

### Phase 2 — Slack 인터뷰 + cron incremental (현재 + 향후)

NAS 가 보여줄 수 없는 빈칸 (가설, 막힘, 다음 일정) 을 메우는 incremental
보강층이다. `harness/code_v3/memory_evolution.py` 가 inbound 처리 시 *먼저*
nas_inventory.json 의 해당 researcher 섹션을 읽어 confirmed 사실을 우선
적재하고, Slack 답신은 inferred 또는 explicit confirmation 으로만 confirmed
를 갱신한다.

구현 (2026-05-12 19:45 완료): `apply_nas_inventory(state_dir, member_uncertainty)`
가 매 cycle `apply_experiments_snapshot` 직후 실행. 각 researcher 에 다음 필드를
적재한다.

- `nas_projects`: list of `{name, file_count, kinds, mtime_newest_iso,
  mtime_oldest_iso, total_size_bytes}`, mtime_newest_iso DESC 정렬.
- `nas_role`: inventory 의 `role` 라벨 (active_cohort / senior).
- `nas_mentor_init`: junior 만 — 멘토 INIT (BHL→SK, SYJ→JSL).
- `nas_mentor_projects`: junior 만 — 멘토의 projects summary (mentor 의
  학습 surface 가 즉시 prompt 에 노출되도록 미러링).
- `nas_folder_exists`: bool — 본인 NAS 폴더 존재 여부.
- top-level `_nas_inventory_swept_at`: ISO 시각.

`evolve_one()` 의 `user_payload` 는 위 필드를 `NAS-grounded projects (Phase 1
ground truth — do NOT re-propose)` 섹션으로 prepend 하여 Qwen 에 보낸다.
`EVO_SYSTEM` 의 Misc rules 에 명시적 금지 추가: NAS 사실을 `confirmed_delta`
로 재제안 금지, Slack reply 는 NAS 가 보여줄 수 없는 빈칸 (가설/막힘/일정) 만
채울 것.

### 2.1 왜 NAS 가 먼저인가

- 짧은 Slack reply 한 줄로 "진짜 사실" 을 착각할 위험을 사전 차단한다.
- 안정적 ground truth (mtime, size, sha256) 가 있으므로 demotion path 가
  결정론적 (deterministic) 으로 작동한다.
- senior anchor 인 SK, JSL 의 폴더는 BHL, SYJ 의 학습 대상이므로 NAS 전수조사
  단계에서 같이 인벤토리해 두면 후속 멘토링 인터뷰 cycle 에 즉시 활용된다.

## 3. Loop 의 6 단계

| 단계 | 책임자 | 입력 | 출력 | 실패 모드 |
|---|---|---|---|---|
| 1. Explore | `nas_sweep.py` (cron weekly + on-demand) | `/Volumes/CSNL_new-{1,2}/Memory/<INIT>/` | `state/nas_inventory.json` | NAS 미마운트 시 last-known-good snapshot 사용; budget 초과 시 partial sweep flag. |
| 2. Surface uncertainty | operator-Opus session (sub-agent 가능) | nas_inventory + member_uncertainty diff | 후보 question pool (in-session) | inventory 와 memory 의 _swept_at / _updated 시각 stale 시 sweep 재실행 요구. |
| 3. Ask | **operator-Opus only** | 후보 pool + 학술 한국어 tone rule | `slack_outbound.post()` 호출 | tone lint 거절 시 재작성; parrot guard 거절 시 폐기. |
| 4. Receive | `realtime_listener.py` (Socket Mode) | inbound DM event | `ledger.inbound_messages` row + `harness_runner --poll-only` spawn | listener 정지 시 launchd health-check 가 1 분 내 재부팅. |
| 5. Update memory | `memory_evolution.py` (Qwen 2.5 14b, `*/10 *` cron) | inbound text + 현재 member_uncertainty | `state/member_uncertainty.json` delta + `memory_evolution_log.jsonl` 1 row | autofire 는 disabled; delta 만 적재. parrot/dedup/flock 3 중 guard. |
| 6. Revise plan | operator review + `topic_switcher.py` | member_uncertainty diff + ledger | `state/researcher_topics.json` priority 변경 + `long-term-plan-*.md` 수동 갱신 | suspension/deadline 감지 시 다음 priority topic 으로 자동 switch. |

각 단계의 책임 경계 (boundary) 는 「§4 비대칭 그라운딩」 invariant 를 반드시
지킨다.

## 4. 비대칭 그라운딩 (epistemic priority)

본 시스템이 다루는 사실의 세 등급은 다음과 같다.

### 4.1 등급 정의

- **confirmed**: NAS file 존재 + 본인의 명시 (explicit) 확인 둘 다 필요.
  단독 NAS 파일은 confirmed 가 아니라 inferred 다 (파일은 존재해도 본인이
  그 모듈을 안다고 확인하지 않은 상태일 수 있다).
- **inferred**: NAS 에는 있으나 본인 미확인, 혹은 본인 답신은 있으나 NAS 미발견.
- **unknown**: 양쪽 다 비어 있음.

### 4.2 Promotion / Demotion path

- **Promotion** (unknown → inferred → confirmed) 는 *명시적 신호* 만 인정한다.
  즉 자동 promotion 은 없다. operator review 또는 본인 답신의 명시 확인이
  필요하다.
- **Demotion** (confirmed → inferred → unknown) 은 *시간 기반 자동 강등* 을
  허용한다: 30 일 갱신 없음 → inferred, 90 일 갱신 없음 → unknown.
  `memory_consolidator.py` (weekly Sun 06:00 cron) 이 수행한다.

### 4.3 _is_parrot guard

LLM (Qwen) 이 inbound 답신의 문자열을 그대로 confirmed 로 적재하려 할 때
거절한다 (parrot detection). 본인의 답신 → 본인의 confirmed 로의 자동 promotion
이 일어나면 inferred 와 confirmed 의 경계가 무너지므로, parrot guard 가
이를 막는다. 구현: `code_v3/memory_evolution.py` 의 `_is_parrot()`.

## 5. Hook 매트릭스 (leak 방지용 명시)

본 단원은 차기 세션이 *어떤 hook 이 어디서 작동하는지* 명확히 알 수 있도록
세 종류의 hook 을 분리 명시한다.

### 5.1 MCP servers (해당 세션이 접속 가능한 외부 도구)

| MCP | 용도 | 본 loop 에서의 활성 단계 |
|---|---|---|
| `chrome-devtools` | 브라우저 검증 | (현재 미사용) |
| `supabase` | csnl_ops.* schema 점검 | Phase 2 보조 (sync_anomalies 조회) |
| `drawio` | 다이어그램 생성 | docs/* 갱신 시 |
| `computer-use` | 데스크톱 제어 | (현재 미사용) |
| `claude_ai_Gmail` / `claude_ai_Google_Drive` | 인증 후 사용 | (현재 미사용) |
| `plugin_vercel_vercel` | 배포 점검 | csnl-ops 배포 시 |

### 5.2 Plugin / session skill

| Skill | 용도 |
|---|---|
| `codex:codex-cli-runtime`, `codex:rescue` | 코덱스 adversarial review |
| `vercel:*` | csnl-ops 배포 / cron / env |
| `prompt-engineer`, `scientific-writing`, `markdown-mermaid-writing` | 본 docs 작성 |
| `code-documenter`, `code-reviewer`, `security-reviewer` | PR review |
| `update-config`, `keybindings-help`, `fewer-permission-prompts`, `loop`, `schedule` | 세션 환경 조정 |

### 5.3 Auto-memory (always-loaded 18 entries)

`/Users/csnl/.claude/projects/-Users-csnl-Documents-claude-csnl-ops/memory/`
에 저장된 사용자-쓰기 메모리. 본 loop 가 의존하는 핵심 항목은 다음과 같다.

| 메모리 | 의미 |
|---|---|
| `project_nas_first_priority.md` | Phase 1/2 우선순위 |
| `feedback_first_run_external.md` | autofire 의 standing approval 조건 |
| `feedback_llm_key_policy.md` | Anthropic API 직접 호출 금지 |
| `feedback_paper_rec_tone.md` | 학술 한국어 tone rule |
| `feedback_paper_rec_date_rules.md` | 1y / 3m 엄격 필터 |
| `feedback_dm_feedback_loop.md` | 답신 → memory 갱신 → 재추천 안 함 |
| `feedback_dual_fire_rule.md` | Mac 동시 실행 금지 |
| `feedback_keep_minimal.md` | legacy 코드 정리 |
| `project_csnl_v3_harness.md` | 7-researcher 캠페인 상태 |
| `reference_harness_runtime_paths.md` | NAS path, ledger schema |
| `reference_mac_studio_runtime.md` | 호스트 권한 |

## 6. State surfaces (truth 의 정의)

| 파일 | owner | mutation cadence | 의미 |
|---|---|---|---|
| `state/nas_inventory.json` | `nas_sweep.py` | weekly + on-demand | Phase 1 ground truth |
| `state/member_uncertainty.json` | `memory_evolution.py` | every 10 min | Phase 2 누적 메모리 |
| `state/researcher_topics.json` | `topic_switcher.py` | per cycle | priority queue (현재 18 topics) |
| `state/ledger.db` | `realtime_listener.py` + `harness_runner.py` | continuous | Slack 대화 audit |
| `state/nas_optout.json` | `realtime_listener.py` | per researcher reply | (P1)~(P5) 정책 |
| `state/memory_evolution_log.jsonl` | `memory_evolution.py` | per delta | append-only audit (~750 KB) |
| `state/memev_processed_msgs.json` | `memory_evolution.py` | per inbound | dedup set (≤2000 msg ids) |
| `state/needs_operator_review.jsonl` | `harness_runner.py` | per cycle | stale-researcher 큐 |
| `state/autofire_log.jsonl` | (현재 비활성) | (n/a) | autofire 재활성 시 audit |
| `state/meeting_index.json` | `meeting_indexer.py` | daily 04:00 | GRM/MM 인덱스 |
| `state/researcher_topics.json` 의 `nas_paths` | `topic_switcher.py` | per topic seed | 후속 NAS broad scan 후보 |

## 6.5 Operator-Opus 의 역할 (현재 단계의 핵심)

### 6.5.1 분담

- **next_question 작성** (substantive Q): operator-Opus 만 담당.
- **delta extraction** (confirmed/inferred/unknown 갱신): Qwen 2.5 14b (local
  Ollama) 만 담당.
- **embedding** (bge-m3 for pgvector): Qwen 계 모델만 담당.
- **consolidation** (weekly 30/90 일 강등): Qwen 2.5 14b (cron Sun 06:00).

### 6.5.2 자동 발사 (autofire) 의 현황

`agentic_responder.py` 는 `realtime_listener.py:128` 에서 **DISABLED** 상태.
`memev_autofire` 는 `memory_evolution.py:main()` 에서 **DISABLED**, 로그에
"autofire: route disabled — operator-Opus is the substantive Q author" 가
기록된다.

### 6.5.3 이유 (2026-05-12 16:40 routing correction)

Qwen 이 작성한 next_question 이 generic (일반적) 이어서 JOP 가 16:37 "이미
답변했음" 으로 회신하여 신뢰가 손상되었다. operator 가 substantive Q 작성을
회수하고 Qwen 의 역할을 보조 (consolidation / delta / embedding) 로 제한한
조치다. 재활성 (re-enable) 은 operator 의 명시적 재승인 필요.

### 6.5.4 standing approval 의 compensating control

`feedback_first_run_external.md` 2026-05-12 amendment 에 따르면, autofire 재
활성 시 두 compensating control 이 *반드시* 작동해야 한다.

1. 일 1 회 `session_meta_review.py` (22:00 cron) 가 inbound/outbound/memev/
   autofire 요약을 `docs/session_meta_reviews/YYYY-MM-DD.md` 에 기록.
2. pgvector memory DB 와 exploration plan 을 주기적으로 사용자에게 시현 후
   조정 권한 수령.

위 둘 중 하나라도 깨지면 standing approval 은 *자동 lapse* 하고 autofire 는
operator-review gate 로 복귀한다.

## 7. Leak 방지 체크리스트

다음 세션이 본 회로의 일부 정보를 잃지 않으려면 아래가 모두 항상-로드 (always
-loaded) 상태여야 한다.

- [ ] 메모리 룰 (`MEMORY.md` index) — 18 entries always-loaded
- [ ] `HANDOFF.md` 가 §0–§11 single-page 유지 (현재 275 lines)
- [ ] `docs/automation-topology.md` 가 cron matrix 유지
- [ ] `docs/uncertainty-pipeline-2026-W19.md` 가 8-stage 정의 유지
- [ ] `docs/module-catalog.md` 가 hook/skill/module catalog
- [ ] `docs/evolution-loop.md` (본 문서) 가 철학 + 단계 명세
- [ ] `docs/long-term-plan-2026-W19+.md` 가 per-researcher 아크 유지
- [ ] `state/nas_inventory.json` 이 NAS ground truth (Phase 1)
- [ ] `state/member_uncertainty.json` 이 Phase 2 누적 메모리
- [ ] `~/.claude/projects/.../memory/` 18 entries

각 항목 누락 시 회로가 잃는 것: 메모리 룰 → tone/policy 위반. HANDOFF →
세션 부팅 비용 폭증. nas_inventory → Slack 한 줄 hallucination 재현.
member_uncertainty → 30/90 일 demotion 무력화.

## 8. 다음 한 주의 운영 cadence

| 시각 (KST) | 작업 | 비고 |
|---|---|---|
| daily on-demand | `nas_sweep.py` | 변경분 incremental 은 미설치 (TODO) |
| daily 04:00 | `meeting_indexer.py` | GRM/MM 스캔 |
| daily 04:30 | `pgvector_grm_sync.py` | bge-m3 embed |
| every 10 min | `memory_evolution.py` | delta only, no autofire |
| every 30 min | `harness_runner.py` (09–21 Mon-Sat) | ack drain + operator queue 만 (auto-reminder beyond 72h 없음) |
| weekly Sun 06:00 | `memory_consolidator.py` | 30/90 일 demotion |
| weekly Sun 09:30 | `weekly_corpus_sync.py --mode=digest` | feedback digest |
| daily 22:00 | `session_meta_review.py` | audit doc 자동 생성 |
| on-demand | operator-Opus session | uncertainty surfacing + NQ 작성 + Slack 발사 (사용자 OK 후) |

## 9. 인용 (cross-reference)

- 8-stage 분해: `docs/uncertainty-pipeline-2026-W19.md`
- module-level 정의: `docs/module-catalog.md`
- 라이브 수치 (live counts): `docs/snapshot.md`
- per-researcher 아크: `docs/long-term-plan-2026-W19+.md`
- 두 레포 handshake: `docs/automation-topology.md`, `docs/HARNESS_BRIDGE.md`
- single-page entrypoint: `docs/HANDOFF.md`

— 최초 작성 2026-05-12 (operator-Opus session)
