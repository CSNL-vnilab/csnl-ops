#!/usr/bin/env python3
"""doctor.py — Opus AR2 H-2 fix: diagnostic for silent-failure detection.

Checks: .env keys, plugin install, Postgres connectivity, NAS root, local
cache drift, conflict file age. Read-only — never modifies state.

Usage:
  doctor.py                 # full check
  doctor.py --quick         # skip Postgres + NAS reachability tests
"""
from __future__ import annotations
import os, sys, json, argparse, datetime
from pathlib import Path
from dotenv import load_dotenv

PLUGIN_ROOT = Path(__file__).resolve().parent.parent
CACHE_ROOT = Path.home() / ".claude" / "csnl-archive"
ENV_FILE = CACHE_ROOT / ".env"
PLUGINS_DIR = Path.home() / ".claude" / "plugins"
RESEARCHERS_YAML = PLUGIN_ROOT / "config" / "researchers.yaml"

if ENV_FILE.exists():
    load_dotenv(ENV_FILE)


def check_env() -> list[tuple[str, bool, str]]:
    """Returns [(check_name, passed, detail), ...]."""
    out = []
    required = ["MY_INIT", "PG_HOST", "PG_PORT", "PG_DBNAME", "PG_USER", "PG_WORKER_PASSWORD"]
    optional = ["NAS_ROOT"]
    for k in required:
        val = os.environ.get(k, "").strip()
        if val:
            shown = val if k != "PG_WORKER_PASSWORD" else "***" + val[-2:]
            out.append((f".env {k}", True, shown))
        else:
            out.append((f".env {k}", False, "MISSING — edit .env"))
    for k in optional:
        val = os.environ.get(k, "").strip()
        out.append((f".env {k}", bool(val), val or "(unset; falls back to lab default)"))
    return out


def check_yaml_init() -> tuple[bool, str]:
    init = os.environ.get("MY_INIT", "").strip().upper()
    if not init:
        return (False, "MY_INIT empty — set in .env")
    try:
        import yaml
        with RESEARCHERS_YAML.open() as f:
            data = yaml.safe_load(f)
        actives = [r["init"] for r in data.get("researchers", []) if r.get("active")]
        if init in actives:
            return (True, f"{init} found, active")
        all_inits = [r["init"] for r in data.get("researchers", [])]
        if init in all_inits:
            return (False, f"{init} in registry but marked active=false")
        return (False, f"{init} not in registry. Allowed active: {actives}")
    except ImportError:
        return (False, "PyYAML missing — re-run install.sh")
    except Exception as e:
        return (False, f"researchers.yaml parse error: {e!r}")


def check_install() -> list[tuple[str, bool, str]]:
    out = []
    link = PLUGINS_DIR / "csnl-researcher-archiver"
    if link.exists() and link.is_symlink():
        target = link.resolve()
        out.append(("plugin symlink", True, f"→ {target}"))
    elif link.exists():
        out.append(("plugin symlink", False, f"{link} exists but not a symlink"))
    else:
        out.append(("plugin symlink", False, f"missing — re-run install.sh"))
    venv_py = CACHE_ROOT / "venv" / "bin" / "python"
    out.append(("venv python", venv_py.exists(), str(venv_py)))
    wrapper = CACHE_ROOT / "run-python.sh"
    out.append(("run-python.sh wrapper", wrapper.exists() and os.access(wrapper, os.X_OK),
                str(wrapper)))
    return out


def check_postgres() -> tuple[bool, str]:
    try:
        import psycopg2
    except ImportError:
        return (False, "psycopg2-binary missing — re-run install.sh")
    pwd = os.environ.get("PG_WORKER_PASSWORD", "")
    if not pwd:
        return (False, "PG_WORKER_PASSWORD empty")
    try:
        conn = psycopg2.connect(
            host=os.environ.get("PG_HOST", "csnls-mac-studio.local"),
            port=int(os.environ.get("PG_PORT", "5432")),
            dbname=os.environ.get("PG_DBNAME", "csnl_v3"),
            user=os.environ.get("PG_USER", "harness_worker"),
            password=pwd,
            connect_timeout=5,
        )
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM public.projects WHERE init = %s",
                        (os.environ.get("MY_INIT", "").upper(),))
            n_my = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM public.projects")
            n_total = cur.fetchone()[0]
        conn.close()
        return (True, f"connected. csnl_v3.public.projects has {n_total} rows; "
                       f"{n_my} are yours.")
    except Exception as e:
        return (False, f"connect failed: {e!r}")


