# 3-Tier Subagent Architecture (2026-05-13, rev 2 — channel layer added)

> Operator directives:
> - 2026-05-13 13:10 KST: 3-tier orchestration (1 orchestrator + 7 subagents Opus + N sub-sub agents Sonnet).
> - 2026-05-13 13:50 KST: 7 private Slack channels `<INIT>_claude` per researcher. Past-session work summary posted there. Per-session continuation lives in those channels.
>
> Target: 7명 전원 uncertainty 최소화, 2026-05-14 14:00 KST.

## 0. Tiers and exact responsibility lines

| Tier | Model | Cardinality | Writes | Reads |
|---|---|---|---|---|
| Orchestrator | Opus 4.7 (1M context) | 1 (this Claude session) | `state/orchestrator/*`, harness/hook/workflow code, `<INIT>_claude` channel posts for handoff | safe_memory.jsonl × 7, channel_map.json |
| Subagent | Opus 4.7 | 7 (one per researcher) | `state/subagents/<INIT>/{context.md, dm_log.jsonl, safe_memory.jsonl, exploration_plan.md, pending_drafts.md, channel_handoff_*.md}` | own state, member_uncertainty[INIT], nas_inventory[INIT], ledger filtered to INIT, own `<INIT>_claude` channel history |
| Sub-sub agent | Sonnet | N per subagent (on demand) | `state/subagents/<INIT>/nas_runs/<UTC>_<run_id>.jsonl` | nas_inventory + scoped NAS subpaths only |

### Hard invariants (never violate)

1. Orchestrator does NOT touch `dm_log.jsonl` or `bot_outbound_messages` for researcher DMs. Substantive researcher DM authoring + sending = subagent only.
2. Subagent does NOT touch `nas_inventory.json` or raw NAS `/Volumes/CSNL_new-*/`. NAS read goes through a sub-sub agent dispatch.
3. Subagent A does NOT read subagent B's state directory. Cross-researcher information flows only via orchestrator → safe_memory merge.
4. Sub-sub agent is stateless. Each invocation writes one new `nas_runs/*.jsonl` file and exits. Never reads prior sub-sub runs (subagent aggregates).
5. Orchestrator's 1M context holds only *solid memory* (confidence ≥0.85). Draft text, raw NAS dumps, low-confidence inferred stays in subagent's local files.
6. Researcher DM fires across subagents serialize via `state/orchestrator/fire_lock` (flock) with 6s sleep before release. No two DMs within 5 s.
7. Each subagent posts a handoff summary to its own `<INIT>_claude` Slack channel at the start of every session (so the next session can resume from Slack history alone if state files are lost).

## 1. Per-researcher channel layer (NEW 2026-05-13 rev 2)

### Channel naming convention

The 7 private channels are named `<init lower>_claude` or `<INIT>_claude` (try
both casings on discovery). They are *private* Slack channels intended as the
operator-visible audit log for each researcher.

| INIT | Researcher | DM channel (bot ↔ researcher) | Audit channel (`<INIT>_claude`) |
|---|---|---|---|
| JOP | 박준오 | D0AMRACTLBH | `jop_claude` (id resolved at runtime) |
| BYL | 이보연 | D0AN6PMLWCS | `byl_claude` |
| MSY | 여민수 | D0AP128V9DE | `msy_claude` |
| SMJ | 정새미 | D0AN0CHTJP5 | `smj_claude` |
| JYK | 김정예 | D0AN3B8K0CD | `jyk_claude` |
| BHL | 이보현 | D0AN6PXAESE | `bhl_claude` |
| SYJ | 조수영 | D0AN4N0278E | `syj_claude` |

### Required Slack scopes (one-time setup)

The bot currently has:
```
search:read.users, calls:read, channels:history, im:read, files:read,
app_mentions:read, channels:join, channels:manage, chat:write, im:write,
assistant:write, commands, incoming-webhook, im:history, reactions:read,
users:read, reactions:write, channels:read, search:read.private,
chat:write.public, files:write
```

To access *private* `<INIT>_claude` channels the bot needs the following
additional scopes (add via Slack App → OAuth & Permissions → Reinstall):

