#!/usr/bin/env python3
"""문자열 레벨 XLSX 편집기.

openpyxl 로 열고 저장하면 ActiveX 컨트롤(동의 체크박스), VML/그림, 인쇄설정,
데이터 유효성 확장이 유실된다. 산학협력단 공식 양식은 이 요소들이 살아 있어야 하므로
시트 XML 을 문자열로 직접 고치고 나머지 zip 엔트리는 바이트 그대로 복사한다.

읽기: 라벨 탐색용으로 sharedStrings 를 해석해 셀 텍스트 맵을 만든다.
쓰기: 대상 <c> 를 inlineStr(문자열) 또는 숫자 셀로 교체한다. s(스타일) 속성은 보존한다.
"""
from __future__ import annotations

import re
import shutil
import zipfile
from xml.etree import ElementTree as ET

NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"


def col_to_num(col: str) -> int:
    n = 0
    for ch in col:
        n = n * 26 + (ord(ch.upper()) - 64)
    return n


def num_to_col(n: int) -> str:
    s = ""
    while n > 0:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def split_ref(ref: str):
    m = re.match(r"([A-Z]+)(\d+)$", ref)
    if not m:
        raise ValueError(f"bad cell ref: {ref}")
    return m.group(1), int(m.group(2))


def xml_escape(s: str) -> str:
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\r\n", "\n")
    )


def norm(s) -> str:
    """공백·개행을 모두 제거한 비교용 문자열."""
    return re.sub(r"\s+", "", str(s)) if s is not None else ""


