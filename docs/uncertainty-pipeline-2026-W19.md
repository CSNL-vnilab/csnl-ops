# Uncertainty Pipeline — Closed-Loop Q&A → Memory → Plan Evolution

> User directive 2026-05-12: "계속 질문-답변 사이클을 통해 메모리를 업데이트하고
> 플랜을 수정해나가는 진화를 이루면 되겠다." — design the system so each Q&A
> turn measurably refines (a) per-researcher uncertainty state, (b) project plan,
> (c) future NAS exploration targeting.

## 1. Loop topology

```
                  ┌──────────────────────────────────────┐
                  │ 1. NAS exploration (sub-agent, cron) │
                  │    /Volumes/CSNL_new-1/Memory/<I>/   │
                  │    + nas_optout.is_path_blocked()    │
                  │    + nas_optout.may_persist()        │
                  └──────────────────┬───────────────────┘
                                     ▼
                  ┌──────────────────────────────────────┐
                  │ 2. Uncertainty surfacing             │
                  │    (a) missing/zero/NaN patterns     │
                  │    (b) cross-subject divergence      │
                  │    (c) ambiguous design conventions  │
                  │    (d) NAS↔ledger fact mismatch      │
                  │    → state/uncertainty_queue.jsonl   │
                  └──────────────────┬───────────────────┘
                                     ▼
                  ┌──────────────────────────────────────┐
                  │ 3. Q draft generation                │
                  │    Opus interactive (CLAUDE session) │
                  │    or Qwen 3.6 35b MOE (after        │
                  │    fine-tune)                        │
                  │    output: tmp/dm_drafts/<I>_<d>.md  │
                  │    + (P1)~(P5) opt-out footer        │
                  └──────────────────┬───────────────────┘
                                     ▼
                  ┌──────────────────────────────────────┐
                  │ 4. Gate (operator-review OR autofire) │
                  │   First cycle: operator pre-check     │
                  │   Subsequent: memev_autofire_next_q   │
                  │   (standing approval 2026-05-12 with  │
                  │    8h throttle + tone lint + parrot   │
                  │    guard + 24h-since-last-outbound)   │
                  │   Compensating controls: periodic     │
                  │   meta-review + memory DB feedback    │
                  └──────────────────┬───────────────────┘
                                     ▼
                  ┌──────────────────────────────────────┐
                  │ 5. Send (slack_outbound.post)        │
                  │    + ledger.bot_outbound_messages    │
                  │    + ledger.outbound_questions       │
                  │    + ledger-vs-Slack post-send audit │
                  └──────────────────┬───────────────────┘
                                     ▼
                  ┌──────────────────────────────────────┐
                  │ 6. Inbound (realtime_listener)       │
                  │    parse (P1)~(P5) opt-out signal    │
                  │    insert inbound_messages           │
                  │    spawn harness_runner --poll-only  │
                  └──────────────────┬───────────────────┘
                                     ▼
                  ┌──────────────────────────────────────┐
                  │ 7. Memory delta                      │
                  │    memory_evolution.py (qwen3.6 MOE) │
                  │    confirmed_delta / inferred_delta  │
                  │    unknown_resolve / unknown_add     │
                  │    + _is_parrot guard                │
                  │    + dual-write camp.next_question   │
                  └──────────────────┬───────────────────┘
                                     ▼
                  ┌──────────────────────────────────────┐
                  │ 8. Plan revision                     │
                  │    long-term-plan-<cycle>.md         │
                  │    + per_member_planning             │
                  │    + carry_over alternates re-rank   │
                  │    + needs_operator_review queue     │
                  └──────────────────┬───────────────────┘
                                     ▼
                                (loop back to 1)
```

## 2. State files (truth surface)

| Path | Owner | Purpose | Mutation cadence |
|---|---|---|---|
| `state/ledger.db` | harness | inbound/outbound/feedback/blocked_paths | per event |
| `state/member_uncertainty.json` | memory_evolution | confirmed/inferred/unknown per researcher | */30min memev |
| `state/csnl_carry_over.json` | operator session | per-cycle PB top + alternates | weekly cycle |
| `state/nas_optout.json` | realtime_listener detect | (P1)..(P5) policy | per researcher reply |
| `state/uncertainty_queue.jsonl` | NAS-exploration sub-agent | pending Q candidates | per exploration cycle |
| `state/needs_operator_review.jsonl` | harness_runner | stale-researcher operator queue | per harness cycle |
| `state/memory_evolution_log.jsonl` | memev + opt-out audit | append-only audit trail | per memev / per opt-out |

## 3. Standardized (P1)..(P5) opt-out footer

Every NAS-grounded uncertainty Q draft MUST include this footer with
researcher-specific directory paths substituted:

```
(NAS 데이터 사용 정책 — 본 질문은 위 <FILE> 1 개의 1 회 read 결과를 기반으로 합니다.
본 형태의 NAS 탐사·메모리 저장이 불편하시면 (P1)~(P5) 중 하나로 회신해 주십시오.)

(P1) 본 분석 결과만 메모리 저장 X — read는 허용되나 long-lived state(state/
     member_uncertainty, state/csnl_carry_over, scratch_dir의 output.md/manifest.json
     등) 에 persist 금지. **단, P1 은 best-effort 정책입니다**: 한 번 LLM context 에
     포함된 텍스트는 그 sub-agent 의 그 turn 동안 모델이 "본" 상태가 되므로,
     summarized output 이나 derived 결정에 영향을 미칠 가능성을 100% 제거할 수는
     없습니다. P1 은 (i) 영구 file 저장 차단, (ii) `may_persist()` 통과한 caller 만
     long-lived state mutation 가능, 두 가지 기계적 enforcement 를 제공합니다.
     영향: 다음 cycle 에서 같은 uncertainty 재 surface 가능.
(P2) `<SPECIFIC_DIR>` 더 이상 탐사 X.
     영향: <명시>
(P3) `<PROJECT_DIR>` 전체 탐사 X.
     영향: <명시>
(P4) `<INIT>/` 전체 NAS 탐사 X.
     영향: 모든 personalization 제거 (Slack DM 기본 ack + reminder 만 유지).
(P5) 본 draft 자체 보류 — 응답 없이 폐기.
```

