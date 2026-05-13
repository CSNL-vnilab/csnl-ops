# Migration prompt — 3-tier orchestrator continuation (2026-05-13 14:00 KST)

> **Use this**: open a new Claude Code session in `/Users/csnl/Documents/claude/csnl-ops/`, paste the prompt below (everything inside the triple-backtick fenced block) as the first message. The session bootstraps the 3-tier orchestration and continues per-researcher work without further intervention.

---

## Copy-paste prompt (single message)

```
이 저장소(csnl-ops)에서 3-tier orchestration 작업을 이어간다. 본 세션은 *orchestrator (Opus 4.7, 1M context)* 역할.

목표: 7명 연구원 (JOP/BYL/MSY/SMJ/JYK/BHL/SYJ) 전원의 uncertainty 최소화. 데드라인 2026-05-14 14:00 KST.

다음 순서로 읽고 시작:

1. ~/.claude/projects/-Users-csnl-Documents-claude-csnl-ops/memory/MEMORY.md
   (auto-loaded; 22 메모리 룰 중 architecture-3tier 관련 핵심:
    - operator-sequential-authority (sequential single-fire 표준 승인)
    - slack-pacing-second-level (≥5s gap fire_lock)
    - nas-traffic-defer (NAS 능동 walk 금지, cache 우선)
    - first-run-external (새 채널 첫 포스트는 OK 필요)
    - paper-rec-tone (학술 한국어, 이모지/superlative 금지, signature `— Claude`)
    - nas-first-priority (Phase 1 = NAS inventory, Phase 2 = Slack interview))

2. docs/architecture-3tier-2026-05-13.md
   (§0-§9 전부. 3 tier 책임 분리 + channel layer + invariants + sub-sub agent dispatch option A)

3. docs/HANDOFF.md §0 + §9
   (직전 single-tier 마지막 fire 시점 + Phase 1 P1 완료 표시)

4. /Users/csnl/csnl_on_ai/harness/state/orchestrator/orchestrator_memory.md
   (이전 세션 orchestrator 의 solid memory 누적분)

5. /Users/csnl/csnl_on_ai/harness/state/subagents/channel_map.json
   (7개 <INIT>_claude private channel id 매핑. 없거나 incomplete 면 §A 의 discovery 먼저)

6. 각 subagent 의 직전 상태:
   for INIT in JOP BYL MSY SMJ JYK BHL SYJ; do
     echo "=== $INIT ==="
     cat /Users/csnl/csnl_on_ai/harness/state/subagents/$INIT/context.md | tail -50
     echo "--- safe_memory.jsonl (last 5) ---"
     tail -5 /Users/csnl/csnl_on_ai/harness/state/subagents/$INIT/safe_memory.jsonl
     echo "--- pending_drafts.md ---"
     cat /Users/csnl/csnl_on_ai/harness/state/subagents/$INIT/pending_drafts.md 2>/dev/null || echo "(none)"
   done

§A. Slack 채널 접근 사전 확인 (필요시)

(A1) 7 INIT_claude private channel 의 id discovery:
     bot 에 `groups:read` 스코프가 추가됐고 bot 이 7 채널에 모두 초대됐는지 확인.
     스크립트: `python3 /Users/csnl/Documents/claude/csnl-ops/scripts/discover_claude_channels.py`
     (state/subagents/channel_map.json 갱신, 누락된 채널 있으면 stderr 로 알림)

(A2) channel_map 이 완성되면 7개 subagent 의 이번 round 시작 전에
     각 subagent 의 channel_handoff_YYYY-MM-DD.md 가 해당 채널에 posted 됐는지 확인.
     안 됐으면 `python3 /Users/csnl/Documents/claude/csnl-ops/scripts/post_session_handoff.py`
     로 일괄 post (fire_lock 으로 ≥6s 간격).

(A3) bot scope/invite 가 아직 안 됐으면, 이 시점에 사용자에게 한 줄로 명시 요청.
     사용자가 처리 후 (A1) 부터 재실행.

§B. 새 세션 첫 round 실행

(B1) 직전 round 마지막 4 시간 이내라면 orchestrator 만 가동
     (memev cron 이 inbound 처리 진행 중일 가능성). ledger 점검:
     sqlite3 /Users/csnl/csnl_on_ai/harness/state/ledger.db \\
       "SELECT researcher_init, datetime(received_at,'+9 hours'), substr(text,1,80)
        FROM inbound_messages
        WHERE datetime(received_at,'+9 hours') > datetime('now','+9 hours','-4 hours')
        ORDER BY received_at DESC;"

(B2) 신규 inbound 가 있는 연구원 만 subagent 호출 (react-and-reply 모드).
     없으면 4 시간 이상 silence + DM-resolvable axis 가 있는 연구원에 한해
     subagent 호출 (proactive 모드).

(B3) Agent tool 호출 패턴 — subagent 1 명 (Opus):
     Agent(
       description="<INIT> subagent <task-summary>",
       subagent_type="general-purpose",
       model="opus",
       prompt="""<docs/subagent-kickoff-template.md 의 §"Work plan" 단계
                + <INIT>-specific facts + hold/p4_active 플래그>"""
     )

(B4) subagent 가 sub-sub NAS dive 가 필요하다고 신호하면 (return 의 NAS 섹션에
     "spawned=no, plan ready" 형식), orchestrator 가 직접:
     Agent(
       description="<INIT> NAS crawl <scope>",
       subagent_type="general-purpose",
       model="sonnet",
       prompt="<exploration_plan.md 본문 + 출력 경로 state/subagents/<INIT>/nas_runs/<UTC>_<run_id>.jsonl>"
     )
     결과 jsonl 경로를 다시 subagent 에게 전달 (SendMessage 또는 신규 Agent 호출).

§C. round 종료 처리

(C1) 모든 subagent 가 safe_memory.jsonl 에 1+ 라인 append 했는지 확인.
(C2) orchestrator 가 7 개 safe_memory 를 읽어 orchestrator_memory.md 갱신.
     confidence ≥ 0.85 confirmed entry 만 member_uncertainty.json 에 merge.
(C3) orchestrator_log.jsonl 에 round audit 1 라인 append.
(C4) 변경분 commit:
     cd /Users/csnl/Documents/claude/csnl-ops
     git add docs/ ; git commit -m "ops: round <N> aggregate <YYYY-MM-DDTHHMM> <delta-summary>"
     (harness/state/ 은 git-tracked 아님 — local + NAS mirror only)

§D. 2026-05-14 14:00 KST 도달 시 — 최종 round

(D1) 7명 별 final uncertainty 표 작성. 각 unknown 의 resolution status.
(D2) 미해결 unknown 은 *post-mortem* 으로 분류 (researcher 보류 / 일정 외 / 외부 의존 등).
(D3) docs/round-final-2026-05-14T1400.md 에 결과 정리.
(D4) 각 <INIT>_claude 채널에 final handoff post.

— 운영 규칙 우선순위 —
- pacing (≥5s gap, fire_lock) 위반 시 즉시 중단.
- 한 채널에 1 시간 내 2+ outbound 시 자체 throttle.
- subagent 가 다른 subagent state 디렉토리에 접근 시도 시 invariant #3 위반 → 중단 + orchestrator_log 기록.
- 새로운 외부 route (예: PI 메일, 캘린더 write, 새 채널 종류) 는 first-run-external 룰 적용.

end of prompt.
```

