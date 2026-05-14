#!/usr/bin/env bash
# csnl-archive — installer (v1.2.2, Claude Code spec compliance)
#
# v1.2.2 fixes:
# - Plugin renamed csnl-researcher-archiver → csnl-archive (shorter slash namespace)
# - Marketplace `csnl-ops` declared at repo root .claude-plugin/marketplace.json
# - settings.json registers extraKnownMarketplaces.csnl-ops (single source) +
#   enabledPlugins["csnl-archive@csnl-ops"]=true (single correct key)
# - Removed 3-variant inert key hack from v1.2.1
# - plugin.json stripped of unknown fields (validated by `claude plugin validate`)
# - hooks.json uses ${CLAUDE_PLUGIN_ROOT} + nested hooks[] shape

set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$PLUGIN_ROOT/.." && pwd)"
CACHE_ROOT="$HOME/.claude/csnl-archive"
VENV_PATH="$CACHE_ROOT/venv"
ENV_FILE="$CACHE_ROOT/.env"
PLUGINS_DIR="$HOME/.claude/plugins"
PLUGIN_LINK="$PLUGINS_DIR/csnl-archive"
MEMORY_DIR="$HOME/.claude/projects/csnl-archive/memory"

# Marketplace registration constants
MARKETPLACE_NAME="csnl-ops"
PLUGIN_NAME="csnl-archive"
ENABLED_KEY="${PLUGIN_NAME}@${MARKETPLACE_NAME}"
GITHUB_REPO="CSNL-vnilab/csnl-ops"

echo "===== csnl-archive install (v1.2.2) ====="
echo "Plugin root:    $PLUGIN_ROOT"
echo "Repo root:      $REPO_ROOT"
echo "Cache root:     $CACHE_ROOT"
echo "Marketplace:    $MARKETPLACE_NAME (github: $GITHUB_REPO)"
echo "Plugin key:     $ENABLED_KEY"
echo

