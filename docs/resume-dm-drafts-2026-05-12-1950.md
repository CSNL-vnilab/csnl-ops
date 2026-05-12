# DM drafts — operator-Opus polish (2026-05-12 19:50 KST)

> 본 파일은 발사 직전 사용자 OK 를 받기 위한 staging 문서. 각 draft 는
> [`resume-dm-sessions.md`](resume-dm-sessions.md) 의 placeholder 를 실제 NAS
> facts + ledger 기록으로 채운 결과. SYJ 는 P4 active → 차단 (no draft).
>
> 발사 순서: JOP → BHL → SMJ → BYL → MSY → JYK.
> 각 draft 의 톤은 [`feedback_paper_rec_tone.md`](../../.claude/memory/) 따름.

## 1. JOP — D0AMRACTLBH — silence 1h53m

**컨텍스트**: 17:18 operator framework Q → 17:19 JOP "trial-to-trial dynamics 보다는 fixed subjective prior recovery + encoding model selection이 더 맞아 보임" → 17:52 JOP "해결됐나?" (operator 측 반영 확인).

**NAS facts**: `JOP/Time2Dist/` = 200 files (174 code), newest 2026-03-24, sample `Code/Experiment/main_duration.m`. RingRepSca, GranNMDS, GranRDT, Time, Uncertainty, tDCS 포함 7 projects.

```
박준오 연구원께,

17:19 의 방향성 (fixed subjective prior recovery + encoding model selection)
반영했습니다. NAS Time2Dist 의 실 experiment 파일은
`Code/Experiment/main_duration.m` (2026-03-24 최신, 200 code files). prior
정의가 들어 있는 함수/스크립트 한 곳만 지정해 주시면 다음 분석 단계의 변수
정의를 거기 맞춰 좁히겠습니다.

— Claude
```

## 2. BHL — D0AN6PXAESE — silence 2h22m

**컨텍스트**: 17:18 operator A/B/C Q → 17:23 BHL "B로 하고, 기존 2순위에 있던 논문을 다시 추천해줘". (B)=Degutis retain, "2순위" = 5/11 20:36 언급한 Xu 2025 eNeuro / Kular & Serences 2025 bioRxiv. 두 후보 모두 fMRI 가정 하에 정리된 것 — BHL 17:13 "fMRI 안 함" 정정 이후로는 mismatch 가능.

**NAS facts**: BHL 본인 폴더 없음 (folder_exists=False). 멘토 SK 의 `WMRepresentation_24_updated` (2 files) + `Screen_Retinotopy` (3 files) 가 학습 surface (단 SK 폴더 NAS 인덱스가 sparse — sweep budget 한도일 가능성).

```
이보현 연구원께,

(B) Degutis retain — fMRI reference 로 메모리에 보류 표시했습니다 (현재
priority 낮음, BHL 의 fMRI_plan 갱신 시 재평가).

"기존 2순위 후보" 건 — 5/11 20:36 에 언급한 Xu (2025 eNeuro), Kular &
Serences (2025 bioRxiv) 두 후보는 *fMRI 연구 가정* 하에 정리된 차순위였습니다.
17:13 의 행동 paradigm pilot 단계 정정 이후로는 그대로 재추천이 mismatch 일
가능성이 있어 사전 확인합니다 —

(a) 두 후보를 행동 paradigm 측에서 활용 가능한 부분만 audit 해서 재추천
(b) 두 후보는 archive 로 두고, 행동 단계 paradigm taxonomy / distractor
    effect 후보로 신규 search cycle

(a) / (b) 한 자만 알려주십시오. 어느 쪽이든 Crossref-verified DOI + author
verbatim 으로 진행합니다.

— Claude
```

## 3. SMJ — D0AN0CHTJP5 — silence 2h33m

**컨텍스트**: 17:16 operator paper rec author 정정 안내 → 17:17 SMJ "R" (수신 확인). 15:50 SMJ "lci 만 사용, 나머지는 미사용" 정보 기억에 반영해야 함. 다음 단계는 LCI 정의의 spatial scale 확인.

**NAS facts**: `SMJ/Concentricity/` = 200 files (47 code, 108 data, 11 notes), newest 2026-03-31. Code samples: `Code/run_experiment_0203.py`, `Code/summary.md`, `Code/analysis_code/data_parser.py` (Python primary).

```
정새미 연구원께,

17:16 정정 수신 확인. 15:50 의 "lci 만 사용" 정보를 메모리에 반영했습니다.
Concentricity 의 LCI 정의에 들어가는 *spatial scale (degrees of visual
angle)* 값을 알려주십시오 — 다음 paper rec 의 신호 처리 layer 가 그 값에
맞춰져야 합니다. NAS `SMJ/Concentricity/Code/analysis_code/` 에서 현재 사용
중인 값과 다를 가능성도 함께 확인 부탁드립니다.

— Claude
```

