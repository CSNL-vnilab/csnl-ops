#!/usr/bin/env python3
"""Generate docs/snapshot.md with current researcher counts.

Reads live harness state (member_uncertainty.json + ledger.db) and writes
a single markdown file with timestamped counts. The README links here
instead of inlining the numbers, because the numbers go stale within
minutes (memev cron runs every 10 minutes).

Usage:
    HARNESS_ROOT=/Users/csnl/csnl_on_ai/harness python3 scripts/snapshot.py
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

KST = timezone(timedelta(hours=9))
RESEARCHERS = ["JOP", "BYL", "MSY", "SMJ", "JYK", "BHL", "SYJ"]

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "docs" / "snapshot.md"
HARNESS_ROOT = Path(os.environ.get("HARNESS_ROOT", "/Users/csnl/csnl_on_ai/harness"))
UNC = HARNESS_ROOT / "state" / "member_uncertainty.json"
LEDGER = HARNESS_ROOT / "state" / "ledger.db"


def _len(v):
    if isinstance(v, (list, dict)):
        return len(v)
    return 0


def _silence_hours(last_iso: str | None, now: datetime) -> float | None:
    if not last_iso:
        return None
    try:
        if "+" in last_iso or last_iso.endswith("Z"):
            dt = datetime.fromisoformat(last_iso.replace("Z", "+00:00"))
        else:
            dt = datetime.fromisoformat(last_iso).replace(tzinfo=KST)
        return round((now - dt).total_seconds() / 3600.0, 1)
    except Exception:
        return None


def main() -> int:
    if not UNC.exists():
        print(f"ERROR: {UNC} not found. Set HARNESS_ROOT.", file=sys.stderr)
        return 1
    if not LEDGER.exists():
        print(f"ERROR: {LEDGER} not found.", file=sys.stderr)
        return 1

    mu = json.loads(UNC.read_text())
    db = sqlite3.connect(LEDGER)
    db.row_factory = sqlite3.Row
    now = datetime.now(KST)

    rows = []
    for init in RESEARCHERS:
        st = mu.get(init, {}) if isinstance(mu.get(init), dict) else {}
        c, i, u = _len(st.get("confirmed")), _len(st.get("inferred")), _len(st.get("unknown"))
        inb = db.execute(
            "SELECT COUNT(*) c, MAX(received_at) m FROM inbound_messages WHERE researcher_init=?",
            (init,),
        ).fetchone()
        out = db.execute(
            "SELECT COUNT(*) c FROM bot_outbound_messages WHERE member=?",
            (init,),
        ).fetchone()
        rows.append({
            "init": init,
            "name": st.get("name", ""),
            "c": c, "i": i, "u": u,
            "inbound": inb["c"], "outbound": out["c"],
            "silence_h": _silence_hours(inb["m"], now),
        })

    total_in = sum(r["inbound"] for r in rows)
    total_out = sum(r["outbound"] for r in rows)

    lines = []
    lines.append(f"# Snapshot — {now.strftime('%Y-%m-%d %H:%M KST')}")
    lines.append("")
    lines.append("> 라이브 수치 모음. memev cron이 10분마다 돌기 때문에 이 파일도 그 주기 안에서 변한다.")
    lines.append("> 새로 찍으려면 `HARNESS_ROOT=... python3 scripts/snapshot.py` 실행.")
    lines.append("")
    lines.append(f"## 합계")
    lines.append("")
    lines.append(f"- inbound (researcher → bot): **{total_in}**")
    lines.append(f"- outbound (bot → researcher): **{total_out}**")
    lines.append("")
    lines.append("## 연구원별")
    lines.append("")
    lines.append("| 이니셜 | 이름 | 확정 | 추정 | 모름 | 받은 | 보낸 | 마지막 응답 (시간) |")
    lines.append("|---|---|---:|---:|---:|---:|---:|---:|")
    for r in rows:
        sil = r["silence_h"] if r["silence_h"] is not None else "—"
        lines.append(f"| {r['init']} | {r['name']} | {r['c']} | {r['i']} | {r['u']} | {r['inbound']} | {r['outbound']} | {sil} |")
    lines.append("")
    lines.append("**컬럼 설명**:")
    lines.append("- 확정 = `member_uncertainty.json[INIT].confirmed` 항목 수")
    lines.append("- 추정 = 같은 파일의 `inferred` 항목 수 (Qwen이 추론한 것)")
    lines.append("- 모름 = 같은 파일의 `unknown` 항목 수 (질문할 거리가 남은 것)")
    lines.append("- 받은/보낸 = `ledger.db` 의 inbound/outbound 메시지 누적 카운트")
    lines.append("- 마지막 응답 = 직전 researcher 답신 이후 경과 시간 (KST)")
    lines.append("")
    lines.append("**원본 데이터 위치** (live 시스템):")
    lines.append(f"- `{UNC}`")
    lines.append(f"- `{LEDGER}`")
    lines.append("")
    lines.append("**참고**:")
    lines.append("- 마지막 응답이 72시간 넘으면 자동 reminder는 차단되고 operator 큐로 넘어간다.")
    lines.append("- `확정 + 추정 + 모름` 합이 작은 연구원 (예: SYJ) 은 인터뷰 사이클이 아직 적게 돈 것.")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines) + "\n")
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