---

## 부록 A — 현재 시점의 정합성 체크

다음 표는 2026-05-13 13:50 KST 시점의 state 정합성 (migration prompt 작성 직전).

| 항목 | 위치 | 상태 |
|---|---|---|
| Architecture spec | `docs/architecture-3tier-2026-05-13.md` | ✅ rev 2 (channel layer 추가) |
| Subagent state dirs | `state/subagents/<INIT>/` × 7 | ✅ created + seeded |
| Channel map | `state/subagents/channel_map.json` | ⏳ awaiting bot scope + invite |
| Discovery script | `scripts/discover_claude_channels.mjs` | 📝 TO BE WRITTEN (this commit) |
| Handoff post script | `scripts/post_session_handoff.mjs` | 📝 TO BE WRITTEN (this commit) |
| Per-subagent handoff md | `state/subagents/<INIT>/channel_handoff_2026-05-13.md` | ✅ 7건 작성됨 |
| Orchestrator memory | `state/orchestrator/orchestrator_memory.md` | ⏳ 첫 aggregation 대기 |
| Migration prompt (this doc) | `docs/migration-prompt-2026-05-13.md` | ✅ this file |
| Bot Slack scopes | Slack App OAuth & Permissions | ⏳ user action: add `groups:read`, `groups:history` |
| Bot channel invitations | 7 INIT_claude channels | ⏳ user action: `/invite @claudebot` × 7 |
| Memory rules | `~/.claude/projects/.../memory/MEMORY.md` | ✅ 22 entries (3-tier 관련 4건 새로 추가) |

