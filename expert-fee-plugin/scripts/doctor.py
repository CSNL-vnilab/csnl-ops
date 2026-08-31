#!/usr/bin/env python3
"""환경 점검 — 무엇이 준비됐고 무엇이 없는지 한눈에."""
from __future__ import annotations

import argparse
import importlib
import os
import shutil
import subprocess
import sys
from pathlib import Path

HOME_CFG = Path(os.environ.get("SNU_EXPERT_FEE_HOME", Path.home() / ".claude" / "snu-expert-fee"))
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def row(ok, name, detail=""):
    mark = "OK  " if ok else ("--  " if ok is None else "MISS")
    print(f"  [{mark}] {name}" + (f" — {detail}" if detail else ""))
    return bool(ok)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--init", action="store_true", help="설정 디렉토리 생성")
    args = ap.parse_args()

    if args.init:
        for sub in ("config/experts", "config/projects", "config/forms", "claims"):
            (HOME_CFG / sub).mkdir(parents=True, exist_ok=True)
        print(f"생성 완료: {HOME_CFG}")

    problems = 0
    print(f"\n■ 파이썬 {sys.version.split()[0]}")
    for mod, why in [("openpyxl", "엑셀 읽기/검증"), ("docx", "docx 생성"), ("pptx", "회의자료 pptx 추출")]:
        try:
            importlib.import_module(mod)
            row(True, mod, why)
        except ImportError:
            problems += 1
            pkg = {"docx": "python-docx", "pptx": "python-pptx"}.get(mod, mod)
            row(False, mod, f"{why} — pip install {pkg}")

    print("\n■ 외부 도구")
    # 존재 여부만 보지 않고 실제로 실행해 본다.
    # homebrew 업그레이드 후 링크가 깨진 ffmpeg 가 PATH 에 남아 있는 경우가 흔하다.
    ff = shutil.which("ffmpeg")
    if not ff:
        problems += 1
        row(False, "ffmpeg", "오디오 변환 — brew install ffmpeg")
    else:
        r = subprocess.run([ff, "-version"], capture_output=True, text=True)
        if r.returncode != 0:
            problems += 1
            err = (r.stderr or "").strip().splitlines()
            hint = next((l for l in err if "Library not loaded" in l or "dylib" in l), err[0] if err else "")
            row(False, "ffmpeg", f"설치돼 있으나 실행 실패 — brew reinstall ffmpeg / {hint[:80]}")
        else:
            row(True, "ffmpeg", r.stdout.split()[2] if len(r.stdout.split()) > 2 else "")
    has_cpp = bool(shutil.which("whisper-cli"))
    has_oai = bool(shutil.which("whisper"))
    if not row(has_cpp or has_oai, "whisper", "녹취 — brew install whisper-cpp 또는 pip install openai-whisper"):
        problems += 1
    if has_cpp:
        models = []
        for d in (Path.home() / "whisper.cpp/models", Path("/opt/homebrew/share/whisper-cpp")):
            models += [p.name for p in d.glob("ggml-*.bin") if ".en." not in p.name] if d.exists() else []
        row(bool(models), "whisper.cpp 다국어 모델", ", ".join(models) or "한국어용 ggml 모델 없음 (ggml-medium.bin 권장)")
    row(bool(shutil.which("pdftotext")), "pdftotext", "PDF 자료 추출 — brew install poppler")
    row(Path(CHROME).exists(), "Google Chrome", "PDF 인쇄")
    row(bool(shutil.which("drawio")), "drawio CLI", "도식 내보내기 — brew install --cask drawio")

    print(f"\n■ 설정 ({HOME_CFG})")
    for sub, why in [("config/experts", "전문가 프로필(PII)"), ("config/projects", "과제 프로필"),
                     ("config/forms", "산학협력단 공식 빈 양식 xlsx"), ("claims", "청구 작업 디렉토리")]:
        d = HOME_CFG / sub
        n = len(list(d.glob("*"))) if d.exists() else 0
        if not row(d.exists(), sub, f"{n}개 — {why}" if d.exists() else f"{why} — doctor.py --init 로 생성"):
            problems += 1

    experts = HOME_CFG / "config/experts"
    if experts.exists():
        for f in experts.glob("*.json"):
            mode = oct(f.stat().st_mode)[-3:]
            if mode not in ("600", "400"):
                problems += 1
                row(False, f"권한 {f.name}", f"{mode} — chmod 600 '{f}' 필요 (주민번호 포함 파일)")
            else:
                row(True, f"권한 {f.name}", mode)

    forms = HOME_CFG / "config/forms"
    if forms.exists():
        names = [p.name for p in forms.glob("*.xlsx")]
        row(any("전문가활용비" in n or "사용내역서" in n for n in names), "사용내역서 양식",
            ", ".join(names) or "config/forms 에 공식 빈 양식을 넣어주세요")
        row(any("일회성경비" in n for n in names), "일회성경비 양식", "")

    print(f"\n결과: {'준비 완료' if problems == 0 else f'{problems}건 조치 필요'}")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
