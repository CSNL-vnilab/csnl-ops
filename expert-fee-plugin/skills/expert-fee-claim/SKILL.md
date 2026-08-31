---
name: expert-fee-claim
description: 서울대학교 산학협력단 전문가활용비(자문료) 청구 증빙서류를 회의 녹음·회의자료로부터 자동 생성한다. 녹취 → 참석자·일시·활용시간 인터뷰 확인 → 자문내용정리/전문가활용 보고서 작성 → 사용내역서·일회성경비 엑셀 기입 → 시스템 설계도(draw.io) → 제출 번들 패키징. 다음 신호에 트리거 - "전문가활용비", "자문료 청구", "자문내용정리", "산학협력단 증빙", "expert fee", "활용보고서", "일회성경비", "회의 녹음으로 자문 보고서", 또는 자문 회의 녹음 파일을 주면서 증빙 서류를 요청할 때.
---

# 전문가활용비 증빙 자동화 (SNU 산학협력단)

회의 녹음 + 회의자료 → **제출 가능한 증빙 번들**까지 한 번에 만든다.

> **불변 규칙 3가지 — 어길 경우 작업 중단**
> 1. **주민등록번호·계좌번호는 화면/대화/커밋에 절대 원문 노출 금지.** 항상 마스킹(`900101-1******`, `1234**-**-5678**`)해서 말하고, 원문은 `~/.claude/snu-expert-fee/config/experts/*.json`(chmod 600)에서 스크립트가 직접 읽어 엑셀에만 기입한다.
> 2. **사실을 지어내지 않는다.** 날짜·시간·참석자·금액은 녹취/자료에서 근거를 못 찾으면 `unknown`으로 두고 §3 인터뷰로 확인한다. 추정치를 확정값처럼 문서에 쓰지 않는다.
> 3. **최종 제출·전송은 사용자가 한다.** 이 스킬은 파일 생성까지만 한다. 메일 발송·연구비 시스템 업로드는 절대 자동 실행하지 않는다.

---

## 0. 최종 산출물 (이 3개가 나오면 끝)

| # | 파일 | 만드는 단계 |
|---|---|---|
| 1 | `<전문가명>_전문가활용비_<YYMMDD>.xlsx` — 사용내역서 | P6 |
| 2 | `<전문가명>_일회성경비.xlsx` — 지급 업로드 양식 | P6 |
| 3 | `자문내용정리_<YYMMDD>.pdf` | P4 |

`전문가활용_<YYMMDD>` (활용 보고서)는 **옵션**이다. 사용자가 요청하거나 산학협력단이
따로 요구할 때만 만든다. 기본 3종에 포함시키지 않는다.

## 0-1. 파이프라인 개요

```
[P0] 준비    프로필(전문가/과제) 로드·검증          → scripts/doctor.py
[P1] 인테이크 녹취 텍스트 수령(기본) / 녹음→녹취, 자료→텍스트 → scripts/intake_media.sh
[P2] 초안 추출 claim.json 사전 예측 (confirmed/inferred/unknown)
[P3] 인터뷰   참석자·일시·활용시간 등 확정          → interview 스킬 규칙 적용
[P4] 본문 집필 자문내용정리 + 전문가활용 보고서      → references/report-templates.md
[P5] 도식     시스템 설계도 (.drawio → png/pdf)     → references/diagram-conventions.md
[P6] 양식     사용내역서 + 일회성경비 엑셀 기입      → scripts/fill_forms.py
[P7] 번들     첨부 정리 + 체크리스트 + manifest      → scripts/bundle.py
```

각 단계는 개별 슬래시 명령으로도 실행 가능하다(`/expert-fee:intake`, `/expert-fee:confirm`, …). 사용자가 전체를 요청하면 P0→P7을 순서대로 진행하되, **P3 인터뷰는 사람 응답을 기다린다** — 여기서만 멈춘다.

### 작업 디렉토리 규약

```
~/.claude/snu-expert-fee/
  config/
    experts/<expert_id>.json      # PII 포함, chmod 600, git 금지
    projects/<project_id>.json    # 과제 정보 (SRnD 번호, 책임자, 기간 …)
    forms/                        # 산학협력단 공식 빈 양식 xlsx 원본
  claims/<YYMMDD>-<expert_id>/
    claim.json                    # 단일 진실원천(SSOT)
    media/                        # 원본 녹음·영상 (심볼릭 링크 권장)
    transcript/*.txt|.srt         # 녹취
    materials/                    # 회의자료 원본 + 추출 텍스트
    draft/*.md                    # 보고서 마크다운 초안
    out/                          # 최종 제출물 (docx/pdf/xlsx/png)
    manifest.json                 # 산출물 목록 + 체크리스트 결과
```

