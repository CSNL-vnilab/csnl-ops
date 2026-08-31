#!/usr/bin/env python3
"""제출 번들 점검 + manifest 작성.

  python3 bundle.py --claim <claim_dir>/claim.json [--strict]

기계로 확인 가능한 항목만 자동 검사한다. 서명·날인·동의 체크는 사람 몫이며
항상 잔여 작업으로 출력한다.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import zipfile
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from xlsx_edit import Workbook  # noqa: E402
import fee_rules  # noqa: E402

RRN_RE = re.compile(r"\d{6}[-\s]?[1-4]\d{6}")
TODO_RE = re.compile(r"【확인 필요")

MANUAL_TASKS = [
    "회의 사진 첨부 확인 (없으면 첨부목록에서 제거)",
    "연구비 관리 시스템 업로드 / 담당자 전달",
]
# 서명(B17 이미지)·개인정보 동의 3항목은 양식에 이미 들어 있어 재활용한다.
# 연구책임자 날인은 생략하기로 확정(2026-08). 셋 다 아래에서 상태만 검사한다.


class Checks:
    def __init__(self):
        self.rows: list[tuple[str, bool, str]] = []

    def add(self, name, ok, detail=""):
        self.rows.append((name, bool(ok), detail))

    @property
    def failed(self):
        return [r for r in self.rows if not r[1]]

    def render(self):
        out = []
        for name, ok, detail in self.rows:
            mark = "PASS" if ok else "FAIL"
            out.append(f"  [{mark}] {name}" + (f" — {detail}" if detail else ""))
        return "\n".join(out)


def text_of(path: Path) -> str:
    suf = path.suffix.lower()
    try:
        if suf in (".md", ".txt", ".html", ".srt", ".json"):
            return path.read_text(encoding="utf-8", errors="replace")
        if suf == ".docx":
            with zipfile.ZipFile(path) as z:
                return re.sub(r"<[^>]+>", " ", z.read("word/document.xml").decode("utf-8"))
        if suf == ".pdf":
            return subprocess.run(["pdftotext", "-layout", str(path), "-"],
                                  capture_output=True, text=True).stdout
    except Exception:
        return ""
    return ""


def cell_by_label(ws, label, dx, occ=1):
    hit = ws.find(label, occ)
    if not hit:
        return None
    r, c = ws.anchor(hit[0], hit[1] + dx)
    return ws.get(r, c)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--claim", required=True)
    ap.add_argument("--strict", action="store_true", help="실패가 있으면 종료코드 1")
    args = ap.parse_args()

    claim_path = Path(args.claim)
    claim = json.loads(claim_path.read_text(encoding="utf-8"))
    root = claim_path.parent
    out_dir = root / "out"
    out_dir.mkdir(parents=True, exist_ok=True)

    ck = Checks()
    files = sorted(p for p in out_dir.rglob("*") if p.is_file())

    usage = next((p for p in files if "전문가활용비" in p.name and p.suffix == ".xlsx"), None)
    payment = next((p for p in files if "일회성경비" in p.name and p.suffix == ".xlsx"), None)
    reports = [p for p in files if p.suffix in (".pdf", ".docx") and "경비" not in p.name]
    advisory_pdf = next((p for p in files if "자문내용정리" in p.name and p.suffix == ".pdf"), None)

    # 0. 최종 산출물 3종
    need = []
    if not usage:
        need.append("사용내역서 xlsx")
    if not payment:
        need.append("일회성경비 xlsx")
    if not advisory_pdf:
        need.append("자문내용정리 pdf")
    ck.add("최종 산출물 3종", not need, "누락: " + ", ".join(need) if need else "")

    # 1. 사용내역서 필수 셀
    usage_amount = usage_hours = usage_date = None
    if not usage:
        ck.add("사용내역서 생성", False, "out/ 에 *전문가활용비*.xlsx 없음")
    else:
        wb = Workbook(str(usage))
        ws = wb.sheet(0)
        required = {
            "SRnD 과제번호": ("SRnD 과제번호", 1), "연구과제명": ("연구과제명", 1),
            "활용일자": ("활용일자", 1), "시간/회당/장": ("시간/회당/장", 1),
            "제목": ("제목", 1), "이름": None,
        }
        empty = []
        for name, spec in required.items():
            if spec is None:
                continue
            val = cell_by_label(ws, spec[0], spec[1])
            if not val:
                empty.append(name)
        usage_amount = cell_by_label(ws, "활용비", 0)
        amt_hit = ws.find("활용비")
        if amt_hit:
            usage_amount = ws.get(amt_hit[0] + 2, amt_hit[1])
        usage_hours = cell_by_label(ws, "시간/회당/장", 1)
        usage_date = cell_by_label(ws, "활용일자", 1)
        ck.add("사용내역서 필수 셀", not empty, f"빈칸: {', '.join(empty)}" if empty else "")
        wb.close()

    # 2~4. 일회성경비
    if not payment:
        ck.add("일회성경비 생성", False, "out/ 에 *일회성경비*.xlsx 없음")
    else:
        wb = Workbook(str(payment))
        ws = wb.sheet(0)
        hdr = ws.find("성명")
        hrow = hdr[0] if hdr else 1
        cols = {}
        for ref, val in ws.cells.items():
            c, r = re.match(r"([A-Z]+)(\d+)", ref).groups()
            if int(r) in (hrow, hrow + 1):
                cols[re.sub(r"\s+", "", str(val))] = c

        def colnum(label):
            from xlsx_edit import col_to_num
            for k, v in sorted(cols.items()):
                if k.startswith(label):
                    return col_to_num(v)
            return None

        drow = hrow + 2
        seq_col = colnum("순번") or 1
        end_val = str(ws.get(drow + 1, seq_col) or "").strip()
        ck.add("일회성경비 END 행", end_val == "END", f"실제값 '{end_val}'")

        acc_col = colnum("계좌번호")
        acc = str(ws.get(drow, acc_col) or "") if acc_col else ""
        ck.add("계좌번호 숫자만", bool(acc) and acc.isdigit(), acc[:4] + "…" if acc else "값 없음")

        # 유효값 목록 검사
        try:
            vs = wb.sheet("업로드 양식 유효성 검사 기준")
            hdrmap, lists = {}, {}
            for ref, val in vs.cells.items():
                c, r = re.match(r"([A-Z]+)(\d+)", ref).groups()
                if int(r) == 1:
                    hdrmap[c] = re.sub(r"\s+", "", str(val))
            for ref, val in vs.cells.items():
                c, r = re.match(r"([A-Z]+)(\d+)", ref).groups()
                if int(r) > 1 and c in hdrmap:
                    lists.setdefault(hdrmap[c], set()).add(str(val).strip())
            bad = []
            for label, key in [("국적", "국적"), ("은행명", "은행"), ("상세소득구분", "상세소득구분")]:
                cn = colnum(label)
                v = str(ws.get(drow, cn) or "").strip() if cn else ""
                if v and key in lists and v not in lists[key]:
                    bad.append(f"{label}='{v}'")
            ck.add("유효값 목록 일치", not bad, ", ".join(bad))
        except KeyError:
            ck.add("유효값 목록 일치", True, "검사 시트 없음 — 건너뜀")

        pay_col = colnum("지급액")
        pay_amount = ws.get(drow, pay_col) if pay_col else None
        try:
            same = int(float(str(usage_amount))) == int(float(str(pay_amount)))
        except (TypeError, ValueError):
            same = False
        ck.add("금액 일치 (사용내역서 ↔ 일회성경비)", same,
               f"{usage_amount} vs {pay_amount}")
        wb.close()

    # 5a. 지급액이 단가 규칙과 맞는가 + 월 상한
    sessions = ((claim.get("meeting") or {}).get("sessions")) or []
    if sessions:
        modes_missing = [str(s.get("seq", "?")) for s in sessions
                         if (s.get("mode") or "") not in ("대면", "비대면")]
        ck.add("회차별 대면/비대면 기입", not modes_missing,
               f"미확인 회차: {', '.join(modes_missing)}" if modes_missing else "")
        fee = fee_rules.compute(sessions)
        try:
            claimed = int(float(str(usage_amount)))
        except (TypeError, ValueError):
            claimed = None
        ck.add("지급액 = 단가 규칙 산정액", claimed == fee["total"],
               f"양식 {claimed} vs 규칙 {fee['total']:,}" if claimed != fee["total"] else "")
        prior = fee_rules.prior_claims_by_month(
            (claim.get("expert") or {}).get("id", ""), root)
        over = []
        for mo, d in fee["by_month"].items():
            tot = prior.get(mo, 0) + d["capped"]
            if tot > fee["rules"]["monthly_cap"]:
                over.append(f"{mo} 합계 {tot:,}원 > 상한 {fee['rules']['monthly_cap']:,}원 "
                            f"(기존 {prior.get(mo, 0):,} + 이번 {d['capped']:,})")
        ck.add("월 지급 상한 (기존 청구 포함)", not over, "; ".join(over))
    else:
        ck.add("회차 정보 존재", False, "claim.json 에 meeting.sessions 가 없어 단가 검증 불가")

    # 5b. 재활용 항목이 양식에 살아 있는가 (서명 이미지 / 동의 체크)
    if usage:
        with zipfile.ZipFile(usage) as z:
            has_sig = any("media/image" in n for n in z.namelist())
            checked = sum(
                1 for n in z.namelist()
                if "ctrlProp" in n and 'checked="Checked"' in z.read(n).decode("utf-8", "replace")
            )
        ck.add("전자서명 이미지 유지", has_sig, "" if has_sig else "양식에서 서명 이미지가 사라짐")
        ck.add("개인정보 동의 3항목 체크", checked >= 3, f"체크된 항목 {checked}개")

    # 6~7. 보고서와 날짜·시간 일치
    report_text = "\n".join(text_of(p) for p in reports)
    if not reports:
        ck.add("보고서 내용 대조", False, "대조할 보고서가 없음")
    else:
        first_date = str(usage_date or "").split("~")[0].strip()
        ok_date = True
        detail = ""
        m = re.match(r"(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})", first_date)
        if m:
            y, mo, d = (int(x) for x in m.groups())
            patterns = [f"{y}년 {mo}월 {d}일", f"{y}.{mo:02d}.{d:02d}", f"{y}-{mo:02d}-{d:02d}"]
            ok_date = any(p in report_text for p in patterns)
            detail = "" if ok_date else f"보고서에서 {patterns[0]} 을 찾지 못함"
        ck.add("활용일자 ↔ 보고서 일시", ok_date, detail)

        hrs = str(usage_hours or "").strip()
        if hrs:
            hnum = re.sub(r"[^\d.]", "", hrs)
            found = re.findall(r"총\s*([\d.]+)\s*시간", report_text)
            ok_h = (not found) or any(f == hnum for f in found)
            ck.add("활용시간 ↔ 보고서", ok_h,
                   "" if ok_h else f"양식 {hnum}시간 vs 보고서 {', '.join(found)}시간")

    # 8. 첨부 파일 존재
    att = claim.get("attachments") or {}
    missing_files = []
    for group in ("materials", "photos", "diagrams"):
        for item in att.get(group, []) or []:
            if isinstance(item, dict) and item.get("path"):
                if not (root / item["path"]).exists() and not Path(item["path"]).exists():
                    missing_files.append(item["path"])
    ck.add("첨부 파일 존재", not missing_files, ", ".join(missing_files))

    # 9a. 양식 안에 남은 "다른 사람" 흔적
    #     셀을 덮어써도 sharedStrings 와 하이퍼링크 rels 에 이전 청구 건의 값이 남는다.
    #     XML 원문 전체를 훑으면 스타일 id 같은 긴 숫자가 오탐이 되므로
    #     "문자열로 저장된 값"(shared string / inlineStr)과 mailto 링크만 본다.
    stale = []
    own_mail = str((claim.get("expert") or {}).get("email") or "").lower()
    for x in (usage, payment):
        if not x:
            continue
        with zipfile.ZipFile(x) as z:
            texts = []
            if "xl/sharedStrings.xml" in z.namelist():
                texts += re.findall(r"<t[^>]*>(.*?)</t>",
                                    z.read("xl/sharedStrings.xml").decode("utf-8", "replace"), re.S)
            for n in z.namelist():
                if n.startswith("xl/worksheets/sheet") and n.endswith(".xml"):
                    body = z.read(n).decode("utf-8", "replace")
                    texts += re.findall(r"<is><t[^>]*>(.*?)</t></is>", body, re.S)
            mails = set()
            for n in z.namelist():
                if n.endswith(".rels"):
                    mails |= set(re.findall(r"mailto:([^\"'<>\s]+)",
                                            z.read(n).decode("utf-8", "replace")))
        rrns = {re.sub(r"\D", "", m) for t in texts for m in RRN_RE.findall(t)}
        if len(rrns) > 1:
            stale.append(f"{x.name}: 서로 다른 주민번호 {len(rrns)}개")
        others = {m for m in mails if own_mail and m.lower() != own_mail}
        if others:
            stale.append(f"{x.name}: 타인 이메일 {', '.join(sorted(others))}")
    ck.add("양식 내 이전 건 잔여정보 없음", not stale, "; ".join(stale))

    # 9. 개인정보 유출 (최우선 실패 항목)
    leaked = []
    for p in files:
        if p.suffix.lower() in (".xlsx",):
            continue  # 양식에는 주민번호가 들어가는 것이 정상
        if RRN_RE.search(text_of(p)):
            leaked.append(p.name)
    ck.add("문서 내 주민번호 노출 없음", not leaked, ", ".join(leaked))

    # 10. 미확인 마커
    todo = [p.name for p in files + list(root.glob("draft/*.md")) if TODO_RE.search(text_of(p))]
    ck.add("미확인 마커(【확인 필요) 없음", not todo, ", ".join(todo))

    manifest = {
        "claim_id": claim.get("claim_id"),
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "outputs": [str(p.relative_to(root)) for p in files],
        "checks": [{"name": n, "pass": ok, "detail": d} for n, ok, d in ck.rows],
        "manual_tasks": MANUAL_TASKS,
    }
    (root / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    passed = len(ck.rows) - len(ck.failed)
    print(f"■ 자동 검사 {passed}/{len(ck.rows)} 통과")
    print(ck.render())
    print("\n■ 산출물")
    for p in files:
        print(f"   {p.relative_to(root)}")
    print("\n■ 사람이 해야 할 잔여 작업")
    for t in MANUAL_TASKS:
        print(f"   [ ] {t}")
    print(f"\nmanifest → {root / 'manifest.json'}")

    if args.strict and ck.failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
