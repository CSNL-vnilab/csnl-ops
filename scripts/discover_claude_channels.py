#!/usr/bin/env python3
"""Discover 7 <INIT>_claude private Slack channels the bot is a member of.

Writes /Users/csnl/csnl_on_ai/harness/state/subagents/channel_map.json with
the channel id + name + private + member + topic fields for each researcher
init.

Prerequisites (one-time):
  1. Slack App must have scopes: groups:read, groups:history (in addition to
     existing channels:read, chat:write).
  2. User must `/invite @claudebot` in each of 7 <INIT>_claude channels.

Exit code:
  0 — all 7 channels discovered + bot is a member of each
  1 — some channels missing (bot not invited or scope incomplete);
      partial map written + missing list printed to stderr

Usage: python scripts/discover_claude_channels.py
"""
from __future__ import annotations
import os, sys, json, time
import requests
from pathlib import Path
from dotenv import load_dotenv

HARNESS = Path("/Users/csnl/csnl_on_ai/harness")
load_dotenv(HARNESS / ".env")

TOKEN = os.environ.get("SLACK_BOT_TOKEN")
if not TOKEN:
    sys.exit("error: SLACK_BOT_TOKEN missing in harness/.env")

OUT_PATH = HARNESS / "state" / "subagents" / "channel_map.json"
INITS = ["JOP", "BYL", "MSY", "SMJ", "JYK", "BHL", "SYJ"]


def slack_get(method: str, params: dict, _retry: int = 0) -> dict:
    """Slack GET with 429 retry. Codex 1-round fix (HIGH HOOK-STABILITY)."""
    resp = requests.get(
        f"https://slack.com/api/{method}",
        headers={"Authorization": f"Bearer {TOKEN}"},
        params=params,
    )
    if resp.status_code == 429 and _retry < 3:
        wait = int(resp.headers.get("Retry-After", "1"))
        time.sleep(wait * (2 ** _retry))
        return slack_get(method, params, _retry=_retry + 1)
    return resp.json()


def list_user_conversations() -> list[dict]:
    """Return all channels the bot is a member of (public + private + im + mpim).

    Paginates via cursor. Returns the raw channel objects from Slack."""
    all_chs: list[dict] = []
    cursor: str | None = None
    while True:
        params: dict = {
            "types": "private_channel,public_channel",
            "limit": 200,
            "exclude_archived": "true",
        }
        if cursor:
            params["cursor"] = cursor
        d = slack_get("users.conversations", params)
        if not d.get("ok"):
            err = d.get("error", "?")
            # Write structured failure artifact instead of hard-exit (Codex fix)
            fail_path = OUT_PATH.with_name("channel_map_failure.json")
            OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
            fail_payload = {
                "error": err,
                "needed_scope": d.get("needed"),
                "provided_scopes": d.get("provided"),
                "at": int(time.time()),
            }
            fail_path.write_text(json.dumps(fail_payload, ensure_ascii=False, indent=2))
            print(
                f"error: users.conversations failed: {err}",
                file=sys.stderr,
            )
            if err == "missing_scope":
                print(
                    f"  Bot needs additional scope: {d.get('needed')}\n"
                    f"  Provided: {d.get('provided')}\n"
                    f"  Wrote failure artifact: {fail_path}",
                    file=sys.stderr,
                )
            sys.exit(2)
        all_chs.extend(d.get("channels", []))
        cursor = (d.get("response_metadata") or {}).get("next_cursor") or None
        if not cursor:
            break
        time.sleep(0.2)  # be polite
    return all_chs


def main() -> int:
    chs = list_user_conversations()
    print(f"Bot is a member of {len(chs)} conversations.", file=sys.stderr)
    matches: dict[str, dict] = {}
    for ch in chs:
        name = (ch.get("name") or "").lower()
        if not name.endswith("_claude"):
            continue
        prefix = name.replace("_claude", "").upper()
        if prefix not in INITS:
            continue
        matches[prefix] = {
            "id": ch["id"],
            "name": ch.get("name"),
            "is_private": ch.get("is_private", False),
            "is_member": ch.get("is_member", False),
            "topic": (ch.get("topic") or {}).get("value", ""),
            "purpose": (ch.get("purpose") or {}).get("value", ""),
            "created": ch.get("created"),
            "discovered_at": int(time.time()),
        }

    found = sorted(matches.keys())
    missing = [i for i in INITS if i not in matches]
    print(f"Found: {found}", file=sys.stderr)
    if missing:
        print(f"MISSING: {missing}", file=sys.stderr)
        print(
            "  → For each missing INIT, ensure:\n"
            "    (1) Slack channel `<init>_claude` exists (private).\n"
            "    (2) `groups:read` scope is added to the bot.\n"
            "    (3) Bot is invited (`/invite @claudebot`) in that channel.",
            file=sys.stderr,
        )

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(matches, ensure_ascii=False, indent=2))
    print(f"Wrote {OUT_PATH} ({len(matches)} / {len(INITS)} channels).")

    return 0 if not missing else 1


if __name__ == "__main__":
    sys.exit(main())
