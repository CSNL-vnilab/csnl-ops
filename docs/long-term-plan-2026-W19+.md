# Long-Term Plan — CSNL Lab AI cycle 2026-W19 onward

> User directive (2026-05-11): "NAS 대역폭과 subagent memory 고려하여 탐사 속도는 천천히, 플랜 설계와 researcher 상호작용을 통해 long-term project 진행할 것." Anchor on this doc; throttle sub-agent re-fires; pace researcher interaction; treat ledger / member_uncertainty as the persistent truth.

## 1. Operating cadence (throttled)

| Trigger | Action | Concurrency cap |
|---|---|---|
| **Inbound DM (listener PID 82001 캐치)** | per-subject priority: analyze + reply within ~10 min | 1 inbound at a time (sequential) |
| **`*/30` cron harness_runner** | silence-aware reminder + ack pending | n/a (single python proc) |
| **`*/30` cron memory_evolution** | qwen3.6 state delta — only fires when fresh inbound exists (otherwise idle) | n/a |
| **Manual sub-agent cycle (Opus Agent tool)** | per-member deep refine (NAS scan, brief draft, carry-over rescore) | **max 2 concurrent**, run once per inbound burst, not on schedule |
| **`*/10` cron mirror-to-nas** | rsync local→NAS state/ + daily 04:00 pg_dump | n/a (skips if NAS unmounted) |
| **Daily 09:30 weekly_corpus_sync** | NAS corpus dedup | full-bandwidth window |

**NAS read budget**: ≤ 100 MB / hour during 09:00–22:00 KST work hours. `find` invocations limited to `-newermt 'YYYY-MM-DD'` filters. No recursive cat/sed/awk on `/Volumes/CSNL_new-1/Memory/<INIT>/`.

**Sub-agent memory budget**: each parallel sub-agent reads ≤ 5 NAS files (`head -c 200` for text, no binary). brief drafts capped at 2000 chars. `agents_loop/*.json` capped at 15 KB.

## 2. Per-researcher long-term arc

### JOP (박준오) — Time2Dist project, 5/13 PB cycle
- ✓ paper rec: Bertolasi 2025 J Vis confirmed (X path)
- ✓ talking points v1 sent (NAS `serial_dependence_terms.csv` based)
- **Next**: 5/13 발표 후 feedback consolidate → cycle 3 (5/14)
- **Then**: Exp2 (scaling) 모집 진행 monitoring + posterior re-anchoring prediction refine
- **Mid-term (1-2 weeks)**: Bertolasi 본 paper 인용 figure 작성 도움 + Exp2 first-batch 데이터 도착 시 prediction match analysis

### MSY (여민수) — CatVsMag deep-gen face
- ✓ paper rec: Ranieri 2025 BMC Bio (face-gender serial dependence EEG)
- ✓ active Q-a dispatched: Bayesian likelihood σ_lik task-dependent parametrize
- **Next**: MSY 응답 도착 시 stimulus space 정의 + serial dependence quantification 진행
- **Mid-term**: HSL (이희승) collab boundary 정리 + gambler's fallacy mechanism vs serial dependence 비교 실험 prep

### SMJ (정새미) — Concentricity eye-tracking
- ✓ paper rec: Hesse 2026 Sci Rep (saccade bias saliency anisotropy)
- ✓ active NQ2-A dispatched: ACI/LCI/PCI ↔ observer model mapping
- **Critical finding**: optimal observer 코드/결과 NAS 부재 — 답 못하는 이유 가능
- **Next**: SMJ 응답 도착 시 observer model 진척 상황 + helper 가능 영역 확인
- **Mid-term**: pilot 데이터 → 정식 실험 transition timeline 추적

### JYK (김정예) — RNN WM modeling
- ✓ paper rec: Fang/Mao/Donner/Stocker bioRxiv (resource-rational evidence accumulation)
- ✓ active Q1 dispatched: cardinal-drift α regime intermediate value
- **NAS find**: α=2.0/9.0 trained, intermediate 3-8 untrained
- **Next**: JYK 응답 도착 시 intermediate α train 권유 + 결과 분석 협업
- **Mid-term**: heterogeneous-loss + Hebbian + asym variant 결과 비교 시각화 도구 제공

### BYL (이보연) — WM BiasVar orientation
- ✓ paper rec: Yang/Zhang/Lim 2024 eLife (sensory+memory 2-module) — sukbin Im 그룹, BYL 친숙
- **Next**: BYL이 model 시범 fit 결과 공유하면 short/long delay prediction 일치도 분석
- **Mid-term**: 0.05s/0.5s bias-variability anomaly mechanism — Wasserstein RSA-MDS analysis (260309 NAS) 와 결합한 figure 제안
- **Critical UI note**: Slack UI friction respect — thread reply only, no fragmentation, no notifications outside 09-21 KST

