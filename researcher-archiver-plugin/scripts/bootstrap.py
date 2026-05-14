#!/usr/bin/env python3
"""bootstrap.py — load INIT's accumulated archive state.

Called by /archive:bootstrap. Pulls central Postgres rows + merges with local
cache, then writes summary to stdout for Claude to consume.

Usage:
  python3 bootstrap.py --init JOP
  python3 bootstrap.py --init JOP --offline  (skip Postgres)
"""
from __future__ import annotations
import os, sys, json, argparse, datetime
from pathlib import Path
from dotenv import load_dotenv

CACHE_ROOT = Path.home() / ".claude" / "csnl-archive"
ENV_FILE = CACHE_ROOT / ".env"
ALLOWED_INITS = {"JOP", "BYL", "MSY", "SMJ", "JYK", "BHL", "SYJ"}

if ENV_FILE.exists():
    load_dotenv(ENV_FILE)


def init_cache(init: str) -> Path:
    p = CACHE_ROOT / init
    (p / "projects").mkdir(parents=True, exist_ok=True)
    (p / "archive").mkdir(parents=True, exist_ok=True)
    for f in ["context.md", "interview_log.jsonl", "safe_memory.jsonl"]:
        if not (p / f).exists():
            (p / f).write_text("")
    return p


def pull_central(init: str) -> list[dict]:
    try:
        import psycopg2, psycopg2.extras
    except ImportError:
        print("[warn] psycopg2 missing — run install.sh first", file=sys.stderr)
        return []
    pwd = os.environ.get("PG_WORKER_PASSWORD", "")
    if not pwd:
        print("[warn] PG_WORKER_PASSWORD missing in .env — running offline", file=sys.stderr)
        return []
    try:
        conn = psycopg2.connect(
            host=os.environ.get("PG_HOST", "csnls-mac-studio.local"),
            port=int(os.environ.get("PG_PORT", "5432")),
            dbname=os.environ.get("PG_DBNAME", "csnl_v3"),
            user=os.environ.get("PG_USER", "harness_worker"),
            password=pwd,
            connect_timeout=10,
        )
    except Exception as e:
        print(f"[warn] Postgres connect failed ({e!r}) — running offline", file=sys.stderr)
        return []

    rows: list[dict] = []
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT init, project_slug, title, phase, "
                "purpose_jsonb, background_jsonb, apparatus_jsonb, "
                "modalities_jsonb, experiment_design_jsonb, "
                "manipulation_variables_jsonb, code_artifacts_jsonb, "
                "data_artifacts_jsonb, analysis_pipeline_jsonb, "
                "results_jsonb, interpretation_jsonb, connected_graph_jsonb, "
                "timeline_jsonb, external_refs_jsonb, meta_jsonb, "
                "confidence_avg, row_version, last_updated_at "
                "FROM public.projects WHERE init = %s ORDER BY project_slug",
                (init,),
            )
            for r in cur.fetchall():
                # Reconstruct nested JSON structure
                row = {
                    "init": r["init"],
                    "project_slug": r["project_slug"],
                    "title": r["title"],
                    "phase": r["phase"],
                    "purpose": r["purpose_jsonb"],
                    "background": r["background_jsonb"],
                    "apparatus": r["apparatus_jsonb"],
                    "modalities": r["modalities_jsonb"],
                    "experiment_design": r["experiment_design_jsonb"],
                    "manipulation_variables": r["manipulation_variables_jsonb"],
                    "code_artifacts": r["code_artifacts_jsonb"],
                    "data_artifacts": r["data_artifacts_jsonb"],
                    "analysis_pipeline": r["analysis_pipeline_jsonb"],
                    "results": r["results_jsonb"],
                    "interpretation": r["interpretation_jsonb"],
                    "connected_graph": r["connected_graph_jsonb"],
                    "timeline": r["timeline_jsonb"],
                    "external_refs": r["external_refs_jsonb"],
                    "_meta": dict(r["meta_jsonb"] or {}),
                }
                row["_meta"]["row_version"] = r["row_version"]
                row["_meta"]["confidence_avg"] = float(r["confidence_avg"]) if r["confidence_avg"] is not None else None
                row["_meta"]["last_updated_at"] = r["last_updated_at"].isoformat() if r["last_updated_at"] else None
                rows.append(row)
    finally:
        conn.close()
    return rows


