# DM 세션 resume plan (2026-05-12 19:00 KST)

> Operator directive (2026-05-12 18:50 KST): "지금까지의 개별적 DM 세션을 이어가면서 정보를 탐사하고 수집하는 자동화 재개." 단 — 발사 (`slack_outbound.post`) 는 [`feedback_first_run_external.md`](../../.claude/memory/) 정책에 따라 사용자 확인 후. 본 문서는 operator-Opus 가 작성한 *draft NQ* 목록과 발사 순서다.

## 0. 발사 정책 요약

- 본 세션 (operator-Opus) 이 NQ 의 *substantive 작성자*. Qwen 은 delta extraction / consolidation 만.
- `agentic_responder.py` + `memev_autofire` 는 **DISABLED** (routing correction 2026-05-12 16:40 KST). 자동 발사 없음.
- 매 draft 는 발사 전 사용자 한 줄 OK 필요. OK 후 `python3 code/_send_bot.py <channel_id> "<text>"` 또는 직접 호출.
- 톤 — [`feedback_paper_rec_tone.md`](../../.claude/memory/): 학술 한국어, 이모지/superlative 금지, 서명 `— Claude`.

## 1. Per-researcher 현재 상태 + draft NQ

> 모든 상태는 2026-05-12 19:00 KST 기준 `state/member_uncertainty.json` + `state/nas_inventory.json` + `ledger.db` 에서 직접 조회. silence_h 는 `received_at` 과 KST 현재시각 차이.

### 1.1 JOP (박준오) — active, 0h silence

- **NAS 프로젝트 (자체)**: GranNMDS, GranRDT, RingRepSca, Time, Time2Dist, Uncertainty, tDCS (7개)
- **Unknown 항목**: 없음 (cohort 중 최저 우연성)
- **마지막 inbound** (17:52 KST): "해결됐나?" — JOP 가 17:18 의 framework-anchored Q 에 응답하면서 *질문으로 되묻기*. operator 측 처리 상태를 확인하는 톤.
- **마지막 outbound** (17:18 KST): `operator_opus_framework_anchored_Q` — pgvector retrieval 결과 + GRM/MM 자료 활용 방안 질의.
- **다음 단계**: JOP 의 "해결됐나?" 는 *작은 follow-up*. 새 NQ 보다는 *상태 확인 응답* 이 적절.

**Draft (확인용 응답, 2 줄)**:
> 박준오 연구원께,
>
> 17:18 질의 정리해 두었습니다. (1) 사전 확률 복원: GRM 자료 중 `JOP/Time2Dist/Code/runExp1.m` (line N 부근) 의 `prior_param_init` 가 그 입력. (2) 인코딩 모델: MM `MM_260413.pptx` 의 figure 3 의 표기 방식으로 진행. 추가로 확인할 부분 있으시면 말씀해 주십시오.
>
> — Claude

(주의: 위 line N + figure 3 reference 는 *placeholder*. operator-Opus 가 NAS sweep inventory + pgvector retrieval 로 실제 위치 채워야 함.)

### 1.2 BHL (이보현) — active, 0h silence

- **NAS 프로젝트**: 자체 없음. mentor `SK` 의 Screen_Retinotopy + WMRepresentation_24_updated 학습 중.
- **Unknown 항목**: ['SK 연구원 논문 추천의 구체적 근거 및 출처', '기존 2순위 논문의 구체적 식별 정보']
- **마지막 inbound** (17:23 KST): "B로 하고, 기존 2순위에 있던 논문을 다시 추천해줘"
- **마지막 outbound** (17:18 KST): `operator_opus_framework_anchored_Q` (fMRI 가설 정정 + 후속).
- **다음 단계**: B 선택 + 2순위 논문 재추천 요청 → operator 가 *재추천 논문 1개* + *B 방식의 첫 구체 요건 1개* 발사. paper rec date 정책 ([`feedback_paper_rec_date_rules.md`](../../.claude/memory/)): 1y journal / 3m preprint.

**Draft (2 part, 사용자 OK 필요)**:
> 이보현 연구원께,
>
> (1) 2순위 재추천: <paper_title> (<author>, <year>, <venue>) — DOI <doi>. Crossref 검증 완료.
>
> (2) B 방식 첫 요건: ROI 정의 — V1/V2/V3v 중 어떤 layer 의 어떤 retinotopic atlas 를 기준으로 잡으실 계획인가요? SK 의 `WMRepresentation_24_updated/Code/atlas_define.m` 의 정의를 따르실지, 본인 정의를 만들지 알려주십시오.
>
> — Claude

(주의: paper title/doi 는 operator-Opus 가 Crossref API 또는 webfetch 로 실시간 확보 후 발사.)

### 1.3 SMJ (정새미) — active, 0h silence

