#!/usr/bin/env bash
# auto-handoff.sh — SessionEnd hook
# Writes a minimal handoff-<datetime>.md if the user didn't explicitly run
# /archive:handoff. Non-blocking; failure prints to stderr only.

set -uo pipefail

INIT="${1:-${MY_INIT:-}}"
[ -z "$INIT" ] && exit 0

CACHE="$HOME/.claude/csnl-archive/$INIT"
[ ! -d "$CACHE" ] && exit 0

NOW=$(date '+%Y-%m-%d-%H%M')
HANDOFF="$CACHE/handoff-$NOW-autosave.md"

# Skip if explicit handoff already exists for same minute
LATEST=$(ls -t "$CACHE"/handoff-*.md 2>/dev/null | head -1)
if [ -n "$LATEST" ]; then
    LATEST_MIN=$(basename "$LATEST" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4}' | head -1)
    CURRENT_MIN=$(echo "$NOW" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4}')
    if [ "$LATEST_MIN" = "$CURRENT_MIN" ]; then
        exit 0
    fi
fi

PROJ_COUNT=$(ls "$CACHE/projects/"*.json 2>/dev/null | wc -l | tr -d ' ')
CTX_BYTES=0
[ -f "$CACHE/context.md" ] && CTX_BYTES=$(wc -c < "$CACHE/context.md" | tr -d ' ')

cat > "$HANDOFF" <<EOF
# Auto-handoff — $INIT
Generated: $(TZ=Asia/Seoul date '+%Y-%m-%dT%H:%M:%S+09:00') (auto, SessionEnd hook)

Session closed without explicit /archive:handoff. Minimal state snapshot:

- Local cache:        $CACHE
- Project rows:       $PROJ_COUNT
- context.md size:    $CTX_BYTES bytes

## Next session prompt

\`\`\`
/archive:continue
\`\`\`

If continue fails (no recent state), fall back to:

\`\`\`
/archive:bootstrap $INIT
\`\`\`

— end of auto-handoff
EOF

echo "[auto-handoff] wrote $HANDOFF" >&2
