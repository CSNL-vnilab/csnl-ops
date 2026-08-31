#!/usr/bin/env python3
"""claim.json + 전문가 프로필 → 산학협력단 양식 2종 기입.

  python3 fill_forms.py --claim <claim.json> \
      --usage-template <전문가활용비_사용내역서.xlsx> \
      --payment-template <일회성경비.xlsx> \
      --out-dir <dir>

설계 원칙
  * 셀 좌표를 하드코딩하지 않고 라벨을 찾아 오프셋으로 쓴다(양식 개정 대응).
  * 채운 필드와 못 채운 필드를 모두 리포트한다. 조용히 넘어가지 않는다.
  * 주민등록번호·계좌번호는 프로필 파일에서만 읽고, 표준출력에는 마스킹해 찍는다.
"""
from __future__ import annotations

import argparse
import difflib
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from xlsx_edit import Workbook, col_to_num, num_to_col  # noqa: E402
import fee_rules  # noqa: E402

EXTERNAL_REF = re.compile(r"\[\d+\]")


def keep_formula(ws, row: int, col: int) -> bool:
    """같은 통합문서 안에서 계산되는 수식만 보존한다.
    '[2]1'!B7 같은 외부 통합문서 링크는 이미 끊어진 참조이므로 값으로 덮어쓴다."""
    f = ws.formula_text(row, col)
    return bool(f) and not EXTERNAL_REF.search(f)

HOME_CFG = Path(os.environ.get("SNU_EXPERT_FEE_HOME", Path.home() / ".claude" / "snu-expert-fee"))
RRN_RE = re.compile(r"\d{6}[-\s]?[1-4]\d{6}")


# ---------------------------------------------------------------- helpers
def mask_rrn(v: str) -> str:
    v = str(v or "")
    d = re.sub(r"\D", "", v)
    return f"{d[:6]}-{d[6]}******" if len(d) >= 7 else "******"


def mask_acct(v: str) -> str:
    d = re.sub(r"\D", "", str(v or ""))
    return f"{d[:4]}{'*' * max(len(d) - 6, 0)}{d[-2:]}" if len(d) > 6 else "*" * len(d)


def dig(obj, path, default=None):
    cur = obj
    for part in path.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return default
    return cur if cur not in ("", None) else default


class Report:
    def __init__(self):
        self.filled: list[tuple[str, str, str]] = []
        self.missing: list[tuple[str, str]] = []
        self.kept: list[tuple[str, str]] = []
        self.errors: list[str] = []

    def ok(self, field, ref, value):
        self.filled.append((field, ref, value))

    def miss(self, field, why):
        self.missing.append((field, why))

    def keep(self, field, ref, formula=""):
        self.kept.append((field, ref, formula))

    def err(self, msg):
        self.errors.append(msg)

    def render(self) -> str:
        out = [f"채움 {len(self.filled)}건 / 미기입 {len(self.missing)}건 / 수식유지 {len(self.kept)}건"]
        for f, ref, v in self.filled:
            out.append(f"  ✓ {f:22} {ref:>5}  {v}")
        for f, ref, formula in self.kept:
            tail = f"  (수식 유지: ={formula})" if formula else "  (양식 수식 유지)"
            out.append(f"  = {f:22} {ref:>5}{tail}")
        for f, why in self.missing:
            out.append(f"  ✗ {f:22}       {why}")
        for e in self.errors:
            out.append(f"  ! {e}")
        return "\n".join(out)


