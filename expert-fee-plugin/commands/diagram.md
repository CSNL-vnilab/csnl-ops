---
description: 자문 결과를 연구실 표준 팔레트의 draw.io 시스템 설계도로 만든다
argument-hint: [claim_dir] [주제]
---

`expert-fee-claim` 스킬의 P5 만 실행한다.
`references/diagram-conventions.md` 의 레이어 밴드·팔레트·배지 규약을 따른다.

1. 자문 내용에서 구성요소와 흐름을 뽑는다. **녹취에 근거가 없는 요소는 그리지 않는다.**
2. `.drawio` XML 을 `draft/` 에 쓴다. 미확정 항목은 dashed + `미정` 표기.
3. 내보내기:

```bash
drawio -x -f pdf --embed-diagram -o <claim_dir>/out/system-map.pdf <claim_dir>/draft/system-map.drawio
drawio -x -f png --embed-diagram -s 2 -o <claim_dir>/out/system-map.png <claim_dir>/draft/system-map.drawio
```

4. draw.io MCP 가 있으면 `mcp__drawio__open_drawio_xml` 로 열어 사용자에게 확인받는다.
