# Automatic Screening Decision Contract

> Issue: #394
> Contract version: `AUTO_SCREENING_DECISION_V1`

채용 AI 면접 리포트와 기업이 공고별로 저장한 기준을 사용해 지원자의 전형 결과를 자동으로 결정하는 계약이다. 기업 사용자는 지원자별 `PASS`, `HOLD`, `FAIL`을 직접 선택하지 않고, 공고를 열기 전에 판정 정책과 평가 기준별 하한선을 설정한다.

## Scope And Ownership

| Concern | Owner | Review |
| --- | --- | --- |
| 공고별 자동 판정 정책과 평가 기준 하한선 설정 | C | B, E, PM |
| 리포트 완료·평가 가능성 판단과 자동 판정 실행 | E | B, C, A |
| `applications` 자동 판정 결과 저장과 기업 조회 | E/B | A, C |
| 지원자 제한 결과 조회와 View | D | B, E, PM |
| 공통 enum, Prisma migration | A | B, C, D, E |
| RETRY job 실행·한도·운영 개입 | E/A | D, PM |

RETRY의 재처리 횟수, backoff, 지원자 재답변과 운영자 재처리 경계는 #397에서 확정한다. 이 문서는 RETRY 진입 조건과 결과 노출 계약만 고정한다.

## Shared Enums

### ScreeningDecision

| Value | Meaning | Final score required |
| --- | --- | --- |
| `UNDECIDED` | 정책 미설정 또는 리포트 생성 대기/진행 중 | N |
| `PASS` | 합격 총점과 모든 필수 평가 기준 하한선을 충족 | Y |
| `HOLD` | 보류 구간에 있거나 총점은 합격선 이상이지만 하나 이상의 필수 기준 하한선 미달 | Y |
| `FAIL` | 보류 하한선 미만 | Y |
| `RETRY` | 리포트 실패, 점수 없음, 평가 불완전 또는 STT terminal 실패로 판정 불가 | N |

`PASS`, `HOLD`, `FAIL`은 판정 가능한 점수가 있을 때만 허용한다. 미완료 값을 0점으로 변환해 `FAIL`로 저장하지 않는다.

### ScreeningDecisionReasonCode

| Value | Decision | Meaning |
| --- | --- | --- |
| `PASS_TOTAL_AND_CRITERIA_MET` | PASS | 총점과 모든 필수 기준 하한선 충족 |
| `HOLD_TOTAL_BAND` | HOLD | `holdMinTotalScore <= totalScore < passMinTotalScore` |
| `HOLD_CRITERION_BELOW_PASS_SCORE` | HOLD | 총점은 합격선 이상이나 필수 기준 중 하나 이상 하한선 미달 |
| `FAIL_BELOW_HOLD_THRESHOLD` | FAIL | `totalScore < holdMinTotalScore` |
| `RETRY_REPORT_FAILED` | RETRY | 리포트 생성 terminal 실패 |
| `RETRY_STT_UNAVAILABLE` | RETRY | 필수 답변의 STT가 terminal 인식 불가 상태 |
| `RETRY_EVALUATION_INCOMPLETE` | RETRY | 필수 답변 또는 활성 평가 profile이 불완전 |
| `RETRY_SCORE_MISSING` | RETRY | 리포트 또는 필수 평가 기준 점수가 NULL |

`UNDECIDED`에는 reason code를 저장하지 않는다. 지원자 API는 상세 reason code를 반환하지 않고 `RETRY`에 대한 일반 안내만 제공한다.

## AutoScreeningPolicyV1

공고별 판정 정책은 면접 설정과 함께 저장하고, 지원서가 제출된 뒤에는 변경할 수 없다.

```json
{
  "enabled": true,
  "passMinTotalScore": 70,
  "holdMinTotalScore": 50,
  "requireAllCriteriaPass": true,
  "policyVersion": 1,
  "decisionPolicyVersion": "AUTO_SCREENING_DECISION_V1"
}
```