# ---------------------------------------------------------------- 사용내역서
USAGE_MAP = [
    # (표시명, 라벨, occurrence, dx, claim 경로, numeric)
    ("SRnD 과제번호", "SRnD 과제번호", 1, 1, "project.srnd_no", False),
    ("연구책임자", "연구책임자", 1, 2, "project.pi", False),
    ("연구과제명", "연구과제명", 1, 1, "project.title", False),
    ("지원기관", "지원기관", 1, 2, "project.funder", False),
    ("연구기간", "연구기간", 1, 1, "project.period", False),
    ("지원사업", "지원사업", 1, 2, "project.program", False),
    ("구분(지급유형)", "구분", 1, 1, "payment.kind", False),
    ("대면/비대면", "대면/비대면", 1, 2, "meeting.mode", False),
    ("구분(내/외국인)", "구분", 2, 2, "expert.residency", False),
    ("활용일자", "활용일자", 1, 1, "meeting.date_range", False),
    ("활용시간(비고)", "활용시간", 1, 2, "meeting.hours_note", False),
    ("시간/회당/장", "시간/회당/장", 1, 1, "meeting.total_hours", True),
    ("직급(직위)", "직급(직위)", 1, 2, "expert.rank", False),
    ("장소", "장소", 1, 2, "meeting.place", False),
    ("제목", "제목", 1, 1, "report.title", False),
    ("목적(활용내용)", "목적(활용내용)", 1, 1, "report.purpose_short", False),
]

PERSON_COLS = [
    ("이름", "expert.name", False),
    ("소속", "expert.affiliation", False),
    ("주민등록번호", "expert.rrn", False),
    ("이메일주소", "expert.email", False),
    ("은행명", "expert.bank", False),
    ("계좌번호", "expert.account", False),
    ("예금주", "expert.account_holder", False),
]


def fill_usage(template: str, out: str, data: dict, rep: Report):
    wb = Workbook(template)
    ws = wb.sheet(0)

    def put(name, row, col, value, numeric=False, force=False):
        if value in (None, ""):
            rep.miss(name, "claim.json 에 값 없음")
            return
        if not force and keep_formula(ws, row, col):
            rep.keep(name, f"{num_to_col(col)}{row}", ws.formula_text(row, col) or "")
            return
        ref = ws.set(row, col, value, numeric=numeric)
        shown = value
        if name == "주민등록번호":
            shown = mask_rrn(value)
        elif name == "계좌번호":
            shown = mask_acct(value)
        rep.ok(name, ref, str(shown)[:60])

    for name, label, occ, dx, path, numeric in USAGE_MAP:
        hit = ws.find(label, occ)
        if not hit:
            rep.miss(name, f"양식에서 라벨 '{label}' (#{occ}) 을 찾지 못함")
            continue
        r, c = hit
        put(name, r, c + dx, dig(data, path), numeric)

    # 인적사항: 헤더 행을 찾고 그 아래 행에 기입
    hdr = ws.find("이름")
    if not hdr:
        rep.miss("인적사항", "'이름' 헤더를 찾지 못함")
    else:
        hrow = hdr[0]
        row_cells = {
            col_to_num(re.match(r"([A-Z]+)", ref).group(1)): v
            for ref, v in ws.cells.items()
            if int(re.search(r"(\d+)$", ref).group(1)) == hrow
        }
        for label, path, _ in PERSON_COLS:
            col = next(
                (c for c, v in sorted(row_cells.items())
                 if re.sub(r"\s+", "", str(v)).startswith(label)),
                None,
            )
            if col is None:
                rep.miss(label, f"인적사항 헤더 행({hrow})에서 '{label}' 열을 찾지 못함")
                continue
            put(label, hrow + 1, col, dig(data, path))

    # 금액: 2단 헤더이므로 헤더행 +2 가 데이터 행
    amt = ws.find("활용비")
    if not amt:
        rep.miss("활용비", "'활용비' 헤더를 찾지 못함")
    else:
        arow, acol = amt
        drow = arow + 2
        put("활용비", drow, acol, dig(data, "payment.amount"), numeric=True)
        travel = dig(data, "payment.travel", {}) or {}
        for label, key in [("항공료", "air"), ("교통료", "transport"), ("체재비", "per_diem"), ("숙박비", "lodging")]:
            hit = ws.find(label)
            if hit and travel.get(key):
                put(label, drow, hit[1], travel[key], numeric=True)
        tot = ws.find("총액")
        if tot:
            total = dig(data, "payment.total") or (
                (dig(data, "payment.amount") or 0) + sum(int(v or 0) for v in travel.values())
            )
            put("총액", drow, tot[1], total, numeric=True)

    # 청구일자
    sig = ws.find("상기와 같이", contains=True)
    if sig:
        # 양식은 보통 =TODAY() 로 되어 있다. 증빙은 날짜가 나중에 바뀌면 안 되므로
        # request_date 가 명시돼 있으면 고정 날짜로 덮어쓴다.
        put("청구일자", sig[0] + 1, sig[1], dig(data, "claim.request_date"), force=True)
    else:
        rep.miss("청구일자", "'상기와 같이 … 청구합니다' 문구를 찾지 못함")

    # 하단 연구책임자 (날인란 왼쪽)
    seal = ws.find("(인)")
    if seal:
        put("연구책임자(날인란)", seal[0], seal[1] - 1, dig(data, "project.pi"))

    # 첨부서류 목록
    att = ws.find("첨부서류 목록", contains=True)
    if att:
        items = []
        for group in ("materials", "photos", "diagrams"):
            for x in dig(data, f"attachments.{group}", []) or []:
                items.append(x if isinstance(x, str) else x.get("label", ""))
        for i, item in enumerate(items[:6]):
            put(f"첨부{i + 1}", att[0] + 1 + i, att[1], f"{i + 1}. {item}")

    wb.save(out)
    wb.close()


