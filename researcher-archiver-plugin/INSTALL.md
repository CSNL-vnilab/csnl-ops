# Install — csnl-archive plugin (v1.2.2)

## 1. Prerequisites

- macOS / Linux PC (Windows WSL OK)
- Python 3.11+
- `git`, `curl`
- Claude Code CLI 설치됨 (claude.ai/code → install 따라하면 됨)
- Supabase DB 접속 정보 — `SUPABASE_DB_PASSWORD` 한 줄만 운영자에게 별도 채널로
  요청 (host/port/user 는 .env.template 에 하드코딩됨). service_role JWT 가 아닌
  DB user 비밀번호를 받습니다.
- NAS 마운트 (선택 — 본인 프로젝트가 NAS 에 있을 때만)

## 2. One-command install

```bash
cd ~/Documents
git clone https://github.com/CSNL-vnilab/csnl-ops.git
cd csnl-ops/researcher-archiver-plugin
./scripts/install.sh
```

`install.sh` 가 다음을 수행한다:
1. Preflight 검사 (Python 3.11+, macOS/Linux, claude CLI)
2. Python venv 생성 (`~/.claude/csnl-archive/venv`) + 의존성 설치
   (`psycopg2-binary`, `python-dotenv`, `requests`, `PyYAML`)
3. `~/.claude/csnl-archive/` 캐시 디렉토리 + `.env` 템플릿 생성
4. Plugin 을 `~/.claude/plugins/csnl-archive` 심볼릭 링크로 등록
5. `~/.claude/settings.json` 에 marketplace `csnl-ops` 와 enabledPlugins
   entry `csnl-archive@csnl-ops` 를 추가 (non-destructive, 백업 자동 생성)
6. `rules/*.md` + `CLAUDE.md` 를 `~/.claude/projects/csnl-archive/memory/`
   로 복사 — researcher 가 `cd csnl-ops/` 후 `claude` 실행 시 project-scoped
   로 픽업됨

> **CLAUDE.md 자동 로드 한계 (Claude Code 1.x)**: plugin 루트 CLAUDE.md 는
> 자동 로드되지 *않는다*. `install.sh` 가 project memory 디렉토리로 복사하므로,
> researcher 는 *반드시* `cd csnl-ops/` (또는 그 하위) 에서 `claude` 를 실행해야
> 톤/룰 가이드를 받을 수 있다. 자세한 메커니즘은 README.md § "CLAUDE.md 로딩 규칙".

## 3. 운영 정보 입력 (1회)

`~/.claude/csnl-archive/.env` 에서 채워야 할 줄은 2 개 (host/port/user 는 이미
하드코딩되어 있음):

```
MY_INIT=<본인 INITIAL>                         # 본인 initial (대문자)
SUPABASE_DB_PASSWORD=<운영자에게_요청>          # 별도 안전 채널로 전달받음
# (NAS_ROOT 는 기본값 /Volumes/CSNL_new — 미마운트면 비워둠)
```

## 4. 첫 실행

```bash
cd ~/Documents/csnl-ops          # repo 루트 — CLAUDE.md project-scoped 로드 위해 필수
claude
> /csnl-archive:bootstrap JOP
```

(`JOP` 대신 본인 initial)

Plugin 이 다음을 자동 수행:
1. Supabase 에서 본인의 누적 project rows 불러옴 (RLS 가 cross-INIT 자동 차단)
2. 로컬 캐시 (`~/.claude/csnl-archive/JOP/context.md`) 와 sync
3. 가장 시급한 missing/ambiguous 노드 식별
4. Map-first 인터뷰 Q 1 개 출력 (multi-choice 또는 table)
5. 본인 답변 → 다음 Q → 누적 → handoff

## 5. 매 세션 종료 시

```
> /csnl-archive:handoff
```

다음 세션 부팅용 prompt 가 `~/.claude/csnl-archive/<INIT>/handoff-<date>.md` 에 작성됨.

## 6. 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| `Supabase connect failed` (timeout / refused) | 프로젝트 paused 또는 host 오타 | Dashboard 에서 wake 또는 운영자 host 재확인 |
| `Supabase connect failed` (auth) | DB password 회전됨 | 운영자에게 새 SUPABASE_DB_PASSWORD 요청 |
| `/csnl-archive:bootstrap` 명령 안 보임 | plugin manifest 미등록 | `install.sh` 재실행 |
| `tone lint failed` | banned word 사용 | 본인 메시지 확인 — 운영자에게 보고 |
| NAS 경로 안 보임 | NAS 미마운트 | `NAS_ROOT` 를 local 경로로 (예 `~/research/JOP/`) |

문제 발생 시 운영자에게 보고.
