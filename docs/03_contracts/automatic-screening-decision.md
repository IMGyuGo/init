# Automatic Screening Decision Contract

> Issues: #394, #429
> Contract version: `AUTO_SCREENING_DECISION_V1`
> Result publication revision: `SCREENING_RESULT_CONFIRMATION_V1`

채용 AI 면접 리포트와 기업이 공고별로 저장한 기준을 사용해 지원자의 전형 결과를 자동 분류하는 계약이다. 시스템은 모든 판정 가능한 지원자를 먼저 `PASS`, `HOLD`, `FAIL`로 나누며, 면접관은 전원을 하나씩 판정하지 않는다. 면접관은 필요한 지원자만 자동판정을 수정할 수 있고, 공고 단위 확정 전까지 지원자에게 결과를 공개하지 않는다.

## Scope And Ownership

| Concern | Owner | Review |
| --- | --- | --- |
| 공고별 자동 판정 정책과 평가 기준 하한선 설정 | C | B, E, PM |
| 리포트 완료·평가 가능성 판단과 자동 판정 실행 | E | B, C, A |
| `applications` 자동 판정 결과 저장과 기업 조회 | E/B | A, C |
| 면접관 검토 초안 수정, 공고 단위 결과 확정, 지원자 알림 등록 | B | A, D, E, PM |
| 확정된 지원자 제한 결과 조회와 View | D | B, E, PM |
| 공통 enum, Prisma migration | A | B, C, D, E |
| RETRY job 실행·한도·운영 개입 | E/A | D, PM |

RETRY의 재처리 횟수, backoff, 지원자 재답변과 운영자 재처리 경계는 #397에서 확정한다. 이 문서는 RETRY 진입 조건과 결과 노출 계약만 고정한다.

## RETRY Execution Policy (#397)

- queue 자동 재시도는 최초 실행을 포함해 총 3회다.
- `RETRYABLE`, `STT_RETRYABLE`만 queue 자동 재시도 대상이다. 각 실패 시점부터 SQS visibility timeout을 900초로 다시 설정하며 worker heartbeat는 300초 간격을 유지한다.
- worker 환경변수로 위 값을 변경하지 않는다. 설정값이 있으면 각각 총 3회, 900초, 300초와 정확히 일치해야 한다.
- 3번째 자동 시도가 실패하면 메시지를 ACK하고 `failure_category=RETRY_EXHAUSTED`로 종료한다. STT process라면 REPORT 생성 전제조건에서는 terminal `STT_UNAVAILABLE`로 취급하지만 `REANSWER_REQUIRED`로 변환하거나 지원자 재답변 권한을 부여하지 않는다. 이후 자동 job을 만들지 않으며 운영자 확인이 필요하다.
- 1·2번째 `RETRYABLE | STT_RETRYABLE` 실패는 `ai_process_logs`와 backoff만 갱신한다. report, resume question batch 등 도메인 결과를 terminal `FAILED`로 바꾸는 후처리는 3회 소진 또는 다른 terminal 실패에서만 수행한다.
- `REANSWER_REQUIRED`는 queue 자동 재시도 대상이 아니다. 기존 지원자 재답변 1회 계약을 사용하며 자동 시도 횟수에 포함하지 않는다.
- `RETRY_REPORT_FAILED`, `RETRY_EVALUATION_INCOMPLETE`, `RETRY_SCORE_MISSING`은 ADMIN 명시적 REPORT 재처리 대상이다. 성공한 REPORT final save가 자동 판정 engine을 다시 실행한다.
- `RETRY_STT_UNAVAILABLE`은 REPORT job만 다시 생성하지 않는다. 최신 STT 실패가 `REANSWER_REQUIRED`일 때만 지원자 재답변 대상이며, `RETRY_EXHAUSTED`이면 운영 확인 대상이다.
- 같은 application의 최신 `REPORT_GENERATE`가 `PENDING | RUNNING` 또는 자동 재시도 backoff 중인 `FAILED(RETRYABLE | STT_RETRYABLE, attempt < 3, nextRetryAt 존재)`이면 새 job을 만들지 않고 기존 job을 멱등 성공으로 반환한다.
- `attempt_count`는 DB 저장 상태가 정본이다. `PENDING` 최초 claim은 저장값을 유지하고, due `FAILED` 또는 lease가 만료된 `RUNNING`을 실제 reclaim할 때만 저장값에서 정확히 1 증가한다. 최대 시도에 도달한 stale `RUNNING`은 추가 실행 없이 `RETRY_EXHAUSTED`로 닫는다. SQS `ApproximateReceiveCount`는 provider 시도 횟수 계산에 사용하지 않는다.
- queue 발행 전에 프로세스가 종료되어 남은 `REPORT_GENERATE/PENDING`과 due `REPORT_GENERATE | RESUME_QUESTION_GENERATE/FAILED` 자동 재시도는 동일 `processLogId`로 복구 발행한다. migration 전 NULL-backoff 행은 `input_ref`가 있는 REPORT만 자동 복구하고, 이미 연결 batch가 terminal일 수 있는 legacy RESUME과 NULL input 등 나머지는 `RETRY_EXHAUSTED` 운영 확인 상태로 전환한다.
- `RETRY_EXHAUSTED` 중복 delivery는 같은 process의 누락된 terminal 후처리를 재개할 수 있다. REPORT process 생성과 실패 후처리는 application/session scope row lock을 공유하고, 잠금 안의 최신 `REPORT_GENERATE.processLogId`가 일치할 때만 report/application 상태를 변경한다.
- 명시적 재처리는 새 `ai_process_logs` row를 만들고 원본 process log와 재처리 주체를 audit snapshot으로 보존한다.
- `failure_reason`에는 답변·서류 원문, 이메일, 전화번호, URL, provider 원문 응답을 저장하지 않는다.

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
- `holdMinTotalScore <= passMinTotalScore`여야 한다.
- 두 하한선이 같으면 총점 HOLD 구간을 사용하지 않는다. 이때 총점이 공통 하한선 미만이면 `FAIL`, 이상이면서 모든 활성 기준 하한선을 충족하면 `PASS`다. 총점은 충족하지만 필수 기준이 미달이면 `HOLD`다.
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