### Validation

- `passMinTotalScore`, `holdMinTotalScore`는 0~100 정수다.
- `holdMinTotalScore < passMinTotalScore`여야 한다.
- `enabled=true`이면 모든 활성 `evaluation_criteria.pass_score`가 0~100 정수여야 한다.
- `requireAllCriteriaPass`는 V1에서 반드시 `true`다. 향후 완화 정책은 새 contract version으로 추가한다.
- NCS framework는 활성 profile의 가중치 합계가 100이어야 한다.
- submitted application이 존재하면 평가 기준, 하한선과 자동 판정 정책을 함께 잠근다.
- 정책 row가 없거나 `enabled=false`이면 시스템은 결과를 자동 확정하지 않고 `UNDECIDED`를 유지한다. 신규 운영 공고는 OPEN 전 `enabled=true` 저장을 필수로 한다.

`policyVersion`은 정책 또는 평가 기준 하한선이 성공적으로 변경될 때 증가한다. 리포트와 자동 판정 결과는 적용한 `policyVersion`, `criteriaVersion`, `decisionPolicyVersion`을 snapshot으로 보존한다.

## Deterministic Decision Algorithm

아래 순서를 바꾸지 않는다.

1. 자동 판정 정책이 없거나 비활성이면 `UNDECIDED`를 유지한다.
2. `report_status=PENDING | GENERATING`이면 `UNDECIDED`를 유지한다.
3. `report_status=FAILED`이면 `RETRY/RETRY_REPORT_FAILED`다.
4. 필수 답변의 최신 STT가 terminal 인식 불가이면 `RETRY/RETRY_STT_UNAVAILABLE`다.
5. NCS 평가가 `INCOMPLETE`이거나 필수 답변·활성 profile 평가가 불완전하면 `RETRY/RETRY_EVALUATION_INCOMPLETE`다.
6. `evaluation_reports.total_score` 또는 활성 평가 기준의 판정 점수가 NULL이면 `RETRY/RETRY_SCORE_MISSING`다.
7. `totalScore < holdMinTotalScore`이면 `FAIL/FAIL_BELOW_HOLD_THRESHOLD`다.
8. `totalScore >= passMinTotalScore`이고 모든 활성 기준 점수가 각 `passScore` 이상이면 `PASS/PASS_TOTAL_AND_CRITERIA_MET`다.
9. `holdMinTotalScore <= totalScore < passMinTotalScore`이면 `HOLD/HOLD_TOTAL_BAND`다.
10. 총점은 합격선 이상이지만 필수 기준 하한선을 하나 이상 충족하지 못하면 `HOLD/HOLD_CRITERION_BELOW_PASS_SCORE`다.

브라우저 telemetry, 비언어 지표, 기업 내부 메모와 지원자별 수동 점수는 자동 판정 입력으로 사용하지 않는다. API consumer와 frontend는 점수 또는 결과를 재계산하지 않는다.

## State Transitions

허용 전이는 다음과 같다.

- `UNDECIDED -> PASS | HOLD | FAIL | RETRY`
- `RETRY -> PASS | HOLD | FAIL`은 재처리 성공 후 자동 판정으로만 허용한다.
- 동일 리포트·동일 policy snapshot에 대한 같은 결과 저장은 멱등 성공으로 처리한다.
- `PASS`, `HOLD`, `FAIL`은 해당 리포트와 policy snapshot의 terminal 결과이며 기업 사용자가 직접 변경할 수 없다.
- terminal 결과를 다시 계산해야 하면 새 report version 또는 명시적 RETRY process를 만들고 audit 가능한 process log를 남긴다.

## Persistence Projection

`applications`에는 다음 자동 판정 projection을 둔다.

