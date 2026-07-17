# NCS Active Profile V2 And Demo Preset Foundation

## 1. Purpose And Scope

이 문서는 기존 `NCS_3_PROFILE_V1`을 변경하지 않고 동적 활성 평가 기준과 공식 3문항 시연 면접을 추가하기 위한 공통 계약이다. WT2(C), WT3(D), WT4(E)는 이 문서의 enum, API field, error, DB column과 validation을 그대로 사용한다.

- 기존 고정 평가 체계: `NCS_3_PROFILE_V1`
- 신규 동적 평가 체계: `NCS_ACTIVE_PROFILE_V2`
- 공식 면접 세션 모드: `STANDARD | DEMO_PRESET`
- 질문 사용 범위: `STANDARD | DEMO_PRESET`
- canonical profile: `JOB_TECHNICAL`, `COLLABORATION_COMMUNICATION`, `PROBLEM_SOLVING`
- 평가 체계에 네 번째 profile을 추가하는 기능은 범위 밖이다.

구현 경계:

- Foundation은 공통 계약, additive schema/migration, shared enum/error/DTO, 순수 validator만 제공한다.
- C 설정 mutation/UI, D 세션 선택/runtime, E 질문 생성/follow-up/evaluator/report 로직은 각 downstream branch가 구현한다.
- 프리셋은 연습 면접이 아니라 `interviewType=RECRUITING`인 공식 면접이다. 동의, 장치 점검, 녹화·업로드, STT, 평가, 총점, 합불과 리포트 경계를 일반 공식 면접과 공유한다.

## 2. Framework Version Split

### 2.1 `NCS_3_PROFILE_V1` compatibility

- canonical profile 세 개를 정확히 한 번씩 사용한다.
- profile별 scoring BASE 질문을 최소 2개 요구한다.
- 질문 하나의 binding은 서로 다른 canonical profile 1~2개다.
- 기존 세션의 `interview_session_ncs_policies.required_question_count=2`와 기존 리포트 계산 결과는 변경하거나 재계산하지 않는다.
- 기존 V1 데이터를 V2 규칙으로 backfill하지 않는다.
- `ncs-report-evaluation-output-v1` shape와 `requiredQuestionCountPerProfile=2`는 그대로 유지한다.

### 2.2 `NCS_ACTIVE_PROFILE_V2`

공고의 `evaluation_criteria`에는 canonical profile 세 행을 유지한다. 별도 `is_active` 컬럼이나 request field를 추가하지 않는다.

- `weight > 0`: 활성 기준
- `weight = 0`: 비활성 기준
- weight는 0~100의 정수다.
- 활성 기준 수는 1~3개다.
- 세 canonical row의 weight 합계는 정확히 100이다.
- profile 중복·누락은 허용하지 않는다. 기준 사용 해제는 행 삭제가 아니라 `weight=0`이다.
- 비활성 기준은 신규 질문 생성, 세션 policy snapshot, 평가 row, 총점·판정과 리포트 score card에서 제외한다.
- 공고 설정 변경은 기존 시작·완료 세션과 리포트에 소급하지 않는다.

정상 `STANDARD` 면접 준비 조건:

- 공통 질문 `jdCriteriaQuestionCount >= 3`
- 개인화 질문 `resumeQuestionCount >= 1`
- 각 활성 profile에 연결된 scoring BASE 질문 최소 1개
- follow-up은 coverage에 포함하지 않는다.
- 전체 scoring BASE 질문 binding 합집합은 모든 활성 profile을 포함한다.
- 질문 하나는 활성 canonical profile 1~2개에 연결할 수 있다.

### 2.3 V2 scoring formula

```text
activeProfiles = criteria where weight > 0
profileAverage(p) = average(effectiveScore of valid scoring BASE questions bound to p)
weightedProfileScore(p) = profileAverage(p) / 5 * configuredWeight(p)
totalScore = sum(weightedProfileScore for activeProfiles)

thresholdResult =
  any active profile is not evaluable -> INCOMPLETE
  totalScore >= 80 AND every active profileAverage >= 3 -> MEETS_THRESHOLD
  otherwise -> BELOW_THRESHOLD
```

- 한 질문이 profile 두 개에 연결되면 답변·profile별 평가 row를 각각 만든다.
- 질문 점수를 총점에 직접 두 번 더하지 않는다. 각 profile 평균에 한 번씩 포함한 뒤 profile weight를 적용한다.
- 비활성 profile에는 신규 평가 row를 만들지 않는다.
- `INCOMPLETE`를 0점으로 바꾸지 않는다.