- `groups:read` — list private channels bot is member of
- `groups:history` — read past messages in private channels
- `groups:write` (optional) — post to private channels bot is member of (chat:write covers this for member channels)

After scope reinstall, the user must `/invite @claudebot` in each of 7
`<INIT>_claude` channels (one-time per channel). The bot does NOT auto-join
private channels.

### Channel permissions model

| Layer | Read | Write |
|---|---|---|
| `<INIT>_claude` channel members | operator (user) + bot | both |
| Bot | yes (after scope + invite) | yes (chat:write) |
| Other researchers / lab | no (private channel) | no |
| Other subagents | NO (invariant #3) | NO |

Each subagent posts ONLY to its own audit channel. Cross-channel writes are
forbidden by invariant.

### `channel_map.json` format

```json
{
  "JOP": {"id": "C0XXXXXXXX", "name": "jop_claude", "is_private": true, "is_member": true, "topic": "..."},
  "BYL": {"id": "...", "name": "byl_claude", ...},
  ...
}
```

Path: `/Users/csnl/csnl_on_ai/harness/state/subagents/channel_map.json`.
Discovery script: `scripts/discover_claude_channels.mjs` (see §6).

## 2. Per-subagent state schema

```
state/subagents/<INIT>/
├── context.md              # subagent 의 running memory (markdown)
├── dm_log.jsonl            # researcher DM audit (subagent → researcher channel)
├── safe_memory.jsonl       # facts to forward to orchestrator
├── exploration_plan.md     # 다음 sub-sub agent 호출의 plan + scope
├── pending_drafts.md       # DM drafts NOT yet fired (hold/P4)
├── channel_handoff_YYYY-MM-DD.md  # session-end summary posted to <INIT>_claude
└── nas_runs/
    └── <UTC_ts>_<run_id>.jsonl    # sub-sub agent 의 NAS 탐사 결과
```

### `context.md`, `dm_log.jsonl`, `safe_memory.jsonl`, `exploration_plan.md`

Schema unchanged from rev 1 (see git history of this file for full schemas).

### `channel_handoff_YYYY-MM-DD.md` (NEW rev 2)

Written by subagent at end of session. Posted verbatim to `<INIT>_claude`
channel via `chat.postMessage`. Contents (one document per session, append-
only across sessions in the same file is OK if dated sections):

```markdown
[handoff <ISO date> KST] <INIT> session 인수인계

세션 종료 시점의 <INIT> 연구원 조사/인터뷰 상태입니다. ...
- 역할/플래그
- uncertainty snapshot
- subagent safe_memory (이번 round)
- DM thread 최신 (5개씩)
- pending_drafts.md (subagent draft, 아직 미발사)
- 다음 세션 시작 명령

— Claude (orchestrator)
```

## 3. Orchestrator aggregation (unchanged)

Reads each `safe_memory.jsonl`, merges into `orchestrator_memory.md` per
researcher section, updates `member_uncertainty.json` ONLY with
confidence≥0.85 confirmed entries, logs the aggregation in
`orchestrator_log.jsonl`.

## 4. Cadence

| Event | Action |
|---|---|
| Session start | Orchestrator runs `discover_claude_channels` to refresh `channel_map.json`, reads orchestrator_memory.md, then spawns 7 subagents in parallel for analysis round |
| Subagent kickoff | Reads template + own context.md + relevant canonical state slice; one round = (one sub-sub dispatch if NAS work pending) + (one DM fire if not held/P4) + state writes + handoff post if session-end |
| New inbound DM (memev cron */3 detects) | Orchestrator spawns just that one subagent to react |
| Session end | Each subagent writes channel_handoff_YYYY-MM-DD.md and posts to its `<INIT>_claude` channel |
| 4-hour boundary | Orchestrator cross-aggregation pass, conflict resolution, orchestrator_log audit |

## 5. Sub-sub agent invocation note (REVISION 2026-05-13)

Round-1 subagent reports surfaced that the `Agent` tool was *not exposed* in
the subagent invocation context. The 3-tier spec's tier-3 dispatch must
therefore use one of:

- **Option A — Orchestrator-side dispatch**: subagent writes `exploration_plan.md`,
  returns control to orchestrator, orchestrator spawns the Sonnet sub-sub
  agent. Result file path returned to subagent on next invocation. (Adds one
  round-trip per NAS dive.)
- **Option B — Direct read via subagent**: subagent uses Bash to read NAS
  files inline under tight scope (≤30 files, ≤2MB). Invariant #2 relaxed: a
  subagent MAY do bounded NAS reads if no Agent tool is available, with the
  same audit output schema (`nas_runs/*.jsonl`).
- **Option C — Spawn Agent on next session restart** if subagent invocation
  contexts gain `Agent`/`Task` in future Claude Code versions.

For 2026-05-13 → 2026-05-14 target run, the orchestrator chooses **Option A**
as primary (cleanest separation) with **Option B** fallback only when the
subagent has hit a hard time budget and a NAS dive would unblock its sole
remaining work item.

## 6. Discovery + automation scripts

### `scripts/discover_claude_channels.py`

Runs once per session start. Lists private channels the bot is member of,
writes `state/subagents/channel_map.json`. Exits with code 1 if any of the 7
INIT_claude channels is missing (bot not invited or scope missing) and prints
a clear remediation note. Idempotent — re-running just refreshes the map.

### `scripts/post_session_handoff.py`

After channel_map is fresh and all 7 channels are accessible, reads each
subagent's latest `channel_handoff_YYYY-MM-DD.md` and posts to the matching
`<INIT>_claude` channel via `chat.postMessage`. Posts are sequenced ≥6 s
apart (per global fire_lock). Idempotent — re-running skips already-posted
files (tracked in `channel_handoff_posts.jsonl` per subagent).

### `scripts/load_subagent_state.py` (TODO)

For next session start. Reads + summarizes 7 subagent state dirs into a single
brief that the orchestrator can paste into its context to bootstrap.

## 7. Memory rules (auto-loaded)

The following memory entries gate this architecture:

- `feedback_operator_sequential_authority.md` — operator-Opus may fire DMs
  sequentially without per-fire OK; same rule extends to per-researcher
  subagents posting to their `<INIT>_claude` channel (the channel is operator-
  audit, not researcher-facing).
- `feedback_slack_pacing.md` — ≥5 s gap between *researcher* DM fires (still
  enforced via fire_lock).
- `feedback_first_run_external.md` — first time the bot posts to a *new*
  channel still needs operator OK. For the 7 INIT_claude channels, the
  handoff post is the operator-authored content (this orchestrator session),
  not a researcher message — but the OK gate still applies for the first
  post (one OK covers all 7 if posted in one ratcheted batch).

## 8. Migration prompt for next session

See `docs/migration-prompt-2026-05-13.md` for the full copy-pasteable startup
sequence. Summary:

1. Bash command to verify all 7 INIT_claude channels are accessible.
2. Bash command to spawn the 7-subagent kickoff round (parallel).
3. Bash command to aggregate safe_memory and update orchestrator_memory.

## 9. What is NOT yet automated (gaps the user should know)

- **groups:read scope** — must be added to bot manually. Until then, the
  channel_map.json IDs cannot be auto-discovered for private channels.
- **Bot invite** — user must `/invite @claudebot` to each of 7 channels.
  After that, automation works.
- **Subagent-side Agent tool** — Claude Code may or may not expose `Agent` to
  spawned subagents. Round-1 reports indicate it was unavailable. Falling
  back to orchestrator-side dispatch (Option A) for now.
- **memev refactor** — memev's qwen-side delta extraction still runs every
  3 min and writes to `member_uncertainty.json` directly. The 3-tier spec
  reserves canonical writes for the orchestrator. Until memev is refactored
  to read-only mode + propose deltas to subagents, the two paths can race.
  Mitigation: orchestrator's safe_memory merge uses confidence≥0.85
  threshold and overwrites memev-proposed inferred entries.
- **Codex 3-round review** — pending (task #8). Will run after Phase 1
  (initial 7 subagent spawn) completes and a session is committed.