class Sheet:
    def __init__(self, book: "Workbook", part: str, name: str, xml: str):
        self.book = book
        self.part = part
        self.name = name
        self.xml = xml
        self._cells: dict[str, str] | None = None
        self._merges: list[tuple[int, int, int, int]] | None = None
        self.formula_overwritten = False
        self.dropped_rel_ids: set[str] = set()

    # ---------- 읽기 ----------
    @property
    def cells(self) -> dict[str, str]:
        if self._cells is None:
            self._cells = self._read_cells()
        return self._cells

    def _read_cells(self) -> dict[str, str]:
        out: dict[str, str] = {}
        for m in re.finditer(r"<c\b([^>]*?)(/>|>(.*?)</c>)", self.xml, re.S):
            attrs, closing, body = m.group(1), m.group(2), m.group(3) or ""
            rm = re.search(r'r="([A-Z]+\d+)"', attrs)
            if not rm:
                continue
            ref = rm.group(1)
            tm = re.search(r't="([^"]+)"', attrs)
            t = tm.group(1) if tm else "n"
            if closing == "/>":
                continue
            if t == "s":
                vm = re.search(r"<v>(.*?)</v>", body, re.S)
                if vm:
                    idx = int(vm.group(1))
                    if 0 <= idx < len(self.book.shared):
                        out[ref] = self.book.shared[idx]
            elif t == "inlineStr":
                texts = re.findall(r"<t[^>]*>(.*?)</t>", body, re.S)
                if texts:
                    out[ref] = _unescape("".join(texts))
            else:
                vm = re.search(r"<v>(.*?)</v>", body, re.S)
                if vm:
                    out[ref] = _unescape(vm.group(1))
        return out

    @property
    def merges(self):
        if self._merges is None:
            self._merges = []
            for m in re.finditer(r'<mergeCell ref="([A-Z]+\d+):([A-Z]+\d+)"', self.xml):
                c1, r1 = split_ref(m.group(1))
                c2, r2 = split_ref(m.group(2))
                self._merges.append((r1, col_to_num(c1), r2, col_to_num(c2)))
        return self._merges

    def anchor(self, row: int, col: int) -> tuple[int, int]:
        """병합 범위에 걸린 좌표를 좌상단으로 보정."""
        for r1, c1, r2, c2 in self.merges:
            if r1 <= row <= r2 and c1 <= col <= c2:
                return r1, c1
        return row, col

    def find(self, label: str, occurrence: int = 1, contains: bool = False):
        """라벨 셀의 (row, col). 못 찾으면 None."""
        target = norm(label)
        hits = []
        for ref, val in self.cells.items():
            v = norm(val)
            ok = (target in v) if contains else (v == target)
            if ok:
                c, r = split_ref(ref)
                hits.append((r, col_to_num(c)))
        hits.sort()
        if len(hits) >= occurrence:
            return hits[occurrence - 1]
        return None

    def get(self, row: int, col: int):
        return self.cells.get(f"{num_to_col(col)}{row}")

    def _raw_cell(self, ref: str):
        pat = re.compile(r'<c\b[^>]*?r="' + ref + r'"(?:\s[^>]*?)?(?:/>|>.*?</c>)', re.S)
        m = pat.search(self.xml)
        return m.group(0) if m else None

    def has_formula(self, row: int, col: int) -> bool:
        """대상 셀(병합 보정 후)에 수식이 들어 있는가."""
        return self.formula_text(row, col) is not None

    def formula_text(self, row: int, col: int):
        """대상 셀의 수식 문자열. 없으면 None."""
        row, col = self.anchor(row, col)
        raw = self._raw_cell(f"{num_to_col(col)}{row}")
        if not raw:
            return None
        m = re.search(r"<f[^>]*>(.*?)</f>", raw, re.S)
        return _unescape(m.group(1)) if m else None

    # ---------- 쓰기 ----------
    def set(self, row: int, col: int, value, numeric: bool | None = None):
        row, col = self.anchor(row, col)
        ref = f"{num_to_col(col)}{row}"
        if value is None:
            value = ""
        if numeric is None:
            numeric = isinstance(value, (int, float)) and not isinstance(value, bool)
        self._write_cell(ref, value, numeric)
        self._drop_hyperlink(ref)
        if self._cells is not None:
            self._cells[ref] = str(value)
        return ref

    def _drop_hyperlink(self, ref: str):
        """셀에 걸린 하이퍼링크를 함께 제거한다.

        이전 청구 건의 mailto: 주소가 시트 rels 에 남아 있으면, 셀 텍스트를 새 값으로
        덮어써도 파일 안에는 옛 이메일이 그대로 남는다. 실제 유출 경로다.
        """
        pat = re.compile(r'<hyperlink\b[^>]*?\bref="' + ref + r'"[^>]*?(?:/>|>.*?</hyperlink>)', re.S)
        m = pat.search(self.xml)
        if not m:
            return
        rid = re.search(r'r:id="([^"]+)"', m.group(0))
        if rid:
            self.dropped_rel_ids.add(rid.group(1))
        self.xml = self.xml[: m.start()] + self.xml[m.end() :]
        # 남은 하이퍼링크가 없으면 빈 <hyperlinks> 래퍼도 제거 (스키마상 자식이 최소 1개)
        self.xml = re.sub(r"<hyperlinks>\s*</hyperlinks>", "", self.xml)

    def _write_cell(self, ref: str, value, numeric: bool):
        col, row = split_ref(ref)
        pat = re.compile(r'<c\b[^>]*?r="' + ref + r'"(?:\s[^>]*?)?(?:/>|>.*?</c>)', re.S)
        m = pat.search(self.xml)
        style = ""
        if m:
            if "<f>" in m.group(0):
                self.formula_overwritten = True
            sm = re.search(r'\ss="(\d+)"', m.group(0))
            if sm:
                style = f' s="{sm.group(1)}"'
            new = self._cell_xml(ref, style, value, numeric)
            self.xml = self.xml[: m.start()] + new + self.xml[m.end() :]
            return
        # 셀이 없으면 행 안의 열 순서에 맞춰 삽입
        new = self._cell_xml(ref, "", value, numeric)
        rowpat = re.compile(r'(<row\b[^>]*?\br="' + str(row) + r'"[^>]*?)(/>|>)(.*?)(</row>)', re.S)
        rm = rowpat.search(self.xml)
        if rm:
            head, close, body, tail = rm.group(1), rm.group(2), rm.group(3), rm.group(4)
            if close == "/>":
                replacement = f"{head}>{new}</row>"
                self.xml = self.xml[: rm.start()] + replacement + self.xml[rm.end() :]
                return
            target = col_to_num(col)
            inserted = False
            out = []
            pos = 0
            for cm in re.finditer(r"<c\b[^>]*?(?:/>|>.*?</c>)", body, re.S):
                cref = re.search(r'r="([A-Z]+)\d+"', cm.group(0))
                if cref and not inserted and col_to_num(cref.group(1)) > target:
                    out.append(body[pos : cm.start()])
                    out.append(new)
                    pos = cm.start()
                    inserted = True
            out.append(body[pos:])
            newbody = "".join(out) if inserted else body + new
            self.xml = (
                self.xml[: rm.start()] + head + close + newbody + tail + self.xml[rm.end() :]
            )
            return
        # 행 자체가 없으면 sheetData 안에 행 순서대로 삽입
        newrow = f'<row r="{row}">{new}</row>'
        sd = re.search(r"(<sheetData\b[^>]*>)(.*?)(</sheetData>)", self.xml, re.S)
        if not sd:
            raise RuntimeError(f"{self.name}: sheetData 를 찾을 수 없음")
        body = sd.group(2)
        inserted = False
        out, pos = [], 0
        for rmatch in re.finditer(r'<row\b[^>]*?\br="(\d+)"', body):
            if int(rmatch.group(1)) > row and not inserted:
                out.append(body[pos : rmatch.start()])
                out.append(newrow)
                pos = rmatch.start()
                inserted = True
        out.append(body[pos:])
        newbody = "".join(out) if inserted else body + newrow
        self.xml = self.xml[: sd.start()] + sd.group(1) + newbody + sd.group(3) + self.xml[sd.end() :]

    @staticmethod
    def _cell_xml(ref: str, style: str, value, numeric: bool) -> str:
        if numeric:
            return f'<c r="{ref}"{style}><v>{value}</v></c>'
        text = xml_escape(value)
        return f'<c r="{ref}"{style} t="inlineStr"><is><t xml:space="preserve">{text}</t></is></c>'


