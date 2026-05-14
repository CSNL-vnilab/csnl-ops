# Snapshot — 2026-05-12 20:14 KST

> 라이브 수치 모음. memev cron이 10분마다 돌기 때문에 이 파일도 그 주기 안에서 변한다.
> 새로 찍으려면 `HARNESS_ROOT=... python3 scripts/snapshot.py` 실행.

## 합계

- inbound (researcher → bot): **46**
- outbound (bot → researcher): **57**

## 연구원별

| 이니셜 | 이름 | 확정 | 추정 | 모름 | 받은 | 보낸 | 마지막 응답 (시간) |
|---|---|---:|---:|---:|---:|---:|---:|
| JOP | 박준오 | 21 | 3 | 0 | 14 | 13 | 2.4 |
| BYL | 이보연 | 8 | 4 | 4 | 3 | 8 | 0.0 |
| MSY | 여민수 | 5 | 2 | 4 | 1 | 6 | 97.7 |
| SMJ | 정새미 | 16 | 3 | 2 | 8 | 10 | 2.9 |
| JYK | 김정예 | 3 | 5 | 6 | 2 | 7 | 0.5 |
| BHL | 이보현 | 14 | 2 | 2 | 10 | 8 | 2.8 |
| SYJ | 조수영 | 2 | 3 | 1 | 8 | 5 | 2.7 |

**컬럼 설명**:
- 확정 = `member_uncertainty.json[INIT].confirmed` 항목 수
- 추정 = 같은 파일의 `inferred` 항목 수 (Qwen이 추론한 것)
- 모름 = 같은 파일의 `unknown` 항목 수 (질문할 거리가 남은 것)
- 받은/보낸 = `ledger.db` 의 inbound/outbound 메시지 누적 카운트
- 마지막 응답 = 직전 researcher 답신 이후 경과 시간 (KST)

**원본 데이터 위치** (live 시스템):
- `/Users/csnl/csnl_on_ai/harness/state/member_uncertainty.json`
- `/Users/csnl/csnl_on_ai/harness/state/ledger.db`

**참고**:
- 마지막 응답이 72시간 넘으면 자동 reminder는 차단되고 operator 큐로 넘어간다.
- `확정 + 추정 + 모름` 합이 작은 연구원 (예: SYJ) 은 인터뷰 사이클이 아직 적게 돈 것.
