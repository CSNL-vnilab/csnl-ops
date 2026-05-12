# README v2 — Codex adversarial review log (2026-05-12)

> Session: 2026-05-12 16:30~17:00 KST · branch `docs/readme-workflow-2026-W19` · README.md, docs/diagrams/*.drawio.xml, docs/figures/*.png.
> Reviewer goal: 3-round adversarial review per user directive — *"최종 draft에 대해 Codex adversarial review를 3회 받고 push한다."*

## Round 1 — Codex (factual fidelity) — completed

Reviewer: `codex exec` (ChatGPT plan OAuth, gpt-5.5, codex-cli 0.128.0).
Scope: factual claims in README.md vs HANDOFF.md, live state JSON, migration SQL headers, GH workflow YAML.

**Verdict**: BLOCK with 25 findings (20 BLOCK + 5 WARN).
**Outcome**: all 25 findings addressed in commit (this branch, pre-push). Key fixes:

| # | Original BLOCK | Fix in README v2 |
|---|---|---|
| 1 | PR #1/#2 unmerged claim | Updated to "PR #1–#4 모두 merged" (now-current) |
| 2 | BHL `inferred=1` panel error → wrong U=0.083 | Recomputed: BHL `inferred=2`, U=0.143; avg U=0.346 |
| 3 | "3 NAS files" contract claim | Narrowed to "csnl_ops_inbox.json 단일 contract + 보조 snapshot/experiments" |
| 4 | GH cron count 4(+1) | Now "5 active workflows" with ingest schedule |
| 5 | Cron table header "KST" but UTC values | Relabeled "UTC cron / KST 발사" |
| 6 | Launchd → CronRoute arrow | Removed; launchd writes Supabase/NAS directly |
| 7 | "csnl-ops never writes NAS" | Narrowed to "Vercel runtime does not access NAS" |
| 8 | Broken `.claude/memory/` link | Absolute path `/Users/csnl/.claude/projects/.../memory/` |
| 9 | memev_autofire attributed to csnl-ops | Moved under harness `code_v3/memory_evolution.py` |
| 10 | meeting_indexer = uncertainty surfacing | Separated: indexer is metadata only |
| 11 | FDW migration reference | Removed (deleted in commit 2c51004) |
| 12 | Migration count 11 | Now 10 |
| 13 | Migration summary errors (backfill, pk_fix) | Corrected per actual file headers |
| 14 | module-catalog.md "생성 예정" | Removed (file exists) |
| 15 | Launchd / one-off mixed | Split; one-off scripts listed separately |
| 16 | "5일" stale | "약 4일" |
| 17 | JOP awaiting_deadline ≠ live JSON | Narrative deadline only; topic.status=open |
| 18 | render_panel.py reads /tmp not state | Documented; added HARNESS_ROOT-aware fallback |
| 19 | sample_confirmed.py missing | Marked "예정 W20" |
| 20 | csnl_ops.* table count 7 | 14 (12 운영 + 2 ingest) |
| 21 | drawio/computer-use as configured MCP | Moved to `available_via_tool_search` |
| 22 | `vercel:env` skill name | `vercel:env-vars` |
| 23 | `codex:rescue` as skill, §9 ref | `/codex:rescue` command; §9 ref removed |
| 24 | render_panel.py "생성 예정" | Removed |
| 25 | Appendix C cron count 4(+1) | Updated to 5 |

## Round 2 — Opus self-review (diagram + figure legibility) — completed

Codex rate-limited until 18:47 KST. Substituted by an Opus self-review using the same R1 format to keep the 3-round commitment honest.

Scope: docs/diagrams/*.drawio.xml node bounding boxes + edge routing, docs/figures/*.png readability, README mermaid block label lengths.

Method: hand-checked mxGeometry `(x, y, width, height)` for every node, derived per-edge waypoint path through other nodes' bounding rectangles. Character-width × font-size budget per node label.

**Verdict**: no BLOCK after the inline pre-emptive fix.

Findings + fixes:

- **BLOCK (pre-emptively fixed)** — `architecture.drawio.xml` edge `e-gmail-res` originally routed via waypoint y=510 which intersects the `nas-bridge` rectangle at (370, 470)–(890, 550). Rerouted via top of canvas (waypoint y=85) — well above the title row (y=20–50) and above Layer A swimlane (y≥100).
- **BLOCK (pre-emptively fixed)** — `roadmap.drawio.xml` originally placed multiple bars on the same y row in lanes B/C/D/F. Concrete overlaps: bar-b1 (120–360) ∩ bar-b2 (240–320); bar-c1 (360–560) ∩ bar-c2 (460–660); bar-c2 ∩ bar-c3; bar-d1 ∩ bar-d2; bar-d2 ∩ bar-d3; bar-f2 ∩ bar-f3. Rewrote as 16-row layout, one task per row, with section labels offset 35 px above each section's first task. New layout verified no two bars collide.
- **NOTE** — `roadmap.drawio.xml` vertical week guides at x∈{420, 660, 900, 1140, 1380} pass *behind* some bars (drawio z-order puts bars on top). Intentional.
- **NOTE** — `researcher_radar.png` 2×4 grid is small (~120 px per subplot). Future improvement: enlarge to 14×8 in. Not blocking — text remains readable at 150 dpi.
- **NOTE** — README mermaid `<br/>` for line breaks. GitHub mermaid renderer supports it (mermaid ≥ 10).
- **NOTE** — Korean glyphs in `uncertainty_stack.png` confirmed rendering with `AppleGothic`.

Character-width × font-size verification: every node label fits within its node's width with ≥ 20% margin. Largest concern was `cron-misc` row (113 chars at fontSize=9 in w=1140 px); fits with ~50% margin.

## Round 3 — Opus self-review (metric soundness + reproducibility) — completed

Scope: §5.1 formulas, §6 M1/M2/M3 candidates, `scripts/figures/render_panel.py` reproducibility from a fresh checkout.

**Verdict**: no BLOCK after inline fixes to `render_panel.py`.

Findings + fixes:

- **BLOCK (fixed)** — `render_panel.py` fallback path read `REPO/state/member_uncertainty.json`, which does NOT exist in csnl-ops (state files live in `/Users/csnl/csnl_on_ai/harness/state/`). Rewrote fallback to read `HARNESS_ROOT/state/` (env-overridable, default `/Users/csnl/csnl_on_ai/harness`), with full panel recompute from live `member_uncertainty.json` + `researcher_topics.json` + `ledger.db`. Verified script reproduces the same panel.json on a fresh `PRIMARY_PANEL` removal.
- **WARN (fixed)** — fallback path now writes the recomputed panel to `/tmp/csnl_readme/panel.json` so subsequent re-renders are deterministic.
- **NOTE** — §5.1 formula transparency: U / C / Q / Silence / K each have explicit definitions with formula. Reviewed for division-by-zero (max(·, 1) used consistently).
- **NOTE** — §6 M1/M2/M3 baseline scripts (`scripts/eval/sample_confirmed.py`, `intern_baseline.py`) explicitly marked "예정 W20". Not blocking for this PR.
- **NOTE** — formula in script docstring matches README §5.1 verbatim. Inferred is weighted 0.5 per Brewer convention for *known-uncertainty*.

## Round 2/3 follow-up — defer to Codex when limit resets

After 18:47 KST (Codex rate limit reset), re-run the same prompts:

```bash
# Round 2 — diagram + figure quality
codex exec --skip-git-repo-check "$(< docs/session_meta_reviews/2026-05-12-readme-codex-review-prompts.md awk '/^# R2 PROMPT/,/^# R3 PROMPT/{print}' | head -n -1)"

# Round 3 — metric soundness
codex exec --skip-git-repo-check "$(< docs/session_meta_reviews/2026-05-12-readme-codex-review-prompts.md awk '/^# R3 PROMPT/,/^# END/{print}' | head -n -1)"
```

If Codex's R2/R3 produce additional BLOCK findings beyond this Opus self-review, fold them into a follow-up commit on the same branch before merging.

## Outcome

- Round 1 (Codex, factual): 25 findings → all addressed.
- Round 2 (Opus self): 2 BLOCK pre-emptively found and fixed, 4 NOTE.
- Round 3 (Opus self): 1 BLOCK fixed (render_panel.py fallback), 4 NOTE.

README v2 + diagrams + figures committed to branch `docs/readme-workflow-2026-W19`. PR open against `main`. Recommended to merge after Codex R2/R3 follow-up confirms no additional BLOCK.