# 0. Preflight — Python version + OS check + marketplace.json existence
echo "[0/7] preflight checks..."
PY_VER=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || echo "0.0")
PY_MAJOR=${PY_VER%%.*}
PY_MINOR=${PY_VER##*.}
if [ "${PY_MAJOR}" -lt 3 ] || ( [ "${PY_MAJOR}" -eq 3 ] && [ "${PY_MINOR}" -lt 11 ] ); then
    echo "  ERROR: Python 3.11+ required (found $PY_VER)" >&2
    exit 1
fi
OS=$(uname -s)
if [ "$OS" != "Darwin" ] && [ "$OS" != "Linux" ]; then
    echo "  WARN: untested OS '$OS' (supported: Darwin/macOS, Linux/WSL)" >&2
fi
MARKETPLACE_JSON="$REPO_ROOT/.claude-plugin/marketplace.json"
if [ ! -f "$MARKETPLACE_JSON" ]; then
    echo "  ERROR: missing $MARKETPLACE_JSON — repo layout broken." >&2
    echo "  This file declares the '$MARKETPLACE_NAME' marketplace at the repo root." >&2
    exit 1
fi
echo "  Python $PY_VER OK, OS $OS, marketplace.json present"

# 1. cache directories
mkdir -p "$CACHE_ROOT"
echo "[1/7] cache dir created: $CACHE_ROOT"

# 2. python venv
if [ ! -d "$VENV_PATH" ]; then
    python3 -m venv "$VENV_PATH"
    echo "[2/7] venv created: $VENV_PATH"
else
    echo "[2/7] venv already exists, skipping"
fi

# 3. dependencies
"$VENV_PATH/bin/pip" install --quiet --upgrade pip 2>&1 | tail -3 || {
    echo "  WARN: pip upgrade failed, continuing with existing pip" >&2
}
DEPS="psycopg2-binary python-dotenv requests PyYAML"
if ! "$VENV_PATH/bin/pip" install --quiet $DEPS 2>/tmp/pip-err.log; then
    echo "  WARN: initial pip install failed. Errors:" >&2
    cat /tmp/pip-err.log >&2
    echo "  Retrying with --no-binary :all: for psycopg2 (source build)..." >&2
    "$VENV_PATH/bin/pip" install --quiet python-dotenv requests PyYAML
    "$VENV_PATH/bin/pip" install --quiet --no-binary :all: psycopg2-binary || {
        echo "  ERROR: psycopg2 install failed even with source build." >&2
        echo "  On Apple Silicon you may need: brew install postgresql && export LDFLAGS=..." >&2
        echo "  Skipping psycopg2 for now — bootstrap.py will run in offline-only mode." >&2
    }
fi
echo "[3/7] python deps installed"

# 4. .env template (non-destructive)
if [ ! -f "$ENV_FILE" ]; then
    cp "$PLUGIN_ROOT/config/.env.template" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    echo "[4/7] .env template created at $ENV_FILE"
    echo "       Edit MY_INIT and SUPABASE_DB_PASSWORD before /csnl-archive:bootstrap"
else
    echo "[4/7] .env exists, kept as-is (non-destructive)"
fi

# 5. venv-aware wrapper for skills
WRAPPER="$CACHE_ROOT/run-python.sh"
cat > "$WRAPPER" <<EOF
#!/usr/bin/env bash
# Auto-generated wrapper — uses the plugin's venv Python with .env loaded
set -e
export CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT"
export PLUGIN_ROOT="$PLUGIN_ROOT"  # legacy alias, kept for backwards compat
[ -f "$ENV_FILE" ] && set -a && source "$ENV_FILE" && set +a || true
exec "$VENV_PATH/bin/python" "\$@"
EOF
chmod +x "$WRAPPER"
echo "[5/7] venv wrapper: $WRAPPER"

# 6. plugin registration — symlink + settings.json marketplace + enabledPlugins entry
mkdir -p "$PLUGINS_DIR"
# 6a. Migrate legacy symlink if present
LEGACY_LINK="$PLUGINS_DIR/csnl-researcher-archiver"
if [ -L "$LEGACY_LINK" ] || [ -d "$LEGACY_LINK" ]; then
    LEGACY_BACKUP="$LEGACY_LINK.legacy-$(date +%Y%m%d-%H%M%S)"
    mv "$LEGACY_LINK" "$LEGACY_BACKUP"
    echo "  legacy plugin link (csnl-researcher-archiver) renamed: $LEGACY_BACKUP"
fi
# 6b. Non-destructive swap of current link
if [ -L "$PLUGIN_LINK" ] || [ -d "$PLUGIN_LINK" ]; then
    BACKUP="$PLUGIN_LINK.backup-$(date +%Y%m%d-%H%M%S)"
    mv "$PLUGIN_LINK" "$BACKUP"
    echo "  prior plugin link backed up: $BACKUP"
fi
ln -s "$PLUGIN_ROOT" "$PLUGIN_LINK"
echo "[6/7] plugin symlinked: $PLUGIN_LINK -> $PLUGIN_ROOT"

# 6.5. register marketplace + enable plugin in user settings.json
USER_SETTINGS="$HOME/.claude/settings.json"
if [ -f "$USER_SETTINGS" ]; then
    "$VENV_PATH/bin/python" - "$USER_SETTINGS" <<PYEOF
import json, pathlib, sys, shutil, datetime
p = pathlib.Path(sys.argv[1])

# Non-destructive backup before mutation (one per install)
ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
backup = p.with_name(p.name + f".pre-csnl-{ts}.bak")
shutil.copy(p, backup)
print(f"  settings backup: {backup.name}")

try:
    s = json.loads(p.read_text())
except Exception as e:
    print(f"  WARN: could not parse {p}: {e!r} — aborting settings mutation")
    sys.exit(0)

# Register marketplace under extraKnownMarketplaces.csnl-ops
mks = s.setdefault("extraKnownMarketplaces", {})
mks["${MARKETPLACE_NAME}"] = {
    "source": {
        "source": "github",
        "repo": "${GITHUB_REPO}"
    }
}

# Enable plugin under the single correct key
ep = s.setdefault("enabledPlugins", {})

# Purge inert legacy keys from v1.2.1
LEGACY_KEYS = (
    "csnl-researcher-archiver",
    "csnl-researcher-archiver@local",
    "csnl-researcher-archiver@csnl-ops",
)
removed = [k for k in LEGACY_KEYS if k in ep]
for k in removed:
    ep.pop(k, None)
if removed:
    print(f"  purged legacy keys: {removed}")

ep["${ENABLED_KEY}"] = True

p.write_text(json.dumps(s, indent=4) + "\n")
print(f"  extraKnownMarketplaces: {list(mks.keys())}")
print(f"  enabledPlugins[csnl-*]: {[k for k in ep if 'csnl' in k]}")
PYEOF
else
    echo "  WARN: $USER_SETTINGS not found — slash commands may not register."
    echo "        Open Claude Code once to create settings, then re-run install.sh."
fi

# 7. memory rules + CLAUDE.md copied to project-scoped memory (so they auto-load
#    when researcher runs `claude` from csnl-ops/ — see README.md "CLAUDE.md 로딩 규칙")
mkdir -p "$MEMORY_DIR"
cp "$PLUGIN_ROOT/rules/"*.md "$MEMORY_DIR/" 2>/dev/null || true
[ -f "$PLUGIN_ROOT/CLAUDE.md" ] && cp "$PLUGIN_ROOT/CLAUDE.md" "$MEMORY_DIR/CLAUDE.md"
cat > "$MEMORY_DIR/MEMORY.md" <<EOF
- [00 Lab context](00_lab_context.md) — annual/weekly/workflow/Slab/MM cadence + NAS path + filename conventions (PB_/CWLL_/GRM_/MM_yymmdd)
- [01 Philosophy](06_philosophy.md) — unstable env, dialogue-based memory, "I don't know" is a signal (HIGHEST priority)
- [02 Scientific skepticism](07_scientific_skepticism.md) — hypothesis test gate, alternative explanations, confounders, contradiction tracking
- [03 Tone](01_tone.md) — strict academic Korean, no AI jargon / model names / internal terms / signature lines
- [04 Grounded](02_grounded.md) — every Q backed by real NAS path / variable / date / value / DOI
- [05 Map-first](03_map-first.md) — broad project map before granular drills
- [06 Past-focus](04_past-focus.md) — past/current artifacts, not future plans
- [07 Memory cap](05_memory-cap.md) — context.md ≤50KB, JSONL rotation, archive cleanup, 5KB pasted-code cap
EOF
echo "[7/7] memory rules + CLAUDE.md installed: $MEMORY_DIR/"

echo
echo "===== install complete (v1.2.2) ====="
echo
echo "Registered researchers (config/researchers.yaml): "
"$VENV_PATH/bin/python" - <<PYEOF
import yaml
with open("$PLUGIN_ROOT/config/researchers.yaml") as f:
    d = yaml.safe_load(f)
active = [r for r in d.get("researchers", []) if r.get("active")]
inactive = [r for r in d.get("researchers", []) if not r.get("active")]
print(f"  active ({len(active)}): {[r['init'] for r in active]}")
print(f"  inactive/anchor ({len(inactive)}): {[r['init'] for r in inactive]}")
PYEOF

echo
echo "Next steps:"
echo "  1. Edit $ENV_FILE — set MY_INIT and SUPABASE_DB_PASSWORD"
echo "  2. Open a NEW terminal session, then:"
echo "       cd $REPO_ROOT     # repo root — required for CLAUDE.md project-scope load"
echo "       claude"
echo "  3. In the Claude session:"
echo "       /csnl-archive:bootstrap <YOUR_INIT>"
echo
echo "For help: see $PLUGIN_ROOT/README.md or $PLUGIN_ROOT/INSTALL.md"
