# csnl-ops

CSNL 연구실의 운영 지식을 자동화하기 위한 저장소.

**Phase 1 (현재)**: 각 연구원이 *자기 PC 의 개별 Claude 세션* 에서 `researcher-archiver-plugin` 으로 본인 프로젝트를 인터뷰·자가 아카이빙하고, 그 결과를 공유 Supabase `csnl_research.projects` 에 동기화한다. 목표는 새 모델이 *자연어 질의* 만으로 연구원 × 프로젝트의 목적·장비·변수·타임라인을 회수할 수 있는 hierarchical memory DB. 캘린더 동기화와 발표자료 chase 메일(csnl-ops Vercel 측)은 이를 보조한다.

## Phase 1 — 플러그인 기반 자가 아카이빙 → 자연어 회수 가능한 메모리 DB

> 2026-05 현재 운영 방식. 이전의 Slack 하니스 / 3-tier orchestrator 방식
> (이 README 의 §1–§5 일부 설명)은 **Phase-1 에 한해 이 플러그인 방식으로
> 대체**되었다. csnl-ops Vercel 앱(캘린더·chase 메일)은 그대로 유지된다.

**최종 목표**: 새 모델 세션이 *자연어 질의* 만으로 7 연구원 × N 프로젝트의
목적(purpose)·장비(apparatus)·동시 modality·조작변수·타임라인·선행연구를
즉시 회수하는 hierarchical memory DB.

**구성**

- 각 연구원이 자기 PC 에서 **개별 Claude Code 세션 + `researcher-archiver-plugin`**
  (슬래시 명령 `/csnl-archive:bootstrap | continue | sync-db | status | doctor |
  handoff`)을 띄워 *본인* NAS 폴더를 map-first 로 훑고, 대화로 빈칸을 채운다.
  Slack·중앙 orchestrator 없음 — 각 세션이 독립.
- 산출 row 는 `researcher-archiver-plugin/scripts/sync_to_supabase.py` 가 공유
  Supabase **`csnl_research.projects`** (PK `(init, project_slug)`, plugin
  v1.1.4+ source-of-truth)로 push. 세션마다 `SET app.my_init` (RLS), 낙관적
  CAS 는 `row_version` (cross-INIT 가드 + 2-phase commit).
- 연구원 레지스트리 단일 소스: `researcher-archiver-plugin/config/researchers.yaml`
  (활성 7 + senior anchor SK/JSL, cap 20). 행동 규칙 `rules/00–07`
  (lab-context / tone / grounded / map-first / past-focus / memory-cap /
  philosophy / scientific-skepticism).

**스키마** — 프로젝트당 풍부한 JSONB 계층: `purpose · background · apparatus ·
modalities · experiment_design · manipulation_variables · code_artifacts ·
data_artifacts · analysis_pipeline · results · interpretation ·
connected_graph · timeline · external_refs · meta`.

**감사·로그 모델** — 별도 로그 테이블 없음. 행 자체가 추적을 보유한다:
`row_version`=누적 sync 횟수, `last_updated_at`=최종 sync,
`meta_jsonb.contradictions[] / fields_low_confidence[] / literature_drift[]`
= `rules/07` 회의주의 감사 (round_a 와 round_b 가 충돌하면 덮어쓰지 않고
구조화 후 reconcile). 상세: 메모리 `reference_plugin_archive_db.md`.

**현재 상태 (2026-05-18 스냅샷; 라이브 수치는 DB 조회)**

- `csnl_research.projects` 14 rows / 7 init.
- **SYJ + BHL 은 하나의 단위** — JSL 후속 연구를 공동 수행하는 주니어 둘.
  per-researcher 집계 시 병합.
- `csnl_research.project_embeddings` (pgvector `bge-m3` 1024-dim) = 향후 NL
  검색 레이어, 현재 0 rows (미생성 — 현 규모에선 ~33K-token 코퍼스 직접
  주입으로 충분).

**자연어 회수 — 검증 완료 (2026-05-18 모델-티어 평가)**

이 DB 를 컨텍스트로 받은 모델은 단일 조회 · 랩 전체 필터/집계 · 프로젝트 간
그래프 · 다중행 종합 · 감사 채굴 · 부재/함정 회피의 6 유형을 모두 답한다.
Opus / Sonnet / Haiku 비교에서 품질은 *읽는 모델* 이 좌우했다:

