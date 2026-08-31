---
description: 자문내용정리 + 전문가활용 보고서 초안을 쓰고 docx/pdf 로 변환한다
argument-hint: [claim_dir]
---

`expert-fee-claim` 스킬의 P4 만 실행한다.

1. `references/report-templates.md` 를 읽는다. 두 문서의 독자·문체가 다르다.
2. 녹취·자료·`claim.json` 을 근거로 `draft/*.md` 초안을 쓴다.
   근거 없는 내용은 쓰지 않는다. 미확인 항목은 `【확인 필요: …】` 로 남긴다.
3. 사용자에게 초안을 보여주고 수정을 받는다.
4. 변환:

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/build_report.py --md <draft.md> --out <claim_dir>/out --format docx pdf
```
