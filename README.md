# csnl-ops

CSNL 연구실의 운영 지식 — 캘린더, 실험 데이터, NAS 저장 경로, 발표자료 메타, 연간/주간 패턴 — 을
하나의 Supabase 기반 운영 DB로 통합하기 위한 **마이그레이션 베이스라인** 저장소.

이 저장소 자체에는 아직 코드가 없다. 새 Claude 세션이 이 README 를 컨텍스트 입력으로 받아
DB 스키마와 동기화 함수를 짓기 시작한다.

---

## 사용 방법

1. 새 Claude 세션을 띄운다 (이 디렉토리 또는 별도 작업 디렉토리에서).
2. [§ 2 마이그레이션 프롬프트](#2-마이그레이션-프롬프트) 본문을 첫 user 메시지로 복사해 붙여넣는다.
3. Claude 가 [§ 1 연구실 일정](#1-연구실-일정-사용자-원본) 과 [§ 3 메모리](#3-claude-자동-메모리-reference)
   를 함께 읽도록 안내하고, prompt 안의 *받아야 할 입력 7개 항목* 부터 채운다.

---

## 1. 연구실 일정 (사용자 원본)

> 이 섹션은 사용자가 직접 정리한 원본 텍스트이다. 모호하거나 누락된 점이 있으면
> 새 세션에서 사용자에게 다시 물어 보강한다.

### 연간 일정

1. 연초 연구제안서 (Grant, NRF) 제출, 주로 기초연구실, 중견 과제 등을 지원함.
2. 연구보고서 및 성과 제출 (2024년에 시작된 중견 연구 진행중)
3. 1학기, 2학기에는 저년차 대학원생들이 Coursework 을 수강함. 수업을 듣지 않는 학생들은 TA 업무를 함.
4. 여름에는 학과 워크샵 (BCS Summerworkshop), 논자시를 앞둔 학생이 구두발표를 수행
5. 겨울에는 학과 학술대회 (Brainday), 연구성과가 있는 사람이 포스터 발표를 수행, 연구실 1년 성과를 구두발표

### 주간 일정

매주 수 오전 10:00~ 랩미팅
순서:
- 10:00 ~ 11:30 **Paper Blitz** (교수님 제외 각 구성원이 5분간 이번주에 읽은 논문을 요약해 소개함.)
- 11:30 ~ 13:00 **GRM** (연구원 한 명이 자신의 연구를 깊이 발표하고 코멘트받음), 가끔 *special-GRM* 으로 여럿이 발표하거나 연구 외적인 발표를 진행하기도 함.

발표자료는 `PB_yymmdd.pdf` (Paper Blitz), `[이니셜]_yymmdd.pdf` (GRM) 으로 저장됨.
가끔 파일이 분산되거나 keynote, pptx 로 있기도 함.

매주 화요일 자정: **CWLL** — 글을 통해 이번 주에 읽은 논문을 소개함. APA, Keyword, Summary 등을 각자 작성.

### 비정기 일정

**Slab calendar** 에 각 연구원이 `[이니셜] [프로젝트명] [Sbj 넘버] [세션 넘버]` 의 형태로 실험을 예약해둔다.
실험자는 실험 참여자에게 행동실험을 수행하고 실험 데이터를 NAS 에 업로드한다.
주로 MATLAB PTB, Psychopy, JSP (jsPsych) 등을 사용하며 저차원의 trial-to-trial 행동데이터와
eyetracking data (필수는 아님) 를 수집함.

**CSNL Calendar** 에 각 연구원이 개인미팅을 잡는다. `Meeting: [이니셜]` 형태로, 주로 대면미팅이며
*Milestone Meeting* 이라는 별명을 가짐. 주로 미팅자료 포맷은 `MM_yymmdd.pptx` 이고,
자료를 정리하지 않는 실험자에게는 따로 요청을 보내야함.

---

## 2. 마이그레이션 프롬프트

> 새 Claude 세션의 첫 user 메시지로 그대로 붙여넣는다. self-contained 하므로
> 이 저장소를 클론하지 않은 환경에서도 동작한다.

```markdown
# CSNL Lab Operations DB — Migration Prompt

## 임무

CSNL 연구실의 운영 지식 (캘린더, 실험, NAS 데이터, 연간/주간 패턴, 발표자료 메타) 을
하나의 **CSNL 운영 DB**로 통합해 Supabase 위에 구축한다.
기존 `lab-reservation` 앱(같은 Supabase 인스턴스)이 다루는 *예약* 도메인은 손대지 말고,
**메타-운영 데이터**를 별도 schema (`csnl_ops` 권장) 로 추가한다.

## 이미 운영 중인 시스템 (컨텍스트)

- **Lab Reservation App** — Next.js 16 + Supabase + Vercel
  - 도메인: 장비/세션 예약, 참여자 부킹, profiles, registration_requests
  - cron 은 GH Actions 로 운영 (Vercel Hobby slot 한도 2개 보호) — `vercel.json` 은 의도적으로 비어 있음
  - 배포 정책: `main` 직푸시, 다중 Claude 세션이 동시 작업
- **TimeExpOnline1** — 시간 재현 패러다임 웹포팅 (jsPsych 기반, in-lab MATLAB PTB 별도 트랙)

새 DB 작업 시 위 두 코드베이스의 **Supabase project · auth · profiles** 를 그대로 활용 가능.

## 도메인 지식 — 사용자 직접 제공분

### 연간 일정

| 시기 | 활동 | 주체 |
|------|------|------|
| Q1 | 연구제안서 제출 — NRF, 기초연구실, 중견과제 | PI + 박사후/박사 |
| 진행 | 2024 시작 중견연구 보고서/성과 제출 | 과제 책임자 |
| 1학기 (3–6월) | 저년차 대학원생 Coursework / 비수강자는 TA | 대학원생 |
| 여름 (7–8월) | **BCS Summer Workshop** (학과 워크샵) | 전원 |
| 〃 | **논자시 앞둔 학생 구두발표** | 해당 학생 |
| 2학기 (9–12월) | Coursework / TA | 대학원생 |
| 겨울 (12–2월) | **Brainday** (학과 학술대회) — 성과자 포스터 | 성과 보유자 |
| 〃 | **연구실 1년 성과 구두발표** | 전원 |

### 주간 일정

- **매주 수요일 10:00–13:00 — Lab Meeting**
  - 10:00–11:30 **Paper Blitz** — 교수님 제외 각 구성원이 5분간 이번 주 읽은 논문 요약
    - 자료: `PB_yymmdd.pdf`
  - 11:30–13:00 **GRM (Group Research Meeting)** — 1인 자기 연구 심층 발표 + 코멘트
    - 자료: `[Initial]_yymmdd.pdf`
    - 변형: **special-GRM** (다인 발표 또는 비연구 주제)
- **매주 화요일 24:00 — CWLL** — 주간 읽은 논문을 글로 소개
  - 형식: APA + Keyword + Summary

### 비정기 일정

- **Slab Calendar** — 실험실 행동실험 예약
  - 이벤트 제목 패턴: `[Initial] [Project] [Sbj#] [Session#]`
  - 실험자: 참여자 행동실험 수행 → NAS 업로드
  - 도구: MATLAB Psychtoolbox / Psychopy / jsPsych
  - 데이터: trial-by-trial 행동, eyetracking (선택)
- **CSNL Calendar** — 개인 미팅 (별명 *Milestone Meeting*)
  - 이벤트 제목 패턴: `Meeting: [Initial]` (주로 대면)
  - 자료: `MM_yymmdd.pptx`
  - **운영 페인포인트**: 자료 미정리 실험자에게 따로 요청을 보내야 함

### 파일 네이밍 정리

| 패턴 | 의미 | 비고 |
|------|------|------|
| `PB_yymmdd.pdf` | Paper Blitz | pdf 표준, 가끔 keynote/pptx 산재 |
| `[Initial]_yymmdd.pdf` | GRM 발표 | 〃 |
| `MM_yymmdd.pptx` | Milestone Meeting | 누락 잦음 → 메타 트래킹 가치 큼 |

## 새 세션이 사용자에게 *받아야 할* 입력 (이전 세션이 모르는 것)

다음은 이전 세션 컨텍스트로는 알 수 없으므로 새 세션에서 한 번에 묶어 질문할 것:

1. **연구원 마스터 리스트** — Initial ↔ 실명 ↔ 역할(학부생/석사/박사/박사후/PI) ↔ 시작일
2. **PI 이름** 및 연구실 공식 한국어/영문 명칭 (디렉토리 핸들은 `csnl`)
3. **NAS 마운트 경로** 와 디렉토리 컨벤션 (e.g. `/nas/csnl/exp/<project>/<sbj>/...`)
4. **Google Calendar ID** — Slab calendar / CSNL calendar 각각
5. **현재 진행 grant 정보** — 과제번호, 과제명, 시작/종료일, 책임자
6. **현재 진행 프로젝트 매핑** — `project_code` ↔ 풀네임 ↔ 책임자 ↔ 사용 도구
7. **논자시·학위논문 일정** — 누가 언제

## 추천 스키마 출발점

`csnl_ops` schema 분리 권장 (`public` 의 reservation 테이블과 격리).

```sql
create schema if not exists csnl_ops;

-- 연구원 마스터
create table csnl_ops.researchers (
  initial         text primary key,                       -- 'JY', 'HK' 등
  full_name       text not null,
  email           text,
  role            text check (role in ('undergrad','ms','phd','postdoc','pi','staff')),
  joined_on       date,
  candidacy_on    date,                                   -- 논자시 통과일
  defended_on     date,
  active          boolean default true
);

-- 실험 예약 (Slab calendar mirror)
create table csnl_ops.experiment_bookings (
  id                      uuid primary key default gen_random_uuid(),
  researcher_initial      text references csnl_ops.researchers,
  project_code            text not null,
  subject_no              int,
  session_no              int,
  scheduled_start         timestamptz not null,
  scheduled_end           timestamptz,
  slab_calendar_event_id  text unique,                    -- Google Calendar event id
  created_at              timestamptz default now()
);

-- Lab meeting (PB / GRM / special-GRM)
create type csnl_ops.lab_meeting_type as enum ('paper_blitz','grm','special_grm');
create table csnl_ops.lab_meetings (
  meeting_date        date not null,
  type                csnl_ops.lab_meeting_type not null,
  presenter_initial   text references csnl_ops.researchers,
  slides_path         text,                               -- NAS / Drive / 로컬
  slides_format       text,                               -- 'pdf','pptx','keynote'
  paper_doi           text,                               -- PB 전용
  notes               text,
  primary key (meeting_date, type, presenter_initial)
);

-- Milestone Meeting (개인 미팅, CSNL calendar)
create table csnl_ops.milestone_meetings (
  meeting_date            date not null,
  researcher_initial      text references csnl_ops.researchers,
  slides_path             text,                           -- MM_yymmdd.pptx
  slides_submitted        boolean default false,
  csnl_calendar_event_id  text unique,
  notes                   text,
  primary key (meeting_date, researcher_initial)
);

-- CWLL 주간 글
create table csnl_ops.cwll_entries (
  due_date              date not null,                    -- 화요일 자정 마감
  researcher_initial    text references csnl_ops.researchers,
  paper_apa             text not null,
  keywords              text[],
  summary               text,
  submitted_at          timestamptz,
  primary key (due_date, researcher_initial)
);

-- 연간 행사
create type csnl_ops.annual_event_type as enum (
  'grant_proposal','grant_report','bcs_workshop','candidacy_oral',
  'brainday_poster','brainday_talk','lab_year_summary'
);
create table csnl_ops.annual_events (
  id              uuid primary key default gen_random_uuid(),
  year            int not null,
  type            csnl_ops.annual_event_type not null,
  deadline        timestamptz,
  owner_initial   text references csnl_ops.researchers,
  status          text default 'pending',
  notes           text
);

-- NAS 데이터 lineage
create table csnl_ops.nas_datasets (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid references csnl_ops.experiment_bookings,
  nas_path            text not null,
  software            text check (software in ('ptb','psychopy','jspsych','other')),
  has_eyetracking     boolean default false,
  uploaded_at         timestamptz,
  uploader_initial    text references csnl_ops.researchers
);

-- Grant / 과제
create table csnl_ops.grants (
  code         text primary key,                          -- 'NRF-2024-...'
  title        text not null,
  category     text,                                       -- '기초연구실','중견' 등
  pi_initial   text references csnl_ops.researchers,
  start_date   date,
  end_date     date,
  status       text
);

-- 프로젝트
create table csnl_ops.projects (
  code         text primary key,                          -- Slab calendar 의 [Project]
  full_name    text,
  lead_initial text references csnl_ops.researchers,
  software     text[],                                     -- ['ptb','jspsych']
  active       boolean default true
);
```

RLS 기본 원칙:
- `csnl_ops.*` 는 인증된 lab member 만 read
- 본인 row 만 write (researcher_initial = 본인 매핑)
- PI 는 모든 write 가능

## 새 세션이 가장 먼저 해야 할 일

1. 이 문서를 끝까지 읽고 *§ 받아야 할 입력* 의 7개 항목을 사용자에게 한 번에 묶어 질문.
2. 사용자 응답으로 위 스키마를 다듬어 `supabase/migrations/<timestamp>_csnl_ops_init.sql` 작성.
3. Google Calendar 동기화 (Slab → `experiment_bookings`, CSNL → `milestone_meetings`) 는
   Supabase Edge Function 또는 GH Actions cron 으로 구현.
   *Vercel Hobby cron 슬롯 2개 한도 주의 — 신규 cron 은 GH Actions 에 추가.*
4. NAS 동기화는 v1 — 사용자 path 직접 입력 폼 → v2 — 자동 스캔.
5. 발표자료 메타 트래킹 (PB / GRM / MM) 부터 만들면 첫 가치 입증 빠름 — 누가 자료를 안 올렸는지 자동 알림.

## 다중 세션 운영 규칙 (필독)

여러 Claude 세션이 동시에 `main` 에 직푸시한다. 새 세션도 다음을 지킬 것:

- 푸시 전 `git fetch && git log HEAD..origin/main` 확인. 원격 진척 있으면 pull 먼저.
- `main` force-push 금지.
- 프로덕션 영향 경로 (`src/app/`, `src/lib/`, `supabase/migrations/`, `vercel.json`) 푸시 후
  **60초 대기** — Vercel concurrency 가 in-flight 빌드를 cancel 함.
- DB 변형 스크립트는 commit body 에 명시.
- Cron 은 `.github/workflows/*-cron.yml` 에 추가. `vercel.json` 에는 추가하지 말 것.
```

---

## 3. Claude 자동 메모리 (reference)

> 아래 frontmatter 포함 본문은 Claude 의 프로젝트별 auto-memory 형식 그대로다.
> 새 작업 디렉토리에서 사용하려면 해당 프로젝트의
> `~/.claude/projects/<project-handle>/memory/reference_csnl_lab_ops.md` 로 저장하고
> 같은 폴더의 `MEMORY.md` 에 한 줄 인덱스를 추가하면 된다.

```markdown
---
name: CSNL lab operations & rhythms
description: CSNL (BCS) lab annual/weekly schedule, file naming conventions, and dual-calendar systems — context for any work touching scheduling, naming, presentation artifacts, or grant timelines
type: reference
---

CSNL is a BCS-affiliated lab. Active codebases this Claude has touched: `lab-reservation` (Next.js 16 + Supabase) and `TimeExpOnline1` (jsPsych port of MATLAB time-reproduction paradigm).

**Annual cycle**
- Q1: NRF / Grant proposals (기초연구실, 중견과제)
- Ongoing: reports for the 2024-start 중견 grant
- 1학기 / 2학기 (3–6월, 9–12월): junior grad coursework; non-takers do TA
- Summer (7–8월): BCS Summer Workshop, candidacy (논자시) oral presentations
- Winter (12–2월): Brainday (dept conference) — posters from achievers + lab annual summary talk

**Weekly recurring**
- Wed 10:00–13:00 Lab Meeting
  - 10:00–11:30 **Paper Blitz** — every member except PI does a 5-min paper summary → `PB_yymmdd.pdf`
  - 11:30–13:00 **GRM** — one researcher in-depth → `[Initial]_yymmdd.pdf`; *special-GRM* = multi-presenter or non-research
- Tue 24:00 **CWLL** — written paper note: APA + keywords + summary

**Calendars (two separate Google Calendars)**
- *Slab calendar*: experiment slot bookings, title pattern `[Initial] [Project] [Sbj#] [Session#]`
- *CSNL calendar*: 1:1 milestone meetings, title pattern `Meeting: [Initial]`, slides `MM_yymmdd.pptx`

**Experimentation**
- Tools: MATLAB Psychtoolbox, Psychopy, jsPsych
- Data: trial-to-trial behavioral + optional eyetracking → uploaded to lab NAS (specific mount/path: unknown to Claude)
- Naming pain: pdf / keynote / pptx scattered; MM slides especially often missing → chasing presenters is real ops overhead

**What Claude does NOT know (must ask user)**
PI name, researcher initial↔name map, NAS mount, calendar IDs, active grant codes, project code↔full-name map, candidacy/defense schedule.

**Use as context when**: scheduling work, parsing presentation filenames, designing schemas that touch lab ops, suggesting which day of week to run something.
```

---

*초기화 일자: 2026-05-01.
원본 컨텍스트는 `lab-reservation` 저장소 작업 중 정리되었다.*
