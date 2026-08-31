# snu-expert-fee

서울대학교 산학협력단 **전문가활용비(자문료) 청구 증빙서류**를 회의 녹음·자료에서 자동으로 만든다.

```
회의 녹음 + 회의자료
  → 녹취·텍스트 추출
  → 참석자·일시·활용시간 인터뷰 확인
  → 자문내용정리 + 전문가활용 보고서 (docx/pdf)
  → 사용내역서 + 일회성경비 엑셀 자동 기입
  → 시스템 설계도 (draw.io → pdf/png)
  → 제출 번들 + 자동 점검 체크리스트
```

## 설치

```bash
/plugin marketplace add CSNL-vnilab/csnl-ops
/plugin install snu-expert-fee@csnl-ops
```

설치 후:

```bash
python3 ~/.claude/plugins/.../scripts/doctor.py --init   # 또는 /snu-expert-fee:doctor --init
```

1. `~/.claude/snu-expert-fee/config/forms/` 에 산학협력단 **공식 빈 양식** 2종을 넣는다
   (`전문가활용비_사용내역서.xlsx`, `일회성경비.xlsx`).
2. `templates/expert-profile.example.json` 을 복사해
   `~/.claude/snu-expert-fee/config/experts/<id>.json` 을 만들고 `chmod 600`.
3. `templates/project-profile.example.json` 을 복사해 과제 프로필을 만든다.

## 사용

```
/snu-expert-fee:new ~/Downloads/자문회의_260403.m4a
```

인터뷰 턴에서 한 번 멈춘다. 답하면 나머지가 이어진다.

개별 단계:

| 명령 | 하는 일 |
|---|---|
| `/snu-expert-fee:doctor` | 환경·설정 점검 (`--init` 로 디렉토리 생성) |
| `/snu-expert-fee:intake` | 녹음 → 녹취, 자료 → 텍스트 |
| `/snu-expert-fee:confirm` | 참석자·일시·활용시간 인터뷰 확정 |
| `/snu-expert-fee:report` | 보고서 2종 초안 + docx/pdf |
| `/snu-expert-fee:diagram` | 연구실 표준 팔레트 draw.io 설계도 |
| `/snu-expert-fee:forms` | 엑셀 양식 2종 기입 |
| `/snu-expert-fee:check` | 제출 전 자동 점검 + manifest |

## 개인정보 취급

- 주민등록번호·계좌번호는 **`config/experts/<id>.json` 에만** 있고, `claim.json` 에는 없다.
  `fill_forms.py` 는 claim.json 에서 주민번호 패턴을 발견하면 **실행을 중단한다**.
- 대화·로그 출력은 항상 마스킹된다 (`900101-1******`).
- 산출물 스캔에서 보고서(docx/pdf/md)에 주민번호가 있으면 점검이 **즉시 실패**한다.
- `.gitignore` 가 `config/experts/*.json`, `claims/`, `*.xlsx` 를 막는다.

## 관공서 양식을 다루는 방식

공식 양식에는 개인정보 동의 **ActiveX 체크박스**, 로고 이미지, 인쇄 설정, 데이터 유효성 규칙이
들어 있다. openpyxl 로 열고 저장하면 이것들이 사라진다. 그래서 `xlsx_edit.py` 는
시트 XML 을 문자열로 직접 고치고 나머지 zip 엔트리는 바이트 그대로 복사한다.

- 셀은 **라벨 앵커**로 찾는다 — 양식이 개정돼 행이 밀려도 동작한다.
- 통합문서 내부 수식(`=D19+F19+…` 총액, `=IF(H3="대한민국","N","Y")`)은 **보존**하고,
  끊어진 외부 참조(`='[2]1'!B7`)만 값으로 덮어쓴다.
- 수식 셀을 덮어쓴 경우 계산 캐시(`calcChain.xml`)를 제거해 Excel 복구 경고를 막고,
  `fullCalcOnLoad` 를 켜 파일을 열 때 총액이 다시 계산되게 한다.
- **셀을 비워도 값은 파일에 남는다.** 지난 청구 건의 이름·주민번호가 `sharedStrings.xml` 에,
  이메일이 하이퍼링크 관계(`.rels`)에 남는 실제 유출 경로가 있다. 저장 시
  참조되지 않는 공유 문자열을 비우고, 덮어쓴 셀의 하이퍼링크와 그 관계 항목을 지운다.
  점검 단계에서도 "양식 내 이전 건 잔여정보 없음"을 따로 검사한다.
- 체크박스 체크·서명·날인은 **사람이 한다**. 스크립트가 하는 척하지 않는다.

## 구성

```
skills/expert-fee-claim/     메인 스킬 + 참조 문서 6종
  references/snu-forms-spec.md        양식 필드 매핑·유효성 규칙
  references/report-templates.md      보고서 2종 구조·문체
  references/interview-protocol.md    확인 인터뷰 질문 설계
  references/media-intake.md          녹취·추출 파이프라인
  references/diagram-conventions.md   연구실 표준 도식 규약
  references/compliance-checklist.md  제출 전 점검 목록
agents/expert-fee-scribe.md  녹취 → 구조화 회의록 (컨텍스트 격리)
commands/                    슬래시 명령 8종
scripts/
  xlsx_edit.py       ActiveX·이미지 보존 xlsx 편집기
  fill_forms.py      양식 2종 기입 + 세액 계산
  intake_media.sh    ffmpeg + whisper 녹취
  extract_text.py    pdf/docx/pptx/xlsx/drawio 텍스트 추출
  build_report.py    md → docx + pdf (Chrome 인쇄)
  bundle.py          자동 점검 10항목 + manifest
  doctor.py          환경 점검
templates/           claim 스키마·예시, 보고서 md 템플릿
```

## 요구 사항

| 도구 | 용도 | 없을 때 |
|---|---|---|
| ffmpeg | 오디오 변환 | 녹취 불가 (중단) |
| whisper-cpp 또는 openai-whisper | 녹취 | 중단 — 추측으로 쓰지 않는다 |
| python-docx / openpyxl / python-pptx | 문서 생성·추출 | 해당 기능만 비활성 |
| pdftotext (poppler) | PDF 자료 추출 | 원본만 첨부 |
| Google Chrome | 보고서 PDF 인쇄 | docx 만 생성 |
| drawio CLI | 도식 내보내기 | `.drawio` 파일만 생성 |

한국어 회의는 **다국어 모델**이 필요하다. `.en` 모델(base.en 등)은 쓰면 안 된다.

## 라이선스

Internal-Lab-Use-Only (CSNL Lab, 서울대 BCS)
