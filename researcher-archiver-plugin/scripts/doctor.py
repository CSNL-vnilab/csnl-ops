#!/usr/bin/env python3
"""doctor.py — diagnostic for silent-failure detection.

Checks: .env keys, plugin install, Supabase connectivity + pause-resumption,
NAS root, local cache drift, conflict file age. Read-only — never modifies
state.

Usage:
  doctor.py                 # full check
  doctor.py --quick         # skip Supabase + NAS reachability tests
"""
from __future__ import annotations
import os, sys, json, argparse, datetime, time
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
    required = ["MY_INIT", "SUPABASE_DB_HOST", "SUPABASE_DB_USER", "SUPABASE_DB_PASSWORD"]
    optional = ["NAS_ROOT", "SUPABASE_DB_PORT"]
    for k in required:
        val = os.environ.get(k, "").strip()
        if val:
            shown = val if k != "SUPABASE_DB_PASSWORD" else "***" + val[-2:]
            out.append((f".env {k}", True, shown))
        else:
            out.append((f".env {k}", False, "MISSING — edit .env"))
    for k in optional:
        val = os.environ.get(k, "").strip()
        if k == "SUPABASE_DB_PORT":
            out.append((f".env {k}", True, val or "5432 (default)"))
        else:
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


def check_supabase() -> tuple[bool, str, float | None]:
    """Returns (ok, detail, simple_select_seconds-or-None).

    The 3rd element is the time `SELECT 1` took — caller uses it for the
    pause-resumption warning. None if connect failed.
    """
    try:
        import psycopg2
    except ImportError:
        return (False, "psycopg2-binary missing — re-run install.sh", None)
    host = os.environ.get("SUPABASE_DB_HOST", "").strip()
    user = os.environ.get("SUPABASE_DB_USER", "").strip()
    pwd = os.environ.get("SUPABASE_DB_PASSWORD", "")
    if not (host and user and pwd):
        return (False, "SUPABASE_DB_HOST / _USER / _PASSWORD missing in .env", None)
    init = os.environ.get("MY_INIT", "").strip().upper()
    try:
        conn = psycopg2.connect(
            host=host,
            port=int(os.environ.get("SUPABASE_DB_PORT", "5432")),
            dbname="postgres",
            user=user,
            password=pwd,
            sslmode="require",
            connect_timeout=5,
        )
    except Exception as e:
        msg = repr(e).lower()
        if "timeout" in msg or "timed out" in msg or "refused" in msg:
            return (False,
                    f"connect failed: {e!r} — Supabase project may be paused. "
                    f"Wake via Dashboard → Project → Restart, then retry.",
                    None)
        return (False, f"connect failed: {e!r}", None)
    try:
        with conn.cursor() as cur:
            # Trivial SELECT 1 — measure for pause-resumption warning
            t0 = time.monotonic()
            cur.execute("SELECT 1;")
            cur.fetchone()
            simple_dt = time.monotonic() - t0
            # Verify RLS + schema scoping work end-to-end
            cur.execute("SET search_path TO csnl_research, public;")
            cur.execute("SELECT set_config('app.my_init', %s, false);", (init,))
            cur.execute("SELECT current_setting('app.my_init', true), "
                        "current_database(), current_user;")
            my_init_set, dbname, dbuser = cur.fetchone()
            cur.execute("SELECT COUNT(*) FROM csnl_research.projects WHERE init = %s",
                        (init,))
            n_my = cur.fetchone()[0]
        conn.close()
        return (True,
                f"connected as {dbuser}@{dbname}. app.my_init={my_init_set}. "
                f"csnl_research.projects has {n_my} row(s) for {init}.",
                simple_dt)
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        return (False, f"query failed after connect: {e!r}", None)


def check_pause_resumption(simple_select_seconds: float | None) -> tuple[bool, str]:
    """Warn if SELECT 1 took > 3s — indicates Supabase cold-start in progress."""
    if simple_select_seconds is None:
        return (True, "(skipped — no successful connect)")
    if simple_select_seconds > 3.0:
        return (False,
                f"trivial SELECT 1 took {simple_select_seconds:.1f}s — "
                f"Supabase may be cold-starting. Wait 10s and retry.")
    return (True, f"SELECT 1 in {simple_select_seconds*1000:.0f}ms (warm)")


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
        ok, detail, simple_dt = check_supabase()
        print(f"{'[✓]' if ok else '[!]'} Supabase 접속 (csnl_research): {detail}")
        if not ok:
            fails += 1
        ok2, detail2 = check_pause_resumption(simple_dt)
        sym = "[✓]" if ok2 else "[!]"
        print(f"{sym} Supabase pause-resumption: {detail2}")
        if not ok2:
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