## 부록 B — 절대 경로 핸드오프

| Key | Value |
|---|---|
| Orchestrator host | `csnls-Mac-Studio.local`, user=`csnl` |
| csnl-ops repo | `/Users/csnl/Documents/claude/csnl-ops/` |
| Active harness | `/Users/csnl/csnl_on_ai/harness/` (NOT git-tracked) |
| NAS root | `/Volumes/CSNL_new-{1,2}/Memory/` |
| Subagent root | `/Users/csnl/csnl_on_ai/harness/state/subagents/` |
| Orchestrator root | `/Users/csnl/csnl_on_ai/harness/state/orchestrator/` |
| Fire lock | `/Users/csnl/csnl_on_ai/harness/state/orchestrator/fire_lock` |
| Ledger DB | `/Users/csnl/csnl_on_ai/harness/state/ledger.db` |
| Slack token | `$SLACK_BOT_TOKEN` (loaded from `/Users/csnl/csnl_on_ai/harness/.env`) |
| Slack outbound module | `/Users/csnl/csnl_on_ai/harness/code/slack_outbound.py` (tone lint chokepoint) |
| Memory rules dir | `/Users/csnl/.claude/projects/-Users-csnl-Documents-claude-csnl-ops/memory/` |
| memev script | `/Users/csnl/csnl_on_ai/harness/code_v3/memory_evolution.py` (cron */3) |
| Subagent kickoff template | `/Users/csnl/Documents/claude/csnl-ops/docs/subagent-kickoff-template.md` |

## 부록 C — 가용 sub-sub agent 발사 패턴 (orchestrator-side dispatch)

```python
# Orchestrator runs this after subagent returns "exploration_plan ready, spawned=no"
result = Agent(
    description="<INIT> NAS crawl",
    subagent_type="general-purpose",
    model="sonnet",
    prompt=f"""
You are a Sonnet sub-sub agent dispatched to crawl NAS for <INIT> subagent.

Read the plan:
  /Users/csnl/csnl_on_ai/harness/state/subagents/<INIT>/exploration_plan.md

Hard rules:
- Read ≤30 files, ≤2 MB total.
- Stay within the scoped subpaths in the plan.
- For each file: capture (path, kind, size, mtime, head≤500chars, brief inspector_notes, relevance_score 0-1, answers_uncertainty list).
- Write JSON-per-line to /Users/csnl/csnl_on_ai/harness/state/subagents/<INIT>/nas_runs/<UTC_ts>_<run_id>.jsonl
- DO NOT modify member_uncertainty, dm_log, or any other state file.
- DO NOT post to Slack.

Return: a brief summary of findings (under 200 words) + the output file path.
"""
)
# Then re-invoke <INIT> subagent with "Read your nas_runs/<file> and decide next."
```
