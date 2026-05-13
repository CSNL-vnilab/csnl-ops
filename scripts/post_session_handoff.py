#!/usr/bin/env python3
"""Post per-researcher session-handoff summaries to the 7 <INIT>_claude channels.

Reads each subagent's `channel_handoff_YYYY-MM-DD.md` (latest file in that
researcher's state dir) and posts it via chat.postMessage. Sequenced with
fire_lock (≥6 s gap between posts).

Prerequisites:
  - scripts/discover_claude_channels.py must have populated channel_map.json
  - Each subagent's state dir contains a channel_handoff_*.md file

Idempotency: each post records the message ts to
  `state/subagents/<INIT>/channel_handoff_posts.jsonl`
On re-run, posts already made (matching md file → ts mapping) are skipped.

Usage:
  python scripts/post_session_handoff.py            # post all 7 newest md files
  python scripts/post_session_handoff.py --date 2026-05-13  # only that-date files
  python scripts/post_session_handoff.py --dry-run  # print what would be posted
"""
from __future__ import annotations
import os, sys, json, time, datetime, fcntl, argparse
import requests
from pathlib import Path
from dotenv import load_dotenv

HARNESS = Path("/Users/csnl/csnl_on_ai/harness")
load_dotenv(HARNESS / ".env")

TOKEN = os.environ.get("SLACK_BOT_TOKEN")
if not TOKEN:
    sys.exit("error: SLACK_BOT_TOKEN missing in harness/.env")

CHANNEL_MAP = HARNESS / "state" / "subagents" / "channel_map.json"
FIRE_LOCK = HARNESS / "state" / "orchestrator" / "fire_lock"
SUBAGENTS = HARNESS / "state" / "subagents"
KST = datetime.timezone(datetime.timedelta(hours=9))
INITS = ["JOP", "BYL", "MSY", "SMJ", "JYK", "BHL", "SYJ"]


def slack_post(channel: str, text: str) -> dict:
    r = requests.post(
        "https://slack.com/api/chat.postMessage",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json; charset=utf-8",
        },
        json={"channel": channel, "text": text, "unfurl_links": False, "unfurl_media": False},
    )
    return r.json()


def latest_handoff(init: str, date_filter: str | None) -> Path | None:
    sub = SUBAGENTS / init
    if not sub.exists():
        return None
    candidates = sorted(sub.glob("channel_handoff_*.md"))
    if date_filter:
        candidates = [p for p in candidates if date_filter in p.name]
    return candidates[-1] if candidates else None


def _content_hash(text: str) -> str:
    import hashlib
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def already_posted(init: str, md_path: Path, content: str) -> bool:
    """Idempotency check: same filename + same SHA256-truncated content hash."""
    log_path = SUBAGENTS / init / "channel_handoff_posts.jsonl"
    if not log_path.exists():
        return False
    target = md_path.name
    target_hash = _content_hash(content)
    for line in log_path.read_text().strip().split("\n"):
        if not line:
            continue
        try:
            row = json.loads(line)
        except Exception:
            continue
        if (
            row.get("md_filename") == target
            and row.get("content_hash") == target_hash
            and row.get("ok")
        ):
            return True
    return False


def record_post(init: str, md_path: Path, content: str, slack_resp: dict):
    log_path = SUBAGENTS / init / "channel_handoff_posts.jsonl"
    row = {
        "at": datetime.datetime.now(KST).isoformat(timespec="seconds"),
        "md_filename": md_path.name,
        "content_hash": _content_hash(content),
        "content_bytes": len(content.encode("utf-8")),
        "channel": slack_resp.get("channel"),
        "ts": slack_resp.get("ts"),
        "ok": slack_resp.get("ok", False),
        "error": slack_resp.get("error"),
    }
    with log_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")
        f.flush()
        os.fsync(f.fileno())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", help="filter handoff md files by ISO date substring (e.g., 2026-05-13)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not CHANNEL_MAP.exists():
        sys.exit(
            f"error: {CHANNEL_MAP} missing. Run discover_claude_channels.py first."
        )
    cmap = json.loads(CHANNEL_MAP.read_text())

    missing_channels = [i for i in INITS if i not in cmap]
    if missing_channels:
        print(
            f"warn: channel_map missing for {missing_channels} — those handoffs "
            f"will be skipped.",
            file=sys.stderr,
        )

    posted = 0
    skipped = 0
    failed = 0

    for init in INITS:
        if init not in cmap:
            print(f"  {init}: skip — no channel mapping")
            skipped += 1
            continue
        ch_id = cmap[init]["id"]
        md = latest_handoff(init, args.date)
        if not md:
            print(f"  {init}: skip — no handoff md file" + (f" matching '{args.date}'" if args.date else ""))
            skipped += 1
            continue
        text = md.read_text(encoding="utf-8")
        if args.dry_run:
            print(f"  {init}: DRY RUN — would post {len(text)}B from {md.name} to {ch_id}")
            continue

        # fire_lock serialization (≥6s gap globally). Use a+ to preserve
        # any diagnostic content; idempotency check is INSIDE the lock so
        # parallel reruns cannot double-post.
        FIRE_LOCK.parent.mkdir(parents=True, exist_ok=True)
        with FIRE_LOCK.open("a+") as lf:
            fcntl.flock(lf.fileno(), fcntl.LOCK_EX)
            try:
                if already_posted(init, md, text):
                    print(f"  {init}: skip — already posted ({md.name}, content_hash match)")
                    skipped += 1
                    continue
                resp = slack_post(ch_id, text)
                record_post(init, md, text, resp)
                if resp.get("ok"):
                    print(f"  {init}: POSTED ({len(text)}B → {ch_id}, ts={resp.get('ts')})")
                    posted += 1
                else:
                    print(f"  {init}: FAILED ({resp.get('error')})")
                    failed += 1
                time.sleep(6)  # honor pacing
            finally:
                fcntl.flock(lf.fileno(), fcntl.LOCK_UN)

    print(f"\nSummary: posted={posted} skipped={skipped} failed={failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
