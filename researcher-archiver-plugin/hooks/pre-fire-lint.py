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
import re as _re
# Opus AR1 CRITICAL-2 fix: use word-boundary regex instead of bare substrings
# to avoid false positives on "background", "around", "ground", "life cycle",
# "ax-is path" inside code/JSON, etc. Banned only as whole tokens.
BANNED_INTERNAL_WORDS = (
    "발사", "라운드", "사이클",
    "round", "Round", "cycle", "Cycle",
    "axis", "Axis",
    "fact_type",
    "outbox", "fire_lock", "q_hash",
    "subagent", "Subagent",
    "orchestrator", "Orchestrator",
    "nas_runs", "safe_memory", "member_uncertainty",
)
# Korean tokens don't have word boundaries; keep as substring scan
BANNED_INTERNAL_KO = ("발사", "라운드", "사이클")
# Multi-word phrases — substring is fine
BANNED_INTERNAL_PHRASES = (
    "interview agenda", "sub-sub agent",
)
BANNED_INTERNAL = ()  # legacy alias — deprecated; use the three above
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
    # Opus AR1: skip JSON/code blocks — they legitimately contain
    # "row_version", "axis", "round" in internal field names. The lint cares
    # about *researcher-facing* prose, not internal state files.
    if text.lstrip().startswith(("{", "[")) and text.rstrip().endswith(("}", "]")):
        return []  # likely JSON write
    v = []
    for w in BANNED_AI_JARGON:
        if w in text:
            v.append(f"ai_jargon:{w.strip()}")
    # Word-boundary regex for internal English tokens
    for w in BANNED_INTERNAL_WORDS:
        if _re.search(rf"\b{_re.escape(w)}\b", text):
            v.append(f"internal:{w}")
    for w in BANNED_INTERNAL_KO:
        if w in text:
            v.append(f"internal_ko:{w}")
    for w in BANNED_INTERNAL_PHRASES:
        if w in text:
            v.append(f"internal_phrase:{w}")
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