def check_nas() -> tuple[bool, str]:
    nas = os.environ.get("NAS_ROOT", "").strip()
    init = os.environ.get("MY_INIT", "").strip().upper()
    if not nas:
        return (True, "NAS_ROOT unset — running in local-only mode (OK)")
    nas_path = Path(nas)
    if not nas_path.exists():
        return (False, f"{nas} does not exist (NAS unmounted?)")
    my_dir = nas_path / init
    if my_dir.exists():
        return (True, f"{my_dir} accessible")
    return (False, f"{my_dir} not found under {nas} — folder may not be synced")


def check_drift(init: str) -> tuple[int, int, list[str]]:
    """Returns (n_total, n_drift, sample_drift_slugs)."""
    proj_dir = CACHE_ROOT / init / "projects"
    if not proj_dir.exists():
        return (0, 0, [])
    n_total = 0
    drift_slugs = []
    for jf in sorted(proj_dir.glob("*.json")):
        if "conflict-" in jf.name:
            continue
        n_total += 1
        try:
            r = json.loads(jf.read_text())
            meta = r.get("_meta") or {}
            rv = int(meta.get("row_version", 0))
            lsv = meta.get("last_synced_version")
            if lsv is None or rv != int(lsv):
                drift_slugs.append(jf.stem)
        except Exception:
            pass
    return (n_total, len(drift_slugs), drift_slugs[:5])


def check_conflicts(init: str) -> tuple[int, int]:
    """Returns (n_total, n_old_30d)."""
    proj_dir = CACHE_ROOT / init / "projects"
    if not proj_dir.exists():
        return (0, 0)
    files = list(proj_dir.glob("*conflict-*"))
    cutoff = datetime.datetime.now().timestamp() - 30 * 86400
    old = sum(1 for f in files if f.stat().st_mtime < cutoff)
    return (len(files), old)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true")
    args = ap.parse_args()
    init = os.environ.get("MY_INIT", "").strip().upper() or "?"
    print(f"=== {init} 환경 점검 ({datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).isoformat(timespec='seconds')}) ===\n")
    fails = 0
    for name, ok, detail in check_env():
        sym = "[✓]" if ok else "[!]"
        print(f"{sym} {name}: {detail}")
        if not ok:
            fails += 1
    ok, detail = check_yaml_init()
    print(f"{'[✓]' if ok else '[!]'} researchers.yaml lookup: {detail}")
    if not ok:
        fails += 1
    for name, ok, detail in check_install():
        sym = "[✓]" if ok else "[!]"
        print(f"{sym} {name}: {detail}")
        if not ok:
            fails += 1
    if not args.quick:
        ok, detail = check_postgres()
        print(f"{'[✓]' if ok else '[!]'} 중앙 DB 접속: {detail}")
        if not ok:
            fails += 1
        ok, detail = check_nas()
        print(f"{'[✓]' if ok else '[!]'} NAS 마운트: {detail}")
        if not ok:
            fails += 1
    if init != "?":
        n_total, n_drift, sample = check_drift(init)
        if n_total == 0:
            print(f"[✓] 로컬 캐시: 비어 있음 (첫 세션)")
        elif n_drift == 0:
            print(f"[✓] 로컬 캐시: {n_total} 프로젝트 모두 동기화됨")
        else:
            print(f"[!] 로컬 캐시: {n_total} 중 {n_drift} 미동기화 — sync 권장. 예: {sample}")
            fails += 1
        n_conf, n_old = check_conflicts(init)
        if n_conf == 0:
            print(f"[✓] Conflict 파일: 없음")
        elif n_old == 0:
            print(f"[ ] Conflict 파일: {n_conf} 개 (모두 30일 이내)")
        else:
            print(f"[!] Conflict 파일: {n_conf} 개 중 {n_old} 개 30일 초과 — 검토 권장")
    print(f"\n{'OK — 모두 정상' if fails == 0 else f'주의: {fails} 항목 점검 필요'}")
    return 0 if fails == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