# ---------------------------------------------------------------- 일회성경비
PAYMENT_COLS = [
    ("순번", None, True),
    ("성명", "expert.name", False),
    ("소속부서", "expert.affiliation", False),
    ("주민(외국인)등록번호", None, False),   # 앞/뒤 2칸으로 분리 처리
    (None, None, False),
    ("외국인\n여부", "expert.foreigner", False),
    ("여권번호", "expert.passport", False),
    ("국적", "expert.nationality", False),
    ("소득구분", "expert.income_type", False),
    ("상세소득구분", "expert.income_detail", False),
    ("지급액", "payment.amount", True),
    ("계좌번호", "expert.account", False),
    ("은행명", "expert.bank", False),
    ("예금주", "expert.account_holder", False),
]


def validation_lists(wb) -> dict[str, set]:
    out: dict[str, set] = {}
    try:
        vs = wb.sheet("업로드 양식 유효성 검사 기준")
    except KeyError:
        return out
    hdr = {}
    for ref, val in vs.cells.items():
        col, row = re.match(r"([A-Z]+)(\d+)", ref).groups()
        if int(row) == 1:
            hdr[col] = re.sub(r"\s+", "", str(val))
    for ref, val in vs.cells.items():
        col, row = re.match(r"([A-Z]+)(\d+)", ref).groups()
        if int(row) > 1 and col in hdr:
            out.setdefault(hdr[col], set()).add(str(val).strip())
    return out


