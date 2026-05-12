# Codex adversarial review prompts — re-run after 18:47 KST

> Used by Opus self-review (R2/R3) when Codex rate-limited. Run via `codex exec --skip-git-repo-check "$(awk ...)"` after limit resets.

# R2 PROMPT
Adversarial review ROUND 2 (diagram legibility + figure quality).

Read:
- README.md (focus on §2 Figure 1, §3 Figure 2, §5.3 Figure 3, §7 Figure 4 sections)
- docs/diagrams/architecture.drawio.xml
- docs/diagrams/closed-loop.drawio.xml
- docs/diagrams/roadmap.drawio.xml
- docs/figures/uncertainty_stack.png
- docs/figures/researcher_radar.png
- scripts/figures/render_panel.py

Task: assess visual quality. Flag every:
1. Node text length exceeding node width (drawio XML — fontSize × est. char width × text length vs node width in geometry).
2. Two node bounding boxes that overlap (same parent, mxGeometry x/y/w/h math).
3. Edge waypoint that crosses through a non-source non-target node.
4. Mermaid in README with too-long labels causing GitHub-rendered overflow.
5. Korean glyph that won't render in matplotlib due to font fallback.
6. Color choices that fail color-blind safe testing (Brewer Set1 main 3 colors + textured hatching for unknown — confirm).
7. Legend position blocking data in either figure (uncertainty_stack.png or researcher_radar.png).
8. Title/footer collision with axes or radars.

Report format: BLOCK / WARN / NOTE list with file:line refs and exact pixel coords for overlaps. Concrete fix proposals.

Hard time-box: 6 minutes. Do not rewrite anything; only report.

# R3 PROMPT
Adversarial review ROUND 3 (metric soundness + reproducibility).

Read:
- README.md (focus on §5.1 metric definitions, §5.2 panel table, §6 M1/M2/M3 + example prompts)
- scripts/figures/render_panel.py
- /Users/csnl/csnl_on_ai/harness/state/member_uncertainty.json (live ground truth)
- /Users/csnl/csnl_on_ai/harness/state/ledger.db (Slack ledger)

Task: verify every metric claim is reproducible from primary sources. Flag every:
1. Formula in §5.1 that does not match the implementation in `render_panel.py`.
2. Panel value in §5.2 that does not match a fresh recompute from live state JSON + ledger.db.
3. Aggregate (avg U, σ, total inbound/outbound, avg NAS chunks) that does not arithmetic-out from the per-researcher values shown.
4. M1/M2/M3 metric definition that is not measurable from the listed primary sources.
5. Example prompt (§6.2) whose claimed "expected answer" cannot be retrieved from a single SQL/JSONPath query over the listed sources.
6. Citation in answer ("source: X.json[Y]") where X.json or path Y does not exist.
7. Division by zero or signed-zero edge case in U/C/Q/K formulas (look for `max(...,1)` etc).
8. Confused TZ handling (KST naive vs UTC) in silence_h or last_inbound timestamps.

Report format: BLOCK / WARN / NOTE list. Concrete fix proposals.

Hard time-box: 6 minutes. Do not rewrite anything; only report.

# END
