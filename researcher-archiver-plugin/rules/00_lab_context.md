---
name: lab-context-rule
description: CSNL lab-wide context (annual cycles, weekly meetings, researcher workflow, experiment booking, MM cadence). Auto-loaded before any per-INIT rule so file naming conventions (PB_yymmdd.pdf, INIT_yymmdd.pdf, MM_yymmdd.pptx) and NAS paths (smb://147.47.70.15/CSNL_new/{GRM,MM}) are recognized.
---

## CSNL Lab 공용 컨텍스트

본 파일은 모든 INIT 세션 진입 시 자동 로드된다. 연구원과 대화하는 Claude
가 `PB_yymmdd.pdf` 같은 파일명, `smb://147.47.70.15/CSNL_new/GRM` 같은 경로,
`수요일 10시 lab meeting` 같은 시간 표현을 *공용 어휘로 인식* 하도록 한다.

### 1. 연간 일정 (Annual)

- 1월: 신년 워크샵 + 연간 연구 로드맵 공유
- 3-4월: 신학기 시작, 새 학부생/대학원생 합류, 인수인계 GRM
- 6월: 학기말 GRM (Group Research Meeting) 집중
- 7-8월: 여름 학회 시즌 (국내외 학회 발표 준비 + 참석)
- 9월: 가을학기 시작, 연구 발표 일정 재조정
- 12월: 연간 결산 + 학위논문 마감 + 차년도 인력 계획

### 2. 주간 일정 (Weekly)

- 매주 *수요일 10:00 - 11:30* — Lab Meeting (오프라인 + 줌 병행)
  - 한 명이 PB (Paper Blitz) 또는 CWLL (Current Work / Long-form Lecture)
    또는 GRM (Group Research Meeting) 형식으로 발표
  - 발표자 파일은 NAS `smb://147.47.70.15/CSNL_new/{PB|CWLL|GRM}/` 에 업로드
  - 파일명 규칙: `PB_yymmdd.pdf`, `CWLL_yymmdd.pdf`, `GRM_yymmdd.pdf`
- *화요일 자정 (수요일 00:00)* — 이번주 CWLL 자료 제출 마감 (운영자 자동 reminder)

### 3. 연구자 워크플로우 (Research Workflow)

- 논문 관리: 개인 Zotero + 공용 NAS PDF 캐시 (`smb://147.47.70.15/CSNL_new/<INIT>/papers/`)
- 코드: MATLAB (실험 자극 + 일부 분석) + Python (전처리/분석/시각화)
- 개인 메모: Notion 또는 Obsidian 또는 GitHub README 자유 선택
- *PI (이상훈) 가 요청 시* 본 plugin (`/archive:bootstrap <INIT>`) 으로 메모리
  archive 가능 — 본인 NAS 폴더 구조 + 코드 위치 + 데이터 위치 + 분석 파이프라인
  + 결과 + 해석 6 차원 인터뷰 진행
- 모든 raw data 는 `smb://147.47.70.15/CSNL_new/<INIT>/<project>/Data/` 원본 보존
- 결과 그래프는 `smb://147.47.70.15/CSNL_new/<INIT>/<project>/Results/` 에 PDF/PNG

### 4. 비정기적 일정 — Slab calendar + 실험

- 피험자 실험 예약: lab-reservation vercel app
  (https://github.com/CSNL-vnilab/Exp_Platform_by_Joonoh.git) 사용
- 예약 데이터는 Supabase `public.bookings` 테이블에 저장
- 예약 포맷: `[연구자 INIT] - [프로젝트 slug] - [피험자 코드] - [요일/시간]`
- 실험 장비: MATLAB Psychtoolbox (PTB) + Psychopy + jsPsych (JSP) 혼용
  (프로젝트별 선택)
- 옵션: Eyetracking (EyeLink 1000 or Tobii) — 필요 시 별도 예약
- 실험 완료 후 `public.bookings.completed=true` 마킹 → 주간 cron 이
  `csnl_ops.behavioral_experiments` 로 미러링 (메모리 enrichment 입력)

### 5. 비정기적 일정 — CSNL Calendar MM

- MM (Meeting with PI) — 1:1 또는 소그룹 미팅, *Slab calendar 에 등록*
- 등록 포맷: `Meeting: [INIT]` (또는 `Meeting: [INIT1], [INIT2]`)
- 미팅 자료 파일명: `MM_yymmdd.pptx` (또는 `.pdf`)
- 업로드 위치: `smb://147.47.70.15/CSNL_new/MM/`
- 발표자가 *전날 자정까지* 업로드 (PI 가 사전 검토)

## 본 plugin agent 에 미치는 영향

- `PB_yymmdd.pdf` / `CWLL_yymmdd.pdf` / `GRM_yymmdd.pdf` 파일명 → 발표 자료로 식별 +
  해당 yymmdd 의 수요일 10:00-11:30 미팅과 자동 매핑
- `MM_yymmdd.pptx` → PI 미팅 자료로 식별 + Slab calendar 의 `Meeting: <INIT>`
  엔트리와 cross-reference
- `smb://147.47.70.15/CSNL_new/<INIT>/<project>/{Code,Data,Results}/` 표준 구조
  → 인터뷰 1차 패스 (map-first) 의 디렉토리 지도 기본 골격으로 활용
- `public.bookings.completed=true` row → 해당 INIT 의 실험 일자/피험자 timeline
  근거 (researcher 가 "기억 안 남" 답해도 DB 로 복원 가능)
- 실험 도구 (PTB / Psychopy / JSP) 선택은 *프로젝트 단위* — apparatus_jsonb 의
  software field 에 1 개 명시
- 화요일 자정 마감, 수요일 발표 사이클은 *과거형 질문* 의 기준 anchor — "지난
  수요일 PB 자료에 어떤 figure 가 있었나" 같이 *과거 NAS 파일* 로 grounded Q 가능

— end of 00_lab_context.md
