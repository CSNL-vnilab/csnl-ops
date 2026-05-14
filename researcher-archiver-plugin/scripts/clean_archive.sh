#!/usr/bin/env bash
# clean_archive.sh — periodic archive directory cleanup
# Called by cron monthly (or manually) to delete 90-day-old compressed
# archives from ~/.claude/csnl-archive/<INIT>/archive/.
#
# Usage:
#   ./clean_archive.sh              (all INITs)
#   ./clean_archive.sh JOP          (single INIT)
#   ./clean_archive.sh --dry-run    (preview)

set -uo pipefail

CACHE_ROOT="$HOME/.claude/csnl-archive"
DAYS=90
DRY_RUN=0
TARGET_INIT=""

for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=1 ;;
        --days=*) DAYS="${arg#--days=}" ;;
        *) TARGET_INIT="$arg" ;;
    esac
done

[ ! -d "$CACHE_ROOT" ] && exit 0

cleanup_init() {
    local init="$1"
    local archive_dir="$CACHE_ROOT/$init/archive"
    [ ! -d "$archive_dir" ] && return 0
    local n=0 total=0
    while IFS= read -r -d '' f; do
        total=$((total + 1))
        if [ $DRY_RUN -eq 1 ]; then
            echo "  [dry] would remove: $f"
        else
            rm "$f"
            n=$((n + 1))
        fi
    done < <(find "$archive_dir" -type f \( -name "*.gz" -o -name "*.tar" -o -name "*.zip" \) -mtime +$DAYS -print0)
    if [ $DRY_RUN -eq 1 ]; then
        echo "  $init: $total candidate(s) older than $DAYS days (dry-run)"
    else
        echo "  $init: removed $n / $total"
    fi
}

if [ -n "$TARGET_INIT" ]; then
    cleanup_init "$TARGET_INIT"
else
    for dir in "$CACHE_ROOT"/*/; do
        init=$(basename "$dir")
        [ "$init" = "venv" ] && continue
        cleanup_init "$init"
    done
fi
