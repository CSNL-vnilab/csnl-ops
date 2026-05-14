#!/usr/bin/env python3
"""pre-fire-lint.py — Claude Code PreToolUse hook.

Inspects outgoing message text intended for the researcher (terminal display)
and rejects it if it contains banned tones per rules/01_tone.md.

Triggers on: Write / Edit / Bash echo / printf operations whose target text
contains the researcher's name + a question pattern.

This is a soft hook — flags violations to stderr for the Claude session to
self-correct rather than hard-blocking.
"""
import sys, re

BANNED_AI_JARGON = (
    "delve", "Delve", "leverage", "Leverage",
    "robust ", "comprehensive", "Comprehensive", "holistic",
    "synergy", "ecosystem", "tapestry", "Tapestry",
    "meticulous", "navigate the complexities", "in the realm of",
)
BANNED_INTERNAL = (
    "발사", "라운드", "사이클",
    " round", "Round ", " cycle", "Cycle ",
    "interview agenda", "axis ", "fact_type",
    "outbox", "fire_lock", "q_hash",
    "subagent", "Subagent", "sub-sub agent",
    "orchestrator", "Orchestrator",
    "nas_runs", "safe_memory", "member_uncertainty",
)
BANNED_MODEL_NAMES = (
    "Claude", "Opus", "Sonnet", "Haiku",
    "Qwen", "GPT-", "Gemini", "OpenAI",
    "— Claude", "- Claude",
)
BANNED_ABBREV = (
    "INIT_claude", "init=", "INIT=",
    "(P1)", "(P2)", "(P3)", "(P4)", "(P5)",
    "H1.1", "H1.2", "H1.3", "H1.4",
    "H2.", "H3.", "H4.", "H5.", "H6.",
)


def lint(text: str) -> list[str]:
    v = []
    for w in BANNED_AI_JARGON:
        if w in text:
            v.append(f"ai_jargon:{w.strip()}")
    for w in BANNED_INTERNAL:
        if w in text:
            v.append(f"internal:{w.strip()}")
    for w in BANNED_MODEL_NAMES:
        if w in text:
            v.append(f"model_name:{w.strip()}")
    for w in BANNED_ABBREV:
        if w in text:
            v.append(f"weird_abbrev:{w.strip()}")
    return v


def main():
    text = sys.stdin.read()
    if not text:
        return 0
    violations = lint(text)
    if violations:
        print(f"[pre-fire-lint] TONE VIOLATION ({len(violations)}): {violations[:5]}",
              file=sys.stderr)
        print("  text snippet:", repr(text[:120]), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
