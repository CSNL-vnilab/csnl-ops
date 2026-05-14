#!/usr/bin/env python3
"""bootstrap.py — load INIT's accumulated archive state (rev 2, Codex-R1 fixes).

Single source of truth for allowed_inits = config/researchers.yaml.
INIT mismatch is FATAL (was warn-and-continue). Atomic writes for cache.
Quarantine parse failures (was silent skip).
"""
from __future__ import annotations
import os, sys, json, argparse, datetime, tempfile, shutil
from pathlib import Path
from dotenv import load_dotenv

PLUGIN_ROOT = Path(__file__).resolve().parent.parent
CACHE_ROOT = Path.home() / ".claude" / "csnl-archive"
ENV_FILE = CACHE_ROOT / ".env"
RESEARCHERS_YAML = PLUGIN_ROOT / "config" / "researchers.yaml"

if ENV_FILE.exists():
    load_dotenv(ENV_FILE)


def load_researchers() -> dict:
    """Single source of truth — config/researchers.yaml."""
    try:
        import yaml
    except ImportError:
        sys.exit("ERROR: PyYAML missing — run install.sh first")
    if not RESEARCHERS_YAML.exists():
        sys.exit(f"ERROR: {RESEARCHERS_YAML} missing — plugin install incomplete")
    with RESEARCHERS_YAML.open() as f:
        data = yaml.safe_load(f)
    by_init = {r["init"]: r for r in data.get("researchers", [])}
    return {"by_init": by_init, "lab": data.get("lab", {})}


def assert_init_valid(init: str, registry: dict) -> dict:
    """FATAL if INIT not in allowlist or inactive. Returns the researcher profile.
    Codex R3 HIGH fix: also FATAL when .env MY_INIT is EMPTY (was: silent pass).
    """
    by_init = registry["by_init"]
    if init not in by_init:
        sys.exit(
            f"ERROR: INIT '{init}' not in registry. Allowed: {sorted(by_init.keys())}\n"
            f"Add a new entry in {RESEARCHERS_YAML} if this is a new researcher."
        )
    profile = by_init[init]
    if not profile.get("active", False):
        sys.exit(
            f"ERROR: INIT '{init}' marked active=false in registry. Cannot run "
            f"interactive session for inactive researcher (role={profile.get('role')})."
        )
    env_init = os.environ.get("MY_INIT", "").strip().upper()
    if not env_init:
        sys.exit(
            f"ERROR: MY_INIT is empty in {ENV_FILE}. Set MY_INIT={init} (or your "
            f"actual initial) before running /archive:bootstrap. This prevents "
            f"accidental cross-INIT runs."
        )
    if env_init != init:
        sys.exit(
            f"ERROR: --init {init} contradicts .env MY_INIT={env_init}. "
            f"Refusing to proceed (cross-INIT contamination guard)."
        )
    return profile


def init_cache(init: str) -> Path:
    p = CACHE_ROOT / init
    (p / "projects").mkdir(parents=True, exist_ok=True)
    (p / "archive").mkdir(parents=True, exist_ok=True)
    (p / "quarantine").mkdir(parents=True, exist_ok=True)  # for unreadable rows
    for f in ["context.md", "interview_log.jsonl", "safe_memory.jsonl"]:
        if not (p / f).exists():
            (p / f).write_text("")
    return p


def atomic_write(path: Path, content: str) -> None:
    """Temp+rename to avoid partial writes on crash."""
    fd, tmp = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except Exception:
        if Path(tmp).exists():
            os.unlink(tmp)
        raise