## 3. Configuration Lock And Deactivation

제출 이력이 있는 공고의 설정은 이후 application 상태가 취소·탈락·완료로 바뀌어도 잠근다. 현재 enum과 legacy nullable `submitted_at`을 함께 고려한 정본 predicate는 다음과 같다.

```sql
EXISTS (
  SELECT 1
  FROM applications a
  WHERE a.posting_id = :postingId
    AND (a.submitted_at IS NOT NULL OR a.application_status <> 'DRAFT')
)
```

잠긴 뒤에는 기준 활성/비활성, weight, 질문 binding, 질문 세트와 STANDARD 질문 수 정책을 수정할 수 없다.

잠기지 않은 공고에서 기준을 `weight=0`으로 바꿀 때:

1. 연결 질문이 없으면 바로 저장할 수 있다.
2. 연결 질문이 있으면 API가 exclusive/multi-binding 영향 개수를 먼저 반환하고 명시적 확인을 요구한다.
3. 해당 profile에만 연결된 질문은 `question_bank.is_active=false`로 보존하며 물리 삭제하지 않는다.
4. 두 profile 질문에서 하나를 해제하면 자동 정상 처리하지 않고 `alignment_status=REVIEW_REQUIRED`로 전환한다.
5. ACTIVE 질문 세트는 재확정 필요 상태가 된다. 새 상태 table/column을 추가하지 않고, 현재 criteria version과 ACTIVE set의 version/coverage 불일치를 projection으로 계산한다.
6. `criteriaVersion`을 원자적으로 증가시키고 기존 세션 snapshot은 유지한다.

## 4. Official Demo Preset Contract

`DEMO_PRESET`은 총 3문항인 공식 면접 한 종류다.

| Order | Question | Binding | Source/usage rule |
| --- | --- | --- | --- |
| 1 | 공통 BASE 1개 | `COLLABORATION_COMMUNICATION`만 | 확정 ACTIVE 공통 질문 풀의 `STANDARD` 질문 중 서버가 선택 |
| 2 | 개인화 BASE 1개 | `JOB_TECHNICAL + PROBLEM_SOLVING` | 별도 `DEMO_PRESET` batch/question에서 서버가 선택 |
| 3 | 개인화 답변 follow-up 1개 | 2번의 두 binding 상속 | session private question, `DEMO_PRESET` usage |

사용 조건과 선택 규칙:

- canonical profile 세 개의 weight가 모두 0보다 클 때만 준비 가능하다.
- 프리셋 개인화 질문은 STANDARD `resumeQuestionCount`에 포함하지 않는 추가 슬롯이다.
- 지원 완료와 서류 추출 완료 뒤 실제 이력서·포트폴리오의 factual anchor로 미리 생성한다.
- 버튼 클릭 시 질문 생성 job을 만들지 않는다.
- 공통 후보는 ACTIVE 질문 세트에 있고 `is_active=true`, `generation_source=JD_CRITERIA`, `usage_scope=STANDARD`, `ALIGNED`, 협업 profile 단일 binding인 질문이다.
- 개인화 후보는 현재 version/hash의 `usage_scope=DEMO_PRESET`, `READY`, `ALIGNED`, 직무+문제해결 두 binding인 질문이다.
- 후보 선택은 D 서버가 application lock/transaction 안에서 수행한다. frontend 난수 선택은 금지한다.
- 최초 선택을 `interview_session_questions`와 binding snapshot에 저장하고 이후 재호출·새로고침은 같은 snapshot을 반환한다.
- 공통 질문에는 follow-up을 생성하지 않는다.
- 개인화 BASE에는 follow-up을 정확히 한 번 결정한다. 생성 실패 시 1회 재시도 후 답변 기반 안전 fallback을 사용한다.
- follow-up은 원본 question mode, 두 binding, answer time과 `usage_scope=DEMO_PRESET`을 상속한다.
- factual anchor가 없으면 demo만 `UNAVAILABLE`이며 STANDARD 준비 상태는 실패로 바꾸지 않는다.

## 5. Official Session Mode Idempotency

`interview_sessions.session_mode`가 공식 면접 선택의 불변 snapshot이다.

- 기존 row와 mode를 생략한 기존 API request는 `STANDARD`로 해석한다.
- 한 application에는 삭제되지 않은 최초 `RECRUITING` session 하나만 공식 선택으로 사용한다.
- 동일 mode 재호출은 기존 session resume/멱등 응답이다.
- 다른 mode 재호출은 `INTERVIEW_SESSION_MODE_CONFLICT`다.
- uniqueness를 기존 데이터에 위험하게 소급하는 DB unique index는 추가하지 않는다. D가 application advisory lock과 transaction 안에서 기존 non-deleted recruiting session을 조회한 뒤 생성한다.
- snapshot 생성 후 공고 설정·질문 원본·batch 변경은 기존 session에 소급하지 않는다.

