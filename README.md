# csnl-ops

CSNL 연구실의 운영을 자동화하기 위한 저장소. 7명의 후배 연구원에게 Slack DM 으로 질문을 보내고, 답을 받고, 메모리에 누적하고, 다음 질문을 만든다. 캘린더와 발표자료 누락 chase 메일도 같이 처리한다.

> **이 README 가 다루는 것**: 시스템이 어떻게 생겼고 어떻게 작동하는지를 한 화면 안에 보여주는 것.
>
> **이 README 가 다루지 않는 것**: 라이브 수치 (다른 곳에 — [docs/snapshot.md](docs/snapshot.md)), 모듈별 docstring ([docs/module-catalog.md](docs/module-catalog.md)), 연구원별 진척 ([docs/researcher_digests.md](docs/researcher_digests.md)), 전체 cron 표 ([docs/automation-topology.md](docs/automation-topology.md)).

---

## 1. 무엇을 만들고 있는가

연구실 운영은 두 가지 흐름이 섞여 있다.

1. **구조화된 운영 데이터**. 캘린더에 잡힌 실험 슬롯, 매주 수요일 발표, 개인 미팅, NRF 과제 같은 것. *언제, 누가, 어디서* 가 명확한 사실들.
2. **연구원의 머릿속**. 어떤 프로젝트를 하는지, 어떤 가설을 시험 중인지, 어떤 논문을 읽었는지, 무엇이 막혔는지. 이건 운영자가 모르면 사라지는 정보다.

기존에는 운영자(JOP)가 사람을 일일이 따라다니며 수집했다. 이 시스템의 목적은 그걸 *자동화하되 사람의 검수를 유지*하는 것이다.

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

자세한 경계와 cron 일정은 [docs/automation-topology.md](docs/automation-topology.md) 에 있다. 편집용 도식 source 는 [docs/diagrams/architecture.drawio.xml](docs/diagrams/architecture.drawio.xml).

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

편집용 도식 source: [docs/diagrams/closed-loop.drawio.xml](docs/diagrams/closed-loop.drawio.xml). 8 단계로 더 자세히 쪼갠 설계 문서는 [docs/uncertainty-pipeline-2026-W19.md](docs/uncertainty-pipeline-2026-W19.md).

**왜 "처음에만 사람 검수" 인가**: 새 외부 호출 (DM, 메일, 캘린더 write) 은 한번이라도 잘못 발사되면 연구원에게 폐가 된다. 첫 회는 운영자가 draft 를 본 뒤 OK 해야 발사된다. 두 번째부터는 메모리 누적 + 검증 가드 (parrot guard, 1시간 throttle, 톤 검사) 만 통과하면 자동 발사된다.

---

## 4. 어디까지 왔나

라이브 수치는 [docs/snapshot.md](docs/snapshot.md) 에 있다. 이 README 본문은 일부러 숫자를 안 적었다 — memev cron 이 10분마다 돌아서 즉시 옛 값이 되기 때문이다.

대신 *구조*만 정리하면:

- 활성 연구원: 7명 (JOP, BYL, MSY, SMJ, JYK, BHL, SYJ).
- 운영 캠페인: `paperblitz_2026_05_06` (Paper Blitz 인터뷰 사이클).
- 운영 cron (csnl-ops 측): GitHub Actions 5 workflow + Mac Studio launchd 3 plist.
- 인터뷰 cron (harness 측): user crontab 9 줄 + launchd 3 plist.
- Supabase 스키마: `csnl_ops.*` 의 12 운영 테이블 + 2 ingest 테이블 (`behavioral_experiments`, `experiment_ingest_anomalies`).
- 로컬 Postgres: `csnl_v3` (pgvector — GRM/MM 슬라이드 임베딩 저장).
- 발표자료 임베딩: `bge-m3` 1024-dim, 매일 04:30 KST `pgvector_grm_sync.py` 갱신.

연구원별 1단락 요약: [docs/researcher_digests.md](docs/researcher_digests.md). 매주 일요일 06:00 KST 의 `memory_consolidator.py` 가 갱신한다.

---

## 5. 다음 6 주

세 개의 acceptance gate 를 통과하면 끝.

- **M1 (5월 말 목표) — 자동 사이클이 사람 손 없이 돈다.** 운영자 큐가 비고, 답신 → 메모리 갱신 → 다음 질문 흐름이 끊김 없이 작동.
- **M2 (6월 초 목표) — 7명 cohort 의 `unknown` 항목이 모두 0 이 된다.** NAS 폴더가 없는 두 명 (BHL, SYJ) 의 onboarding 완료 포함.
- **M3 (6월 말 목표) — 인턴이 자연어로 DB 에 물어 답을 받는다.** Recall@5 ≥ 0.80. 평가 방법은 [docs/uncertainty-pipeline-2026-W19.md](docs/uncertainty-pipeline-2026-W19.md) 에 정의.

자세한 주별 task 분해는 [docs/long-term-plan-2026-W19+.md](docs/long-term-plan-2026-W19+.md).

---

## 더 깊이 알고 싶다면

- 전체 시스템 한 페이지: [docs/HANDOFF.md](docs/HANDOFF.md)
- 두 부분이 만나는 contract: [docs/HARNESS_BRIDGE.md](docs/HARNESS_BRIDGE.md)
- 모듈별 docstring 카탈로그: [docs/module-catalog.md](docs/module-catalog.md)
- 폐회로 8 단계 분해: [docs/uncertainty-pipeline-2026-W19.md](docs/uncertainty-pipeline-2026-W19.md)
- 운영 규칙 메모리: `~/.claude/projects/-Users-csnl-Documents-claude-csnl-ops/memory/MEMORY.md`
- 마이그레이션 베이스라인 (2026-05-01 원본): [docs/archive/README-2026-05-01-migration-baseline.md](docs/archive/README-2026-05-01-migration-baseline.md)

---

## 운영 규칙 quick reference

| 규칙 | 무엇 | 어디 |
|---|---|---|
| 두 Mac 동시 가동 금지 | Slack DM 이중 발사 방지 | memory: `feedback_dual_fire_rule.md` |
| 첫 외부 호출은 사람 검수 | 첫 메일/DM/캘린더 write 는 OK 받고 발사 | memory: `feedback_first_run_external.md` |
| (P1)~(P5) opt-out | 연구원이 NAS 탐사 거부 신호를 보낼 수 있는 5단계 | [docs/uncertainty-pipeline-2026-W19.md §3](docs/uncertainty-pipeline-2026-W19.md) |
| LLM 키 정책 | Anthropic API 키는 코드에 두지 않음. cron 은 로컬 Ollama 만. | memory: `feedback_llm_key_policy.md` |
| 연구원 DM 톤 | 학술 한국어, 이모지·과장 표현 금지, 서명 `— Claude` | memory: `feedback_paper_rec_tone.md` |
| Paper Blitz / CWLL 안내 | csnl-ops 가 보내지 *않는다*. SMJ 가 수동으로. | memory: `project_smj_pb_cwll.md` |
| Supabase config push | shared 인스턴스에서 절대 금지 | memory: `feedback_supabase_config_push.md` |

---

## License

GitHub 저장소: `CSNL-vnilab/csnl-ops`. PI: 이상훈 (서울대 BCS). 운영자: 박준오 (JOP). 자동화: Claude Code + Codex CLI + 로컬 Qwen.