- 기본 retrieval = **Sonnet** (Opus 동급 정확도, 비용↓)
- 합성 / 감사 리포트 = **Opus**
- **Haiku 는 단건 lookup 한정** — 정밀 scoping(Q1)·감사 채굴(Q5)에서 핵심 누락

전체 입출력 대조표 · 정답 검증 · 근거:
[docs/retrieval_tests/2026-05-18-model-tier-eval.md](docs/retrieval_tests/2026-05-18-model-tier-eval.md)

**실제로 답해지는 질의 예시**

- "시선추적/동공 데이터를 쓰는 프로젝트와 그 modality 역할은?"
- "D2E 패러다임을 공유하는 프로젝트와 연구자 관계는?"
- "분석 전 데이터 위생이 필요한 프로젝트와 사유는?" (예: `BYL/biasvar` 120Hz 타이밍 caveat)
- "JOP 의 granularity 효과를 분석하는 계산 모델 접근들은?"
- "working memory 표상을 다루는 프로젝트들의 공통 가설과 차이는?"

---

> **이 시스템이 매일 하는 일** — 누구나 5초 안에 이해할 수 있도록:
> 1. **새벽 (04~05 KST)**: NAS 폴더를 훑어 `nas_inventory.json` 갱신 + 발표자료를 임베딩해서 검색 가능한 형태로 저장.
> 2. **낮 (09~21 KST 평일)**: Slack 으로 7 명에게 NAS 가 답할 수 없는 1 줄 질문을 던지고, 답신을 받아 메모리에 누적.
> 3. **3 분마다**: 답신이 도착하면 로컬 Qwen 이 `confirmed/inferred/unknown` 을 갱신. NAS facts 는 자동 *재제안 금지* (Phase 1 ground truth 보존).
> 4. **매주 일요일**: 30 일 / 90 일 미갱신 항목을 자동 강등 (영구 사실로 굳지 않게).

> **시작 전 한번 읽기**: [docs/HANDOFF.md](docs/HANDOFF.md) (single-page 핸드오프), [docs/evolution-loop.md](docs/evolution-loop.md) (philosophy), [docs/system-index.md](docs/system-index.md) (전체 카탈로그).
>

---

## 1. 무엇을 만들고 있는가

연구실 운영 지식의 source 는 둘로 나뉜다. 우선순위가 중요하다.

1. **NAS 폴더 (먼저 적재할 것)**. `/Volumes/CSNL_new-2/Memory/<INIT>/<Project>/` 아래에 각 연구원이 저장해 둔 코드, 데이터, 노트, 슬라이드. 이건 *움직이지 않는 ground truth* 다. `harness/code/nas_sweep.py` 가 9 init (5 active 자체 폴더 + 2 mentor pointer + 2 senior) 의 18 projects 를 전수 walk 해서 `state/nas_inventory.json` 에 인벤토리한다.
2. **연구원의 머릿속 (NAS 가 못 보는 것)**. 어떤 가설을 시험 중인지, 무엇이 막혔는지, 어떤 논문을 새로 읽었는지. Slack DM 인터뷰로 *NAS 가 채우지 못한 빈칸* 만 채운다. inbound 답신은 `state/member_uncertainty.json` 의 `confirmed/inferred/unknown` 에 누적된다.

기존에는 운영자(JOP)가 사람을 일일이 따라다니며 수집했다. 이 시스템의 목적은 그걸 *자동화하되 사람의 검수를 유지*하는 것이다. NAS 우선 적재 → Slack 인터뷰가 보강 → cron 이 incremental 갱신 — 이 순서를 지키면 short Slack reply 한 줄로 잘못된 confirmed fact 가 자리잡는 hallucination 을 피할 수 있다.

자세한 philosophy 와 6-단계 loop 명세는 [docs/evolution-loop.md](docs/evolution-loop.md) 참고.

---

## 2. 두 부분으로 나뉘어 있다