| Column | Definition | Description |
| --- | --- | --- |
| `screening_decision` | `ScreeningDecision` | 자동 판정 결과 |
| `screening_decision_reason_code` | `ScreeningDecisionReasonCode` nullable | UNDECIDED이면 NULL |
| `screening_decision_policy_version` | VARCHAR(80) nullable | `AUTO_SCREENING_DECISION_V1` |
| `screening_policy_version` | INTEGER nullable | 적용한 공고별 정책 version |
| `screening_criteria_version` | INTEGER nullable | 적용한 평가 기준 version |
| `screening_decided_at` | TIMESTAMP nullable | 자동 판정 저장 시각 |

`screening_memo`는 기업 내부 운영 메모로 유지하지만 판정 입력이 아니며 지원자에게 노출하지 않는다.

공고별 설정은 `auto_screening_policies`에 저장한다.

| Column | Definition | Description |
| --- | --- | --- |
| `posting_id` | BIGINT PRIMARY KEY | 공고 FK |
| `enabled` | BOOLEAN NOT NULL DEFAULT FALSE | 자동 판정 활성화 |
| `pass_min_total_score` | INTEGER NOT NULL | 합격 총점 하한선 |
| `hold_min_total_score` | INTEGER NOT NULL | 보류 총점 하한선 |
| `require_all_criteria_pass` | BOOLEAN NOT NULL DEFAULT TRUE | 활성 기준별 하한선 모두 충족 필요 |
| `policy_version` | INTEGER NOT NULL DEFAULT 1 | 설정 변경 version |
| `decision_policy_version` | VARCHAR(80) NOT NULL | 결정 알고리즘 version |
| `created_at` | TIMESTAMP NOT NULL | 생성 시각 |
| `updated_at` | TIMESTAMP NOT NULL | 수정 시각 |

실제 migration과 repository 구현은 #398에서 진행한다. ERD SQL은 해당 구현 PR에서 PostgreSQL CHECK/FK와 함께 갱신한다.

## API Projection

### Company settings

- API-034는 `data.screeningPolicy: AutoScreeningPolicyV1 | null`을 반환한다.
- API-036은 평가 기준과 `screeningPolicy`를 한 transaction에서 저장한다.
- submitted application이 있으면 두 설정을 모두 `INTERVIEW_CONFIGURATION_LOCKED`로 차단한다.

### Company applicant/report

- API-020과 지원자 목록은 `screeningDecision`, `screeningDecisionReasonCode`, 적용 policy/criteria version과 `screeningDecidedAt`을 기업에 반환한다.
- API-012의 지원자별 `screeningDecision` 수동 mutation은 폐기한다. 자동 판정 활성 공고에 대한 호출은 `COMMON_CONFLICT`와 `reason=SCREENING_DECISION_SYSTEM_MANAGED`를 반환한다.
- API-026 수동 평가는 메모를 저장할 수 있지만 최종 `screeningDecision`을 입력받지 않는다.

### Candidate result

- API-073과 API-074는 `screeningDecision: UNDECIDED | PASS | HOLD | FAIL | RETRY`를 반환한다.
- `RETRY`는 report가 실패했거나 점수가 없어도 조회 가능한 제한 결과다.
- 지원자 응답에는 내부 점수, 기준별 하한선, `screeningDecisionReasonCode`, `screeningMemo`를 포함하지 않는다.
- 상태 표시 기본 문구는 #395에서 정의하며 `RETRY`를 합격·보류·전형 종료로 표현하지 않는다.

## Rollout Compatibility

1. 공통 enum과 API 계약을 먼저 배포한다.
2. `RETRY`와 알 수 없는 상태 fallback을 지원하는 프론트를 먼저 배포한다.
3. DB migration과 자동 판정 engine을 배포하되 feature flag 또는 policy `enabled`로 결과 생성을 활성화한다.
4. 기존 수동 판정 UI와 API consumer를 제거한다.
5. E2E가 통과한 뒤 신규 공고의 자동 판정 정책을 필수화한다.

기존 `PASS/HOLD/FAIL` 데이터는 그대로 읽는다. 기존 공고를 자동 변환하거나 과거 결과를 재계산하지 않는다.
