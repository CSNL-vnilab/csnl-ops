# 인테이크 — 녹음·자료 → 텍스트

`scripts/intake_media.sh` 가 수행하는 일과, 실패했을 때의 폴백.

## 0. 기본 경로 — 녹취 텍스트를 직접 받는다

사용자가 녹취 `.txt` 를 이미 갖고 있으면 그것을 쓴다. 녹음을 다시 돌리지 않는다.

```bash
bash intake_media.sh --claim <claim_dir> --transcript <녹취.txt> [--input <회의자료>]
```

- `--transcript` 로 준 파일은 `transcript/` 로 그대로 복사된다.
- `--input` 으로 준 `.txt`/`.md` 도 파일명에 `녹취|전사|transcript|stt|자막|회의록` 이
  들어 있으면 자동으로 `transcript/` 로 간다. 그 외 텍스트는 회의자료로 취급한다.
- 오디오 파일이 하나도 없으면 whisper·ffmpeg 를 요구하지 않는다.

녹취 원문을 대화창에 통째로 붙여넣지 않는다. 파일로 두고 필요한 대목만 인용한다.
분량이 크면 `expert-fee-scribe` 서브에이전트에 맡겨 구조화 회의록만 받는다.

## 1. 오디오/영상 → 녹취 (텍스트 녹취가 없을 때만)

```
입력(.m4a .mp3 .wav .mp4 .mov .aac .flac)
  → ffmpeg -ac 1 -ar 16000 -c:a pcm_s16le  (16kHz mono wav)
  → 녹취 엔진
  → transcript/<name>.txt, transcript/<name>.srt
```

### 엔진 선택 순서

1. **whisper.cpp** (`whisper-cli`) + ggml 모델 — 가장 빠름. 모델 경로는 `WHISPER_CPP_MODEL` 환경변수 또는 `~/whisper.cpp/models/ggml-*.bin` 중 large > medium > small 순.
2. **openai-whisper** (`whisper`) — `--language Korean --model small` (medium 이상 권장, 첫 실행 시 모델 자동 다운로드).
3. 둘 다 없으면 **중단하고 사용자에게 보고**한다. 녹취 없이 추측으로 보고서를 쓰지 않는다.

한국어 회의는 `.en` 모델을 쓰면 안 된다(영어 전용). `--language ko` 를 항상 지정한다.

### 긴 회의

2시간 이상이면 ffmpeg `-f segment -segment_time 1800` 으로 30분씩 잘라 병렬 처리하고, 타임스탬프 오프셋을 더해 병합한다. `--split` 플래그로 켠다.

### 녹취 활용 시 주의

- 화자 분리(diarization)는 하지 않는다. 누가 말했는지는 문맥과 인터뷰로 확정한다.
- 녹취는 오인식이 있다. 고유명사(사람 이름, 제품명, 숫자)는 **그대로 인용하지 말고** 인터뷰로 확인한다.
- 녹음 길이는 활용시간의 **하한 추정치**일 뿐이다.

## 2. 회의자료 → 텍스트

| 형식 | 방법 | 실패 시 |
|---|---|---|
| pdf | `pdftotext -layout` | 스캔본이면 페이지 이미지로 추출해 첨부만 |
| docx | `python-docx` 문단+표 | 그대로 첨부 |
| pptx | `python-pptx` 슬라이드별 텍스트 | 슬라이드 이미지로 내보내 첨부 |
| xlsx | `openpyxl` 시트별 셀 덤프 | 그대로 첨부 |
| drawio | `value=` 속성 추출 (노드 라벨) | png 내보내기로 첨부 |
| hwp/hwpx | 추출기 없음 | **본문 미추출**로 기록하고 원본만 첨부. 필요하면 사용자에게 PDF 변환 요청 |
| 이미지 | 추출 안 함 | 회의 사진 후보로 분류 |

추출 결과는 `materials/<원본명>.txt` 로 저장하고, 원본은 `materials/` 에 그대로 둔다.

## 3. 분류

인테이크 후 파일을 세 갈래로 분류해 `claim.json` 에 기록한다.

- `attachments.materials` — 첨부목록 1 "회의자료 예시"
- `attachments.photos` — 첨부목록 2 "회의 사진"
- `attachments.diagrams` — 붙임 "시스템 지도"

## 4. 개인정보

녹취에 주민번호·계좌번호·전화번호가 섞여 들어올 수 있다. 인테이크 직후 정규식으로 스캔해
`\d{6}[-\s]?[1-4]\d{6}` / `\d{2,3}-\d{3,4}-\d{4}` 패턴이 있으면 **사용자에게 경고**하고
녹취 파일에서 마스킹한 뒤 진행한다.