```
                                                     +---------+
                                                     | Ollama  |
                                                     | (Qwen,  |
                                                     | bge-m3) |
                                                     +----+----+
                                                          ^  local LLM
                                                          |
  +----------+    +----------+    +-------------+    +----+-----+
  | Calendar |--->| csnl-ops |--->| inbox.json  |--->| harness  |
  | (Slab +  |    | (Vercel) |    | (NAS, daily |    | (Mac     |
  | CSNL)    |    |          |    |  03:00 KST) |    | Studio)  |
  +----------+    +-----+----+    +-------------+    +-----+----+
                        |                                  |
                        | chase 메일                         | Slack DM (양방향)
                        v                                  v
                     +-----------------------------------------+
                     |              7 연구원                       |
                     |   JOP  BYL  MSY  SMJ  JYK  BHL  SYJ        |
                     +-----------------------------------------+
```

- **csnl-ops** (이 저장소, Vercel + Next.js 16) — Google Calendar 에서 일정 끌어오고, Supabase 에 정리하고, 발표자료가 안 올라오면 chase 메일을 보낸다. NAS 는 *못 본다* (Vercel 마운트가 없어서).
- **harness** (`/Users/csnl/csnl_on_ai/harness/`, 저장소 외부 — Mac Studio) — Slack 봇을 띄우고, 답신을 받고, 로컬 Ollama 로 메모리를 갱신한다.
- **공유 파일** — NAS 의 `csnl_ops_inbox.json` 하나. csnl-ops 가 매일 03:00 KST 에 쓰고, harness 가 읽는다. 단방향.


---

## 3. 한 사이클은 네 단계

```
                       +----------+
                       | Operator |   첫 회만 사람이 draft 검수
                       |  (사람)   |
                       +-----+----+
                             | approve
                             v
                   +--------------------+
                   |  A. 질문 보내기      |  ← cron 또는 답신 직후
                   |  (Slack DM)        |
                   +---------+----------+
                             |
                             v
                   +--------------------+        +--------------+
                   |  B. 답 받기          |------> | opt-out 정책  |  P1~P5 응답이면
                   |  (Slack 수신)        |        | 갱신          |  탐사 거부 신호로 처리
                   +---------+----------+        +--------------+
                             |
                             v
                   +--------------------+
                   |  C. 메모리 갱신      |  ← Qwen 이 답을 읽고
                   |  (사실/추정/모름)     |     confirmed/inferred/unknown 갱신
                   +---------+----------+
                             |
                             v
                   +--------------------+
                   |  D. 다음 질문 정하기 |  ← 새 메모리 + topic queue
                   |                    |     로 next_question 산출
                   +---------+----------+
                             |
                             +------ 다시 A 로 돌아간다 ------+
```

각 단계가 누구의 코드인지:

| 단계 | 코드 위치 (harness 안) | 트리거 |
|---|---|---|
| A. 질문 보내기 | `code/slack_outbound.py` + `code/_send_bot.py` | 첫 회는 사람이 발송, 이후는 cron / 답신 직후 |
| B. 답 받기 | `code/realtime_listener.py` (Slack Socket Mode) | 상시 (launchd) |
| C. 메모리 갱신 | `code_v3/memory_evolution.py` (로컬 Qwen 호출) | 답신 도착 직후 + 10분마다 cron |
| D. 다음 질문 정하기 | `code/topic_switcher.py` + `memory_evolution.py` 의 next_question 산출 | C 직후 |


**왜 "처음에만 사람 검수" 인가**: 새 외부 호출 (DM, 메일, 캘린더 write) 은 한번이라도 잘못 발사되면 연구원에게 폐가 된다. 첫 회는 운영자가 draft 를 본 뒤 OK 해야 발사된다. 두 번째부터는 메모리 누적 + 검증 가드 (parrot guard, 1시간 throttle, 톤 검사) 만 통과하면 자동 발사된다.

---

## 4. 어디까지 왔나

라이브 수치는 [docs/snapshot.md](docs/snapshot.md) 에 있다. 이 README 본문은 일부러 숫자를 안 적었다 — memev cron 이 10분마다 돌아서 즉시 옛 값이 되기 때문이다.

대신 *구조*만 정리하면:

