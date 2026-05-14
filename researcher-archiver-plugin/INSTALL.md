# Install — csnl-researcher-archiver Plugin

## 1. Prerequisites

- macOS / Linux PC (Windows WSL OK)
- Python 3.11+
- `git`, `curl`
- Claude Code CLI 설치됨 (claude.ai/code → install 따라하면 됨)
- Postgres 접속 정보 (PG_WORKER_PASSWORD — 운영자 (JOP) 에게 요청)
- NAS 마운트 (선택 — 본인 프로젝트가 NAS 에 있을 때만)

## 2. One-command install

```bash
cd ~/Documents
git clone https://github.com/CSNL-vnilab/csnl-ops.git
cd csnl-ops/researcher-archiver-plugin
./scripts/install.sh
```

`install.sh` 가 다음을 수행한다:
1. Python venv 생성 (`~/.claude/csnl-archive/venv`)
2. 의존성 설치 (`psycopg2-binary`, `python-dotenv`, `requests`)
3. `~/.claude/csnl-archive/` 캐시 디렉토리 생성
4. plugin manifest 를 Claude Code config 에 등록 (`~/.claude/plugins/` 심볼릭 링크)
5. rules/*.md 를 `~/.claude/projects/<your-repo>/memory/` 로 복사 (always-load)
6. `.env` 템플릿 생성 — 본인이 PG_WORKER_PASSWORD 채워야 함

## 3. 운영 정보 입력 (1회)

`~/.claude/csnl-archive/.env`:
```
PG_HOST=csnls-mac-studio.local      # 또는 IP — 운영자 요청
PG_PORT=5432
PG_DBNAME=csnl_v3
PG_USER=harness_worker
PG_WORKER_PASSWORD=<운영자에게_요청>
MY_INIT=JOP                         # 본인 initial (대문자)
NAS_ROOT=/Volumes/CSNL_new-1/Memory # NAS 마운트 안 됐으면 local 경로
```

## 4. 첫 실행

```bash
claude code
> /archive:bootstrap JOP
```

(`JOP` 대신 본인 initial)

Plugin 이 다음을 자동 수행:
1. Postgres 에서 본인의 누적 project rows 불러옴
2. 로컬 캐시 (`~/.claude/csnl-archive/JOP/context.md`) 와 sync
3. 가장 시급한 missing/ambiguous 노드 식별
4. Map-first 인터뷰 Q 1 개 출력 (multi-choice 또는 table)
5. 본인 답변 → 다음 Q → 누적 → handoff

## 5. 매 세션 종료 시

```
> /archive:handoff
```

다음 세션 부팅용 prompt 가 `~/.claude/csnl-archive/<INIT>/handoff-<date>.md` 에 작성됨.

## 6. 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| `Postgres connection refused` | PG_HOST 잘못 또는 Mac Studio off | 운영자 PG 주소 확인 |
| `/archive:bootstrap` 명령 안 보임 | plugin manifest 미등록 | `install.sh` 재실행 |
| `tone lint failed` | banned word 사용 | 본인 메시지 확인 — 운영자에게 보고 |
| NAS 경로 안 보임 | NAS 미마운트 | `NAS_ROOT` 를 local 경로로 (예 `~/research/JOP/`) |

문제 발생 시 운영자 (JOP, jy061100@gmail.com) 에게 보고.