## 6. Usage Scope And Batch Idempotency

`QuestionUsageScope`은 저장·생성 목적을 분리한다.

- 기존 question/batch/application question/session question은 모두 `STANDARD`로 backfill한다.
- `question_bank.usage_scope`는 질문 원본의 저장 목적이다. 이번 demo 공통 질문은 확정 STANDARD 공통 풀에서 선택한다.
- `application_interview_question_batches.usage_scope`와 `application_interview_questions.usage_scope`는 STANDARD N개와 DEMO_PRESET 추가 1개를 분리한다.
- `interview_session_questions.usage_scope`는 해당 session에서 소비한 목적이다. DEMO_PRESET의 공통·개인화·follow-up snapshot은 모두 `DEMO_PRESET`이다.
- batch business key는 다음과 같다.

```text
applicationId + usageScope + policyVersion + criteriaVersion
+ jdSnapshotHash + resumeDocumentHash
```

- `DEMO_PRESET` batch는 STANDARD batch의 status를 stale/failed로 바꾸지 않으며 반대도 동일하다.
- policy/criteria/JD/resume 변경은 같은 usage scope 안에서만 기존 batch를 stale로 만든다.

## 7. Readiness Projection

별도 readiness table은 만들지 않는다. policy, criteria, ACTIVE set, current DEMO_PRESET batch/question, document와 official session으로 계산한다.

```ts
type DemoPresetReadinessProjection = {
  status: "READY" | "PENDING" | "UNAVAILABLE";
  canStart: boolean;
  reasonCode: DemoPresetReadinessReasonCode | null;
  existingSessionId: number | null;
  existingSessionMode: "STANDARD" | "DEMO_PRESET" | null;
};
```

| Condition | status | canStart | reasonCode |
| --- | --- | --- | --- |
| 조건 충족, session 없음 | READY | true | null |
| 동일 DEMO_PRESET session 존재 | READY | true(resume) | OFFICIAL_SESSION_EXISTS |
| personalized 생성 중 | PENDING | false | DEMO_PERSONALIZED_QUESTION_GENERATING |
| canonical 3개가 모두 활성 아님 | UNAVAILABLE | false | CANONICAL_PROFILES_NOT_ALL_ACTIVE |
| 협업 공통 후보 없음 | UNAVAILABLE | false | COLLABORATION_COMMON_QUESTION_MISSING |
| 검토 필요 | UNAVAILABLE | false | DEMO_PERSONALIZED_QUESTION_REVIEW_REQUIRED |
| 생성 실패 | UNAVAILABLE | false | DEMO_PERSONALIZED_QUESTION_FAILED |
| factual anchor 없음 | UNAVAILABLE | false | FACTUAL_ANCHOR_MISSING |
| STANDARD 공식 session 존재 | UNAVAILABLE | false | OFFICIAL_SESSION_MODE_CONFLICT |
| 설정/version/coverage 불일치 | UNAVAILABLE | false | CONFIGURATION_COVERAGE_MISMATCH |

## 8. API Delta

기존 endpoint를 확장하며 중복 endpoint를 만들지 않는다.

### API-034 / API-036 evaluation criteria

```ts
type NcsCriterionProjection = {
  ncsProfileId: NcsProfileId;
  weight: number;
  isActive: boolean; // weight > 0 파생값
};

type NcsConfigurationProjection = {
  evaluationFramework: EvaluationFramework;
  criteriaVersion: number;
  criteria: NcsCriterionProjection[];
  configurationLocked: boolean;
  configurationLockedReason: "SUBMITTED_APPLICATION_EXISTS" | null;
  questionImpactByProfile: Array<{
    ncsProfileId: NcsProfileId;
    exclusivelyBoundActiveQuestionCount: number;
    multiBoundActiveQuestionCount: number;
  }>;
  questionSetRequiresReconfirmation: boolean;
};
```

- API-036 request는 `isActive`를 받지 않고 canonical criteria 세 행의 `weight`를 받는다.
- 연결 질문이 있는 profile을 0으로 바꾸려면 `confirmQuestionImpact=true`가 필요하다.

### API-097 question policy

