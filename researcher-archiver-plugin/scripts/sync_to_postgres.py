#!/usr/bin/env python3
"""sync_to_postgres.py — push local row changes to csnl_v3.public.projects (rev 2).

Codex R1 fixes:
- Single source allowed_inits from config/researchers.yaml
- Filter by .last_sync (only changed rows since last sync)
- Atomic row_version bump (local v → v+1 before UPSERT)
- rowcount check (detect zero-row updates as central-version-newer conflict)
- Conflict backup as conflict-<ts>.json
- Cross-INIT guard: refuse if MY_INIT != row.init OR --init mismatch
"""
from __future__ import annotations
import os, sys, json, argparse, datetime, tempfile
from pathlib import Path
from dotenv import load_dotenv

PLUGIN_ROOT = Path(__file__).resolve().parent.parent
CACHE_ROOT = Path.home() / ".claude" / "csnl-archive"
ENV_FILE = CACHE_ROOT / ".env"
RESEARCHERS_YAML = PLUGIN_ROOT / "config" / "researchers.yaml"

if ENV_FILE.exists():
    load_dotenv(ENV_FILE)


def load_allowed_inits() -> set[str]:
    try:
        import yaml
    except ImportError:
        sys.exit("ERROR: PyYAML missing — run install.sh first")
    with RESEARCHERS_YAML.open() as f:
        data = yaml.safe_load(f)
    return {r["init"] for r in data.get("researchers", [])}


def load_changed_rows(init: str) -> list[tuple[Path, dict]]:
    """Codex R2 CRITICAL fix: use per-row last_synced_version (not timestamp).
    A row is changed iff _meta.row_version != _meta.last_synced_version.
    """
    proj_dir = CACHE_ROOT / init / "projects"
    rows = []
    for jf in sorted(proj_dir.glob("*.json")):
        if "conflict-" in jf.name:
            continue
        try:
            r = json.loads(jf.read_text())
            if r.get("init") != init:
                print(f"[warn] {jf} has init={r.get('init')} != {init} — SKIP "
                      f"(cross-INIT guard)", file=sys.stderr)
                continue
            meta = r.get("_meta") or {}
            rv = int(meta.get("row_version", 0))
            lsv = meta.get("last_synced_version")
            if lsv is None or rv != int(lsv):
                rows.append((jf, r))
        except Exception as e:
            print(f"[warn] {jf} parse fail: {e}", file=sys.stderr)
    return rows


def fetch_central_version(cur, init: str, slug: str) -> int | None:
    """Read central row_version for optimistic CAS. Returns None if no row."""
    cur.execute(
        "SELECT row_version FROM public.projects WHERE init=%s AND project_slug=%s",
        (init, slug),
    )
    r = cur.fetchone()
    return int(r[0]) if r else None


def write_row(jf: Path, row: dict) -> dict:
    """Atomic temp+rename + ensure _meta.last_updated_at is current."""
    meta = row.setdefault("_meta", {})
    meta["last_updated_at"] = datetime.datetime.now(
        datetime.timezone(datetime.timedelta(hours=9))
    ).isoformat(timespec="seconds")
    fd, tmp = tempfile.mkstemp(prefix=f".{jf.name}.", suffix=".tmp", dir=jf.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False, indent=2))
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, jf)
    except Exception:
        if Path(tmp).exists():
            os.unlink(tmp)
        raise
    return row