def merge_local(init_dir: Path, central_rows: list[dict]) -> dict:
    """Write central rows to local cache; preserve local row if local row_version >= central."""
    proj_dir = init_dir / "projects"
    central_by_slug = {r["project_slug"]: r for r in central_rows}
    local_by_slug = {}
    for jf in sorted(proj_dir.glob("*.json")):
        try:
            local_by_slug[jf.stem] = json.loads(jf.read_text())
        except Exception:
            pass
    written = 0
    conflicts = 0
    for slug, c_row in central_by_slug.items():
        local_row = local_by_slug.get(slug)
        if not local_row:
            (proj_dir / f"{slug}.json").write_text(json.dumps(c_row, ensure_ascii=False, indent=2))
            written += 1
            continue
        c_v = (c_row.get("_meta") or {}).get("row_version", 0)
        l_v = (local_row.get("_meta") or {}).get("row_version", 0)
        if c_v > l_v:
            # central newer — overwrite local, but back up the local
            backup = proj_dir / f"{slug}.conflict-{int(datetime.datetime.now().timestamp())}.json"
            backup.write_text(json.dumps(local_row, ensure_ascii=False, indent=2))
            (proj_dir / f"{slug}.json").write_text(json.dumps(c_row, ensure_ascii=False, indent=2))
            conflicts += 1
        # if local >= central, keep local (sync-db will push later)
    return {"central_pulled": len(central_rows), "merged": written, "conflicts": conflicts}


def find_latest_handoff(init_dir: Path) -> Path | None:
    candidates = sorted(init_dir.glob("handoff-*.md"))
    return candidates[-1] if candidates else None


def compute_top_missing(rows: list[dict]) -> tuple[str, str] | None:
    """Pick the highest-priority missing/ambiguous node across rows."""
    best = None
    for r in rows:
        ma = (r.get("_meta") or {}).get("missing_or_ambiguous") or []
        if not isinstance(ma, list):
            continue
        conf = (r.get("_meta") or {}).get("confidence_avg") or 1.0
        for node in ma:
            score = (1.0 - conf)
            if best is None or score > best[0]:
                node_id = node.get("node") if isinstance(node, dict) else str(node)
                why = node.get("why", "") if isinstance(node, dict) else ""
                best = (score, r["project_slug"], node_id, why)
    if best is None:
        return None
    return f"{best[1]}.{best[2]}", best[3]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--init", required=True)
    ap.add_argument("--offline", action="store_true")
    args = ap.parse_args()
    init = args.init.upper()
    if init not in ALLOWED_INITS:
        sys.exit(f"unknown INIT: {init} (allowed: {sorted(ALLOWED_INITS)})")
    env_init = os.environ.get("MY_INIT", "").upper()
    if env_init and env_init != init:
        print(f"[warn] $MY_INIT={env_init} != requested {init}; using {init}", file=sys.stderr)

    init_dir = init_cache(init)
    rows = []
    if not args.offline:
        rows = pull_central(init)
    merge_stats = merge_local(init_dir, rows)
    handoff = find_latest_handoff(init_dir)
    top_missing = compute_top_missing(rows)

    out = {
        "init": init,
        "cache_dir": str(init_dir),
        "central_rows_pulled": merge_stats["central_pulled"],
        "merged_to_local": merge_stats["merged"],
        "conflicts_backed_up": merge_stats["conflicts"],
        "latest_handoff": str(handoff) if handoff else None,
        "top_missing": top_missing,
        "at": datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).isoformat(timespec="seconds"),
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
