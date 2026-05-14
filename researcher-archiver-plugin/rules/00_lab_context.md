---
name: lab-context-rule
description: CSNL 연구실 공용 컨텍스트 (연간 일정, 주간 일정, 연구자 워크플로우, 비정기 실험 예약, MM 캘린더). 모든 INIT 세션 진입 시 자동 로드. 파일 명명 규칙 (PB_yymmdd.pdf, INIT_yymmdd.pdf, MM_yymmdd.pptx) 과 NAS 경로 (smb://147.47.70.15/CSNL_new/{GRM,MM}) 를 공용 어휘로 인식하기 위함.
---

## CSNL 연구실 기본 규칙

본 파일은 모든 INIT 세션 진입 시 자동 로드된다. PI 이상훈 (Sanghoon Lee, BCS,
서울대) 의 CSNL (Computational & Systems Neuroscience Lab) 운영 규칙을 담는다.
연구원과 대화하는 Claude 가 파일명, NAS 경로, 시간 표현을 *공용 어휘* 로 인식
하도록 한다.

### 1. 연간 일정

1. **연초 — 연구제안서 (Grant, NRF) 제출.** 주로 기초연구실, 중견 과제 등을
   지원함. 과제 코드 / 인프라 / 연구비 총액 정보는 행정 선생님으로부터 받아야 함.
2. **연구보고서 및 성과 제출.** 2024 년에 시작된 중견 연구 진행 중.
3. **1 학기, 2 학기 — 저년차 대학원생이 Coursework 수강.** 수업을 듣지 않는
   학생은 TA 업무. 이 정보는 Notion 시간표 등록 정도면 충분 — 연구데이터 활용 X.
4. **여름 — 학과 워크샵 (BCS Summerworkshop).** 논자시를 앞둔 학생이 구두발표
   수행 (이 내용은 추가 등록 예정).
5. **겨울 — 학과 학술대회 (Brainday).** 연구 성과가 있는 사람이 포스터 발표
   수행 + 연구실 1 년 성과 구두발표.

### 2. 주간 일정

- **매주 수요일 오전 10:00 부터 랩미팅 진행.**
  - 10:00 - 11:30 — *Paper Blitz (PB)*. 교수님 제외 각 구성원이 5 분간 이번 주에
    읽은 논문을 요약 소개. 전체 발표자료를 하나로 concat 해둠.
  - 11:30 - 13:00 — *GRM (Group Research Meeting)*. 연구원 한 명이 자신의 연구를
    깊이 발표 + 코멘트 받음. 가끔 special-GRM 으로 여럿이 발표하거나 연구 외적
    발표 진행.
  - NAS 경로: `smb://147.47.70.15/CSNL_new/GRM`
  - 파일명 규칙:
    - `PB_yymmdd.pdf` — Paper Blitz
    - `[이니셜]_yymmdd.pdf` — GRM
  - 가끔 파일이 분산되거나 keynote / pptx 로 있기도 함.

- **매주 화요일 자정 — CWLL.** 글을 통해 이번 주에 읽은 논문 소개. APA / Keyword
  / Summary 등을 참고하면 각 연구원의 research focus, 읽은 논문 리스트를 얻을
  수 있음.

### 3. 연구자 워크플로우

- 각자 논문을 읽고 (Zotero 또는 raw pdf), 자신의 연구 아이디어에 응용.
- MATLAB 또는 Python 기반으로 실험 디자인, 데이터 분석, 계산모델링 수행.
- 읽은 논문을 정리해놓은 *연구노트* (Notion, Obsidian, 수기 작성 등 다양) 와
  코드를 정리해놓는 *GitHub* 는 개별적으로 소유.
- PI 는 이 개별 노트를 DB 에 아카이빙하도록 요청할 수 있음.

### 4. 비정기 일정 — Slab calendar 실험 예약

- 각 연구원이 Slab calendar 에 `[이니셜] [프로젝트명] [Sbj 넘버] [세션 넘버]`
  형태로 실험 예약.
- 실험자는 참여자에게 행동실험을 수행하고 데이터를 NAS 에 업로드.
- 사용 도구: MATLAB PTB / Psychopy / jsPsych (JSP) 등.
- 수집 데이터: 저차원의 trial-to-trial 행동데이터 + eyetracking data (필수 아님).
- 실험 수집/기록 플로우는 vercel app 으로 관리하며 Supabase DB 에 연동.
  - 코드: https://github.com/CSNL-vnilab/Exp_Platform_by_Joonoh.git

### 5. 비정기 일정 — CSNL Calendar MM (Milestone Meeting)

- CSNL Calendar 에 각 연구원이 개인미팅 등록. `Meeting: [이니셜]` 형태.
- 주로 대면 미팅. 별명 = Milestone Meeting (MM).
- 미팅자료 포맷: `MM_yymmdd.pptx`
- NAS 경로: `smb://147.47.70.15/CSNL_new/MM`
- 자료를 정리하지 않는 실험자에게는 따로 요청을 보내야 함.

## 본 plugin 세션에 미치는 영향

- `PB_yymmdd.pdf` → 해당 yymmdd 의 수요일 10:00-11:30 Paper Blitz 발표자료로 식별
- `[INIT]_yymmdd.pdf` → 해당 yymmdd 의 수요일 11:30-13:00 GRM 발표자료로 식별
- `MM_yymmdd.pptx` → PI Milestone Meeting 자료로 식별 + CSNL Calendar 의
  `Meeting: <INIT>` 항목과 cross-reference
- Slab calendar booking `[INIT] [project] [Sbj N] [Sess N]` → 해당 INIT 의
  실험 일자 / 피험자 / 세션 timeline 근거 (researcher 가 "기억 안 남" 답해도
  Supabase `public.bookings` DB 로 복원 가능)
- 실험 도구 선택 (PTB / Psychopy / jsPsych) 은 프로젝트 단위 — `apparatus_jsonb`
  의 software field 에 1 개 명시
- 화요일 자정 CWLL 마감 + 수요일 PB/GRM 사이클은 *과거형 grounded Q* 의 기준
  anchor — "지난 수요일 GRM 자료에 어떤 figure 가 있었나" 같이 *실 NAS 파일* 로
  연결된 질문 가능

— end of 00_lab_context.md