- **NAS 프로젝트**: Concentricity (1개; LCI/PCI/ACI index 가 핵심)
- **Unknown 항목**: ['코드 언어', 'fMRI 사용 여부']
- **마지막 inbound** (17:17 KST): "R" — 단음절. 직전 outbound (paper_rec_author_correction, Crossref audit 결과) 에 대한 *수신 확인* 으로 해석.
- **마지막 outbound** (17:16 KST): paper rec 저자 정정 안내.
- **다음 단계**: 이전에 발사된 NQ ("Najemnik/Geisler vs Eckstein 중 우선 프레임워크") 에 대해 *후속 ack* + Concentricity 의 LCI 분석 방향 (pivoting 이슈) 의 다음 단계 질의.

**Draft (1 part)**:
> 정새미 연구원께,
>
> 17:16 정정 수신 확인. 15:50 회신의 "lci 만 사용, 나머지는 미사용" 정보를 기억에 반영했습니다. behavioral 쪽 pivot 의 다음 한 걸음 — local concentricity 의 정의를 어떤 spatial scale (degrees of visual angle) 로 잡으실 계획인지 알려주십시오. NAS `SMJ/Concentricity/` 의 `LCI_compute.py` (또는 .m) 에서 현재 사용 중인 값과 다를 가능성이 있어 사전에 확인합니다.
>
> — Claude

### 1.4 BYL (이보연) — slow active, 20h silence

- **NAS 프로젝트**: biasVar (1개; 168 code files + 26 other)
- **Unknown 항목**: ['방법론 (psychophysics? fMRI? modeling?)', '현재 상태 (데이터 수집/분석/논문)', '코드 언어', 'NAS 아카이빙 진행 여부']
- **마지막 inbound** (5/11 21:07): "후보2 로 교체할게" — paper rec 교체 요청.
- **마지막 outbound** (17:25 KST): `uncertainty_state_reminder_with_audit` — 오늘 3 건 outbound 모두 미답신.
- **다음 단계**: 4 unknown 항목 중 *방법론* 부터. NAS `BYL/biasVar/` 의 168 code files 가 강한 단서 — operator-Opus 가 file extension 분포로 1차 추정 후 본인 확인 받기.

**Draft (1 part — operator-Opus 가 NAS inventory 확인 후 발사)**:
> 이보연 연구원께,
>
> NAS `BYL/biasVar/` 에 .m 파일 다수 / .py 파일 N 개 가 있습니다. 본인 연구의 *코드 언어* (MATLAB / Python / 혼용) 와 *방법론 분류* (psychophysics 행동 / fMRI / RNN 모델링 / 혼합) 알려주십시오. 두 정보가 있어야 다음 paper rec 의 venue 와 method 가 맞춰집니다.
>
> — Claude

(주의: ".m N 개 / .py M 개" 는 operator-Opus 가 nas_inventory.json 의 `BYL.projects.biasVar.kinds` 에서 정확 카운트 후 채워 발사.)

### 1.5 MSY (여민수) — stale, 96h+ silence

- **NAS 프로젝트**: Code, Context, Data, Results (atypical — project name 이 sub-dir level)
- **Unknown 항목**: ['코드 언어', '데이터 형식/규모', '자극 차원', 'NAS 아카이빙 진행 여부']
- **마지막 inbound** (5/8 18:34): "이 논문에 관한 질문을 해도 되나?"
- **마지막 outbound** (17:25 KST 오늘): `uncertainty_state_reminder_with_audit`
- **다음 단계**: 96h+ silence 는 자동 reminder *금지* 범위 (≥72h → operator queue per [`meta-review-2026-05-11.md`](meta-review-2026-05-11.md) §A2). operator 가 *curated* draft 로 처음부터 다시 접근. NAS sample (Context/ 의 53 slides) 이 큰 단서.

**Draft (curated, soft restart tone)**:
> 여민수 연구원께,
>
> 5/8 18:34 의 "이 논문에 관한 질문을 해도 되나?" 에 늦게 답신드립니다 — 가능합니다. 어떤 논문인지 + 어떤 부분이 본인의 cat_mag_main 연구와 충돌/연결되는지 알려주시면, 다음 GRM 발표 (`MSY/Context/` 의 슬라이드 시리즈와 연결되도록) 의 framing 에 반영하겠습니다.
>
> — Claude

### 1.6 JYK (김정예) — stale, 99h+ silence

- **NAS 프로젝트**: RNN (200 files, 199 "other" — likely .pth / .npz)
- **Unknown 항목**: 5개 (프로젝트 약칭 / 다른 방법론 / 시뮬레이션 단계 / 데이터 type / Gu et al. 2025 관계)
- **마지막 inbound** (5/8 14:42): "distinction은 모르겠음.. 관련 지식 잘 모르고 아직 해본적 없음"
- **마지막 outbound** (17:23 KST 오늘): `paper_rec_doi_correction` (Crossref + bioRxiv prefix)
- **다음 단계**: 99h silence + *지식 부족 명시*. operator 가 *교육적인 톤* 으로 reset — 모른다는 답 자체를 confirmed 로 받고, 다음 한 걸음을 구체화.

