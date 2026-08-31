---
description: 환경·설정 점검 (녹취 엔진, 양식 파일, 프로필 권한)
argument-hint: [--init]
---

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/doctor.py $ARGUMENTS
```

`--init` 은 `~/.claude/snu-expert-fee/` 설정 디렉토리를 만든다.
전문가 프로필 파일 권한이 600이 아니면 경고한다 — 주민등록번호가 들어 있는 파일이다.
