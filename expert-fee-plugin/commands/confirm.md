---
description: 참석자·일시·활용시간 등을 인터뷰로 확정한다
argument-hint: [claim_dir]
---

`expert-fee-claim` 스킬의 P3(인터뷰)만 실행한다.
`references/interview-protocol.md` 를 읽고 그대로 따른다.

1. `claim.json` 의 `field_status` 에서 `unknown`/`inferred` 필드를 뽑는다.
2. 첫 턴: 사전 예측 표 + 최대 3문항.
3. 이후: **한 턴 한 질문**. 답이 오면 인용 + 한 줄 요약 + 다음 질문.
4. `unknown` 이 0이 되면 확정 요약을 보여주고 종료한다.

기본 참석자는 박준오 연구원, 신재솔 연구원이다. 기본값을 제시하고 정정만 받는다.
주민등록번호·계좌번호는 묻지 않는다 — 프로필 파일에 직접 넣도록 안내한다.
