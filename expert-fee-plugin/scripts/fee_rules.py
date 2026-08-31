#!/usr/bin/env python3
"""지급 단가 규칙 — 회의 형태별 단가와 월 상한.

기본 규칙 (2026-08 J 확정)
  * 대면(방문) 1건        = 400,000원
  * 비대면(Zoom) 2건      = 400,000원  → 1건당 200,000원
  * 월 최대 지급액        = 800,000원

`~/.claude/snu-expert-fee/config/fee_rules.json` 으로 덮어쓸 수 있다:
  { "per_session": { "대면": 400000, "비대면": 200000 }, "monthly_cap": 800000 }
"""
from __future__ import annotations

import json
import os
import re
from collections import defaultdict
from pathlib import Path

HOME_CFG = Path(os.environ.get("SNU_EXPERT_FEE_HOME", Path.home() / ".claude" / "snu-expert-fee"))

DEFAULTS = {
    "per_session": {"대면": 400000, "비대면": 200000},
    "monthly_cap": 800000,
    "_note": "비대면은 2건당 400,000원 규칙을 1건당 200,000원으로 환산한 값",
}


def load_rules() -> dict:
    path = HOME_CFG / "config" / "fee_rules.json"
    rules = json.loads(json.dumps(DEFAULTS))
    if path.exists():
        override = json.loads(path.read_text(encoding="utf-8"))
        rules["per_session"].update(override.get("per_session", {}))
        if "monthly_cap" in override:
            rules["monthly_cap"] = override["monthly_cap"]
    return rules


def month_of(date_str: str) -> str:
    """'2026-04-03' / '2026.04.03' → '2026-04'. 못 읽으면 빈 문자열."""
    m = re.match(r"(\d{4})[.\-/](\d{1,2})", str(date_str or ""))
    return f"{m.group(1)}-{int(m.group(2)):02d}" if m else ""


def compute(sessions: list[dict], rules: dict | None = None) -> dict:
    """회차 목록 → 금액 산정 결과.

    반환:
      total            상한 적용 후 청구 금액
      raw_total        상한 적용 전 합계
      by_month         {'2026-04': {'대면': n, '비대면': n, 'raw': 원, 'capped': 원}}
      breakdown        회차별 [(seq, date, mode, 원)]
      warnings         사람이 판단해야 하는 사항
    """
    rules = rules or load_rules()
    per = rules["per_session"]
    cap = rules["monthly_cap"]

    breakdown, warnings = [], []
    months: dict[str, dict] = defaultdict(lambda: {"대면": 0, "비대면": 0, "raw": 0})

    for s in sessions or []:
        mode = (s.get("mode") or "").strip()
        if mode not in per:
            warnings.append(
                f"{s.get('seq', '?')}차({s.get('date', '날짜미상')}): 형태가 '{mode or '미확인'}' 이라 단가를 정할 수 없음 "
                "— 대면/비대면을 확인해야 한다"
            )
            fee = 0
        else:
            fee = per[mode]
        mo = month_of(s.get("date"))
        breakdown.append((s.get("seq"), s.get("date"), mode or "미확인", fee))
        if mode in months[mo]:
            months[mo][mode] += 1
        months[mo]["raw"] += fee

    raw_total = sum(f for *_, f in breakdown)
    total = 0
    for mo, d in months.items():
        d["capped"] = min(d["raw"], cap)
        total += d["capped"]
        if d["raw"] > cap:
            warnings.append(
                f"{mo}: 산정액 {d['raw']:,}원이 월 상한 {cap:,}원을 초과 → {cap:,}원으로 제한. "
                "초과분은 다음 달로 이월할지 확인이 필요하다"
            )
        if d["비대면"] % 2 == 1:
            warnings.append(
                f"{mo}: 비대면 {d['비대면']}건(홀수). 2건당 {per['비대면'] * 2:,}원 규칙을 "
                f"1건당 {per['비대면']:,}원으로 환산했다. 남는 1건을 다음 청구와 묶을지 확인이 필요하다"
            )

    return {
        "total": total,
        "raw_total": raw_total,
        "by_month": dict(months),
        "breakdown": breakdown,
        "warnings": warnings,
        "rules": rules,
    }


def prior_claims_by_month(expert_id: str, exclude_dir: Path | None = None) -> dict[str, int]:
    """같은 전문가의 기존 청구 건을 월별로 합산 — 월 상한 교차 검증용."""
    out: dict[str, int] = defaultdict(int)
    claims_root = HOME_CFG / "claims"
    if not claims_root.exists():
        return dict(out)
    for cj in claims_root.glob("*/claim.json"):
        if exclude_dir and cj.parent.resolve() == Path(exclude_dir).resolve():
            continue
        try:
            d = json.loads(cj.read_text(encoding="utf-8"))
        except Exception:
            continue
        if (d.get("expert") or {}).get("id") != expert_id:
            continue
        amount = int((d.get("payment") or {}).get("amount") or 0)
        sessions = (d.get("meeting") or {}).get("sessions") or []
        mo = month_of(sessions[0].get("date")) if sessions else month_of(
            (d.get("meeting") or {}).get("date_range", "").split("~")[0].replace(".", "-"))
        if mo:
            out[mo] += amount
    return dict(out)


def render(result: dict) -> str:
    lines = [f"산정 {result['raw_total']:,}원 → 청구 {result['total']:,}원"]
    for seq, date, mode, fee in result["breakdown"]:
        lines.append(f"  {str(seq or '-'):>2}차 {date or '날짜미상':<12} {mode:<6} {fee:>9,}원")
    for mo, d in sorted(result["by_month"].items()):
        lines.append(f"  [{mo or '월미상'}] 대면 {d['대면']} · 비대면 {d['비대면']} → {d['capped']:,}원")
    for w in result["warnings"]:
        lines.append(f"  ! {w}")
    return "\n".join(lines)


if __name__ == "__main__":
    import sys
    data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    print(render(compute((data.get("meeting") or {}).get("sessions") or [])))
