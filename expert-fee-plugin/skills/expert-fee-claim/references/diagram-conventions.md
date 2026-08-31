# 시스템 도식 규약 (연구실 표준)

기준: `lab-ai-workflow v0.6`. 새 도식은 이 팔레트·레이아웃을 따라야 기존 자료와 나란히 놓았을 때 한 세트로 읽힌다.

## 페이지 구성

한 `.drawio` 파일에 뷰 여러 개를 둔다(같은 시스템, 다른 시선).

| 페이지 | 이름 | 언제 |
|---|---|---|
| A | `A. 가로 흐름형` | 기본. 데이터가 왼→오로 흐르는 파이프라인 |
| B | `B. 허브형 (중심 저장소)` | 하나의 저장소를 중심으로 방사형 연결일 때 |
| C | `C. 레이어 분해 뷰` | 계층별 책임을 분리해 보여줄 때 |

페이지 크기 1860×1080, `grid=1 gridSize=10`.

## 레이어 밴드 (A안)

배경 밴드 `rounded=1;arcSize=4;fillColor=#F7F9FC;strokeColor=none;` 위에 4개 열로 배치:

```
① 데이터 소스 → ② 인터페이스 / 저장소 → ③ 파이프라인 → ④ DB · 지식층
```

각 밴드 상단에 `text;fontSize=14;fontStyle=1;fontColor=#1F2A44` 로 밴드 제목.
문서 제목은 `fontSize=20;fontStyle=1;fontColor=#1F2A44`, 우측에 `(… · YYYY-MM-DD)` 버전 표기.

## 팔레트

| 용도 | fill | stroke | font |
|---|---|---|---|
| 제목·강조 텍스트 | — | — | `#1F2A44` |
| 본문 텍스트 | — | — | `#333333` / `#40484F` |
| 보조 설명 | — | — | `#5F6368` |
| 주요 노드 헤더(스윔레인) | `#2F6FDE` | `#2F6FDE` | `#FFFFFF` |
| 노드 본문 | `#EAF1FD` / `#FFFFFF` | `#D0D7DE` | `#333333` |
| DB·저장소 (cylinder3) | `#D4F1F4` | `#0E7490` | `#0B5563` |
| 주석 노트 (shape=note) | `#FFE0B2` | `#B26A00` | `#7A4A00` |
| 강조/경고 | `#F8BBD0` | `#AD1457` | `#880E4F` |
| 외부·추후 항목 (dashed) | `#F5F6F7` | `#9AA0A6` | `#5F6368` |
| 사람·역할 | `#FFFFFF` | `#8E5DB8` | `#5B3B78` |
| 성공·완료 | — | `#2E9E6B` | — |

폰트 크기: 노드 본문 10, 배지 8, 보조 9, 밴드 제목 14, 문서 제목 20.

## 표기 관습

- **자료형 배지**: 노드 안에 `PPT` `MP4` `MD` `PDF` `RAW` `CODE` 소형 칩(`rounded=1;arcSize=50` 또는 8pt 텍스트)을 붙여 어떤 형식이 흐르는지 표시.
- **★ 접두**: 정기 산출물(예 `★ PB`, `★ GRM`, `★ MM`)에 별표.
- **주기 표기**: 노드 하단 9pt 회색으로 `수 주1회 · 15시 마감` 처럼 실행 주기와 마감을 적는다.
- **엣지**: `edgeStyle=orthogonalEdgeStyle`. 주 흐름 `strokeWidth=3;strokeColor=#7A8794`, 보조 `1.5`, 미확정/추후는 `dashed=1;strokeColor=#9AA0A6`. 라벨은 `labelBackgroundColor=#FFFFFF`.
- **미확정 항목**은 dashed + 라벨에 `— 미정` / `(추후)`.

## 산출

```bash
drawio -x -f pdf --embed-diagram -o out/system-map.pdf draft/system-map.drawio
drawio -x -f png --embed-diagram -s 2 -o out/system-map.png draft/system-map.drawio
```

`--embed-diagram` 을 반드시 붙인다 — 내보낸 파일에서 원본 편집이 가능해야 한다.
draw.io MCP(`mcp__drawio__open_drawio_xml`)가 있으면 사용자 확인용으로 열어 보여준다.

## 내용 규칙

도식은 **자문 결과의 요약**이다. 녹취/자료에 근거가 없는 구성요소를 그리지 않는다.
확정되지 않은 것은 dashed + `미정` 으로 정직하게 표기한다.
