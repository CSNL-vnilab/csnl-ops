#!/usr/bin/env python3
"""Read state/orchestrator/needs_subagent_response.jsonl and print the pending
subagent dispatch queue. Orchestrator (interactive Claude Code session) reads
the output + spawns the corresponding subagents via Agent tool.

Schema per line:
{
  "at": "<iso>",
  "init": "<INIT>",
  "trigger": "memev_detected_new_inbound",
  "msg_ids": [...],
  "latest_msg_ts": "...",
  "text_preview": "...",
  "memev_changes": [...],
  "claimed_at": null,
  "completed_at": null
}

Usage:
  python scripts/read_subagent_intent_queue.py            # list pending
  python scripts/read_subagent_intent_queue.py --claim    # mark all pending as claimed (orchestrator about to spawn)
  python scripts/read_subagent_intent_queue.py --complete <init>  # mark all rows for INIT as completed (subagent done)
"""
from __future__ import annotations
import sys, json, datetime, argparse, fcntl
from pathlib import Path

HARNESS = Path("/Users/csnl/csnl_on_ai/harness")
QUEUE = HARNESS / "state" / "orchestrator" / "needs_subagent_response.jsonl"
LOCK = HARNESS / "state" / "orchestrator" / ".intent_queue.lock"
KST = datetime.timezone(datetime.timedelta(hours=9))


def _load() -> list[dict]:
    if not QUEUE.exists():
        return []
    out = []
    for ln in QUEUE.read_text().splitlines():
        ln = ln.strip()
        if not ln:
            continue
        try:
            out.append(json.loads(ln))
        except Exception:
            continue
    return out


def _save(rows: list[dict]):
    QUEUE.parent.mkdir(parents=True, exist_ok=True)
    with QUEUE.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


CLAIM_LEASE_MINUTES = 30  # claimed but never completed → release after 30 min


def _reap_stuck_claims(rows: list[dict]) -> int:
    """Lease expiry — release claimed-but-not-completed rows older than 30 min.
    Codex 1-round fix (HIGH LOOP-INTEGRITY): crash/context-reset can leave rows
    claimed forever. Reaper restores them to pending so the next orchestrator
    invocation can pick them up.
    """
    cutoff = (datetime.datetime.now(KST) - datetime.timedelta(minutes=CLAIM_LEASE_MINUTES)).isoformat(timespec="seconds")
    n = 0
    for r in rows:
        if r.get("claimed_at") and not r.get("completed_at") and r["claimed_at"] < cutoff:
            r["claimed_at"] = None
            r.setdefault("reap_history", []).append({
                "reaped_at": datetime.datetime.now(KST).isoformat(timespec="seconds"),
                "previous_claim": r.get("claimed_at"),
            })
            n += 1
    return n


def list_pending() -> list[dict]:
    rows = _load()
    return [r for r in rows if not r.get("claimed_at") and not r.get("completed_at")]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--claim", action="store_true",
                    help="Mark all currently-pending rows as claimed (orchestrator about to spawn)")
    ap.add_argument("--complete", metavar="INIT",
                    help="Mark all rows for INIT as completed")
    args = ap.parse_args()

    LOCK.parent.mkdir(parents=True, exist_ok=True)
    with LOCK.open("a+") as lf:
        fcntl.flock(lf.fileno(), fcntl.LOCK_EX)
        try:
            rows = _load()
            reaped = _reap_stuck_claims(rows)
            if reaped:
                _save(rows)
                print(f"[reaper] released {reaped} stuck claimed row(s) older than {CLAIM_LEASE_MINUTES} min", file=sys.stderr)
            pending = [r for r in rows if not r.get("claimed_at") and not r.get("completed_at")]
            now_iso = datetime.datetime.now(KST).isoformat(timespec="seconds")

            if args.complete:
                init = args.complete
                n = 0
                for r in rows:
                    if r.get("init") == init and r.get("claimed_at") and not r.get("completed_at"):
                        r["completed_at"] = now_iso
                        n += 1
                _save(rows)
                print(f"marked {n} rows complete for init={init}")
                return 0

            if args.claim:
                n = 0
                for r in pending:
                    r["claimed_at"] = now_iso
                    n += 1
                _save(rows)
                print(f"claimed {n} pending rows at {now_iso}")
                return 0

            # Default: list pending
            print(f"=== pending subagent dispatch queue ({len(pending)} rows) ===")
            by_init: dict[str, list[dict]] = {}
            for r in pending:
                by_init.setdefault(r["init"], []).append(r)
            for init in sorted(by_init.keys()):
                items = by_init[init]
                latest = items[-1]
                print(f"\n  {init}: {len(items)} pending row(s)")
                print(f"    latest_at: {latest.get('at')}")
                print(f"    trigger:   {latest.get('trigger')}")
                print(f"    text_preview: {latest.get('text_preview','')[:160]}")
                print(f"    memev_changes: {latest.get('memev_changes', [])[:3]}")
            if pending:
                print(f"\n→ To spawn: invoke per-INIT subagent (Opus) with the standard kickoff template + new inbound text. After spawn, mark complete via:")
                print(f"   python3 scripts/read_subagent_intent_queue.py --complete <INIT>")
                print(f"→ To claim batch up-front (before spawn):")
                print(f"   python3 scripts/read_subagent_intent_queue.py --claim")
            else:
                print("(nothing to dispatch)")
            return 0
        finally:
            fcntl.flock(lf.fileno(), fcntl.LOCK_UN)


if __name__ == "__main__":
    sys.exit(main())
