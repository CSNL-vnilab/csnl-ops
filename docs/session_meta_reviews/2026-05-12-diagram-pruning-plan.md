# Diagram pruning plan (2026-05-12, after user feedback)

> User directive: "jargon 줄이고, 텍스트 가독성 높여. 색깔과 화살표 난잡하고 텍스트가 너무 많음. 어떤 것을 schematic illustration으로 구현할지 상세한 plan을 먼저 세우고, pruning 후 핵심만 그리도록 전송 & visual QC 여러 차례 진행하여 가독성을 높일 것. 핵심이 전달되어야만함."

Three figures need rebuilding. Visual budget hard caps; visual QC ≥3 iterations per figure via drawio MCP.

## Visual budget — applies to all three figures

- **Color palette**: max 3 colors total (2 distinguishing + 1 neutral). Each color must encode **one** semantic axis (e.g., who owns it, or what kind of action).
- **Nodes per figure**: ≤ 10 (was 14–18).
- **Edges per figure**: ≤ 10 (was 13–17).
- **Text per node**: ≤ 3 lines, ≤ 30 chars per line.
- **Title + footer only** — no inline annotations on edges unless they are the *core* message.
- **No emoji, no Unicode block markers, no nested swimlanes** unless absolutely needed.
- **Whitespace**: ≥ 40 px gap between nodes; arrow waypoints never pass through any non-source non-target node bounding box.
- **Single canonical label per node** — no parenthetical sub-clauses inside the node text. Detail moves to README prose.

---

## Figure 1 — Architecture (one sentence)

**Core**: *"Two layers cooperate over a single shared file: csnl-ops writes the inbox, the harness reads it and talks to researchers."*

Reduced element list (target ≤ 7 nodes, ≤ 7 edges):

| Node | Role |
|---|---|
| Researchers | 7 인 (Slack DM) |
| csnl-ops (left layer) | calendar/email/Supabase 운영 |
| Supabase (small DB icon under csnl-ops) | csnl_ops.* schema |
| Inbox file | shared NAS bridge — *one* file `csnl_ops_inbox.json` |
| harness (right layer) | Slack listener, memory, Qwen LLM |
| Local DB (small DB icon under harness) | ledger.db + member_uncertainty.json |
| Ollama (chip aside harness) | Qwen + bge-m3 |

Edges (≤ 7):
1. csnl-ops → Supabase (write)
2. csnl-ops → Inbox file (daily write)
3. Inbox file → harness (read)
4. harness ↔ Local DB
5. harness → Ollama (local LLM)
6. harness ↔ Researchers (Slack DM bidirectional)

**Drop** from previous version:
- GH Actions cron block (mentioned in §4.1 instead)
- All 5 cron route names
- lib-modules box (purely directory listing)
- launchd-scripts as separate node (merge into csnl-ops)
- cron-misc strip listing 5 Python modules
- Topic-switcher + memev + slack-outbound + harness-runner as separate nodes (merge into "harness")
- Gmail SMTP separate node (merge into csnl-ops since it's just one outbound channel)
- Google Calendar separate node (it's an *input* — replace with one arrow labeled "Calendar / Email")
- pgvector + statejson + ledger as 3 cylinders → 1 "Local DB" icon
- Legend (too text-heavy) — single short caption suffices

**Color**:
- csnl-ops layer = blue (Vercel-ish)
- harness layer = pink (was used in v1, keep)
- Bridge file = neutral yellow
- Researchers = green (active humans)

---

## Figure 2 — Q&A Loop (one sentence)

**Core**: *"Ask → Receive → Update memory → Reflect → Ask again. The operator approves first-ever questions; the researcher can opt out with a P-code."*

Reduce 8 stages to **4 phases**:

| Phase | Combines old stages | Single short label |
|---|---|---|
| Phase A — Ask | ① NAS scan + ② surfacing + ③ NQ draft + ④ gate + ⑤ send | "질문 발사" |
| Phase B — Receive | ⑥ inbound | "응답 수신" |
| Phase C — Update | ⑦ memory delta | "메모리 업데이트" |
| Phase D — Reflect | ⑧ plan revision | "계획 갱신" |

Side branches (≤ 2):
- Operator gate (above Phase A) — "첫 질문은 사람이 검토"
- Opt-out (right of Phase B) — "P1–P5 응답 시 정책 갱신"

Edges (≤ 6):
1. A → B
2. B → C
3. C → D
4. D → A (loop back)
5. Operator → A (manual approve)
6. B → Opt-out → C (sidebar feedback)

**Drop** from previous version:
- All technical module names (memev, Qwen3.6, parrot guard, etc.)
- The 6-bullet opt-out P1..P5 enumeration → 1-line caption
- The "state files mutated" sketch box → README has it
- Cycle entry node → arrow alone
- "throttle / dedup / hash" technical labels on the gate

**Color**:
- 4 phases = single blue gradient (light to dark) for sequence emphasis
- Operator branch = warm yellow
- Opt-out branch = warm yellow
- That's it.

---

## Figure 4 — Roadmap (one sentence)

**Core**: *"Three milestones (M1 autonomous loop, M2 unknown resolution, M3 intern Recall@5) span 6 weeks; the present is W19."*

Reduce 16-task gantt to:
- 6 week ticks on a horizontal axis
- 3 milestone diamonds at their target weeks
- 4 *underlying* workstream bars (one per milestone + 1 routine)
- A clear "오늘 (W19)" marker

Final element count: 6 ticks + 1 axis + 3 milestones + 4 bars + 1 today-marker + title + caption = ~16 elements (was 60+).

**Drop**:
- All 16 task labels → keep only 4 most load-bearing
- Section labels (A/B/C/D/E/F) → unnecessary categorization
- Vertical week guides → axis ticks suffice
- Legend with 6 colors → 2 colors only

The 4 retained bars (mapped to milestones):
1. "Cycle 3–7 weekly run" → spans W19–W24 (routine, blue)
2. "outbound_questions + intern baseline" → W20–W21 (work for M3)
3. "NAS broad scan + senior consent" → W20–W22 (work for M2)
4. "Qwen FT + agent layer" → W22–W24 (work for M3)

3 milestones (red diamonds) at fixed weeks:
- M1 (autonomous loop) — end of W20
- M2 (unknown resolved) — end of W22
- M3 (intern Recall@5 ≥ 0.80) — end of W24

**Color**:
- Routine bar = blue
- Workstream bars = orange (LLM/agent work)
- Milestones = red diamond
- Today marker = green vertical line
- That's it.

---

## Visual QC iteration plan (per figure)

For each figure, ≥ 3 iterations via drawio MCP `mcp__drawio__open_drawio_xml`:

| Iteration | Focus |
|---|---|
| 1 | Layout draft — verify element placement does not collide. |
| 2 | Text legibility — every label fits within its node; no clipping; sentence-case Korean / English. |
| 3 | Color & arrow QC — final palette pass, ensure no edge passes through a non-source/non-target node. |

If iteration N reveals a structural issue, restart from N=1 for that figure.

## Out of scope for this pruning pass

- matplotlib figures (Figure 3a/3b) — already pass legibility (84KB stack + 229KB radar). Keep as-is.
- README §0–§8 narrative — separate pruning task #15.