def _unescape(s: str) -> str:
    return (
        s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"')
        .replace("&apos;", "'").replace("&amp;", "&")
    )


class Workbook:
    def __init__(self, path: str):
        self.path = path
        self._zip = zipfile.ZipFile(path)
        self.names = self._zip.namelist()
        self.shared = self._read_shared()
        self.sheets: list[Sheet] = self._read_sheets()

    def _read_shared(self) -> list[str]:
        if "xl/sharedStrings.xml" not in self.names:
            return []
        root = ET.fromstring(self._zip.read("xl/sharedStrings.xml"))
        out = []
        for si in root.findall(f"{{{NS_MAIN}}}si"):
            out.append("".join(t.text or "" for t in si.iter(f"{{{NS_MAIN}}}t")))
        return out

    def _read_sheets(self) -> list[Sheet]:
        wb = ET.fromstring(self._zip.read("xl/workbook.xml"))
        rels = ET.fromstring(self._zip.read("xl/_rels/workbook.xml.rels"))
        relmap = {r.get("Id"): r.get("Target") for r in rels}
        sheets = []
        for sh in wb.iter(f"{{{NS_MAIN}}}sheet"):
            rid = sh.get(
                "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
            )
            target = relmap.get(rid, "")
            part = "xl/" + target.lstrip("/").replace("xl/", "", 1) if target else ""
            if part not in self.names:
                cand = [n for n in self.names if n.endswith(target.split("/")[-1])]
                if not cand:
                    continue
                part = cand[0]
            xml = self._zip.read(part).decode("utf-8")
            sheets.append(Sheet(self, part, sh.get("name"), xml))
        return sheets

    def sheet(self, name_or_index=0) -> Sheet:
        if isinstance(name_or_index, int):
            return self.sheets[name_or_index]
        for s in self.sheets:
            if s.name == name_or_index:
                return s
        raise KeyError(name_or_index)

    def _scrubbed_shared_strings(self) -> bytes | None:
        """어느 시트에서도 참조하지 않는 공유 문자열의 내용을 비운다.

        셀을 덮어써도 원래 문자열은 sharedStrings.xml 에 그대로 남는다.
        Excel 화면에는 안 보이지만 파일 안에는 있다 — 이전 청구 건의 이름·주민번호가
        새 양식에 묻어 나가는 실제 유출 경로다. si 개수는 유지한 채 내용만 비워
        인덱스가 밀리지 않게 한다.
        """
        if "xl/sharedStrings.xml" not in self.names:
            return None
        used: set[int] = set()
        for sh in self.sheets:
            for m in re.finditer(r"<c\b[^>]*?\bt=\"s\"[^>]*>(.*?)</c>", sh.xml, re.S):
                vm = re.search(r"<v>(\d+)</v>", m.group(1))
                if vm:
                    used.add(int(vm.group(1)))
        xml = self._zip.read("xl/sharedStrings.xml").decode("utf-8")
        idx = -1
        out, pos, changed = [], 0, False
        for m in re.finditer(r"<si\b[^>]*>.*?</si>|<si\b[^>]*/>", xml, re.S):
            idx += 1
            if idx in used:
                continue
            out.append(xml[pos:m.start()])
            out.append("<si><t xml:space=\"preserve\"></t></si>")
            pos = m.end()
            changed = True
        if not changed:
            return None
        out.append(xml[pos:])
        return "".join(out).encode("utf-8")

    def save(self, out_path: str, scrub_strings: bool = True):
        changed = {s.part: s.xml.encode("utf-8") for s in self.sheets}
        drop = set()
        if scrub_strings:
            scrubbed = self._scrubbed_shared_strings()
            if scrubbed is not None:
                changed["xl/sharedStrings.xml"] = scrubbed
        # 수식 셀을 리터럴로 덮어썼다면 계산 캐시(calcChain)가 어긋난다.
        # calcChain 은 캐시일 뿐이라 통째로 지우면 Excel 이 다시 만든다.
        if any(s.formula_overwritten for s in self.sheets) and "xl/calcChain.xml" in self.names:
            drop.add("xl/calcChain.xml")
            ct = self._zip.read("[Content_Types].xml").decode("utf-8")
            ct = re.sub(r'<Override[^>]*PartName="/xl/calcChain\.xml"[^>]*/>', "", ct)
            changed["[Content_Types].xml"] = ct.encode("utf-8")
            rels = self._zip.read("xl/_rels/workbook.xml.rels").decode("utf-8")
            rels = re.sub(r'<Relationship[^>]*Target="calcChain\.xml"[^>]*/>', "", rels)
            changed["xl/_rels/workbook.xml.rels"] = rels.encode("utf-8")
        for sh in self.sheets:
            if not sh.dropped_rel_ids:
                continue
            rels_part = re.sub(r"([^/]+)$", r"_rels/\1.rels", sh.part)
            if rels_part not in self.names:
                continue
            rels = self._zip.read(rels_part).decode("utf-8")
            for rid in sh.dropped_rel_ids:
                if f'r:id="{rid}"' in sh.xml:      # 다른 셀이 아직 쓰고 있으면 남긴다
                    continue
                rels = re.sub(r'<Relationship[^>]*Id="' + re.escape(rid) + r'"[^>]*/>', "", rels)
            changed[rels_part] = rels.encode("utf-8")

        # 수식 입력값이 바뀌었으므로 열 때 강제 재계산 — 캐시된 옛 합계가 보이지 않게.
        wbxml = self._zip.read("xl/workbook.xml").decode("utf-8")
        if "fullCalcOnLoad" not in wbxml:
            if "<calcPr" in wbxml:
                wbxml = re.sub(r"<calcPr\b([^>]*?)/>", r'<calcPr\1 fullCalcOnLoad="1"/>', wbxml, count=1)
            else:
                wbxml = wbxml.replace("</workbook>", '<calcPr fullCalcOnLoad="1"/></workbook>')
            changed["xl/workbook.xml"] = wbxml.encode("utf-8")

        tmp = out_path + ".tmp"
        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
            for item in self._zip.infolist():
                if item.filename in drop:
                    continue
                data = changed.get(item.filename)
                if data is None:
                    data = self._zip.read(item.filename)
                zi = zipfile.ZipInfo(item.filename, date_time=item.date_time)
                zi.compress_type = item.compress_type
                zi.external_attr = item.external_attr
                zout.writestr(zi, data)
        shutil.move(tmp, out_path)

    def close(self):
        self._zip.close()