def fill_payment(template: str, out: str, data: dict, rep: Report):
    wb = Workbook(template)
    ws = wb.sheet(0)
    lists = validation_lists(wb)

    # 유효값 검사 — 목록에 없으면 업로드 시 서버가 거절한다
    for field, path, key in [
        ("국적", "expert.nationality", "국적"),
        ("은행명", "expert.bank", "은행"),
        ("상세소득구분", "expert.income_detail", "상세소득구분"),
        ("소득구분", "expert.income_type", "소득구분"),
    ]:
        val = dig(data, path)
        allowed = lists.get(key)
        if val and allowed and val not in allowed:
            near = difflib.get_close_matches(val, list(allowed), n=3, cutoff=0.5)
            rep.err(f"{field} '{val}' 은 유효값 목록에 없음. 후보: {', '.join(near) or '(없음)'}")

    # 헤더 2행 → 데이터는 3행부터
    hdr_row = 1
    name_hit = ws.find("성명")
    if name_hit:
        hdr_row = name_hit[0]
    cols = {}
    for ref, val in ws.cells.items():
        col, row = re.match(r"([A-Z]+)(\d+)", ref).groups()
        if int(row) in (hdr_row, hdr_row + 1):
            cols[re.sub(r"\s+", "", str(val))] = col_to_num(col)

    def find_col(label: str):
        """정확 일치 → 접두 일치 순으로 헤더 열을 찾는다."""
        if label in cols:
            return cols[label]
        for k, v in sorted(cols.items()):
            if k.startswith(label):
                return v
        return None

    row = hdr_row + 2
    rrn = re.sub(r"\D", "", str(dig(data, "expert.rrn", "")))
    acct = re.sub(r"\D", "", str(dig(data, "expert.account", "")))
    travel = dig(data, "payment.travel", {}) or {}

    values = [
        ("순번", 1, True),
        ("성명", dig(data, "expert.name"), False),
        ("소속부서", dig(data, "expert.affiliation"), False),
        ("앞자리", rrn[:6], False),
        ("뒷자리", rrn[6:13], False),
        ("여권번호", dig(data, "expert.passport"), False),
        ("국적", dig(data, "expert.nationality", "대한민국"), False),
        ("소득구분", dig(data, "expert.income_type", "기타소득"), False),
        ("상세소득구분", dig(data, "expert.income_detail"), False),
        ("지급액", dig(data, "payment.amount"), True),
        ("계좌번호", acct, False),
        ("은행명", dig(data, "expert.bank"), False),
        ("예금주", dig(data, "expert.account_holder"), False),
        ("항공료", int(travel.get("air") or 0), True),
        ("교통료", int(travel.get("transport") or 0), True),
        ("체재비", int(travel.get("per_diem") or 0), True),
        ("숙박비", int(travel.get("lodging") or 0), True),
    ]
    for label, value, numeric in values:
        col = find_col(label)
        if col is None:
            rep.miss(label, "일회성경비 헤더에서 열을 찾지 못함")
            continue
        if value in (None, ""):
            if label not in ("여권번호",):
                rep.miss(label, "값 없음")
            continue
        if keep_formula(ws, row, col):
            rep.keep(label, f"{num_to_col(col)}{row}", ws.formula_text(row, col) or "")
            continue
        ref = ws.set(row, col, value, numeric=numeric)
        if label == "뒷자리":
            shown = "*******"
        elif label == "계좌번호":
            shown = mask_acct(value)
        else:
            shown = value
        rep.ok(label, ref, str(shown))

    # 마지막 데이터 행 다음 END (없으면 업로드 에러)
    end_col = find_col("순번") or 1
    if re.sub(r"\s+", "", str(ws.get(row + 1, end_col) or "")) != "END":
        ws.set(row + 1, end_col, "END")
    rep.ok("END 마커", f"{num_to_col(end_col)}{row + 1}", "END")

    wb.save(out)
    wb.close()


