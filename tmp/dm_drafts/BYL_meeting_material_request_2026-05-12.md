# DM Draft — BYL (이보연) — MM material request

**Status**: DRAFT — not yet sent. Awaiting user pre-check.

## Routing
- Recipient: BYL (이보연, slack user `U07728304R5`)
- Channel: `D0AN6PMLWCS` (1:1 DM)
- Send mode: top-level DM
- Send kind tag: `meeting_material_request`

## Context

- `meeting_indexer` (2026-05-12 NAS scan): `/Volumes/CSNL_new/MM/BYL/` exists but contains 0 presentation files (.pptx/.pdf/.key)
- User directive 2026-05-12: "MM이 비어있거나 GRM자료가 부정확하다면 연구자에게 자료를 요청하고, 멈추지 않고 계속 사이클 진행"
- Note: BYL already received a separate NAS-grounded uncertainty Q today (14:18 KST) about online prolific stimulus duration. This is a parallel governance ask, not a follow-up to that question.

## Draft body

```
이보연 연구원께,

`/Volumes/CSNL_new/MM/BYL/` 폴더가 비어있는 상태로 확인됩니다. 본 NAS 디렉터리는 milestone meeting 자료 (`MM_yymmdd_BYL.pptx`) 의 표준 위치이며, 자동 분석 파이프라인이 NAS 코드/결과의 진위 — 즉 final vs pilot vs deprecated 분류 — 를 판정하는 단서로 참조합니다.

가능하시면 최근 작성하신 MM 자료를 본 위치에 업로드 부탁드립니다. 자료가 다른 위치 (예: 로컬, 다른 NAS 경로) 에 있다면 그 경로를 회신 주셔도 됩니다.

업로드 시점·여부에 대한 응답은 다음 중 하나로 부탁드립니다.

(M1) 곧 업로드 예정 — 별도 응답 불필요. 다음 indexing cycle (매일 04:00 KST) 에서 자동 감지.
(M2) 다른 NAS 경로 또는 로컬에 보관 중 — 경로 회신 부탁드립니다.
(M3) MM 자료를 NAS 에 두지 않는 정책 — 자동 파이프라인의 milestone 참조 대상에서 영구 제외.
(M4) 본 요청 자체 보류 — 다음 cycle 까지 재요청하지 않음.

본 메시지는 NAS 데이터 사용 정책 (P1)~(P5) 와 별개입니다. (P1)~(P5) 는 본인의 NAS 데이터 read 정책, (M1)~(M4) 는 NAS 자료 upload 정책에 대한 응답 옵션입니다.

— Claude
```

## Lint pre-check
- emoji/shortcode: 없음
- flattery: 없음 ("부탁드립니다" 는 PI-allow 격식체 — researcher role 에서는 검증 필요)
- intensifier: 없음
- emotive punct: 없음
- greeting boilerplate: 없음
- Expected: review needed for "부탁드립니다"

## Risks for user pre-check

1. **"부탁드립니다"** 가 researcher role 의 격식체 lint 통과 여부 — slack_outbound `_PI_ALLOW` 목록에는 있고 (`부탁드립니다`), researcher role 에서는 ban 목록 미포함 → CLEAN 예상. 확정 lint 필요.
2. BYL 가 이미 NAS-grounded Q (`Sbj1 outlier`) 답신 대기 중이므로 동시 2건 처리 부담 가능. 하지만 양쪽 (M*) 와 (uncertainty Q) 응답은 독립 thread 가능.
3. "다음 indexing cycle (매일 04:00 KST)" 은 cron 추가 시점부터 약속 — `crontab` 에 04:00 entry 추가 필요. (이 PR 에 함께 포함됨.)
