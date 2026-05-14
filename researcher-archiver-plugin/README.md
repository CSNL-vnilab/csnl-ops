# CSNL Researcher Archiver Plugin

Terminal-CLI Claude plugin that helps a CSNL researcher *archive their own
projects* into a shared Supabase DB through structured interview. One PC
= one researcher = one Claude Code session.

## What it does (5초 요약)

1. Researcher 가 본인 PC 에서 `claude code` 실행 + `/archive:bootstrap <INIT>` 입력
2. Plugin 이 *그 INIT 의 누적 메모리* 를 로컬 캐시 + Supabase 에서 불러옴
   (RLS 로 cross-INIT 자동 차단)
3. Claude 가 *map-first* 인터뷰 시작 (디렉토리 / 라이브러리 / main 코드 / 목적 / 기간
   / 미팅 연결 → missing link → 구체 파라미터)
4. Researcher 가 답하면 Claude 가 *grounded JSON row* 로 `projects/<INIT>/<slug>.json`
   에 적재 + Supabase sync (선택)
5. 세션 종료 시 `/archive:handoff` 가 *다음 세션 부팅 prompt* 를 자동 작성

## 누구를 위한 것

- CSNL lab researchers (현 7 + 향후 20 명 cap, `config/researchers.yaml`)
- 본인 프로젝트의 NAS 폴더 (또는 local working dir) 에 직접 접근 가능
- Slack 비동기 인터뷰 → 터미널 동기 대화로 전환 (2026-05-14 14:00 KST 부터)
- 새 연구원 추가: `config/researchers.yaml` 의 researchers 배열에 entry 추가 + 본인
  PC 에서 `./scripts/install.sh` 1 회 실행

## Quickstart

```bash
# 1. 설치 (one-time per PC)
cd ~/Documents
git clone https://github.com/CSNL-vnilab/csnl-ops.git
cd csnl-ops/researcher-archiver-plugin
./scripts/install.sh

# 2. 시작
claude code
> /archive:bootstrap JOP        # 본인 initial 로 치환
```

이후 Claude 가 알아서 인터뷰 진행. 응답하면서 누적 archive.

## Plugin 구조 (v1.1.0 — Claude Code 공식 spec 준수)

```
researcher-archiver-plugin/
├── README.md                  # 이 문서
├── INSTALL.md                 # 설치 상세
├── CLAUDE.md                  # always-loaded 동작 명세
├── .claude-plugin/
│   └── plugin.json            # plugin manifest (Claude Code spec)
├── agents/
│   └── archiver.md            # main agent persona (Opus 4.7)
├── commands/                  # /archive:* slash commands
│   ├── bootstrap.md           # /archive:bootstrap <INIT>
│   ├── continue.md            # /archive:continue (resume)
│   ├── status.md              # /archive:status (DB 진척)
│   ├── sync-db.md             # /archive:sync-db (push to Supabase)
│   └── handoff.md             # /archive:handoff (next-session prompt)
├── rules/                     # auto-loaded memory rules
│   ├── 00_lab_context.md      # 공용 lab 컨텍스트 (annual/weekly/workflow/Slab/MM)
│   ├── 01_tone.md             # 엄격 톤
│   ├── 02_grounded.md         # Q grounded 필수
│   ├── 03_map-first.md        # 큰 지도 먼저
│   ├── 04_past-focus.md       # 과거 artifact 중심
│   ├── 05_memory-cap.md       # ≤50KB context
│   └── 06_philosophy.md       # 불안정 환경 철학
├── hooks/
│   ├── hooks.json             # PreToolUse / SessionEnd 등록 (Claude Code spec)
│   ├── pre-fire-lint.py       # banned-word tone gate
│   └── auto-handoff.sh        # SessionEnd auto-handoff
├── config/
│   ├── researchers.yaml       # 7~20 명 single-source registry
│   └── .env.template          # per-PC .env template
├── templates/
│   ├── handoff.md.template
│   └── project-row.json.template
└── scripts/
    ├── install.sh             # preflight + venv + non-destructive symlink
    ├── bootstrap.py           # /archive:bootstrap 백엔드 (FATAL INIT check)
    ├── sync_to_supabase.py    # 변경분만 + atomic version + conflict backup
    ├── doctor.py              # /archive:doctor 환경 점검 (read-only)
    └── clean_archive.sh       # 90 일 이상 압축 archive 정리 (cron monthly)
```

## 데이터 격리 + 일관성 (중요)

- 각 PC 의 로컬 캐시 = `~/.claude/csnl-archive/<INIT>/` (per-INIT 폴더 격리)
- 중앙 DB = `csnl_research.projects` (Supabase 프로젝트; RLS + row_version
  conflict resolution; 모든 PC 가 sync)
- Memory cap: context.md ≤ 50KB, dm_log.jsonl rotate 매주
- 한 세션 = 한 INIT only (cross-init 차단)

## Phase 1 목표

[Phase 1 계층 메모리 DB](../docs/phase1-memory-db-schema.md) — 7 연구원 × N 프로젝트
의 *목적 / 배경 / 실험 / 분석 / 결과 / 해석* 6 차원을 자연어 query 가능한 수준으로
완성.

## 운영 정책

- 미래 계획 질문 자제 → 과거/현재 NAS/코드/파라미터 중심
- 산발적 Q 금지 → map-first → drill (체계적)
- AI jargon / "발사" / "라운드" / 모델명 / 기괴 약어 차단 (runtime lint)
- 모호함 (가설 흔들림 / 잘 모르겠음) 은 정상 신호 — confirmed 승격 차단

자세한 룰은 `rules/*.md` 6 개. CLAUDE.md 가 plugin context 진입 시 항상 로드.

## Author / License

CSNL Lab (서울대 BCS, PI 이상훈). 내부 사용. 외부 공유 시 PI 승인 필요.
