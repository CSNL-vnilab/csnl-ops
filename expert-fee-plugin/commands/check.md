---
description: 제출 전 자동 점검 + manifest 작성
argument-hint: [claim_dir]
---

`expert-fee-claim` 스킬의 P7 만 실행한다.

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/bundle.py --claim <claim_dir>/claim.json
```

결과를 표로 보고한다. 실패 항목은 **무엇이 왜 실패했고 어떻게 고치는지**까지 쓴다.
통과율만 말하고 넘어가지 않는다.
