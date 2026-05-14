#!/usr/bin/env bash
# csnl-researcher-archiver — one-time installer
# Usage: ./install.sh (from plugin root)

set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE_ROOT="$HOME/.claude/csnl-archive"
VENV_PATH="$CACHE_ROOT/venv"
ENV_FILE="$CACHE_ROOT/.env"

echo "===== csnl-researcher-archiver install ====="
echo "Plugin root:  $PLUGIN_ROOT"
echo "Cache root:   $CACHE_ROOT"
echo

# 1. cache directories
mkdir -p "$CACHE_ROOT"
echo "[1/6] cache dir created: $CACHE_ROOT"

# 2. python venv
if [ ! -d "$VENV_PATH" ]; then
    python3 -m venv "$VENV_PATH"
    echo "[2/6] venv created: $VENV_PATH"
else
    echo "[2/6] venv already exists, skipping"
fi

# 3. dependencies
"$VENV_PATH/bin/pip" install --quiet --upgrade pip
"$VENV_PATH/bin/pip" install --quiet psycopg2-binary python-dotenv requests
echo "[3/6] python deps installed (psycopg2-binary, python-dotenv, requests)"

# 4. .env template
if [ ! -f "$ENV_FILE" ]; then
    cat > "$ENV_FILE" <<'EOF'
# csnl-researcher-archiver — local config
# Fill MY_INIT with your researcher initial (JOP, BYL, MSY, SMJ, JYK, BHL, SYJ)
# Get PG_WORKER_PASSWORD from operator (JOP <jy061100@gmail.com>)

MY_INIT=
PG_HOST=csnls-mac-studio.local
PG_PORT=5432
PG_DBNAME=csnl_v3
PG_USER=harness_worker
PG_WORKER_PASSWORD=

# NAS path — if your NAS is not mounted, point to a local working dir
NAS_ROOT=/Volumes/CSNL_new-1/Memory
EOF
    chmod 600 "$ENV_FILE"
    echo "[4/6] .env template created at $ENV_FILE"
    echo "       ⚠  Fill in MY_INIT and PG_WORKER_PASSWORD before first /archive:bootstrap"
else
    echo "[4/6] .env already exists at $ENV_FILE (kept as-is)"
fi

# 5. plugin registration in ~/.claude/plugins/
PLUGINS_DIR="$HOME/.claude/plugins"
mkdir -p "$PLUGINS_DIR"
PLUGIN_LINK="$PLUGINS_DIR/csnl-researcher-archiver"
if [ -L "$PLUGIN_LINK" ] || [ -d "$PLUGIN_LINK" ]; then
    rm -rf "$PLUGIN_LINK"
fi
ln -s "$PLUGIN_ROOT" "$PLUGIN_LINK"
echo "[5/6] plugin symlinked: $PLUGIN_LINK -> $PLUGIN_ROOT"

# 6. memory rules copy to user's project-scoped memory
MEMORY_DIR="$HOME/.claude/projects/csnl-researcher-archiver/memory"
mkdir -p "$MEMORY_DIR"
cp "$PLUGIN_ROOT/rules/"*.md "$MEMORY_DIR/" 2>/dev/null || true
# Build MEMORY.md index
cat > "$MEMORY_DIR/MEMORY.md" <<'EOF'
- [01 Tone](01_tone.md) — strict academic Korean, no AI jargon / model names / internal terms / signature lines
- [02 Grounded](02_grounded.md) — every Q backed by real NAS path / variable / date / value / DOI
- [03 Map-first](03_map-first.md) — broad project map before granular drills
- [04 Past-focus](04_past-focus.md) — past/current artifacts, not future plans
- [05 Memory cap](05_memory-cap.md) — context.md ≤50KB, JSONL rotation, archive cleanup
- [06 Philosophy](06_philosophy.md) — unstable env, dialogue-based memory, "I don't know" is a signal
EOF
echo "[6/6] memory rules installed: $MEMORY_DIR/"

echo
echo "===== install complete ====="
echo
echo "Next steps:"
echo "  1. Edit $ENV_FILE — set MY_INIT and PG_WORKER_PASSWORD"
echo "  2. Open Claude Code:  claude code"
echo "  3. Type:              /archive:bootstrap <YOUR_INIT>"
echo
echo "For help: see $PLUGIN_ROOT/README.md or INSTALL.md"
