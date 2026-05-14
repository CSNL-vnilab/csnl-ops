#!/usr/bin/env python3
"""Sync state/orchestrator/projects/<INIT>/<slug>.json → csnl_v3.projects (Phase 1 archive).

Usage:
  python scripts/sync_projects_to_postgres.py            # upsert all + show diff
  python scripts/sync_projects_to_postgres.py --dry-run  # show what would change
"""
from __future__ import annotations
import os, sys, json, argparse, datetime
from pathlib import Path
from dotenv import load_dotenv
import psycopg2
import psycopg2.extras

HARNESS = Path("/Users/csnl/csnl_on_ai/harness")
load_dotenv(HARNESS / ".env")
PROJECTS_DIR = HARNESS / "state" / "orchestrator" / "projects"

PG_DSN = dict(
    host="127.0.0.1", port=5432, dbname="csnl_v3",
    user="harness_worker", password=os.environ.get("PG_WORKER_PASSWORD",""),
)


def load_rows() -> list[dict]:
    rows = []
    for init_dir in sorted(PROJECTS_DIR.iterdir()):
        if not init_dir.is_dir():
            continue
        for jf in sorted(init_dir.glob("*.json")):
            try:
                data = json.loads(jf.read_text())
                rows.append(data)
            except Exception as e:
                print(f"  WARN: {jf} parse fail: {e}", file=sys.stderr)
    return rows


def upsert_row(cur, row: dict):
    init = row["init"]
    slug = row["project_slug"]
    meta = row.get("_meta") or {}
    cur.execute(
        """
        INSERT INTO public.projects (
            init, project_slug, title, phase, active_since,
            purpose_jsonb, background_jsonb, apparatus_jsonb, modalities_jsonb,
            experiment_design_jsonb, manipulation_variables_jsonb,
            code_artifacts_jsonb, data_artifacts_jsonb,
            analysis_pipeline_jsonb, results_jsonb, interpretation_jsonb,
            connected_graph_jsonb, timeline_jsonb, external_refs_jsonb,
            meta_jsonb, confidence_avg, row_version, last_updated_at
        ) VALUES (
            %s, %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s,
            %s, %s,
            %s, %s, %s,
            %s, %s, %s,
            %s, %s, %s, %s
        )
        ON CONFLICT (init, project_slug) DO UPDATE SET
            title = EXCLUDED.title,
            phase = EXCLUDED.phase,
            active_since = EXCLUDED.active_since,
            purpose_jsonb = EXCLUDED.purpose_jsonb,
            background_jsonb = EXCLUDED.background_jsonb,
            apparatus_jsonb = EXCLUDED.apparatus_jsonb,
            modalities_jsonb = EXCLUDED.modalities_jsonb,
            experiment_design_jsonb = EXCLUDED.experiment_design_jsonb,
            manipulation_variables_jsonb = EXCLUDED.manipulation_variables_jsonb,
            code_artifacts_jsonb = EXCLUDED.code_artifacts_jsonb,
            data_artifacts_jsonb = EXCLUDED.data_artifacts_jsonb,
            analysis_pipeline_jsonb = EXCLUDED.analysis_pipeline_jsonb,
            results_jsonb = EXCLUDED.results_jsonb,
            interpretation_jsonb = EXCLUDED.interpretation_jsonb,
            connected_graph_jsonb = EXCLUDED.connected_graph_jsonb,
            timeline_jsonb = EXCLUDED.timeline_jsonb,
            external_refs_jsonb = EXCLUDED.external_refs_jsonb,
            meta_jsonb = EXCLUDED.meta_jsonb,
            confidence_avg = EXCLUDED.confidence_avg,
            row_version = EXCLUDED.row_version,
            last_updated_at = EXCLUDED.last_updated_at
        """,
        (
            init, slug, row.get("title"), row.get("phase"), row.get("active_since"),
            json.dumps(row.get("purpose")) if row.get("purpose") else None,
            json.dumps(row.get("background")) if row.get("background") else None,
            json.dumps(row.get("apparatus")) if row.get("apparatus") else None,
            json.dumps(row.get("modalities")) if row.get("modalities") else None,
            json.dumps(row.get("experiment_design")) if row.get("experiment_design") else None,
            json.dumps(row.get("manipulation_variables")) if row.get("manipulation_variables") else None,
            json.dumps(row.get("code_artifacts")) if row.get("code_artifacts") else None,
            json.dumps(row.get("data_artifacts")) if row.get("data_artifacts") else None,
            json.dumps(row.get("analysis_pipeline")) if row.get("analysis_pipeline") else None,
            json.dumps(row.get("results")) if row.get("results") else None,
            json.dumps(row.get("interpretation")) if row.get("interpretation") else None,
            json.dumps(row.get("connected_graph")) if row.get("connected_graph") else None,
            json.dumps(row.get("timeline")) if row.get("timeline") else None,
            json.dumps(row.get("external_refs")) if row.get("external_refs") else None,
            json.dumps(meta) if meta else None,
            meta.get("confidence_avg"),
            meta.get("row_version", 1),
            meta.get("last_updated_at") or datetime.datetime.utcnow().isoformat(),
        ),
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    rows = load_rows()
    print(f"Loaded {len(rows)} project rows from {PROJECTS_DIR}")
    for r in rows:
        meta = r.get("_meta") or {}
        print(f"  {r['init']}/{r['project_slug']}: phase={r.get('phase')} "
              f"row_v={meta.get('row_version','?')} conf={meta.get('confidence_avg','?')}")

    if args.dry_run:
        print("DRY RUN — no upserts.")
        return 0

    conn = psycopg2.connect(**PG_DSN)
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            for r in rows:
                upsert_row(cur, r)
            cur.execute("SELECT COUNT(*) FROM public.projects;")
            count = cur.fetchone()[0]
        conn.commit()
        print(f"\nUpserted {len(rows)} rows. csnl_v3.projects total = {count}")
    except Exception as e:
        conn.rollback()
        print(f"ROLLBACK due to: {e!r}", file=sys.stderr)
        return 1
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