## 4. BYL — D0AN6PMLWCS — silence 22h41m

**컨텍스트**: 5/11 21:07 BYL "후보2 로 교체할게" → 오늘 14:18 nas_grounded_uncertainty_Q + 17:25 uncertainty_state_reminder 모두 미답. 4 unknown 항목 (방법론, 현재 상태, 코드 언어, NAS 아카이빙).

**NAS facts**: `BYL/biasVar/` = 200 files (168 code, 2 data, 1 notes, 1 slides, 2 doc, 26 other), newest 2026-03-23. Code samples 3 건 모두 Python (`Code/Experiment/OnlineProject/Python_mainExp_helperFiles/*.py`).

```
이보연 연구원께,

NAS `BYL/biasVar/` 에 code 168 파일 (sample 3 건 모두 Python:
`Code/Experiment/OnlineProject/Python_mainExp_helperFiles/`). 본인 연구의
*방법론 분류* (psychophysics 행동 / fMRI / RNN 모델링 / 혼합) 와 *주 언어*
(Python 단일 / Python+MATLAB 혼용) 알려주십시오. 두 정보가 있어야 다음 paper
rec 의 venue 와 method 가 맞춰집니다. 단답 (한 줄) 이면 충분합니다.

— Claude
```

## 5. MSY — D0AP128V9DE — silence 96h+ (stale)

**컨텍스트**: 5/8 18:34 MSY "이 논문에 관한 질문을 해도 되나?" → 오늘 14:18 nas_grounded_uncertainty_Q + 17:25 reminder 모두 미답. 96h+ silence → 자동 reminder 금지 범위. operator curated soft restart.

**NAS facts**: `MSY/Context/` 53 slides (GRM/PB-style), `MSY/Data/cat_mag_main/`, `MSY/Data/face_cond_ver9/`. `MSY/Code/` 200 files. atypical layout (project name 이 sub-dir level).

```
여민수 연구원께,

5/8 18:34 의 "이 논문에 관한 질문을 해도 되나?" 에 늦게 답신드립니다 —
가능합니다. 어떤 논문인지 + 어떤 부분이 본인의 cat_mag_main 연구와 충돌/
연결되는지 알려주시면, 다음 GRM 발표 (`MSY/Context/` 의 슬라이드 시리즈와
연결되도록) 의 framing 에 반영하겠습니다. 단답 한 줄 + DOI 또는 제목으로
충분합니다.

— Claude
```

## 6. JYK — D0AN3B8K0CD — silence 99h+ (stale)

**컨텍스트**: 5/8 14:42 JYK "distinction은 모르겠음.. 관련 지식 잘 모르고 아직 해본적 없음" → 오늘 14:18 nas_grounded_uncertainty_Q + 17:23 paper_rec_doi_correction 미답. 99h+ silence + 지식 부족 명시. operator 가 supportive 톤으로 reset.

**NAS facts**: `JYK/RNN/` = 200 files (1 data, 199 other — likely .pth checkpoints), newest 2026-03-23. 0 code 분류 (모두 "other" 로 떨어짐, samples 도 접근 불가).

```
김정예 연구원께,

5/8 14:42 의 "distinction 모르겠음" 회신, 솔직한 진단 감사합니다. 이를
출발점으로 — 본인의 RNN 시뮬레이션이 *어떤 입력* 을 받고 *어떤 출력* 을
내는지, 한 문장으로 정리해 주실 수 있나요? 출력 형식 (예: "cardinal
direction 4 개 중 하나의 softmax") 만 있어도 다음 cycle 의 paper rec 와
framework discussion 의 그라운드가 됩니다.

— Claude
```

## 7. SYJ — D0AN4N0278E — **P4 ACTIVE — 발사 금지**

`state/nas_optout.json[SYJ].level = P4, status = active, declared_at = 2026-05-12T17:32:55+09:00`. P4 lift 신호 전까지 channel quiet 유지.

## 발사 절차

각 draft 별:
```python
import sys; sys.path.insert(0, '/Users/csnl/csnl_on_ai/harness/code')
import slack_outbound
text = """<draft 본문>"""
slack_outbound.post(
    channel_id="<DM channel>",
    text=text,
    member_init="<INIT>",
    kind="operator_opus_resume_session_Q",
)
```

발사 직후 30 초 안에 ledger.bot_outbound_messages 에 row 생성 + 30 분 내 답신 시 memev */3 cycle 이 자동 delta 처리.