# ---------------------------------------------------------------- main
def load_claim(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    raw = path.read_text(encoding="utf-8")
    if RRN_RE.search(raw):
        raise SystemExit(
            "중단: claim.json 에 주민등록번호로 보이는 문자열이 있습니다.\n"
            "  주민번호·계좌번호는 claim.json 이 아니라 프로필 파일에만 두세요:\n"
            f"  {HOME_CFG / 'config' / 'experts'}/<expert_id>.json (chmod 600)"
        )
    # 전문가 프로필 병합 (PII 는 여기서만 읽는다)
    eid = dig(data, "expert.id")
    if eid:
        prof = HOME_CFG / "config" / "experts" / f"{eid}.json"
        if prof.exists():
            mode = oct(prof.stat().st_mode)[-3:]
            if mode not in ("600", "400"):
                print(f"[경고] {prof} 권한이 {mode} 입니다. chmod 600 을 권장합니다.", file=sys.stderr)
            merged = json.loads(prof.read_text(encoding="utf-8"))
            merged.update({k: v for k, v in (data.get("expert") or {}).items() if v not in ("", None)})
            data["expert"] = merged
        else:
            print(f"[경고] 전문가 프로필 없음: {prof}", file=sys.stderr)
    pid = dig(data, "project.id")
    if pid:
        pf = HOME_CFG / "config" / "projects" / f"{pid}.json"
        if pf.exists():
            merged = json.loads(pf.read_text(encoding="utf-8"))
            merged.update({k: v for k, v in (data.get("project") or {}).items() if v not in ("", None)})
            data["project"] = merged
    data.setdefault("claim", {})
    data["claim"].setdefault("request_date", data.get("request_date"))

    # 금액 자동 산정 — 회의 형태별 단가와 월 상한을 규칙에서 가져온다.
    # payment.amount 를 직접 적어 두면 그 값을 쓰되, 규칙 산정액과 다르면 경고한다.
    sessions = dig(data, "meeting.sessions", []) or []
    if sessions:
        fee = fee_rules.compute(sessions)
        data["_fee"] = fee
        given = dig(data, "payment.amount")
        if given in (None, ""):
            data.setdefault("payment", {})["amount"] = fee["total"]
        elif int(given) != fee["total"]:
            fee["warnings"].append(
                f"claim.json 의 payment.amount({int(given):,}원)가 규칙 산정액"
                f"({fee['total']:,}원)과 다르다 — 의도한 값인지 확인이 필요하다"
            )
    return data


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--claim", required=True)
    ap.add_argument("--usage-template")
    ap.add_argument("--payment-template")
    ap.add_argument("--out-dir", required=True)
    args = ap.parse_args()

    claim_path = Path(args.claim)
    data = load_claim(claim_path)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    name = dig(data, "expert.name", "전문가")
    ymd = (dig(data, "meeting.date_range", "") or "").split("~")[0].replace(".", "").replace("-", "")[2:]
    ymd = ymd or "000000"

    results = {}
    if args.usage_template:
        rep = Report()
        out = out_dir / f"{name}_전문가활용비_{ymd}.xlsx"
        fill_usage(args.usage_template, str(out), data, rep)
        results["사용내역서"] = (out, rep)
    if args.payment_template:
        rep = Report()
        out = out_dir / f"{name}_일회성경비.xlsx"
        fill_payment(args.payment_template, str(out), data, rep)
        results["일회성경비"] = (out, rep)

    exit_code = 0
    for label, (out, rep) in results.items():
        print(f"\n=== {label} → {out}")
        print(rep.render())
        if rep.errors:
            exit_code = 1

    fee = data.get("_fee")
    if fee:
        print("\n=== 지급액 산정")
        print(fee_rules.render(fee))
        prior = fee_rules.prior_claims_by_month(dig(data, "expert.id", ""), claim_path.parent)
        for mo, d in sorted(fee["by_month"].items()):
            if prior.get(mo):
                tot = prior[mo] + d["capped"]
                mark = "초과" if tot > fee["rules"]["monthly_cap"] else "이내"
                print(f"  [{mo}] 기존 청구 {prior[mo]:,}원 + 이번 {d['capped']:,}원 = {tot:,}원 "
                      f"({mark}, 상한 {fee['rules']['monthly_cap']:,}원)")

    amount = dig(data, "payment.amount") or 0
    detail = dig(data, "expert.income_detail", "")
    rate = {"그 외 필요경비 없는 기타소득": 0.22, "강연료 등 필요경비 있는 기타소득": 0.088,
            "거주자의 사업소득": 0.033, "비과세 기타소득": 0.0}.get(detail)
    if rate is not None and amount:
        tax = round(int(amount) * rate)
        print(f"\n[참고] 세전 {int(amount):,}원 · 원천징수({detail}, {rate:.1%}) {tax:,}원 · 실지급 {int(amount) - tax:,}원")
        print("       (양식에는 세전 금액을 기재합니다)")
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