def upsert(cur, row: dict, central_v: int | None, dry: bool) -> tuple[str, int]:
    """Optimistic CAS UPSERT.
    Codex R2 CRITICAL fix: caller passes central_v (pre-fetched). We bump
    local row_version to max(central_v, local_lsv) + 1 right before UPSERT,
    so concurrent devices never collide on the same version.

    Returns (status, rowcount). status ∈ {inserted, updated, conflict, dry}.
    """
    meta = row.setdefault("_meta", {})
    local_v = int(meta.get("row_version", 0))
    local_lsv = int(meta.get("last_synced_version") or 0)
    # Optimistic CAS — refuse if local hasn't seen the latest central
    if central_v is not None and local_lsv < central_v:
        return ("conflict", 0)
    # Bump beyond central + local
    new_v = max(central_v or 0, local_v, local_lsv) + 1
    meta["row_version"] = new_v
    meta["last_updated_at"] = datetime.datetime.now(
        datetime.timezone(datetime.timedelta(hours=9))
    ).isoformat(timespec="seconds")
    # Codex R2 — strip per-PC fields from meta_jsonb before pushing to central
    meta_central = {k: v for k, v in meta.items() if k != "last_synced_version"}
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
        json.dumps(meta_central) if meta_central else None,
        meta_central.get("confidence_avg"),
        new_v,
        meta_central.get("last_updated_at") or datetime.datetime.utcnow().isoformat(),
    )
    if dry:
        return ("dry", 0)
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
        WHERE public.projects.row_version < EXCLUDED.row_version
        RETURNING (xmax = 0) AS inserted, row_version
        """,
        payload,
    )
    fetched = cur.fetchone()
    if fetched is None:
        return ("conflict", 0)
    inserted, db_v = fetched[0], fetched[1]
    # Mark local as synced
    meta["last_synced_version"] = int(db_v)
    return ("inserted" if inserted else "updated", 1)


def backup_conflict(jf: Path, row: dict) -> Path:
    ts = int(datetime.datetime.now().timestamp())
    target = jf.parent / f"{jf.stem}.conflict-{ts}.json"
    target.write_text(json.dumps(row, ensure_ascii=False, indent=2))
    return target


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--init", required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    init = args.init.upper()

    allowed = load_allowed_inits()
    if init not in allowed:
        sys.exit(f"refused: --init {init} not in registry. Allowed: {sorted(allowed)}")
    env_init = os.environ.get("MY_INIT", "").upper()
    if env_init and env_init != init:
        sys.exit(f"refused: $MY_INIT={env_init} != --init {init} (cross-INIT guard)")

    candidates = load_changed_rows(init)
    if not candidates:
        print(f"no changed rows for {init} (all rows up-to-date with central)")
        return 0
    print(f"found {len(candidates)} changed row(s) (row_version != last_synced_version)")

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

    n_ins, n_upd, n_conflict, n_skip = 0, 0, 0, 0
    try:
        with conn.cursor() as cur:
            for jf, row in candidates:
                try:
                    central_v = fetch_central_version(cur, row["init"], row["project_slug"])
                    status, rc = upsert(cur, row, central_v, args.dry_run)
                    if not args.dry_run and status in ("inserted", "updated"):
                        # Persist new row_version + last_synced_version
                        write_row(jf, row)
                    v = (row.get("_meta") or {}).get("row_version", "?")
                    if status == "inserted":
                        print(f"  {row['init']}/{row['project_slug']} v{v}: INSERT (rowcount={rc})")
                        n_ins += 1
                    elif status == "updated":
                        print(f"  {row['init']}/{row['project_slug']} v{v}: UPDATE (rowcount={rc}, central was v{central_v})")
                        n_upd += 1
                    elif status == "conflict":
                        backup = backup_conflict(jf, row)
                        print(f"  {row['init']}/{row['project_slug']} v{v}: CONFLICT — "
                              f"central is v{central_v}, your local_synced_version is "
                              f"{(row.get('_meta') or {}).get('last_synced_version')}. "
                              f"Local backed up to {backup.name}. Run /archive:bootstrap to pull + re-merge.")
                        n_conflict += 1
                    elif status == "dry":
                        print(f"  {row['init']}/{row['project_slug']} v{v}: dry-run")
                except Exception as e:
                    print(f"  {row.get('init','?')}/{row.get('project_slug','?')}: FAIL {e!r}",
                          file=sys.stderr)
                    n_skip += 1
        if not args.dry_run:
            conn.commit()
    finally:
        conn.close()

    print(f"\nsynced: {n_ins} inserted, {n_upd} updated, {n_conflict} conflict(s), {n_skip} skipped (init={init})")
    return 0 if (n_skip + n_conflict) == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
