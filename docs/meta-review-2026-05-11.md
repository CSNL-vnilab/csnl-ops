# Slack Bot ↔ Researcher Meta-Review (2026-05-11 KST)

> Session: 2026-05-11 22:00~22:35 KST, Mac Studio (`csnls-Mac-Studio.local`).
> Scope: 7-researcher Paper-Blitz interview cycle (`paperblitz_2026_05_06`).
> Goal: assess (i) memory-evolution quality, (ii) outbound-question delivery,
> (iii) conversation flow per researcher, and apply non-DM-risking fixes.

## 1. Engagement snapshot at 22:15 KST

| Init | Name | Last reply | Silence | memev cycle | next_question quality |
|---|---|---|---|---|---|
| JOP | 박준오 | 5/11 22:13 | 1 min | 22:00 ✅ | ⚠ parroting (LLM echoed researcher's own message back) |
| BYL | 이보연 | 5/11 21:07 | 1 h | 22:00 ✅ | ✅ saccadic-vs-orientation 구분 후속 |
| BHL | 이보현 | 5/10 19:46 | 26 h | 5/8 17:30 stale | ✅ fMRI ROI 회로 질문 |
| MSY | 문서영 | 5/8 18:34 | 81 h | 5/8 14:00 stale | ✅ 얼굴 속성 분석 질문 |
| SMJ | 정새미 | 5/8 14:24 | 80 h | 5/8 17:30 stale | ⚠ parroting (`optimal observer\n...`) |
| JYK | 김정예 | 5/8 14:42 | 96 h | 5/8 17:30 stale | ⚠ parroting (무지 표현을 되묻기) |
| SYJ | 조수영 | 5/8 16:31 | 77 h | 5/8 17:30 stale | ⚠ 방향 역전 (SYJ가 봇에게 한 질문을 SYJ에게 할 질문으로 저장) |

## 2. Critical issues discovered

### 2.1 next_question parroting (4/7 researchers)

`memory_evolution.py`의 prompt가 "mirror-quote 12-30 chars from reply"를 명시적으로
요구해 LLM이 user 발화를 그대로 echo back. 추가로 reply가 봇에게 던진 질문인 경우
(SYJ "where and when can I expect…?") 그 질문을 그대로 인용해 방향 역전 발생.

### 2.2 next_question은 계산되지만 DM 전달 안 됨 (구조적 분기)

- `memory_evolution.py` → `member_uncertainty.json[init].next_question`
- `harness_runner.py` → `member_uncertainty.json[init].campaigns[campaign_id].next_question`

서로 다른 키. 결과: 6/7 researchers의 `campaign.next_question`이 빈 문자열이라
silence reminder 조건이 충족되어도 발사 안 됨. (SMJ만 campaign.nq 채워져 있어
오늘 reminder #1 발사된 유일한 케이스.)

### 2.3 5/8 ~ 5/11 memory evolution 3일 공백

`crontab memory-evolution.sh`가 NAS 경로 (`/Volumes/CSNL_new-2/.../code_v3/memory_evolution.py`)를
가리켰는데 import한 `llm.py`가 `/Volumes/CSNL_new/.../code_v3/llm.py`에 있어 EPERM.
5/11 중 어느 시점에 로컬 경로로 교정되어 오늘부터 정상 작동. BHL의 5/10 답신과
5/8 저녁 inbound 다수가 미반영 상태.

### 2.4 mirror-to-nas.sh의 EPERM 폭주

`/Volumes/CSNL_new-1` (afpfs) 에서 rsync `-a`의 chmod/chown/utime syscall이 EPERM.
mirror.log이 EPERM 로그로 가득. 실제 content는 부분적으로 들어감.

### 2.5 outbound_questions 테이블 미사용

ledger.db에 `outbound_questions` 테이블이 있으나 `harness_runner.py`가 INSERT 안 함.
질문 발사 audit 불가.

### 2.6 침묵 5/7명에게 자동 reminder 발사 시 품질 우려

자동 reminder = 단순 `"리마인더 #N\n\n<old_next_question>"` 텍스트. 침묵 72시간 이상
researcher에게 보내면 stale + 품질 낮은 nudge. 사용자 directive: "Slack 대화는
정확도와 정보 획득을 우선으로, 답장은 늦어도 됨".

## 3. Fixes applied (live, 22:25~22:32 KST)

### A1 — `memory_evolution.py` campaign.next_question 동시 갱신

`code_v3/memory_evolution.py` main()에서 `apply_delta` 직후, `next_question` 변경 시
연구원의 `campaigns.*` 중 `status in (in_progress, paused, open, None)`인 것에
모두 nq를 mirror. 22:29 dry-run에서 BYL의 `paperblitz_2026_05_06.next_question synced`
확인.

### A2 — `harness_runner.py` 침묵 72h+ researcher 자동 reminder 차단

새 상수 `MAX_AUTO_REMINDER_SILENCE_HOURS = 72`. silence_h가 이를 초과하면 reminder
발사 대신 `state/needs_operator_review.jsonl`에 entry 추가. 다음 활동:
- 침묵 < 24h: 정상 활동, reminder 없음
- 24h ≤ silence < 72h: 자동 reminder #1 / #2 발사 (기존 로직)
- silence ≥ 72h: 자동 reminder 차단, operator 큐로 — interactive session이 curated draft 작성

### A3 — `memory_evolution.py` prompt 강화 + parroting guard

prompt:
- 거울 인용 12-25자 (max), 평서문만, 30자 이상 verbatim quote 금지
- 봇/assistant에게 던진 질문은 `confirmed_delta.outstanding_user_question`로 기록
  하고 next_question은 빈 문자열 또는 정보 요청 형태로 변환
- 무지/거부/회피 표현은 `inferred_delta.engagement_signal`로 기록, 하위 질문으로 분해
- 3개의 negative example 명시 포함

코드:
- `apply_delta(state, delta, reply_text)` 시그니처에 reply_text 추가
- `_is_parrot(nq, reply)` 가드: 30자 연속 echo / 짧은 reply 통째 echo / interrogative
  phrase echo back 검출 시 next_question 적용 거부
- 단위 테스트 8/8 통과 (4가지 parrot 케이스 + 4가지 정상 케이스)

### A4 — `mirror-to-nas.sh` 에러 분리

awk로 `Operation not permitted | mkstemp | failed to set times | some files could not
be transferred` 패턴은 `mirror.errlog`로, 나머지는 `mirror.log`로 라우팅. mirror.log은
이제 cycle당 1줄 summary만 남음. content 미러는 정상 작동 (BYL/JOP의 22:14/22:17 mtime
NAS 측 확인).

추가: `nas-find.sh`에 실제 mktemp probe (`_try_write`) 추가 — afpfs/smbfs가 `[ -w ]`를
오인 통과시키는 문제 우회.

## 4. Working components (변경 없음)

- `realtime_listener.py` Socket Mode (pid 93958, OK)
- crontab `*/30 9-21 * * 1-6` harness-runner.sh — 자체 schedule 정상
- launchd `csnl.realtime` (running), `csnl.orchestrator` (CalendarInterval 9:30)
- `slack_outbound.py` chokepoint enforcement
- Researcher-DM tone (학술 한국어, 이모지/superlative 금지, "이보연 연구원께") 준수
- 오늘 11:36-12:10 operator-curated batch 품질 우수 (BHL ROI question, JOP PB skeleton,
  BYL paper replacement)

## 5. Deferred — needs further design

### B1 — Supabase PostgresDB 체계화 (사용자 directive)
ledger.db (SQLite) + member_uncertainty.json + memory_evolution_log.jsonl을
Supabase Postgres 스키마로 이관 검토. 우선순위: Codex review 후 결정.

### B3 — Harness repo 위치
현재 `/Users/csnl/csnl_on_ai/harness/`는 git 미관리. csnl-ops에 통합 vs 별도
repo `csnl-harness` 결정 필요.

### B4 — Qwen 3.6 dense + 35b MOE fine-tune (사용자 directive)
현재 cron LLM은 generic Qwen 2.5 14b. 연구실 도메인 fine-tune 모델로 교체 시
parroting / tone 품질 추가 개선 예상. 학습 데이터: Slack 대화 + researcher_briefs.

### Curated DM drafts (C path)
침묵 72h+ researchers (BHL/MSY/SMJ/JYK/SYJ) 및 active responder JOP/BYL에 대한
draft를 `tmp/dm_drafts/` 아래 별도 작성 → 사용자 검토 후 일괄 송신. 별도 PR로 진행.

## 6. Verification at 22:30 cron fire

다음 memev cycle (22:30)에서 자동으로:
- JOP의 22:13 "더 중요한 질문을 해" 메시지가 새 prompt로 처리됨
- BYL의 21:07 "후보2 교체" + 이전 메시지가 dual-write 적용으로 campaign.nq에 sync
- 5/7 stale researchers의 첫 fire는 9:00 화 이후 (현재 outbound window 9-22 외)

다음 화요일 9:00 KST에 6 researchers (JOP는 converged) 중:
- silence_h > 72h: BHL(26h 정상), MSY(81h skip), SMJ(80h skip), JYK(96h skip), SYJ(77h skip), BYL(~12h 정상)
- BHL과 BYL은 자동 reminder 가능, 4명은 operator 큐로

## 7. Permissions used in this session (per 사용자 directive "모두 승인")

- D4 git push csnl-ops origin/main — pending after this PR + Codex review
- D1/D2/D3 (Supabase / Vercel / GH secrets) — pending B1+B3 design decisions