- 기존 `jdCriteriaQuestionCount`, `resumeQuestionCount`는 `usageScope=STANDARD` 전용이다.
- V2 저장은 각각 최소 3/1이고 활성 profile coverage 최소 1을 요구한다.
- response에 `activeProfileCoverage[]`와 `questionSetRequiresReconfirmation`을 추가한다.
- DEMO_PRESET 개인화 1개는 위 count에 포함하지 않는다.

### API-061 / API-062 application and guide

- 각 application/guide에 `demoPreset: DemoPresetReadinessProjection`을 추가한다.
- 기존 공식 session이 있으면 `sessionMode`도 반환한다.

### API-017 / API-065 official session create/start

```ts
type OfficialInterviewSessionStartRequest = {
  mode?: "STANDARD" | "DEMO_PRESET"; // 기존 client 호환 default STANDARD
};
```

- response에 `sessionMode`, `snapshotCreated`와 각 question의 `usageScope`를 포함한다.
- STANDARD는 framework별 coverage(V1=2, V2 active=1)를 검증한다.
- DEMO_PRESET은 3개 모두 활성, eligible 1+1 후보, 두 번째 질문 binding을 검증한 뒤 server-side로 선택한다.
- mode가 같은 재호출은 기존 session/snapshot을 반환한다.

### API-098 / API-099 and worker job

- query/request/response와 worker input에 `usageScope`를 포함한다.
- STANDARD의 생략값은 `STANDARD`다.
- DEMO_PRESET은 정확히 개인화 BASE 1개와 `JOB_TECHNICAL + PROBLEM_SOLVING` binding을 요구한다.
- batch lookup/retry/stale 전이는 같은 `usageScope` 안에서만 수행한다.

## 9. Error Contract

| Code | HTTP | Meaning |
| --- | --- | --- |
| `INTERVIEW_NCS_ACTIVE_PROFILE_INVALID` | 422 | V2 canonical 구성, 중복 또는 활성 profile 수 1~3 조건 위반 |
| `INTERVIEW_NCS_WEIGHT_INVALID` | 422 | weight가 0~100 정수가 아니거나 합계 100 위반 |
| `INTERVIEW_NCS_BINDING_INVALID` | 422 | 질문 binding 1~2, canonical/중복/활성 profile 규칙 위반 |
| `INTERVIEW_NCS_QUESTION_COVERAGE_INVALID` | 422 | V1 profile별 2개 또는 V2 활성 profile별 1개 BASE coverage 위반 |
| `INTERVIEW_CONFIGURATION_LOCKED` | 409 | 제출 이력 때문에 설정 변경 불가 |
| `INTERVIEW_DEMO_PRESET_NOT_READY` | 409 | readiness가 READY가 아님 |
| `INTERVIEW_DEMO_PRESET_QUESTION_POOL_INSUFFICIENT` | 409 | eligible 공통 또는 개인화 질문 후보 부족 |
| `INTERVIEW_SESSION_MODE_CONFLICT` | 409 | application의 기존 공식 session과 요청 mode 불일치 |
| `INTERVIEW_NCS_FRAMEWORK_UNSUPPORTED` | 422 | 지원하지 않는 framework/profile/scoring version |

## 10. Persistence And Compatibility

Foundation migration은 다음만 수행한다.

- PostgreSQL enum `InterviewSessionMode`, `QuestionUsageScope` 추가
- `interview_sessions.session_mode NOT NULL DEFAULT STANDARD`
- `question_bank.usage_scope NOT NULL DEFAULT STANDARD`
- `application_interview_question_batches.usage_scope NOT NULL DEFAULT STANDARD`
- `application_interview_questions.usage_scope NOT NULL DEFAULT STANDARD`
- `interview_session_questions.usage_scope NOT NULL DEFAULT STANDARD`
- batch unique business key에 `usage_scope` 포함
- evaluation framework check에 `NCS_ACTIVE_PROFILE_V2` 허용
- session policy의 `required_question_count` check를 V2의 1을 허용하도록 `>= 1`로 완화

기존 row의 다른 값, V1 criteria/session/report와 질문 binding은 수정하지 않는다. `evaluation_criteria.is_active`와 별도 readiness table은 추가하지 않는다.

## 11. Cross-owner Review

- A: shared enum/error/DTO, Prisma schema, forward migration과 AWS `migrate deploy`
- C: weight=0 mutation, 설정 잠금, 질문 영향/비활성화, ACTIVE set 재확정
- D: official session mode lock/idempotency, server-side selection, snapshot/runtime
- E: usage-scoped batch, factual anchor, follow-up, active-only evaluator/report
- PM: demo readiness/잠금 문구, 3문항 흐름, V1/V2 리포트 표시