**Draft (curated, supportive tone)**:
> 김정예 연구원께,
>
> 5/8 14:42 의 "distinction 모르겠음" 회신, 솔직한 진단 감사합니다. 이를 출발점으로 — 본인의 RNN 시뮬레이션이 *어떤 입력* 을 받고 *어떤 출력* 을 내는지, 한 문장으로 정리해 주실 수 있나요? 출력 형식 (예: "cardinal direction 4 개 중 하나의 softmax") 만 있어도 다음 cycle 의 paper rec 와 framework discussion 의 그라운드가 됩니다.
>
> — Claude

### 1.7 SYJ (조수영) — **P4 ACTIVE**, 발사 금지

- **NAS 프로젝트**: 자체 없음. mentor `JSL` 의 SerialDep_Spatial + Passive_navigation 학습 중 (의도된 학습 경로).
- **Unknown 항목**: ['specific_subfield_focus']
- **마지막 inbound** (17:32 KST): **"(P4)"** — SYJ 가 명시적으로 P4 opt-out 신호.
- **`state/nas_optout.json[SYJ]`**: `level: P4, status: active, declared_at: 2026-05-12T17:32:55+09:00`
- **다음 단계**: **자동 NQ 발사 금지**. P4 는 NAS 탐사 전체 차단 + 추후 메모리 persist 도 차단. 다음 외부 action 은 SYJ 가 P4 해제 신호 (P1→P0 또는 explicit 재허용) 를 보낸 뒤에만.

**No draft.** SYJ 의 추후 발신 (P4 lift / 다른 답신) 까지 channel quiet 유지.

## 2. 발사 순서 권장

operator-Opus 가 이 세션에서 실 발사할 때의 권장 순서 (silence 짧은 active 우선, stale 은 manual curated 로 마지막):

1. **JOP** — 17:52 "해결됐나?" 즉시 응답 (2-line ack). 가장 짧음, hallucination 위험 낮음.
2. **BHL** — 17:23 "B 선택 + 2순위 재추천" 에 대한 응답 (paper rec + 첫 요건 1개). Crossref API 호출 필요.
3. **SMJ** — 17:17 "R" 정정 수신 확인 + LCI scale 후속 질의.
4. **BYL** — 20h silence. NAS inventory 의 정확 카운트 채워서 *방법론 + 코드 언어* 질의 1개.
5. **MSY** — 96h+ stale. curated soft-restart. "그 논문 무엇인지" 부터.
6. **JYK** — 99h+ stale. curated 교육적 톤. "RNN 입출력 1 문장" 부터.
7. **SYJ** — **발사 금지**. P4 lift 까지 대기.

## 3. 발사 절차 (operator-Opus 의 step-by-step)

각 draft 당:

```python
# 1. 사용자 OK 확인 (CLI 또는 메시지)
# 2. operator-Opus 가 NAS inventory 에서 실제 facts 채움 (placeholder 제거)
# 3. 톤 lint pre-check:
import slack_outbound
violations = slack_outbound.lint_message_text(text, recipient_role="researcher")
assert not violations, violations
# 4. ledger pre-check (dedup):
import sqlite3
db = sqlite3.connect("/Users/csnl/csnl_on_ai/harness/state/ledger.db")
# ... check recent outbound to same researcher, last 30 min
# 5. 발사:
import _send_bot
_send_bot.send(channel_id, text)  # 또는 slack_outbound.post(...)
# 6. ledger 사후 audit:
import ledger_audit
ledger_audit.verify_recent(researcher_init)
```

## 4. 발사 후 follow-through

- 발사 직후 `realtime_listener` 가 30 분 안에 답신을 잡으면 자동으로 memev cron 다음 사이클이 delta 처리.
- 답신 없으면 — `harness_runner` 의 72h reminder 차단 정책에 따라 manual operator review.
- operator 는 매 발사를 `docs/session_meta_reviews/2026-05-12.md` (cron 22:00 갱신) 의 audit log 에서 확인 가능.

## 5. 운영 노트

- 본 plan 의 draft 들은 *operator-Opus 가 NAS inventory 의 실제 facts 를 채운 뒤* 완성된다. 본 문서의 ".m N 개" / "MM_260413.pptx figure 3" 등은 placeholder. 발사 직전 `state/nas_inventory.json` 또는 pgvector retrieval 로 실제 값 채우는 것이 필수.
- 본 plan 자체는 발사 명령이 아니다. 사용자가 각 draft 에 명시적 OK 후에만 채널에 들어간다.
- SYJ 의 P4 는 다음 P4-lift signal 까지 *모든* NAS 탐사 + 메모리 persist 를 차단한다. mentor pointer (JSL) 만 inventory 에 남아 있어도 SYJ-context 에서는 사용 금지.