`holdMinTotalScore=passMinTotalScore`여도 위 판정 순서는 바꾸지 않는다. 동일 경계값에서는 9번의 총점 HOLD 구간이 공집합이 되며, 8번의 필수 기준 검증을 통과하지 못한 경우에만 10번의 `HOLD`가 남는다.

### Saltlux presentation fixture

- `SALTLUX_AI_BACKEND_V1 + DEMO_PRESET`은 버전 관리된 동일 리포트를 사용한다. 커트라인을 바꾸기 위해 AI 평가나 리포트를 다시 생성하지 않는다.
- 고정 리포트 총점과 이미 저장된 활성 기준 점수를 공고의 `passMinTotalScore`, `holdMinTotalScore`, 기준별 `passScore`에 한 번 적용한다.
- 리포트 완료와 자동판정 저장은 같은 API transaction에서 처리한다. 일반 worker 경로와 동일한 deterministic decision 함수를 사용한다.
- fixture 결과도 면접관에게만 먼저 노출하고, 지원자 공개는 별도의 면접관 확정 이후로 제한한다.

## State Transitions

허용 전이는 다음과 같다.

- `UNDECIDED -> PASS | HOLD | FAIL | RETRY`
- `RETRY -> PASS | HOLD | FAIL`은 재처리 성공 후 자동 판정으로만 허용한다.
- 동일 리포트·동일 policy snapshot에 대한 같은 결과 저장은 멱등 성공으로 처리한다.
- `screening_decision`의 `PASS`, `HOLD`, `FAIL`은 해당 리포트와 policy snapshot의 terminal 자동판정이며 직접 덮어쓰지 않는다. 면접관 수정값은 별도 `screening_reviewer_decision`에 저장한다.
- terminal 결과를 다시 계산해야 하면 새 report version 또는 명시적 RETRY process를 만들고 audit 가능한 process log를 남긴다.

자동판정 상태 전이와 지원자 공개 상태는 서로 독립적이다. 자동판정이 `PASS | HOLD | FAIL`에 도달해도 면접관 확정 전에는 지원자에게 공개하지 않는다.

## Result Confirmation And Candidate Publication

