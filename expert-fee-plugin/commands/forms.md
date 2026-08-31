---
description: 사용내역서 + 일회성경비 엑셀을 자동 기입한다
argument-hint: [claim_dir]
---

`expert-fee-claim` 스킬의 P6 만 실행한다.

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/fill_forms.py \
  --claim <claim_dir>/claim.json \
  --usage-template ~/.claude/snu-expert-fee/config/forms/전문가활용비_사용내역서.xlsx \
  --payment-template ~/.claude/snu-expert-fee/config/forms/일회성경비.xlsx \
  --out-dir <claim_dir>/out
```

- 스크립트 출력의 **미기입(✗) 항목을 빠짐없이 사용자에게 보고**한다.
- 원천징수 후 실지급액은 참고로만 알린다. 양식에는 세전 금액이 들어간다.
- 동의 체크박스·서명·날인은 스크립트가 못 한다. 잔여 작업으로 안내한다.
