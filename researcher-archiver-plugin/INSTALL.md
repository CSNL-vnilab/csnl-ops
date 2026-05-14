# Install — csnl-researcher-archiver Plugin

## 1. Prerequisites

- macOS / Linux PC (Windows WSL OK)
- Python 3.11+
- `git`, `curl`
- Claude Code CLI 설치됨 (claude.ai/code → install 따라하면 됨)
- Supabase DB 접속 정보 (SUPABASE_DB_HOST + USER + PASSWORD — 운영자 (JOP) 에게
  요청. service_role JWT 가 아닌 DB password 를 받습니다.)
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
6. `.env` 템플릿 생성 — 본인이 SUPABASE_DB_PASSWORD 채워야 함

## 3. 운영 정보 입력 (1회)

`~/.claude/csnl-archive/.env`:
```
MY_INIT=JOP                                    # 본인 initial (대문자)
SUPABASE_DB_HOST=aws-0-ap-northeast-2.pooler.supabase.com  # 운영자 제공
SUPABASE_DB_PORT=5432                          # session pooler
SUPABASE_DB_USER=postgres.<project_ref>        # 운영자 제공
SUPABASE_DB_PASSWORD=<운영자에게_요청>
NAS_ROOT=/Volumes/CSNL_new-1/Memory            # NAS 미마운트 시 비워둠
```

## 4. 첫 실행

```bash
claude code
> /archive:bootstrap JOP
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
> /archive:handoff
```

다음 세션 부팅용 prompt 가 `~/.claude/csnl-archive/<INIT>/handoff-<date>.md` 에 작성됨.

## 6. 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| `Supabase connect failed` (timeout / refused) | 프로젝트 paused 또는 host 오타 | Dashboard 에서 wake 또는 운영자 host 재확인 |
| `Supabase connect failed` (auth) | DB password 회전됨 | 운영자에게 새 SUPABASE_DB_PASSWORD 요청 |
| `/archive:bootstrap` 명령 안 보임 | plugin manifest 미등록 | `install.sh` 재실행 |
| `tone lint failed` | banned word 사용 | 본인 메시지 확인 — 운영자에게 보고 |
| NAS 경로 안 보임 | NAS 미마운트 | `NAS_ROOT` 를 local 경로로 (예 `~/research/JOP/`) |

문제 발생 시 운영자에게 보고.