`claim.json` 스키마는 `templates/claim.schema.json`. 모든 단계는 이 파일을 읽고 갱신한다.

---

## 1. P0 — 준비

1. `python3 ${CLAUDE_PLUGIN_ROOT}/scripts/doctor.py` 실행. 누락 항목(ffmpeg/whisper/openpyxl/양식 파일/프로필)을 사람이 읽을 수 있게 보고한다.
2. 전문가 프로필이 없으면 `templates/expert-profile.example.json`를 복사해 만들도록 안내하고, **주민번호·계좌번호는 사용자가 직접 파일에 넣게 한다**(대화창에 붙여넣지 말라고 명시).
3. 과제 프로필이 없으면 최근 청구 건에서 복사하거나 새로 만든다.

## 2. P1 — 인테이크 / P2 — 초안 추출

**기본 경로 — 녹취 텍스트를 직접 받는다.** 사용자가 이미 만들어 둔 녹취 `.txt` 를 주면
오디오 처리를 통째로 건너뛴다(시간·토큰 절약). 오디오가 없으면 whisper 도 요구하지 않는다.

```bash
bash ${CLAUDE_PLUGIN_ROOT}/scripts/intake_media.sh --claim <claim_dir> \
  --transcript <녹취.txt> [--input <회의자료 파일 또는 폴더>]
```

오디오/영상밖에 없을 때만:

```bash
bash ${CLAUDE_PLUGIN_ROOT}/scripts/intake_media.sh --claim <claim_dir> --input <녹음파일> --lang ko
```

- 오디오/영상 → 16kHz mono wav → whisper 녹취(`transcript/<name>.txt`, `.srt`)
- pdf/docx/pptx/xlsx/hwp → 텍스트 추출(`materials/<name>.txt`). hwp/hwpx는 추출 실패 시 그대로 첨부만 하고 "본문 미추출"로 기록한다.
- 상세 규칙·폴백은 `references/media-intake.md`.

녹취와 자료를 읽고 `claim.json`을 **사전 예측**으로 채운다. 각 필드에 `status`를 붙인다:

| status | 의미 | 처리 |
|---|---|---|
| `confirmed` | 녹취/자료/프로필에 명시적 근거 있음 | 근거 문장을 `evidence`에 인용 |
| `inferred` | 정황상 추정 | P3에서 "이렇게 이해했는데 맞나요?"로 확인 |
| `unknown` | 근거 없음 | P3 질문 대상 1순위 |

> 활용시간은 특히 조심한다. 녹음 길이 ≠ 활용시간(준비·정리 포함). 녹음 길이는 `inferred` 하한으로만 쓴다.

## 3. P3 — 인터뷰 (사람 확인)

`interview` 스킬 규칙을 그대로 적용한다. 핵심만 재기술:

- **사전 예측 우선**: 백지 질문 금지. "1차 2026-05-04, Zoom, 120분으로 파악했습니다. 틀린 곳 있나요?" 형태.
- **부트스트랩 턴만 최대 3문항**, 이후는 **한 턴 한 질문**.
- **거울 인용**: 답변 12~30자 인용 + 한 줄 요약으로 되돌려 확인.
- 종료 조건: 필수 필드에 `unknown`이 0개.

### 확인 대상 필드 (우선순위 순)

1. **참석자** — 기본값 `박준오 연구원`, `신재솔 연구원`. 기본값을 그대로 제시하고 추가/제외만 물어본다.
2. **자문위원(전문가)** — 지급 대상. 기본값 `신재솔 (위데이터랩 대표)`.
3. **일자 / 회차** — 여러 회차면 회차별 일자·시간을 각각.
4. **활용시간(총 시간)** — 사용내역서 `시간/회당/장` 칸에 들어가는 숫자.
5. **대면/비대면 + 장소** — 대면 기본 `서울대학교 220동 650호`, 비대면 기본 `온라인 Zoom 화상회의`.
6. **금액 / 소득구분** — 기본 자문료 400,000원, 기타소득(그 외 필요경비 없는 기타소득, 22%). 출장경비 유무.
7. **제목 / 목적** — 사전 예측 초안을 제시하고 문구 수정만 받는다.
8. **첨부 구성** — 회의자료 예시, 회의 사진, 시스템 지도 포함 여부.