- 활성 연구원: 7명 (JOP, BYL, MSY, SMJ, JYK, BHL, SYJ).
- 운영 캠페인: `paperblitz_2026_05_06` (Paper Blitz 인터뷰 사이클).
- 운영 cron (csnl-ops 측): GitHub Actions 5 workflow + Mac Studio launchd 3 plist.
- 인터뷰 cron (harness 측): user crontab 10 줄 + launchd 3 plist.
- Supabase 스키마: `csnl_ops.*` 의 12 운영 테이블 + 2 ingest 테이블 (`behavioral_experiments`, `experiment_ingest_anomalies`).
- 로컬 Postgres: `csnl_v3` (pgvector — GRM/MM 슬라이드 임베딩 저장).
- 발표자료 임베딩: `bge-m3` 1024-dim, 매일 04:30 KST `pgvector_grm_sync.py` 갱신.


### 최근 변경 (2026-05-12 / 13)

- **memev 가 NAS 를 먼저 본다**. `code_v3/memory_evolution.py` 의 매 cycle 시작부에 `apply_nas_inventory()` 가 9 researchers × 18 projects + 멘토 링크 (BHL→SK, SYJ→JSL) 를 `member_uncertainty[init].nas_projects` 로 적재. 이후 `evolve_one()` 의 Qwen prompt 는 NAS facts 를 *재제안 금지* 영역으로 명시. Slack reply 가 한 줄 짧게 와도 NAS file 존재가 confirmed 의 1차 근거로 남는다.
- **NAS sweep 이 cron 화**. 매주 일요일 14:00 KST (`0 5 * * 0`) `nas_sweep.py` 가 자동 실행 → `state/nas_inventory.json` 갱신. 수동 trigger 금지 (NAS 대역폭 보호).
- **topic_switcher 가 NAS 인벤토리에서 자동 도출**. `seed_from_nas_inventory(init)` 가 멘토 분기 포함해 새 topics 추가. 기존 운영자-큐 토픽은 보존 (idempotent).
- **상시 인터뷰 사이클**. operator-Opus 가 substantive Q 작성, Qwen 은 delta/embedding 만. 발사 단위는 *1명 sequential* (batch 금지, `feedback_slack_pacing.md`).

---

## 5. 다음 6 주

세 개의 acceptance gate 를 통과하면 끝.

- **M1 (5월 말 목표) — 자동 사이클이 사람 손 없이 돈다.** 운영자 큐가 비고, 답신 → 메모리 갱신 → 다음 질문 흐름이 끊김 없이 작동.
- **M2 (6월 초 목표) — 7명 cohort 의 `unknown` 항목이 모두 0 이 된다.** NAS 폴더가 없는 두 명 (BHL, SYJ) 의 onboarding 완료 포함.


---

## 더 깊이 알고 싶다면

- 전체 시스템 한 페이지: [docs/HANDOFF.md](docs/HANDOFF.md)
- 운영 규칙 메모리: `~/.claude/projects/-Users-csnl-Documents-claude-csnl-ops/memory/MEMORY.md`

---

## 운영 규칙 quick reference

| 규칙 | 무엇 | 어디 |
|---|---|---|
| 두 Mac 동시 가동 금지 | Slack DM 이중 발사 방지 | memory: `feedback_dual_fire_rule.md` |
| 첫 외부 호출은 사람 검수 | 첫 메일/DM/캘린더 write 는 OK 받고 발사 | memory: `feedback_first_run_external.md` |
| LLM 키 정책 | Anthropic API 키는 코드에 두지 않음. cron 은 로컬 Ollama 만. | memory: `feedback_llm_key_policy.md` |
| 연구원 DM 톤 | 학술 한국어, 이모지·과장 표현 금지, 서명 `— Claude` | memory: `feedback_paper_rec_tone.md` |
| Paper Blitz / CWLL 안내 | csnl-ops 가 보내지 *않는다*. SMJ 가 수동으로. | memory: `project_smj_pb_cwll.md` |
| Supabase config push | shared 인스턴스에서 절대 금지 | memory: `feedback_supabase_config_push.md` |

---

## License

GitHub 저장소: `CSNL-vnilab/csnl-ops`. PI: 이상훈 (서울대 BCS). 운영자: 박준오 (JOP). 자동화: Claude Code + Codex CLI + 로컬 Qwen.
