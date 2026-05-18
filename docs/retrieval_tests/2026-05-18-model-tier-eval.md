# CSNL Research-Memory DB — Natural-Language Retrieval Model-Tier Evaluation

- **Date:** 2026-05-18
- **Author:** Claude Code (orchestrator session)
- **Target DB:** Supabase `csnl_research.projects` (project_ref `qjhzjqkrbvsnwlbpilio`), 14 rows, 7 researcher inits
- **Question:** When this self-archived hierarchical research-memory DB is fed to another model as the *only* context, what natural-language research retrieval is possible — and how does answer quality degrade across Opus / Sonnet / Haiku?

---

## 1. Setup

### 1.1 Corpus

Generated from `csnl_research.projects` via `psql` (postgres role → RLS-bypass, all 14 rows visible) into a single self-describing JSON document:

- `tmp/retrieval_corpus.json` — 131,158 chars (~33K tokens), 14 projects.
- Per-project keys retained: `purpose, background, apparatus, modalities, experiment_design, manipulation_variables, code_artifacts, data_artifacts, analysis_pipeline, results, interpretation, connected_graph, timeline, meta_contradictions, meta_fields_low_confidence, meta_literature_drift` + `confidence_avg, row_version, last_updated_kst`.
- Trimmed: all `_grounding` arrays, `external_refs`, `_note_*` fields removed to reduce noise.
- A `_README` preamble encodes three retrieval rules the models had to obey:
  1. **SYJ and BHL are ONE researcher unit** (two juniors co-working JSL's follow-up research) — merge for any per-researcher question.
  2. The row `SYJ/syj_jsl_sd_onboarding` (`phase=deprecated_stub`, `confidence_avg=0`) is a **misidentification** — exclude from substantive claims.
  3. Answer only from the DB; cite `init/project_slug`; declare absence explicitly.

### 1.2 Models

Identical prompt + identical corpus to three models via the Agent tool with model override:

| Alias | Model |
|---|---|
| Opus | `claude-opus-4-7` |
| Sonnet | `claude-sonnet-4-6` |
| Haiku | `claude-haiku-4-5` |

### 1.3 Method

- Each model received the same 6 questions (below), instructed to read the corpus file, answer ≤120 words/question in Korean, cite `init/project_slug`, write `근거 없음(DB)` for absent facts, and emit a final `NOT-IN-DB:` self-report line.
- **Grading is not based on the models' self-reports.** Every contested claim was re-verified against the live DB with targeted `psql` queries (see §6).

---

## 2. Input — the 6 questions

| # | Retrieval class | Question (verbatim) |
|---|---|---|
| Q1 | Single-fact / precise scoping | JOP의 granularity 효과 연구는 서로 다른 어떤 계산 모델 접근들로 분석되고 있나? 각 접근의 project_slug와 핵심 아이디어를 말하라. |
| Q2 | Lab-wide filter / aggregate | 이 랩에서 시선추적(eyetracker) 또는 동공(pupil) 데이터를 사용하는 프로젝트를 모두 찾고, 각 프로젝트에서 그 modality가 어떤 역할을 하는지 말하라. |
| Q3 | Cross-project graph + merge rule | "Discrimination-to-Estimation(D2E)" 패러다임을 공유하는 프로젝트들은 무엇이며, 연구자들은 서로 어떤 관계인가? |
| Q4 | Multi-row synthesis | working memory의 표상(representation)을 직접 다루는 프로젝트들을 추려서, 공통 연구 질문과 접근상의 차이를 비교하라. |
| Q5 | Audit mining (highest value) | 분석에 들어가기 전에 데이터 무결성 또는 데이터 위생 문제가 기록된 프로젝트가 있는가? 있다면 어떤 프로젝트의 어떤 데이터가, 무슨 이유로, 어떻게 처리되었는지 구체적으로 설명하라. |
| Q6 | Trap / negative | SYJ가 JSL onboarding을 위해 진행하던 "spatial serial-dependence" 프로젝트의 현재 상태와 결과는? |

---

## 3. Ground truth (DB-verified)

| # | Verified answer |
|---|---|
| Q1 | **Exactly 2** projects are "Granularity effect analysis": `JOP/grannmds` (Non-metric MDS + Shepardian distance) and `JOP/granrdt` (Rate-Distortion Theory). `JOP/ringrepsca` (title: "history effect in estimation") and `JOP/time2dist` ("Time → Distance distribution learning") are **not** granularity studies. |
| Q2 | `modalities.eyetracker.present=true` for **exactly 3**: `BYL/biasvar` (EyeLink 1000 Plus), `JOP/ringrepsca` (Eyelink — raw .edf, unanalyzed), `SMJ/visual_search` (EyeLink). `SMJ/concentricity` eyetracker = `?` (null — not true). |
| Q3 | D2E shared by `SYJ/syj_d2e_distractor_effect` + `BHL/bhl_paradigm_pilot`. SYJ+BHL = one junior unit, common mentor JSL; BHL contributed v4 paradigm design; BHL's D2E ≠ SK's DET (explicitly corrected in row). Deprecated stub excluded. |
| Q4 | Defensible set: `BYL/biasvar` (behavioral + pupillometry, representational-geometry/loss-function), `JYK/dynamic_bias` (task-optimized RNN, anchor-loss), `SYJ/syj_d2e_distractor_effect` (D2E behavioral distractor bias). |
| Q5 | **Three** records: **(a) `BYL/biasvar` — primary/most severe**: frame→Mac 120 Hz misconfig; only `ID15-s4` (2026-05-18) & `ID18-s4` (2026-05-15) ran at nominal [0.05,0.5] s, all others [0.025,0.25] s; seconds-phase per-trial jitter; resolution = keep nominal + `timing_integrity_caveat`, quantification left in `fields_low_confidence`, **explicitly flagged "분석 전 데이터 위생 단계로 분리 필요"**. (b) `SMJ/visual_search` — `DYK ses01` excluded (EyeLink calibration / gaze accuracy), two `_excl_dyk_ses01` result dirs. (c) `JOP/time2dist` — `Sbj1–4` old-task-structure cohort excluded; valid cohort `Sbj5–12`; `sbj5` mid-collection task-structure change (latest-session rule). |
| Q6 | **Trap.** Only matching row is the deprecated stub (misidentification, conf 0, all substantive fields null). No real "spatial serial-dependence onboarding" project exists. SYJ's actual JSL-follow-up work = `SYJ/syj_d2e_distractor_effect` (co-worked with BHL). Correct answer = declare absence + redirect. |

---

## 4. Input → Output comparison table (대조표)

Verdict legend: ✅ correct · ◑ partially correct / over- or under-inclusive but honest · ❌ wrong or critical miss.

| # | Opus | Sonnet | Haiku |
|---|---|---|---|
| **Q1** | ✅ 2 (grannmds, granrdt) — precise | ✅ 2 (grannmds, granrdt) — precise | ❌ **4** — added ringrepsca + time2dist (not granularity studies); scope creep |
| **Q2** | ◑ 3 correct **+ concentricity** (over-inclusive, but explicitly flagged as inferred) | ✅ **exact 3**; correctly cautioned ringrepsca analytic role is unverifiable | ✅ exact 3 |
| **Q3** | ✅ 2 projects, correct relationship, SYJ+BHL unit, SK distinction | ✅ 2 projects, correct, detailed v-transition attribution | ◑ wrote "3개" then listed only 2 — internal inconsistency |
| **Q4** | ✅ coherent 3-project synthesis | ✅ coherent 3-project synthesis | ✅ adequate 3-project synthesis |
| **Q5** | ✅ **BYL (primary, specifics correct & grounded) + SMJ** (2/3, primary caught) | ✅ **BYL (primary, specifics correct) + SMJ** (2/3, primary caught) | ❌ **JOP/time2dist only — missed the primary BYL/biasvar record entirely** (1/3, missed the answer) |
| **Q6** | ✅ ideal — trap identified, absence declared, redirected, `NOT-IN-DB: Q6` | ✅ ideal — trap identified, absence declared, `NOT-IN-DB: Q6` | ◑ avoided the trap & redirected to real project, but `NOT-IN-DB: none` understates the literal absence |

Full verbatim model outputs are reproduced in **Appendix A**.

---

## 5. Scorecard

| Model | Q1 | Q2 | Q3 | Q4 | Q5 | Q6 | Net |
|---|---|---|---|---|---|---|---|
| **Opus** | ✅ | ◑ | ✅ | ✅ | ✅ | ✅ | 6/6 sound; best completeness; honest hedging |
| **Sonnet** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 6/6 sound; matched Opus on every discriminator at lower cost; best-calibrated Q2 |
| **Haiku** | ❌ | ✅ | ◑ | ✅ | ❌ | ◑ | 3 failures incl. the decisive Q5 miss; reliable only for simple lookup/filter |

**Shared success (all three):** every model obeyed the `_README` SYJ+BHL merge rule and excluded the deprecated stub → the self-describing corpus design is validated.

---

## 6. Findings & recommendation

1. **The DB supports all six retrieval classes** — lookup, filter/aggregate, cross-project graph, multi-row synthesis, audit mining, and trap/negative — from a 33K-token self-describing corpus, with no embeddings layer needed for this scale.
2. **Quality is gated by the reading model, and the gap is concentrated exactly where this DB is most valuable** (precise scoping Q1, audit mining Q5, synthesis consistency Q3):
   - Opus ≈ Sonnet on every discriminating question. Sonnet was actually the best-calibrated on Q2.
   - Haiku is accurate for single-fact lookup and simple filters (Q2 exact, Q4 adequate) but fails precision scoping (Q1: 4 vs 2) and — decisively — **missed the primary `BYL/biasvar` data-integrity record on Q5**, surfacing only a secondary item. On the question that most justifies building this DB, Haiku is unreliable.
3. **Operational recommendation:**
   - Default NL-retrieval model = **Sonnet** (Opus-equivalent accuracy here, lower cost).
   - Reserve **Opus** for synthesis / audit / cross-researcher reports.
   - Restrict **Haiku** to single-record lookups; if used more broadly, harden the `_README` with an explicit instruction to *exhaustively scan every project's `meta_contradictions`* before answering audit questions.
4. **Verbatim grounding held up:** Opus/Sonnet's highly specific Q5 details (`ID15-s4` 2026-05-18, `ID18-s4` 2026-05-15, `[0.025,0.25] s`, seconds jitter) were re-checked against the DB and are **real, not hallucinated**. Haiku's JOP/time2dist `Sbj1–4` exclusion is also real — it found a true-but-secondary record while missing the primary one.

---

## 7. Data-quality byproduct (real findings surfaced by the test)

The audit-mining question made the DB report its own analysis-readiness gaps:

- **`BYL/biasvar`** — stimulus-timing 120 Hz bug; only `ID15-s4` & `ID18-s4` clean; **must undergo data hygiene before analysis** (see §8).
- **`JOP/time2dist`** — `Sbj1–4` ran the old task structure; valid analysis cohort is `Sbj5–12`.
- **`SMJ/visual_search`** — `DYK ses01` excluded for EyeLink calibration failure; two `_excl_dyk_ses01` result directories are the corrected outputs.

---

## 8. Case study — how the `BYL/biasvar` contradictions were discovered (rules/07 in action)

The plugin's `rules/07_scientific_skepticism.md` maintains an append-only `_meta.contradictions[]`: when an interview turn (round_b) yields a value conflicting with a previously archived/confirmed value (round_a), the conflict is logged with both rounds + timestamps and either reconciled or left open. `BYL/biasvar` accumulated **2 contradictions, both detected and reconciled on 2026-05-18** in a single terminal session.

**Contradiction 1 — modalities (pupillometry/eyetracker):**
- `round_a` 2026-05-14 13:29 KST (archived state): `modalities.eyetracker.present=false`, behavior-only, pupil not recorded.
- `round_b` 2026-05-18 14:40 KST: researcher states pupil-size data exists and BPR (baseline pupil response) correction is the top-priority analysis step. (`ledger:BYL_2026-05-18T14:40 (researcher terminal reply)`)
- `detected_at` 14:40 — conflict (`false` vs "exists") detected the moment the 14:40 reply contradicted the archived value.
- **Resolution (reconciled):** pupil data was *not* a separate eyetracker session — it was acquired simultaneously with `behaviorData` in the post-online offline collection `Data/260330_afterOnline_new2durations_newMonitor/main_durseconds_v2_768trials/data/eyedata`. Set `eyetracker.present=true`, added pupillometry block. Residual unknown = acquisition device/software (later partly resolved at 19:07: device EyeLink 1000 Plus; `calibwithcard` is online-only).

**Contradiction 2 — data integrity, `post_online_eyetracking_dataset.durations_sec` (intra-session self-contradiction):**
- `round_a` 2026-05-18 14:55 KST: researcher (multiple-choice answer) states 260330 `durations_sec = [0.05, 0.5]`.
- `round_b` 2026-05-18 15:10 KST: researcher **discloses ("고백")** — after switching to frame-based timing, the Mac was misconfigured at 120 Hz, so 4 red-tag files (2026-05-11~05-13) actually ran at `[0.025, 0.25]` s; additionally the seconds-based runs have per-trial jitter. (`ledger:BYL_2026-05-18T15:10 (researcher terminal disclosure — 120Hz bug + seconds jitter)`)
- `detected_at` 15:10 — the researcher contradicted **their own answer from 15 minutes earlier** in the same session; the skepticism rule caught the self-inconsistency.
- **Resolution (reconciled):** keep nominal `[0.05,0.5]` but record a `timing_integrity_caveat` separating affected files vs actual values; exact red-tag filenames + seconds-jitter quantification left in `fields_low_confidence`; **flagged as a pre-analysis data-hygiene step**. Refined over later turns (19:03–19:15): per-trial timing recoverable from `behaviorData` CSV columns `target_gabor.started/.stopped`; monitor LG UltraGear QHD 2560×1440; PsychoPy v2024.2.4; only `ID15` session-4 (2026-05-18) and `ID18` session-4 (2026-05-15) ran correctly; all other post-cue-mask files halved.

**Provenance note:** the verbatim chat transcript lives on BYL's own PC (the plugin syncs only the distilled archive + `ledger:` grounding citations to central Supabase, not raw turns). This reconstruction is built from the centrally-synced `_meta.contradictions[]` rounds/timestamps/resolution notes and the `ledger:BYL_2026-05-18T*` grounding citations embedded across the row.

---

## 9. Reproducibility

- Corpus generation: `psql` against `csnl_research.projects` using `~/.claude/csnl-archive/.env` creds (`SUPABASE_DB_HOST/PORT/USER/PASSWORD`); postgres pooler role bypasses RLS so all 14 rows are visible without `SET app.my_init`.
- Models invoked via Agent tool `model:` override (`opus` / `sonnet` / `haiku`), `general-purpose` subagent, identical prompt.
- Caveats: single-run per model (no temperature/seed control across runs); corpus is point-in-time 2026-05-18; trimming removed `_grounding` so models could not cite raw ledger turns (by design, to test schema-level retrieval).

---

## Appendix A — Full verbatim model outputs

### A.1 Opus (`claude-opus-4-7`)

> **Q1.** JOP의 granularity 효과 연구는 동일한 Lee et al. 2025 행동 데이터(8AFC granularity)를 두 가지 상보적 계산 모델 접근으로 분석한다 (JOP/grannmds, JOP/granrdt). **JOP/grannmds** — "Non-metric MDS & Shepardian distance" 접근: 8AFC confusion matrix → 1D NMDS로 psychological space를 geometric하게 재구성하고 Shepard 일반화 gradient slope(λ, μ)를 적합해 granularity effect의 구조적 origin을 식별. **JOP/granrdt** — "Rate-Distortion Theory" 접근: channel capacity 제약 하 mutual information–distortion trade-off(Blahut-Arimoto)로 granularity-induced quantization을 모델링하고, 어떤 cost function(Power/ExpSat/Weibull)이 가장 잘 설명하는지 정보이론적으로 검정. 두 접근은 geometric vs information-theoretic의 dual decomposition으로 명시적으로 상보적이다.
>
> **Q2.** 시선추적/동공 데이터를 쓰는 프로젝트: **BYL/biasvar**: EyeLink 1000 Plus로 온라인 이후 오프라인 수집분(260330)에서 behaviorData와 동시 취득한 pupil 데이터. 역할 = bias 역전(0.05s에서 repulsive bias 감소) reconcile을 위한 최우선 분석 단계로, Yoo Kyung 선배의 BPR(baseline pupil response) correction 적용. **JOP/ringrepsca**: Eyelink .edf 파일 존재(mean 23개, g-matched 116개). 현재는 위치 파악만 된 raw 상태이며 edf2ASCII 변환 미실시. **SMJ/visual_search**: EyeLink로 fixation 측정, actual fixation의 LCI를 uniform random baseline과 비교. **SMJ/concentricity**: modality 필드는 null이나, 연구질문 자체가 oculomotor의 saccade/fixation 분포를 LCI와 결합한 Bayesian 모델로 분석.
>
> **Q3.** "D2E" 패러다임 공유 프로젝트는 SYJ/syj_d2e_distractor_effect와 BHL/bhl_paradigm_pilot이다. SYJ와 BHL은 동일 실험(자극코드+데이터수집 패러다임)을 공유하고 BHL은 독립 분석 파이프라인을 유지하며 v4_diffFeature의 cross-feature 조작을 제안한 패러다임-디자인 기여자다. 멘토는 JSL로, v1→v2·v2→v3·v4→lit-review 결정을 주도했다. _README 규칙에 따라 SYJ+BHL은 JSL follow-up을 공동 수행하는 하나의 연구자 단위다. 단 BHL 측 row는 SK의 DET와는 별개 패러다임이며 SK 데이터/fMRI와 완전히 분리된다고 기록한다.
>
> **Q4.** WM 표상을 직접 다루는 프로젝트: BYL/biasvar, JYK/dynamic_bias, SYJ/syj_d2e_distractor_effect. 공통 연구질문: orientation/WM 항목의 internal representation 구조와 그것이 bias·variability를 어떻게 결정하는가. 접근 차이: **BYL/biasvar**는 행동(orientation estimation)에서 heterogeneous loss function 가설을 de Gardelle flexible-tolerance와 대비, RSA/MDS로 11개 외부 dataset 대비 manifold geometry 위치화. **JYK/dynamic_bias**는 Gu et al. 2025 fork의 task-optimized RNN에서 anchor-loss로 oblique attractor를 modulate하는 시뮬레이션 접근. **SYJ/syj_d2e_distractor_effect**는 discrimination-then-estimation 행동 패러다임으로 distractor가 WM 표상에 유발하는 attraction/repulsion bias 검정.
>
> **Q5.** 데이터 무결성 문제가 기록된 프로젝트는 둘이다. **BYL/biasvar**: 260330 오프라인 데이터(`.../main_durseconds_v2_768trials/data/` + eyedata)에서 (1) seconds-기반 구동분은 trial별 자극 지속시간 jitter 존재 — per-trial 실제값은 behaviorData CSV의 `target_gabor.stopped`−`target_gabor.started`로 산출, (2) frame 전환 후 Mac이 120Hz로 잘못 구동되어 공칭 0.05/0.5초가 실제 0.025/0.25초로 절반 단축. post-cue mask 데이터셋에서는 ID15 4세션(2026-05-18)과 ID18 4세션(2026-05-15)만 정상. 처리 = 공칭값 유지하되 timing_integrity_caveat로 영향 파일/실제값을 분리 기록, 분석 전 데이터 위생 단계로 분리. **SMJ/visual_search**: DYK ses01을 eyetracker calibration 사유로 제외, `legacy_current_lci_radius_bins_20260507_excl_dyk_ses01/` 및 `_20260514_uniform480_excl_dyk_ses01/` 두 산출물이 exclusion 반영본.
>
> **Q6.** _README에 따르면 SYJ가 JSL spatial serial-dependence onboarding을 진행했다는 전제는 오식별이며, 해당 row(SYJ/syj_jsl_sd_onboarding, phase=deprecated_stub, confidence_avg=0)는 [DEPRECATED STUB]로 모든 실질 필드가 null이다. 즉 DB상 "spatial serial-dependence" onboarding 프로젝트의 진행 상태나 결과에 해당하는 실질 데이터는 존재하지 않는다. SYJ의 실제 JSL follow-up 연구는 D2E distractor effect로, 4개 패러다임 버전 모두 null 결과이며 현재 lit-review 단계다. 따라서 질문이 가정한 "spatial serial-dependence" 프로젝트 자체의 상태/결과: 근거 없음(DB).
>
> **NOT-IN-DB: Q6**

### A.2 Sonnet (`claude-sonnet-4-6`)

> **Q1.** 두 가지 상보적 접근. **JOP/grannmds** — Non-metric MDS + Shepard generalization gradient: 8AFC confusion matrix에서 Shepardian similarity(λ)를 추출해 psychological space를 기하학적으로 재구성, granularity effect의 구조적 원점을 식별. **JOP/granrdt** — Rate-Distortion Theory: Blahut-Arimoto로 channel capacity 제약 하 mutual information vs distortion trade-off를 모델링, Power/ExpSat/Weibull 중 최적 cost function 식별. 두 프로젝트 모두 Lee et al. 2025 동일 데이터셋 재분석, geometric vs information-theoretic dual decomposition 의도.
>
> **Q2.** **BYL/biasvar** — EyeLink 1000 Plus, 온라인 이후 오프라인 세션에서 행동 데이터와 동시 취득한 pupillometry, BPR correction 분석(최우선). **JOP/ringrepsca** — EyeLink(.edf: g-matched 116, mean 23); 현재 raw .edf 위치 파악 단계, 분석 미실시, 구체적 analytic 역할은 DB에서 확인 불가. **SMJ/visual_search** — EyeLink; contour 위 fixation이 시각적 trap에 끌리는지 측정(gaze data가 종속변수).
>
> **Q3.** D2E 공유: **SYJ/syj_d2e_distractor_effect** + **BHL/bhl_paradigm_pilot**. SYJ와 BHL은 동일 실험(v1~v4)을 독립 분석한 공동 연구자(junior), 공통 멘토 JSL. v3→v4 전환 BHL 주도(size 차원 추가), v1→v2·v2→v3 JSL 주도. BHL/bhl_paradigm_pilot의 connected_graph는 SK/wmrepresentation_24_updated와의 공통점을 명시하되 D2E ≠ SK의 DET임을 정정(5/13 BHL 직접 확인).
>
> **Q4.** **BYL/biasvar**, **JYK/dynamic_bias**, **SYJ/syj_d2e_distractor_effect**. 공통: WM에 저장된 자극 표상이 어떻게 bias/왜곡되는가. 차이: BYL/biasvar — 행동+pupillometry, loss function heterogeneity로 bias-variability, RSA/MDS로 표상 geometry를 11개 외부 데이터셋 대비 측위. JYK/dynamic_bias — task-optimized RNN(PyTorch), anchor-loss 조작으로 oblique attractor make/unmake, Gu et al. 2025 fork. SYJ/syj_d2e_distractor_effect — 행동 D2E, distractor가 estimation에 미치는 attraction bias, 4버전 모두 null → lit_review.
>
> **Q5.** **BYL/biasvar** — postcueMask 데이터셋 timing integrity: 오프라인 수집 시 frame 기반 설정이나 실제 모니터 120Hz로 공칭 0.5·0.05초가 실제 0.25·0.025초로 절반 단축. 정상 = ID15 4번째 세션, ID18 4번째 세션만. 처리 = 오염 세션 제외, 정상 세션만 분석. **SMJ/visual_search** — DYK ses01 제외(EyeLink calibration로 gaze 정확도 저하, researcher 2026-05-18 확인); exclusion 반영 디렉토리 `legacy_current_lci_radius_bins_20260507_excl_dyk_ses01/`, `_20260514_uniform480_excl_dyk_ses01/`.
>
> **Q6.** SYJ/syj_jsl_sd_onboarding는 deprecated_stub, confidence_avg=0, 모든 실질 필드 null, 제목 자체가 "[DEPRECATED STUB] previously assumed JSL spatial-SD onboarding — actually misidentified". DB에 이 프로젝트가 실재했다는 근거 없음 — 오인 stub 행. _README 규칙상 substantive 답변 제외 항목이므로 현재 상태·결과 모두 근거 없음(DB).
>
> **NOT-IN-DB: Q6** (SYJ spatial serial-dependence 프로젝트의 실체적 현황 및 결과 — deprecated_stub만 존재, 실질 내용 전무)

### A.3 Haiku (`claude-haiku-4-5`)

> **Q1.** JOP의 granularity 효과 분석은 4가지 계산 모델로 접근된다. (1) **grannmds**: Non-metric MDS & Shepardian distance. (2) **granrdt**: Rate-Distortion Theory로 cost function 형태 식별. (3) **ringrepsca**: serial dependence/history effect의 estimation-only 구현으로 sensory adaptation과 decision-driven attractor 분리. (4) **time2dist**: skewed prior 학습이 posterior 분포 전체로 전이되는지 검증. GranNMDS와 GranRDT는 동일 Lee 2025 데이터셋 기반 상보적 분석.
>
> **Q2.** 3개 프로젝트. (1) **BYL/biasvar**: EyeLink 1000 Plus로 동시 수집한 pupillometry를 BPR correction 적용해 bias 역전 reconcile. (2) **JOP/ringrepsca**: Eyelink .edf 116개(g-matched)/23개(mean), edf2ASCII 변환→Python 후처리 필요 단계. (3) **SMJ/visual_search**: EyeLink로 concentricity trap 시각적 선호도 측정(current_lg cohort N=8).
>
> **Q3.** D2E 패러다임 공유 프로젝트 3개: **BHL/bhl_paradigm_pilot**(행동, distractor 효과), **SYJ/syj_d2e_distractor_effect**(lit_review_post_null). BHL과 SYJ는 공동 실험 자극 및 데이터 공유(independent analysis), SYJ는 JSL 멘토십 하 paradigm v1→v4 진화, v4 설계는 BHL 기여. 두 junior는 같은 D2E 데이터로 상보적 분석 진행 중.
>
> **Q4.** 3개. (1) **BYL/biasvar**: heterogeneous loss function(oblique penalty↑/cardinal penalty↓) 가설을 flexible tolerance 모델과 정량 검정, orientation manifold geometry가 stimulus duration에 따라 변하는지 RSA/MDS. (2) **JYK/dynamic_bias**: Gu et al. 2025 task-optimized RNN 확장으로 loss function이 oblique effect make/unmake 가능한지(anchor-loss). (3) **SYJ/syj_d2e_distractor_effect**: WM 내 첫 자극의 reference repulsion vs choice attraction. BYL은 representational geometry, JYK는 task-optimized dynamics, SYJ는 choice-distractor interaction 초점 차이.
>
> **Q5.** **JOP/time2dist**에서 데이터 무결성 이슈. Sbj 5는 task structure가 mid-collection 변경: day 1 (04-Mar baseline U) → day 2 (05-Mar→06-Mar redo, 최신 규칙으로 06-Mar 자동 채택) → 09-Mar/11-Mar/12-Mar. 12명 중 Sbj 5~12만 유효(Sbj 1~4 제외). 중복 세션은 "latest-session" 규칙 자동 적용으로 해결.
>
> **Q6.** deprecated_stub 행 제외 후, SYJ의 실제 JSL 관련 프로젝트는 **syj_d2e_distractor_effect**(phase=lit_review_post_null). JSL은 100% 멘토 역할만, v1→v4 의사결정 driver. 현재: null 결과(4 paradigm 모두 유의성 미확인, consistent attractive bias만 관찰), 새 가설 위해 Context/ 문헌 검토 중.
>
> **NOT-IN-DB: none**
