-- =============================================================================
-- 20260508000002_anomaly_push_tracking.sql
--
-- Adds pushed_to_harness_at to csnl_ops.sync_anomalies.
--
-- Role of this column:
--   export-anomalies-for-harness.mjs reads rows where pushed_to_harness_at IS
--   NULL (and resolved_at IS NULL), writes them to the _lab_ai_harness inbox
--   JSON, then stamps this column with now().  The harness never writes back
--   to csnl_ops — the stamp is the sole handshake that prevents re-delivery.
--
--   Only anomaly kinds that the harness acts on are ever stamped:
--     • mm_slides_missing
--     • grm_presenter_missing
--   Operational kinds (grm_orphan_file, special_grm_promoted, etc.) remain
--   NULL permanently; the index below excludes them via the kind filter.
-- =============================================================================

ALTER TABLE csnl_ops.sync_anomalies
  ADD COLUMN IF NOT EXISTS pushed_to_harness_at timestamptz;

COMMENT ON COLUMN csnl_ops.sync_anomalies.pushed_to_harness_at IS
  'Timestamp when this anomaly was written to the _lab_ai_harness inbox JSON. '
  'NULL = not yet published. Set by export-anomalies-for-harness.mjs after '
  'atomic file write succeeds. Only mm_slides_missing and grm_presenter_missing '
  'rows are ever stamped; operational kinds stay NULL.';

-- Partial index for the export query: unpushed, unresolved rows ordered cheaply.
CREATE INDEX IF NOT EXISTS sync_anomalies_unpushed_idx
  ON csnl_ops.sync_anomalies (kind, created_at)
  WHERE pushed_to_harness_at IS NULL
    AND resolved_at IS NULL;