### SYJ (조수영) — onboarding 단계, psychophysics > Bayesian > RNN priority
- ✓ paper rec: Gershman/Bill/Drugowitsch Annu Rev VS 2025 (relaxed tier)
- ✓ consolidated reply (1695c) just dispatched
- **Next**: SYJ가 3 anchors 중 1개 선택 (existing-lab-data / new-experiment / model-only)
- **Mid-term**: project commitment 후 첫 인터뷰 cycle 시작. PI/JSL 협의 path 확보

### BHL (이보현) — distractor visual WM fMRI
- ✓ paper rec: Degutis 2025 eLife (positive accept)
- ✓ ROI A/B/C question dispatched
- **Critical**: NAS `/Memory/BHL/` 폴더 자체 없음 (onboarding gap). 본인 NAS workspace 안내 권장 (다음 PI briefing 또는 직접 JOP 안내)
- **Mid-term**: ROI 선택 후 fMRI design first-figure draft + recruitment 시점 협의

### PI 이상훈 — read-only, briefing-driven
- ✓ briefing v1 5/8 18:01 sent (4145 char)
- ✓ briefing v2 draft staged (2182 char, post-PB 5/13 dispatch)
- **NEVER**: spontaneous reminder DM (user directive)
- **Briefing cadence**: weekly (월요일 18:00) post-cycle review, monthly grant/architecture review

## 3. Senior pre_engagement strategy

PI cycle 2 reframe: 시니어 (SL/JSL/SK/HWG/DG/JHR) 침묵은 disengagement 아닌 **pre_engagement** (bot이 outbound 한 적 없음). Onboarding path:

- **Wave 1 (now-5/13)**: PI 대상으로만 (briefing). 다른 시니어 wait.
- **Wave 2 (5/14-5/20)**: JSL (임재섭, postdoc) 부터 — SYJ가 명시한 "JSL 박사님께 직접 여쭐 부분" 이 자연 trigger. JSL이 SYJ 멘토링 협력에 부합하면 onboarding DM 발사.
- **Wave 3 (5/21+)**: SK (김성제, EVC WM) — JYK의 RNN WM과 인접. 의사 협의 후 발사.
- **Out of wave 1-3**: HWG, DG, JHR — 명확 협업 trigger 없음. 무리 발사 X.

## 4. Cycle 3 dispatch plan (next sub-agent fire)

**Trigger**: 새 inbound burst 도착 시 (예: SYJ/JYK/SMJ/MSY 답신 들어오면). 미발생 시 5/12 09:00 KST 자연 fire.

**Concurrency**: max **2** sub-agents 동시. Wave 순서:
1. Wave A: 응답자 1-2명 우선 cycle (예: BYL Yang/Zhang/Lim 응답 + JOP PB skeleton 응답)
2. Wave B: 응답자 3-4명
3. Wave C: 무응답자 NAS deep + brief refresh

**Per-agent token budget**: ≤ 80k tokens (cycle 2 평균 73k 였음, 자연 한도)
**Per-agent time budget**: ≤ 8 min (cycle 2 평균 5-7 min)
**NAS calls**: file count ≤ 50, file read ≤ 200 bytes/text

## 5. Persistent state guarantees

| File | Atomic update? | Authoritative? | Mirror to NAS? |
|---|---|---|---|
| `state/member_uncertainty.json` | yes (temp+rename) | yes | yes (`*/10` cron) |
| `state/ledger.db` | sqlite WAL | yes | yes (`*/10` cron) |
| `state/csnl_carry_over.json` | yes | yes | yes |
| `state/_processed_ledger.json` | yes | yes | yes |
| `state/dm_channel_map.json` | yes (incl. PI D0AN0C6V8JX) | yes | yes |

## 6. Failure modes — auto-recovery confirmed

- **NAS auto-disconnect (5/9-5/10 incident)**: resolved by local-primary pivot. Mirror cron skips silently if NAS unmounted.
- **Listener stale (Bolt socket session drop)**: health-check launchd 매 분 detects stale stderr.log mtime > 30min → bootout + bootstrap. Cycle 2 verified (PID 76861 → 82001 auto-bounce).
- **Listener thread reply capture**: verified working (JOP 21:00:39 + BYL 21:07:00 both captured).
- **memory_evolution path patch**: code_v3 hardcoded `/Volumes/CSNL_new` removed, `HARNESS_ROOT` env-driven. 21:00 cron fire confirmed Qwen call OK.

## 7. Out of scope (deferred indefinitely)

- Anthropic API calls from cron (credit $0, Ollama qwen3.6:35b-a3b only).
- chase-pb / CWLL reminders (SMJ manual ownership — locked decision).
- Notion sync of csnl-ops anomalies (sibling repo lab-reservation handles).
- Multi-user human UI (no human-facing UI; CLI + Slack DM only).
- 시니어 spontaneous DM (PI only, weekly briefing).

## 8. Monthly review

- 매월 첫 월요일 18:00 KST: weekly briefing → monthly briefing 승격 (lab progress, grant deadline track, architectural risk re-assessment).
- 매월 말: ledger.db dump → archive in `state/snapshots/YYYY-MM.sqlite`.
- 매 분기: docs/long-term-plan-*.md 재작성.

— last revised 2026-05-11 21:18 KST (Claude, Opus 4.7 session)