def pull_central(init: str, profile: dict, lab: dict) -> list[dict]:
    """Read csnl_research.projects WHERE init=<INIT>. Returns [] on offline.

    Supabase session pooler — sslmode=require + RLS context via
    set_config('app.my_init', ...) on every session.
    """
    try:
        import psycopg2, psycopg2.extras
    except ImportError:
        print("[warn] psycopg2 missing — run install.sh first", file=sys.stderr)
        return []
    pwd = os.environ.get("SUPABASE_DB_PASSWORD", "")
    if not pwd:
        print("[warn] SUPABASE_DB_PASSWORD missing in .env — running offline", file=sys.stderr)
        return []
    host = os.environ.get("SUPABASE_DB_HOST", "").strip()
    user = os.environ.get("SUPABASE_DB_USER", "").strip()
    if not host or not user:
        print("[warn] SUPABASE_DB_HOST / SUPABASE_DB_USER missing in .env — running offline",
              file=sys.stderr)
        return []
    try:
        conn = psycopg2.connect(
            host=host,
            port=int(os.environ.get("SUPABASE_DB_PORT", "5432")),
            dbname="postgres",  # always 'postgres' on Supabase
            user=user,
            password=pwd,
            sslmode="require",
            connect_timeout=10,
        )
    except Exception as e:
        print(f"[warn] Supabase connect failed ({e!r}) — running offline. "
              f"Hint: project may be paused — wake via Dashboard.", file=sys.stderr)
        return []

    rows: list[dict] = []
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # RLS + schema scoping — must run on every session
            cur.execute("SET search_path TO csnl_research, public;")
            cur.execute("SELECT set_config('app.my_init', %s, false);", (init,))
            cur.execute(
                "SELECT init, project_slug, title, phase, "
                "purpose_jsonb, background_jsonb, apparatus_jsonb, "
                "modalities_jsonb, experiment_design_jsonb, "
                "manipulation_variables_jsonb, code_artifacts_jsonb, "
                "data_artifacts_jsonb, analysis_pipeline_jsonb, "
                "results_jsonb, interpretation_jsonb, connected_graph_jsonb, "
                "timeline_jsonb, external_refs_jsonb, meta_jsonb, "
                "confidence_avg, row_version, last_updated_at "
                "FROM csnl_research.projects WHERE init = %s ORDER BY project_slug",
                (init,),
            )
            for r in cur.fetchall():
                row = {
                    "init": r["init"], "project_slug": r["project_slug"],
                    "title": r["title"], "phase": r["phase"],
                    "purpose": r["purpose_jsonb"], "background": r["background_jsonb"],
                    "apparatus": r["apparatus_jsonb"], "modalities": r["modalities_jsonb"],
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
    """Atomic merge with quarantine for parse failures."""
    proj_dir = init_dir / "projects"
    quarantine_dir = init_dir / "quarantine"
    central_by_slug = {r["project_slug"]: r for r in central_rows}
    local_by_slug = {}
    parse_failures = 0
    for jf in sorted(proj_dir.glob("*.json")):
        if "conflict-" in jf.name:
            continue
        try:
            local_by_slug[jf.stem] = json.loads(jf.read_text())
        except Exception as e:
            # Quarantine — move to /quarantine/ instead of silent skip
            target = quarantine_dir / f"{jf.name}.parsefail-{int(datetime.datetime.now().timestamp())}"
            shutil.move(str(jf), str(target))
            print(f"[warn] {jf.name} parse fail ({e!r}) → quarantined to {target}", file=sys.stderr)
            parse_failures += 1

    written, conflicts = 0, 0
    for slug, c_row in central_by_slug.items():
        local_row = local_by_slug.get(slug)
        if not local_row:
            atomic_write(proj_dir / f"{slug}.json", json.dumps(c_row, ensure_ascii=False, indent=2))
            written += 1
            continue
        c_v = (c_row.get("_meta") or {}).get("row_version", 0)
        l_v = (local_row.get("_meta") or {}).get("row_version", 0)
        if c_v > l_v:
            ts = int(datetime.datetime.now().timestamp())
            atomic_write(proj_dir / f"{slug}.conflict-{ts}.json",
                         json.dumps(local_row, ensure_ascii=False, indent=2))
            atomic_write(proj_dir / f"{slug}.json",
                         json.dumps(c_row, ensure_ascii=False, indent=2))
            conflicts += 1
    return {"central_pulled": len(central_rows), "merged": written,
            "conflicts": conflicts, "parse_failures": parse_failures}


def find_latest_handoff(init_dir: Path) -> Path | None:
    candidates = sorted(init_dir.glob("handoff-*.md"))
    return candidates[-1] if candidates else None


def compute_top_missing(rows: list[dict]) -> tuple[str, str] | None:
    """Codex R2 HIGH fix: read top-level missing_or_ambiguous (per template),
    fall back to _meta.missing_or_ambiguous for backcompat.
    """
    best = None
    for r in rows:
        # Try top-level first (template schema)
        ma = r.get("missing_or_ambiguous")
        if ma is None:
            ma = (r.get("_meta") or {}).get("missing_or_ambiguous")
        if not isinstance(ma, list):
            continue
        conf = (r.get("_meta") or {}).get("confidence_avg") or 1.0
        for node in ma:
            score = (1.0 - float(conf))
            if best is None or score > best[0]:
                node_id = node.get("node") if isinstance(node, dict) else str(node)
                why = node.get("why", "") if isinstance(node, dict) else ""
                best = (score, r["project_slug"], node_id, why)
    if best is None:
        return None
    return f"{best[1]}.{best[2]}", best[3]


def append_interview_log(init_dir: Path, event: dict) -> None:
    """Codex R2 HIGH fix: bootstrap actually appends an interview_log entry."""
    log_path = init_dir / "interview_log.jsonl"
    with log_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")
        f.flush()
        os.fsync(f.fileno())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--init", required=True)
    ap.add_argument("--offline", action="store_true")
    args = ap.parse_args()
    init = args.init.upper()

    registry = load_researchers()
    profile = assert_init_valid(init, registry)  # FATAL on bad input
    init_dir = init_cache(init)

    rows = [] if args.offline else pull_central(init, profile, registry["lab"])
    merge_stats = merge_local(init_dir, rows)
    handoff = find_latest_handoff(init_dir)
    top_missing = compute_top_missing(rows)
    now_iso = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).isoformat(timespec="seconds")

    # Codex R2 HIGH fix: actually append interview_log entry as promised by /archive:bootstrap
    append_interview_log(init_dir, {
        "at": now_iso,
        "init": init,
        "event": "bootstrap",
        "row_count": merge_stats["central_pulled"],
        "conflicts": merge_stats["conflicts"],
        "parse_failures": merge_stats["parse_failures"],
        "top_missing": top_missing,
        "offline": args.offline,
    })

    # Resolve effective NAS root per layout (Codex R2 MEDIUM 7 — use nas_layout)
    lab_nas_root = (registry["lab"] or {}).get("nas_root_default", "/Volumes/CSNL_new-1/Memory")
    env_nas_root = os.environ.get("NAS_ROOT", "").strip()
    base_nas = profile.get("nas_root_override") or env_nas_root or lab_nas_root
    layout = profile.get("nas_layout", "standard")
    if layout == "empty_with_mentor" and profile.get("mentor_init"):
        scope_hint = f"{base_nas}/{profile['mentor_init']}/"
        scope_note = f"empty_with_mentor: scope = mentor {profile['mentor_init']}/ tree"
    elif layout == "atypical_flat":
        scope_hint = f"{base_nas}/{init}/"
        scope_note = "atypical_flat: <INIT>/Code/, Data/, Context/, Results/ as sibling project dirs"
    else:
        scope_hint = f"{base_nas}/{init}/"
        scope_note = "standard: <INIT>/<project>/{Code,Data,...}"

    out = {
        "init": init,
        "name": profile.get("name"),
        "role": profile.get("role"),
        "mentor_init": profile.get("mentor_init"),
        "nas_layout": layout,
        "nas_scope_hint": scope_hint,
        "nas_scope_note": scope_note,
        "cache_dir": str(init_dir),
        "central_rows_pulled": merge_stats["central_pulled"],
        "merged_to_local": merge_stats["merged"],
        "conflicts_backed_up": merge_stats["conflicts"],
        "parse_failures_quarantined": merge_stats["parse_failures"],
        "latest_handoff": str(handoff) if handoff else None,
        "top_missing": top_missing,
        "at": now_iso,
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
