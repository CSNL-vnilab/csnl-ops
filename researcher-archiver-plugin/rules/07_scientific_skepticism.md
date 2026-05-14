---
name: scientific-skepticism-rule
description: Before promoting a researcher claim to confirmed, the assistant must consider alternative explanations, identify confounders, and flag claims that contradict prior rounds. Researcher's confidence ≠ epistemic confidence.
---

## 과학적 회의주의 룰 (Codex R3 HIGH 추가)

본 archive 는 *과학 메모리* 를 만든다. 따라서 researcher 가 단호하게 말했다고 해서
자동 confirmed 가 되지는 않는다. 약학적 reasoning 게이트를 통과해야 한다.

### 핵심 원칙

- *researcher confidence ≠ epistemic confidence*. 본인이 "당연하지" 라고 답해도
  본 시스템은 그 답이 *외부 검증 (NAS 파일 / 코드 / 미팅 일지 / 선행 문헌) 가능* 한
  지 확인해야 한다.
- 비검증된 claim 은 confirmed 가 아니라 `inferred` (`fact_type=inferred`) 또는
  `claimed_unverified` 로 적재.

### 매 researcher 답신 처리 시 체크 (사전 게이트)

1. **검증 가능성**: 이 claim 을 *NAS 파일 / 코드 / 슬라이드 / DOI* 중 하나로 cross-
   check 할 수 있는가? 없으면 → `inferred` 또는 `claimed_unverified`. confirmed
   금지.
2. **대안 설명**: 이 결과가 다른 원인 (confounders) 으로 설명 가능한가?
   - 예: "frame rate 60Hz → ms 보정 안 함" → 대안: monitor refresh 변동성? CPU 부하?
   - 대안 설명이 *최소 1 개* 가능하면 `_meta.alternative_explanations[]` 에 적재.
3. **모순 검출**: prior round 에서 같은 axis 에 대해 다른 답이 있었는가?
   - 있으면 `_meta.contradictions[]` 에 항목 추가 + 다음 round 의 axis 로 모순 추적.
   - 형식: `{round, axis, prior_value, new_value, resolution: null|reconciled|abandoned}`
4. **선행 문헌 정합성**: claim 이 background.prior_studies 의 DOI 와 일치하는가?
   불일치 시 *researcher 가 선행 연구를 재해석한 것인지 vs 단순 misremember 인지*
   구분 필요. 후자라면 `_meta.literature_drift[]` 기록.

### 'researcher 가 강하게 우긴다' 케이스

- 강한 confidence 는 *그 자체로 epistemic confidence 의 증거가 아님*.
- 본인 코드의 변수 의미를 본인이 모를 수도 있는 환경 (rules/06 의 불안정성).
- 따라서: claim 을 기록하되 *반드시* 검증 source pointer 함께 요청.
- 검증 source 가 없으면 `claimed_unverified` 로만 적재. 다음 cycle 의 missing_or_
  ambiguous 에 자동 추가.

### `_meta.contradictions[]` 필드 (template 신규)

```json
"_meta": {
  ...
  "contradictions": [
    {
      "detected_at": "<ISO>",
      "axis": "experiment_design.n_subjects",
      "round_a": {"at": "2026-05-13T16:25", "value": "32명"},
      "round_b": {"at": "2026-05-13T17:34", "value": "12명 / 32세션"},
      "resolution": "reconciled",
      "resolution_note": "researcher clarified 17:34 — 32 = sessions not subjects"
    }
  ]
}
```

`scripts/sync_to_postgres.py` 가 이 필드를 그대로 `meta_jsonb` 에 push 하므로 별도
DB 스키마 변경 불요.

### 적용 우선순위

본 룰은 *philosophy 다음, tone/grounded 보다 앞* 의 우선순위. 즉:

1. philosophy (rules/06) — 불안정 환경 인정
2. **scientific skepticism (this rule)** — claim 검증
3. tone (rules/01) — 학술 한국어
4. grounded (rules/02) — Q 본문 ground
5. map-first (rules/03) — broad 먼저
6. past-focus (rules/04) — 과거 중심
7. memory-cap (rules/05) — 메모리 제한
