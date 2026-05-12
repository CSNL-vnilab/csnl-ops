# Researcher Digests — paperblitz_2026_05_06

> 7명 junior researcher 대상 단일 page 디제스트. 출처: `state/member_uncertainty.json` (2026-05-12 15:14:36 KST 통합), `state/researcher_topics.json`, `docs/researcher_summaries/*.md`, `docs/long-term-plan-2026-W19+.md`, HANDOFF.md §1 roster table. 기준 metric은 2026-05-12 16:00 KST baseline.

---

## JOP — 박준오 (Junior senior researcher)

`unknown=0, inferred=3, confirmed=10, inbound=10, outbound=9, NQ_set=yes`

현재 focus는 **Time2Dist** project. RingRepSca는 Lee et al. 2025 확장으로 완결, GranRDT/GranNMDS/Uncertainty/SerialDepTime 등 6 부속 topic은 priority 5 dormant 상태. Active research question은 *TimeExp1 (reproduction) 8명 데이터 유효성 확인 및 Exp2 (scaling) paradigm 설계*. 직전 milestone은 2026-W19 declaration (2026-05-08): `analysis_target=TimeExp1 Sbj 5–12 검증·교수 보고`, `recruitment_target=Exp2 모집 시작`. NAS engagement는 `JOP/Time2Dist`에 41 MM 파일·219 pgvector chunks (가장 풍부). Blocker는 Exp2 paradigm scaling 미확정 — Bertolasi 2025 인용 figure 및 Exp2 first-batch 데이터 도착 후 prediction match 분석이 다음 실험자 action.

## BYL — 이보연

`unknown=4, inferred=4, confirmed=6, inbound=2, outbound=6, NQ_set=yes`

Focus project는 **WM BiasVar** (orientation estimation 기반). 후보 paper의 stimulus 정의 오류를 본인이 지적한 적극적 수정 의지 신호 확인됨. Active uncertainty는 *saccadic location orientation과 구분되는 orientation estimation 기준* — 현재 NQ로 dispatch 됨. 직전 milestone은 paper rec 수락 (Yang/Zhang/Lim 2024 eLife, sukbin Im group). NAS engagement는 `BYL/biasVar/`가 **HANDOFF상 MM=0, pgvector=0 (empty)**. 방법론(psychophysics/fMRI/modeling) 미확인이 가장 큰 unknown. 다음 실험자 action은 short/long delay (0.05s/0.5s) prediction 일치도 분석을 위한 model fit 결과 공유.

## MSY — 여민수

`unknown=4, inferred=2, confirmed=5, inbound=1, outbound=4, NQ_set=yes`

Focus는 **CatVsMag** (deep-gen face stimulus). Research question은 *동일 자극에 대해 categorization vs magnitude decision 시 서로 다른 generative model이 작동하여 history effect 등 행동 패턴이 다르게 나타나는지*. 상태는 `실험 진행 중`. NQ는 *생성 얼굴 이미지의 어떤 속성을 categorization/magnitude 판단에 사용하는가*. NAS engagement는 `MSY/Code/cat_mag_main/` — **MM count=46, pgvector=76 chunks** (JOP 다음으로 풍부). 직전 milestone은 paper rec 수락 (Ranieri 2025 BMC Bio, face-gender SD EEG) 및 active Q-a (σ_lik task-dependent parametrize) 발사. Blocker는 stimulus space 정의 미확정 — HSL collab boundary 정리가 mid-term 과제.

## SMJ — 정새미

`unknown=2, inferred=3, confirmed=9, inbound=5, outbound=6, NQ_set=yes`

Focus는 **Concentricity** (oculomotor + spatial prior). Research question은 *concentricity가 object 위치 파악의 강력한 prior로 작동, scene parsing/visual search에서 object center에 fixation 분포가 집중되는가*. 상태는 `파일럿 데이터 기반 분석 진행 중`, archiving 완료(본인 보고 2026-03-27). 현재 NQ는 *행동 연구 중심 선호 — 특정 실험 패러다임 선호도* (NAS에 optimal observer 코드/결과 부재 finding 이후 행동 연구로 pivot). NAS engagement는 `SMJ/Concentricity/`이지만 **HANDOFF상 MM=0, pgvector=0** (empty — onboarding gap). 직전 milestone은 paper rec 수락 (Hesse 2026 Sci Rep). Blocker는 optimal observer 모델 진척 상황 미확인. 다음 실험자 action은 pilot→정식 실험 transition timeline 추적.

## JYK — 김정예

`unknown=6, inferred=4, confirmed=3, inbound=1, outbound=5, NQ_set=yes`