질문 문구 템플릿은 `references/interview-protocol.md`.

## 4. P4 — 본문 집필

두 문서를 만든다. 문체·구조·금지사항은 **반드시** `references/report-templates.md`를 읽고 따른다.

| 산출물 | 성격 | 구조 |
|---|---|---|
| `전문가활용_<YYMMDD>` (활용 보고서) | 산학협력단 제출용, 격식 문어체, 고유명사·기술스택 최소화 | 제목 / 장소 / 활용일시 / 1.전문가 활용 목적 / 2.회의 내용 / 3.전문가 자문 결과 / 4.향후 방안 / 첨부목록 |
| `자문내용정리_<YYMMDD>` (상세 정리) | 실무 근거자료, 기술 용어 허용, 불릿 계층 | 1.자문 개요 / 2.일자별 상세 자문 내용 / 3.차기 자문 전 핵심 액션 아이템 / 붙임 |

**필수는 `자문내용정리` 하나다.** 활용 보고서는 요청이 있을 때만 만든다.

작성 순서: 마크다운 초안 → 사용자 검토 → 변환.

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/build_report.py --md draft/전문가활용_260403.md --out out/ --format docx pdf
```

## 5. P5 — 시스템 설계도

자문 내용이 시스템/워크플로우 설계를 포함하면 도식을 만든다(붙임 1-1 "시스템 지도" 역할).

- 레이어 밴드, 색상 팔레트, 배지 표기 등 연구실 표준은 `references/diagram-conventions.md`를 따른다.
- `.drawio` XML을 작성 → `drawio -x -f pdf --embed-diagram` 으로 내보낸다. draw.io MCP(`mcp__drawio__open_drawio_xml`)가 있으면 화면 확인용으로 함께 연다.
- 도식은 **자문 결과를 요약하는 그림**이어야 한다. 녹취에 없는 구성요소를 그려 넣지 않는다.

## 6. P6 — 양식 기입

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/fill_forms.py \
  --claim <claim_dir>/claim.json \
  --usage-template ~/.claude/snu-expert-fee/config/forms/전문가활용비_사용내역서.xlsx \
  --payment-template ~/.claude/snu-expert-fee/config/forms/일회성경비.xlsx \
  --out-dir <claim_dir>/out
```

- 셀 좌표 하드코딩이 아니라 **라벨 앵커**로 찾아 쓴다(양식 개정 대응). 필드별 매핑과 검증 규칙은 `references/snu-forms-spec.md`.
- 스크립트는 채운 필드/못 채운 필드를 리포트한다. **못 채운 필드는 반드시 사용자에게 그대로 보고한다** — 조용히 넘어가지 않는다.
- 원천징수(기타소득 22%) 후 실지급액을 참고로 계산해 보고한다. 양식에는 세전 금액을 쓴다.
- 지난 제출본을 양식으로 재사용하면 이전 전문가의 정보가 파일 안에 남는다. 스크립트가
  공유 문자열·하이퍼링크를 정리하지만, P7 의 "이전 건 잔여정보" 검사 결과를 반드시 확인한다.

## 7. P7 — 번들 + 체크리스트

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/bundle.py --claim <claim_dir>/claim.json
```

`out/` 에 최종물을 모으고 `manifest.json`을 쓴다. 그 다음 `references/compliance-checklist.md`의 항목을 하나씩 대조해 **표로** 보고한다. 실패 항목이 있으면 무엇이 왜 빠졌는지 명시한다.

마지막 보고에는 다음을 포함한다:
- 산출물 경로 목록
- 체크리스트 통과/실패
- 사용자가 직접 해야 하는 잔여 작업(서명·날인, 회의 사진 삽입, 시스템 업로드)

---

## 참조 파일

| 파일 | 내용 |
|---|---|
| `references/snu-forms-spec.md` | 사용내역서·일회성경비 필드 매핑, 유효성 규칙 |
| `references/report-templates.md` | 두 보고서의 구조·문체·예문·금지 표현 |
| `references/interview-protocol.md` | 확인 필드별 질문 문구, 기본값, 분기 |
| `references/media-intake.md` | ffmpeg/whisper 파이프라인, 문서 텍스트 추출 폴백 |
| `references/diagram-conventions.md` | 연구실 표준 도식 팔레트·레이아웃 규약 |
| `references/compliance-checklist.md` | 제출 전 최종 점검 목록 |