### Detection rule (realtime_listener.py)

```python
_OPTOUT_TOK_RE = re.compile(r'^\s*[\(\[]?P([1-5])[\)\]]?(?:[\s\.\,\:;。가-힣]|$)')
```

Matches `(P3)`, `P3`, `P3.`, `P3 ...`, `P3가 좋겠다`, `[P4]`, etc.
**Does NOT** match `(1) Sbj1`, `피드백 P1`, `I think P3 might`.

Tested 13/13 cases (see `realtime_listener._handle_optout_signal` + harness/tests).

### Code paths that MUST consult `nas_optout`

| Caller | Function call | When |
|---|---|---|
| `csnl_carry_over` generator | `is_path_blocked()` | before reading per-researcher NAS dirs |
| `memory_evolution` NAS-augmented mode | `is_path_blocked()` + `may_persist()` | before adding NAS-sourced confirmed_delta |
| paper rec scoring | `is_path_blocked()` | before parsing project keywords from NAS code |
| NAS exploration sub-agents | `is_path_blocked()` + `may_persist()` | at start of every uncertainty-surfacing run |
| harness_runner ack/reminder | (skip — uses only memory + ledger, no NAS) | n/a |

## 4. Ledger-vs-Slack audit (catches "거짓 기록")

The 2026-05-11 phantom-send investigation revealed: ledger entries can claim a
message was sent while the actual Slack outcome is different (e.g., thread reply
that the operator/researcher couldn't easily see). Mitigation: a daily script
that verifies every `bot_outbound_messages` row corresponds to a reachable Slack
message and matches the expected delivery mode (top-level vs thread).

```sh
python harness/code/ledger_audit.py --since 2026-05-11 \
  --check chat.getPermalink \
  --report state/ledger_audit.jsonl
```

Audit detects:
- `slack_ts` fabricated (chat.getPermalink → 404)
- `thread_ts` ≠ ledger's stored `thread_ts` (mismatch)
- Top-level expected (no `thread_ts`) but landed in thread (or vice versa)
- Channel mismatch (rare)

Mismatches are logged for operator review, NOT auto-repaired.

## 5. Plan revision after each cycle

`long-term-plan-2026-W19+.md` and `per_member_planning` in
`csnl_carry_over.json` should reflect the most recent state. After every
researcher reply that resolves ≥1 unknown:

1. memev applies delta → member_uncertainty
2. operator session reviews delta, decides if plan arc needs revision
3. update per_member_planning entry (or remove if resolved)
4. update long-term-plan section if cross-researcher implication

Currently this step is **manual** (operator-curated). Future automation:
sub-agent compares old vs new member_uncertainty, proposes plan-doc edits,
operator approves.

## 6. Throttling rules (sub-agent + cron + NAS bandwidth)

Per user directive 2026-05-11 ("탐사 속도는 천천히, 플랜 설계와 researcher
상호작용을 통해 long-term project 진행"):

- **NAS read budget**: ≤ 100 MB / hour during 09-22 KST
- **Sub-agent concurrency**: max 2 parallel (e.g., one NAS-exploration + one
  Codex review). Never >2.
- **Cron cadence**:
  - `*/30` memev — always on
  - `*/30 9-21 1-6` harness-runner — outbound-window only
  - `*/10` mirror-to-nas — observational, can lag
  - `30 9 * * 1-6` weekly_corpus_sync (light); `30 9 * * 0` (digest)
  - NAS-exploration sub-agent: **on-demand only**, not on cron
- **DM cadence per researcher**: ≤ 1 substantive Q per 24h (operator-curated)
- **Reminder cadence**: ≤ 1 / 24h, capped at 2 unanswered → abandon

## 7. Open design questions (for Codex adversarial review)

1. Where does the uncertainty-surfacing sub-agent live? csnl-ops (Vercel
   Functions, cron-invoked) vs harness/code_v3 (local Mac Studio cron) vs
   ad-hoc Opus session invocations only?
2. opt-out P2/P3 paths are resolved from the bot's prior outbound text via
   regex. Is that robust enough, or should the bot embed a hidden metadata
   block (`payload.metadata`) that the listener parses unambiguously?
3. Plan revision step (8) is currently manual. Can it be safely automated
   (Qwen 3.6 35b MOE) with operator review gate?
4. Should `state/uncertainty_queue.jsonl` be reified as a `ledger.db` table
   with status tracking (pending / drafted / sent / resolved / dropped)?

## 8. Migration / scope

This doc supersedes the loose "next_question" mechanism described in
`meta-review-2026-05-11.md` §3 — that was a quick fix for parroting + dual-write.
The closed-loop architecture here is the longer-term shape; the meta-review
patches (parrot guard, MAX_AUTO_REMINDER_SILENCE_HOURS, mirror-fix) remain
correct but get re-framed as components of step 7 (memory delta) and the
operator-review gate (step 4).

Codex adversarial review is requested per user directive ("Codex GPT 5.5의
adversarial review를 3회 받을 것") on (a) this architecture, (b) the
nas_optout module, (c) the audit script — separate PRs.