1. 자동판정 engine이 `PASS | HOLD | FAIL`을 저장하면 기업 목록은 `effectiveDecision = screeningReviewerDecision ?? screeningDecision`으로 모든 판정 가능 지원자를 합격/보류/불합격 그룹에 즉시 배치한다.
2. 면접관은 목록 전체를 하나씩 체크하지 않는다. 궁금하거나 수정이 필요한 지원자만 상세 리포트를 열고 `PASS | HOLD | FAIL` 중 다른 검토 결과를 저장한다.
3. 자동판정과 다른 검토 결과에는 10~1000자의 내부 변경 사유가 필수다. 자동판정으로 되돌리면 reviewer decision과 변경 사유를 NULL로 초기화한다.
4. `UNDECIDED | RETRY`는 수정·확정 대상이 아니며 기업 목록의 `재처리/확인 필요` 그룹에 남긴다.
5. 공고 단위 `결과 확정` 버튼은 아직 확정되지 않은 합격/보류/불합격 인원, 확정 대상 합계, 제외되는 `UNDECIDED | RETRY` 인원을 Alert 또는 modal에 표시한다. 이미 확정된 인원은 확정 대상 판정별 인원에 포함하지 않는다. 사용자가 `취소`하면 API를 호출하지 않고, `확정`을 다시 선택해야만 일괄 확정 API를 호출한다.
6. 확정 API는 요청의 `expectedEligibleCount`와 현재 판정 가능 미확정 인원이 다르면 `SCREENING_CONFIRMATION_SCOPE_CHANGED`로 거부하고 목록 새로고침을 요구한다.
7. 확정 transaction은 공고에 속한 판정 가능한 미확정 application row를 잠그고 각 행에 `screening_final_decision=effectiveDecision`, 확정 시각·확정자를 저장하며 지원자별 `IN_APP` 알림과 `EMAIL/PENDING` 알림을 멱등 생성한다.
8. transaction commit 이후 지원자 API는 `resultPublicationStatus=CONFIRMED`와 제한된 최종 `screeningDecision`을 반환한다.
9. 이메일 발송 실패는 notification을 `FAILED`로 남기고 재시도하되, 확정 상태와 지원자 포털 공개를 되돌리지 않는다.
10. 동일 범위의 확정 재호출은 기존 확정 결과와 알림을 반환하는 멱등 성공이다. 이미 확정된 결과를 다른 값으로 바꾸거나 중복 알림을 만들지 않는다.
11. V1에서는 확정 취소, 확정 후 결과 변경, 생성된 리포트의 커트라인 재적용 UI를 제공하지 않는다.

### Score-based pass target and pass mail

- 공고의 결과 미확정 지원자 중 `reportStatus=COMPLETED`이고 `effectiveDecision=PASS | HOLD | FAIL`인 모든 지원자를 목표 합격자 수 선발 대상으로 사용한다.
- 대상은 최신 리포트 총점 내림차순, 제출 시각 오름차순, application ID 오름차순으로 정렬한다. 상위 목표 인원은 유효 `PASS`, 나머지는 유효 `FAIL`로 저장하므로 대상 범위의 `HOLD`도 두 결과 중 하나로 변경한다.
- 완전한 자동 판정 snapshot이 있으면 `screening_decision`과 reason/version/report snapshot을 보존하고 `screening_reviewer_decision`에 목표 선발 결과를 저장한다. legacy 또는 snapshot 불완전 행만 `screening_decision`을 직접 갱신한다.
- 최종 유효 `PASS`에게만 합격 메일을 발송하며 이미 `SENT`인 대상은 재발송하지 않는다. 발송 실패 대상은 이번 요청 직전 reviewer/legacy 상태로 복구한다.
- `UNDECIDED`, `RETRY`, 리포트 미완료, 결과 확정 지원자는 목표 인원과 최대 선발 가능 인원에서 제외한다.

지원자 공개 상태는 다음과 같다.

| resultPublicationStatus | 조건 | 지원자 응답 |
| --- | --- | --- |
| `PENDING` | 공고 결과 미확정, `UNDECIDED`, `RETRY` | 내부 자동·검토 판정, 점수, 리포트를 숨기고 `결과 검토 중` 표시 |
| `CONFIRMED` | `screening_final_decision=PASS | HOLD | FAIL`이며 면접관 확정 snapshot 존재 | 제한된 최종 `screeningDecision`과 통보 시각 표시 |

## Persistence Projection

`applications`에는 다음 자동 판정 projection을 둔다.

| Column | Definition | Description |
| --- | --- | --- |
| `screening_decision` | `ScreeningDecision` | 자동 판정 결과 |
| `screening_decision_reason_code` | `ScreeningDecisionReasonCode` nullable | UNDECIDED이면 NULL |
| `screening_decision_policy_version` | VARCHAR(80) nullable | `AUTO_SCREENING_DECISION_V1` |
| `screening_policy_version` | INTEGER nullable | 적용한 공고별 정책 version |
| `screening_criteria_version` | INTEGER nullable | 적용한 평가 기준 version |
| `screening_decision_report_id` | BIGINT nullable | 멱등 snapshot에 적용한 리포트 FK. 내부 저장 전용 |
| `screening_decided_at` | TIMESTAMP nullable | 자동 판정 저장 시각 |
| `screening_reviewer_decision` | ScreeningDecision nullable | 면접관 검토 초안. 자동판정 유지 시 NULL |
| `screening_final_decision` | ScreeningDecision nullable | 공고 단위 확정 시 effective decision snapshot |
| `screening_decision_override_reason` | TEXT nullable | 자동판정과 다른 검토 결과의 내부 사유 |
| `screening_result_confirmed_at` | TIMESTAMP nullable | 면접관 결과 확정 시각. 지원자 공개 기준 |
| `screening_result_confirmed_by_user_id` | BIGINT nullable | 결과를 확정한 기업 사용자 FK |