Focus는 **RNN WM modeling** (anchor models, Gu et al. 2025 task-optimized RNN과 유관). Confirmed research question은 *WM에서 input noise와 loss function이 representation에 미치는 영향* — code_language=Python, specific_manipulation=Oblique cost↑ 조작. 그러나 unknown=6으로 7명 중 최다 (프로젝트 약칭, 다른 방법론, fMRI 사용, Gu et al. 관계 등 미확인). NAS engagement는 `JYK/RNN/`이 **HANDOFF상 MM=0, pgvector=1 chunk (GRM only)** — onboarding 초기. 현재 NQ는 *관련 지식 미숙 상태에서 어떤 구분/지식을 의미하는지* — 본인의 "잘 모르고 아직 해본 적 없음" 응답에 대한 후속 clarification. 직전 milestone은 NAS find (α=2.0/9.0 trained, 3–8 untrained). 다음 실험자 action은 intermediate α 학습 권유 + heterogeneous-loss/Hebbian/asym variant 결과 비교 시각화 도구 제공.

## BHL — 이보현

`unknown=0, inferred=1, confirmed=5, inbound=6, outbound=4, NQ_set=yes`

Focus는 **distractor effect on visual WM + fMRI neural decoding** (SK 멘토링 하 학습 진행). Confirmed로 researcher_name·research_interest·target_pis(Oberauer/Rademaker/Fristche/Stormer)·training_status (폴더 내 학습 차단 없음, 진행 중)·data_access_status 5개 항목 모두 채워짐 — junior 중 unknown=0 달성. NAS engagement는 **HANDOFF상 본인 폴더 없음** (`/Memory/BHL/` 미존재, SK 폴더 학습용 reads). 현재 NQ는 *독립 연구 데이터셋의 구체적 출처와 전처리 단계*. 직전 milestone은 paper rec 수락 (Degutis 2025 eLife, positive accept) 및 ROI A/B/C question dispatched. **Critical gap**: 본인 NAS workspace 미생성 — PI 또는 JOP 안내로 onboarding 후 ROI 선택 → fMRI design first-figure draft 진행이 다음 실험자 action.

## SYJ — 조수영

`unknown=1, inferred=3, confirmed=2, inbound=6, outbound=4, NQ_set=yes`

Onboarding 단계, **JSL 멘토링 path** (SerialDep_Spatial / Passive_navigation 학습 priority 1/5). Confirmed는 research_interests=[psychophysics, behavioral modeling, Bayesian approaches] + current_task=clarification_and_timeline. Inferred에 language_preference=Korean, status=awaiting_resources, research_confusion=psychophysics_vs_behavioral_Bayesian. 유일한 unknown은 specific_subfield_focus. NAS engagement는 **HANDOFF상 본인 폴더 없음** (JSL/ 학습용 reads). 현재 NQ는 *paper recommendation 수령 일정 확정 요청* — researcher가 적극적으로 일정 push 중. 직전 milestone은 paper rec 발송 (Gershman/Bill/Drugowitsch 2025 Annu Rev VS, relaxed tier) + consolidated reply 1695 char dispatch. 다음 실험자 action은 3 anchor (existing-lab-data / new-experiment / model-only) 중 선택 → 첫 인터뷰 cycle 시작 + JSL과 직접 협의 path 확보.

---

## Discrepancy notes (HANDOFF roster vs. live state)

- **JOP**: HANDOFF에 41 MM 파일·219 pgvector chunks로 가장 풍부하다고 기재되어 있으나 live `researcher_summaries/JOP.md`는 *latest inbound/outbound = None* 으로 표기됨. 실제 outbound=9, inbound=10이 baseline metric — researcher_summary가 30일 memev_entries 기준이라 짧은 window에서 비어 있을 수 있음. 모순 아님.
- **BYL/SMJ**: HANDOFF는 "MM_count=0 (empty)" 명시, 본인 폴더는 NAS상 존재하나 MM 파일 미존재 — live `member_uncertainty.json[SMJ].confirmed.archiving="완료 (본인 보고 2026-03-27)"`와 정합. SMJ archiving 보고와 NAS empty의 불일치는 본인 archiving 기준이 다른 경로(개인 NAS/Drive)일 가능성 — 후속 확인 필요.
- **JYK**: HANDOFF는 "1 GRM only" 표기, live `researcher_summaries/JYK.md`는 30d memev 5건. pgvector_grm_sync 결과는 NAS scan 시점 기준이므로 baseline과 일관.
- **BHL/SYJ**: HANDOFF는 "no own NAS folder"로 정확히 표기됨. junior onboarding 단계 — discrepancy 없음.
- **MSY**: live `researcher_summaries/MSY.md`는 *30일 memev 0건* 으로 표기되나 baseline inbound=1, outbound=4 — researcher_summary는 30d 단위 memory_evolution_log 집계이므로 active campaign 데이터 (`outbound_questions`, `bot_outbound_messages` ledger)와 별개. 모순 아님.
