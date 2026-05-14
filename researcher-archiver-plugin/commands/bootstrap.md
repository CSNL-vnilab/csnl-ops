---
name: archive:bootstrap
description: Load INIT's accumulated archive state from local cache + Postgres and start a map-first grounded interview session. Idempotent — re-running merges any new central updates.
args:
  - name: init
    type: string
    required: true
    description: Your researcher initial (one of JOP/BYL/MSY/SMJ/JYK/BHL/SYJ)
---

## /archive:bootstrap <INIT>

세션 시작 시 *한 번* 실행. INIT 매칭 검증 + state load + 첫 인터뷰 Q 출력.

### 동작 순서

1. **INIT 검증**:
   - 입력값을 `manifest.yaml` 의 `allowed_inits` 와 매칭
   - `~/.claude/csnl-archive/.env` 의 `MY_INIT` 와 일치하는지 확인
   - 불일치 시 abort + 운영자 문의 안내

2. **State 로드** (`scripts/bootstrap.py`):
   ```bash
   python3 "$PLUGIN_DIR/scripts/bootstrap.py" --init <INIT>
   ```
   - Postgres `csnl_v3.public.projects WHERE init=<INIT>` 모든 row 로컬 캐시로 pull
   - 로컬 캐시 (`~/.claude/csnl-archive/<INIT>/projects/`) merge (row_version 충돌 시
     central 우선, 차이 row 는 `conflict-<timestamp>.json` 백업)
   - 최신 `handoff-*.md` 가 있으면 그 내용을 context 에 prepend

3. **첫 Q 결정**:
   - 모든 project row 의 `missing_or_ambiguous` 목록 집계
   - 가장 시급한 1 개 노드 선택 (priority: confidence_avg 낮은 row + 가장 최근 갱신
     안 된 axis)
   - rules/03_map-first.md 의 Stage 1 map 이 비어 있으면 *그것부터*
   - rules/02_grounded.md 의 H1.4 self-check 4/4 통과하는 Q 작성

4. **출력**:
   ```
   안녕하세요 <name> 연구원,

   누적 상태 — <N> 개 프로젝트 row 로딩 완료. 다음 한 가지 확인 부탁드립니다.

   [grounded Q with backticked path + values + multi-choice]
   ```

5. **interview_log.jsonl 첫 줄 append**:
   ```json
   {"at": "...", "init": "...", "event": "bootstrap", "row_count": N, "first_q_hash": "..."}
   ```

### 실패 케이스

- Postgres 연결 실패 → 로컬 캐시만 사용 + 경고 출력 (`--offline`)
- 로컬 캐시 비어 있고 Postgres 도 비어 있음 → "신규 INIT — 첫 인터뷰 시작" 메시지
- `.env` 미존재 → INSTALL.md §3 안내

### 후속 동작

이후 researcher 의 답신 → 자동 record + 다음 Q. `/archive:continue` 는 별도 호출
필요 없음 (bootstrap 후 자연 대화).