`screening_memo`는 기업 내부 운영 메모로 유지하지만 판정 입력이 아니며 지원자에게 노출하지 않는다.
`screening_decision_report_id`는 `reportId + policyVersion + criteriaVersion + decisionPolicyVersion` 멱등 키를 DB에 보존하기 위한 내부 필드이며 기업·지원자 API 응답에는 노출하지 않는다.

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

실제 migration과 repository 구현은 #398에서 관리한다. ERD SQL도 PostgreSQL CHECK/FK와 함께 동기화한다.

## API Projection

### Company settings

- API-034는 `data.screeningPolicy: AutoScreeningPolicyV1 | null`을 반환한다.
- API-036은 평가 기준과 `screeningPolicy`를 한 transaction에서 저장한다.
- submitted application이 있으면 두 설정을 모두 `INTERVIEW_CONFIGURATION_LOCKED`로 차단한다.

### Company applicant/report

- API-014, API-020과 지원자 목록은 자동 `screeningDecision`, `screeningReviewerDecision`, `effectiveScreeningDecision`, `finalScreeningDecision`, 자동판정 reason/version, `screeningResultConfirmationStatus`, 확정 시각을 기업에 반환한다.
- 목록은 `effectiveScreeningDecision` 기준 PASS/HOLD/FAIL 그룹과 count를 제공하고 `UNDECIDED | RETRY`를 별도 주의 그룹으로 제공한다.
- API-012의 지원자별 `screeningDecision` 수동 mutation은 폐기한다. 자동 판정 활성 공고에 대한 호출은 `COMMON_CONFLICT`와 `reason=SCREENING_DECISION_SYSTEM_MANAGED`를 반환한다.
- API-026 수동 평가는 메모를 저장할 수 있지만 최종 `screeningDecision`을 입력받지 않는다.
- API-012R은 미확정 지원자의 reviewer decision과 변경 사유를 저장하거나 자동판정으로 초기화한다.
- API-014-PASS-MAILS는 자동 판정 정책 활성 여부와 관계없이 판정 가능한 미확정 `PASS | HOLD | FAIL` 전체를 점수순으로 PASS/FAIL에 재배치하고 자동 판정 snapshot이 있으면 reviewer decision으로 보존한다.
- API-012C는 공고의 판정 가능한 미확정 결과를 Alert 재확인 후 일괄 확정한다. 확정 전 면접관 화면에는 지원자 비공개 상태와 대상/제외 인원을 표시한다.

### Candidate result

- API-073과 API-074는 항상 `resultPublicationStatus: PENDING | CONFIRMED`를 반환한다.
- 면접관 확정 전에는 내부 `screeningDecision`이 존재해도 지원자 응답의 `screeningDecision`을 `null`로 반환하고 리포트·점수·reason code를 노출하지 않는다.
- 확정 후에만 `screening_final_decision`을 `screeningDecision: PASS | HOLD | FAIL`로 반환한다. 자동판정과 reviewer decision은 지원자에게 공개하지 않는다. `UNDECIDED | RETRY`는 지원자에게 공개하거나 확정할 수 없다.
- 지원자 응답에는 내부 점수, 기준별 하한선, `screeningDecisionReasonCode`, `screeningMemo`, 확정자 정보를 포함하지 않는다.
- `PENDING` 기본 문구는 `결과 검토 중`이며 합격·보류·전형 종료로 표현하지 않는다.

## Rollout Compatibility

1. 공통 enum과 API 계약을 먼저 배포한다.
2. 면접관 확정 전 결과를 숨기는 candidate projection과 `PENDING` fallback을 먼저 배포한다.
3. DB migration과 자동 판정 engine을 배포하되 feature flag 또는 policy `enabled`로 결과 생성을 활성화한다.
4. 면접관 검토 수정 API, 공고 단위 확정 UI/API와 멱등 알림 생성을 배포한다.
5. 기존 수동 판정 UI와 API consumer를 제거한다.
6. E2E가 통과한 뒤 신규 공고의 자동 판정 정책을 필수화한다.

기존 `PASS/HOLD/FAIL` 데이터는 기업 화면에서 그대로 읽되 confirmation snapshot이 없는 기존 결과는 지원자에게 자동 공개하지 않는다. 기존 공고를 자동 변환하거나 과거 결과를 재계산하지 않으며, 지원자 공개가 필요하면 면접관이 현재 결과를 명시적으로 확정한다.
