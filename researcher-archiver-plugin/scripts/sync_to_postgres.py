#!/usr/bin/env python3
"""sync_to_postgres.py — push local row changes to central csnl_v3.public.projects.

Per-INIT scoped — refuses to write any row whose `init` field doesn't match
the --init argument (cross-INIT contamination guard).

Usage:
  python3 sync_to_postgres.py --init JOP
  python3 sync_to_postgres.py --init JOP --dry-run
"""
from __future__ import annotations
import os, sys, json, argparse, datetime
from pathlib import Path
from dotenv import load_dotenv

CACHE_ROOT = Path.home() / ".claude" / "csnl-archive"
ENV_FILE = CACHE_ROOT / ".env"

if ENV_FILE.exists():
    load_dotenv(ENV_FILE)


def load_local_rows(init: str) -> list[dict]:
    proj_dir = CACHE_ROOT / init / "projects"
    rows = []
    for jf in sorted(proj_dir.glob("*.json")):
        if "conflict-" in jf.name:
            continue
        try:
            r = json.loads(jf.read_text())
            if r.get("init") != init:
                print(f"[warn] {jf} has init={r.get('init')} != {init} — SKIP", file=sys.stderr)
                continue
            rows.append(r)
        except Exception as e:
            print(f"[warn] {jf} parse fail: {e}", file=sys.stderr)
    return rows


def upsert(cur, row: dict, dry: bool):
    meta = row.get("_meta") or {}
    payload = (
        row["init"], row["project_slug"], row.get("title"), row.get("phase"),
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
    )
    if dry:
        return "would-upsert"
    cur.execute(
        """
        INSERT INTO public.projects (
            init, project_slug, title, phase,
            purpose_jsonb, background_jsonb, apparatus_jsonb, modalities_jsonb,
            experiment_design_jsonb, manipulation_variables_jsonb,
            code_artifacts_jsonb, data_artifacts_jsonb,
            analysis_pipeline_jsonb, results_jsonb, interpretation_jsonb,
            connected_graph_jsonb, timeline_jsonb, external_refs_jsonb,
            meta_jsonb, confidence_avg, row_version, last_updated_at
        ) VALUES (%s,%s,%s,%s, %s,%s,%s,%s, %s,%s, %s,%s, %s,%s,%s, %s,%s,%s, %s,%s,%s,%s)
        ON CONFLICT (init, project_slug) DO UPDATE SET
            title = EXCLUDED.title, phase = EXCLUDED.phase,
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
        WHERE public.projects.row_version <= EXCLUDED.row_version
        """,
        payload,
    )
    return "upserted"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--init", required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    init = args.init.upper()
    env_init = os.environ.get("MY_INIT", "").upper()
    if env_init and env_init != init:
        sys.exit(f"refused: $MY_INIT={env_init} != --init {init} (cross-INIT guard)")

    rows = load_local_rows(init)
    if not rows:
        print(f"no local rows for {init}")
        return 0

    try:
        import psycopg2
        conn = psycopg2.connect(
            host=os.environ.get("PG_HOST", "csnls-mac-studio.local"),
            port=int(os.environ.get("PG_PORT", "5432")),
            dbname=os.environ.get("PG_DBNAME", "csnl_v3"),
            user=os.environ.get("PG_USER", "harness_worker"),
            password=os.environ.get("PG_WORKER_PASSWORD", ""),
            connect_timeout=10,
        )
    except Exception as e:
        sys.exit(f"Postgres connect failed: {e!r}")

    n_ok, n_skip = 0, 0
    try:
        with conn.cursor() as cur:
            for r in rows:
                try:
                    result = upsert(cur, r, args.dry_run)
                    n_ok += 1
                    print(f"  {r['init']}/{r['project_slug']} v{(r.get('_meta') or {}).get('row_version','?')}: {result}")
                except Exception as e:
                    print(f"  {r['init']}/{r['project_slug']}: FAIL {e!r}", file=sys.stderr)
                    n_skip += 1
        if not args.dry_run:
            conn.commit()
    finally:
        conn.close()
    print(f"\nsynced {n_ok} row(s){', '+str(n_skip)+' skipped' if n_skip else ''} (init={init})")
    return 0 if n_skip == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
