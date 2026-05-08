# csnl-ops → _lab_ai_harness Bridge

## Why This Exists

`csnl-ops` tracks NAS sync anomalies in `csnl_ops.sync_anomalies` (Supabase).
The `_lab_ai_harness` drives Slack-based researcher outreach. Neither service
should reach into the other's internals — the inbox JSON is the sole contract.

`export-anomalies-for-harness.mjs` reads unpushed anomaly rows and writes a
single file that the harness consumes during its digest cycle.

Only two kinds are bridged:
- `mm_slides_missing` — researcher-specific; grouped under their initial.
- `grm_presenter_missing` — presenter unknown; grouped under `lab_wide`.

Operational kinds (`grm_orphan_file`, `special_grm_promoted`, etc.) are never
pushed and their `pushed_to_harness_at` stays NULL permanently.

## Inbox File

**Path:** `/Volumes/CSNL_new-2/Memory/_lab_ai_harness/state/csnl_ops_inbox.json`

Written atomically (tmp → rename). Overwritten on each run; idempotent.

## JSON Schema (schema_version = 1)

```jsonc
{
  "generated_at": "2026-05-08T03:00:00.000Z",   // ISO 8601 UTC
  "schema_version": 1,
  "source": "csnl-ops",
  "groups": {
    "<initial>": {                                // e.g. "JOP", "MJC"
      "anomalies": [
        {
          "id": "<uuid>",
          "kind": "mm_slides_missing",
          "summary_ko": "<Korean one-sentence description>",
          "context": {
            "meeting_date": "YYYY-MM-DD",
            "researcher_initial": "<INIT>"
          },
          "created_at": "<ISO>"
        }
      ]
    },
    "lab_wide": {                                 // grm_presenter_missing rows
      "anomalies": [
        {
          "id": "<uuid>",
          "kind": "grm_presenter_missing",
          "summary_ko": "<Korean one-sentence description>",
          "context": {
            "meeting_date": "YYYY-MM-DD",
            "event_title": "<title or null>",
            "calendar_id": "<id or null>"
          },
          "created_at": "<ISO>"
        }
      ]
    }
  },
  "totals": {
    "mm_slides_missing": 3,
    "grm_presenter_missing": 1
  }
}
```

`initial` keys are sorted alphabetically; `lab_wide` is always last.

## Harness Consumption (Suggested Pattern)

During the weekly digest cycle `weekly_corpus_sync.py` should:

1. Check whether `state/csnl_ops_inbox.json` exists.
2. Parse it and merge `groups["<initial>"]` entries into each researcher's
   campaign prompt alongside their DM channel from `state/dm_channel_map.json`.
3. Merge `groups["lab_wide"]` into the PI / lab-wide message thread.
4. After dispatching, delete or rotate the file (e.g. rename to
   `csnl_ops_inbox_YYYYMMDD.json.bak`) to prevent re-delivery.

The harness owns Slack UID lookup entirely via `dm_channel_map.json`.
csnl-ops never writes to any other harness state file.

## Handshake

- csnl-ops stamps `pushed_to_harness_at = now()` on every exported row after
  a successful file write.
- If the harness deletes or rotates the inbox, csnl-ops will not re-export
  already-stamped rows (filter: `pushed_to_harness_at IS NULL`).
- If the DB stamp fails after a successful write, re-running the script is safe
  — it re-exports the same rows and overwrites the inbox file.
