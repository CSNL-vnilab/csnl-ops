#!/bin/bash
# dispatch_health_alert.sh — cron-driven autonomous-loop guard
#
# Codex 1-round fix (MEDIUM LOOP-INTEGRITY): true 24h unattended runs require
# durable visibility into the intent queue. This script runs every 15 min via
# cron, checks the queue depth + age, and writes a "wake up next session"
# alert line. Combined with the queue reader's lease-expiry reaper, no inbound
# is permanently dropped on operator absence.

set -euo pipefail
QUEUE=/Users/csnl/csnl_on_ai/harness/state/orchestrator/needs_subagent_response.jsonl
ALERTS=/Users/csnl/csnl_on_ai/harness/state/orchestrator/dispatch_alerts.jsonl
mkdir -p "$(dirname "$ALERTS")"

[ ! -f "$QUEUE" ] && exit 0

PENDING=$(grep -c '"claimed_at": null' "$QUEUE" 2>/dev/null || echo 0)
PENDING=${PENDING:-0}
NOW=$(TZ=Asia/Seoul date '+%Y-%m-%dT%H:%M:%S%z')
SIZE=$(stat -f "%z" "$QUEUE" 2>/dev/null || echo 0)
OLDEST=$(grep '"claimed_at": null' "$QUEUE" 2>/dev/null | head -1 | sed -n 's/.*"at": "\([^"]*\)".*/\1/p' || echo "")

if [ "$PENDING" -gt 0 ]; then
    printf '{"at": "%s", "level": "INFO", "pending_count": %s, "queue_bytes": %s, "oldest_pending_at": "%s", "note": "subagent dispatch needed"}\n' \
        "$NOW" "$PENDING" "$SIZE" "$OLDEST" >> "$ALERTS"
    echo "[dispatch_health_alert] $NOW pending=$PENDING oldest=$OLDEST" >&2
fi
