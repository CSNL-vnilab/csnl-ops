---
description: 자문내용정리(필수)를 쓰고 pdf 로 변환한다. 활용 보고서는 요청 시에만
argument-hint: [claim_dir]
---

`expert-fee-claim` 스킬의 P4 만 실행한다.

1. `references/report-templates.md` 를 읽는다. 두 문서의 독자·문체가 다르다.
2. 녹취·자료·`claim.json` 을 근거로 `draft/자문내용정리_<YYMMDD>.md` 초안을 쓴다.
   활용 보고서(`전문가활용_<YYMMDD>.md`)는 사용자가 요청했을 때만 추가한다.
   근거 없는 내용은 쓰지 않는다. 미확인 항목은 `【확인 필요: …】` 로 남긴다.
3. 사용자에게 초안을 보여주고 수정을 받는다.
4. 변환:

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/build_report.py --md <draft.md> --out <claim_dir>/out --format docx pdf
```
