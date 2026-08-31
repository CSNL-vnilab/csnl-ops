---
description: 회의 녹음·자료를 인테이크해 녹취와 추출 텍스트를 만든다
argument-hint: <파일 또는 폴더> [--claim <claim_dir>]
---

`expert-fee-claim` 스킬의 P1 만 실행한다.

```bash
bash ${CLAUDE_PLUGIN_ROOT}/scripts/intake_media.sh --claim <claim_dir> --input $ARGUMENTS --lang ko
```

- 오디오/영상이 길면 `--split` 을 붙인다(1시간 초과 시 30분 단위 분할).
- 완료 후 녹취 분량, 추출된 자료, 개인정보 경고를 요약 보고한다.
- 녹취 원문을 대화에 통째로 붙여넣지 않는다. 필요한 대목만 인용한다.
