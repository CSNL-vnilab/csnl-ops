---
name: archive:doctor
description: Diagnostic — checks .env keys, Postgres connectivity, NAS root accessibility, plugin install integrity, and last_synced_version drift. Read-only.
---

## /archive:doctor

세션 시작 시 또는 의심 시 1회 실행 — 환경의 *조용한 실패* (PG 비밀번호 회전, NAS
미마운트, venv 깨짐) 를 *눈에 보이게* 만든다.

### 점검 항목

1. **`.env` 무결성**:
   - `MY_INIT`, `PG_HOST`, `PG_PORT`, `PG_DBNAME`, `PG_USER`, `PG_WORKER_PASSWORD`,
     `NAS_ROOT` 키가 모두 set 됐는지
   - `MY_INIT` 가 `config/researchers.yaml` 의 active researcher 중에 있는지
2. **Plugin 설치 무결성**:
   - `~/.claude/plugins/csnl-researcher-archiver` symlink 가 유효한지
   - `~/.claude/csnl-archive/venv/bin/python` 실행 가능한지
   - `~/.claude/csnl-archive/run-python.sh` 가 wrapper 로 작동하는지
3. **Postgres 연결**:
   - `csnl_v3` DB 접속 (`SELECT 1` 1회) 성공/실패
   - 실패 시 명확한 진단 (password? host? mDNS?)
4. **NAS root 접근**:
   - `NAS_ROOT` 가 실제로 mounted 디렉토리인가
   - 본인 INIT 폴더 (`<NAS_ROOT>/<INIT>/`) 가 존재 + readable 인가
5. **로컬 캐시 drift**:
   - 각 `projects/<slug>.json` 의 `_meta.row_version` 과 `last_synced_version` 차이
   - drift 0 = 모두 동기화, drift N = N 개 pending sync
6. **Conflict 파일**:
   - `projects/*conflict-*.json` 갯수
   - 30 일 이상 묵은 conflict 있는지 (clean_archive.sh 가 처리하지만 사용자도 알아야)

### 출력 예시 (researcher 친화적)

```
=== JOP 환경 점검 (2026-05-14T13:00:00+09:00) ===

[✓] .env: MY_INIT=JOP, PG_HOST set, NAS_ROOT=/Volumes/CSNL_new-1/Memory
[✓] 플러그인 설치: 정상
[✓] 중앙 DB 접속 (csnl_v3): OK
[!] NAS 마운트: /Volumes/CSNL_new-1/Memory/JOP/ 접근 불가 (NAS 연결 확인 필요)
[✓] 로컬 캐시: 4 프로젝트, 모두 동기화됨 (drift 0)
[!] Conflict 파일: 2 개 (45일 이상 오래됨 — 검토 후 수동 정리 권장)

권장 action:
  - NAS 재연결 또는 NAS_ROOT 를 local 경로로 변경
  - projects/biasvar.conflict-2026-04-12T10-23.json 검토
```

### 동작

`~/.claude/csnl-archive/run-python.sh "$PLUGIN_ROOT/scripts/doctor.py"` 호출.
**Read-only** — 어떤 상태도 변경하지 않음.
