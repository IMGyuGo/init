# NCS Final Evaluation Contract Preparation

## Purpose

이 문서는 구현 전 검토 이력을 보존한다. 확정 정본은 [`docs/03_contracts/ncs-final-evaluation.md`](../03_contracts/ncs-final-evaluation.md), 구현 순서는 [`ncs-final-evaluation-integration-milestones.md`](./ncs-final-evaluation-integration-milestones.md)를 따른다.

## Fixed Product Rules

| Rule | Value |
| --- | --- |
| NCS profile count | 3 |
| Profile weight total | 100 |
| Default profile weights | `JOB_TECHNICAL=30`, `COLLABORATION_COMMUNICATION=30`, `PROBLEM_SOLVING=40` |
| Profile weight editing | 면접관이 공고별 면접 설정에서 수정, 합계 100 필수 |
| Profiles per base question | 1~2 |
| Minimum base questions per profile | 2 |
| Scoring question sources | 공통 기본 질문과 이력서 개인화 질문 모두 포함 |
| Behavior points | integer 0~3 |
| Logic points | integer 0~2 |
| Base/effective question score | integer 0~5 |
| Follow-up trigger | linked profile score 중 하나라도 5 미만 |
| Follow-up limit | base question당 최대 1회 |
| Follow-up mode | base question과 동일 |
| Follow-up answer time | 세션에 고정된 기존 `answerTimeSec`와 동일 |
| Follow-up score policy | `max(baseScore, combinedScore)`, 최대 5 |
| Overall threshold | 80/100 이상 |
| Profile minimum threshold | 각 profile 평균 3/5 이상 |
| Truth boundary | 기술 사실성·실제 경험 진위는 자동 확정하지 않음 |

30/30/40은 공고별 최초 기본값이다. 면접관은 면접 설정 단계에서 각 profile weight를 수정할 수 있으며 저장 시 합계는 반드시 100이어야 한다.

## Proposed Contract Types

아래 이름은 팀원 구현 type을 확인한 뒤 정본 이름으로 조정한다.

```ts
type NcsThresholdResult = "MEETS_THRESHOLD" | "BELOW_THRESHOLD" | "INCOMPLETE";
type NcsScoreContribution = "SCORING" | "SUPPLEMENTAL_NON_SCORING";
type NcsTruthValidationStatus = "NOT_VERIFIED" | "EXPERT_VERIFIED" | "EXPERT_REJECTED";

type NcsQuestionBindingSnapshot = {
  criterionId: number;
  profileId: "JOB_TECHNICAL" | "COLLABORATION_COMMUNICATION" | "PROBLEM_SOLVING";
  profileVersion: string;
  alignmentStatus: "ALIGNED" | "LOW_ALIGNMENT" | "REVIEW_REQUIRED";
  alignmentScore: number | null;
};

type NcsQuestionSource = "JD_CRITERIA" | "RESUME_PERSONALIZED";

type NcsAnswerSegment = {
  answerId: number;
  kind: "BASE" | "FOLLOW_UP";
  text: string;
};

type NcsQuestionProfileScore = {
  answerId: number;
  profileId: NcsQuestionBindingSnapshot["profileId"];
  behaviorPoints: 0 | 1 | 2 | 3;
  logicPoints: 0 | 1 | 2;
  baseScore: number;
  effectiveScore: number;
  followUpApplied: boolean;
  scoreStatus: "SCORED" | "INSUFFICIENT_INPUT" | "LOW_ALIGNMENT" | "BLOCKED";
  truthValidationStatus: NcsTruthValidationStatus;
  evidence: Array<{ answerId: number; quote: string }>;
};

type NcsReportScoreSummary = {
  profileScores: Array<{
    profileId: NcsQuestionBindingSnapshot["profileId"];
    validBaseQuestionCount: number;
    averageScore: number | null;
    weight: number;
    weightedScore: number | null;
  }>;
  totalScore: number | null;
  thresholdResult: NcsThresholdResult;
  scoringVersion: string;
};
```

## Deterministic Formula

```text
baseScore(question, profile) = behaviorPoints(0..3) + logicPoints(0..2)
effectiveScore = follow-up 없음 ? baseScore : max(baseScore, combinedScore)
profileAverage = 해당 profile에 연결된 SCORING 질문의 effectiveScore 평균
weightedProfileScore = profileAverage / 5 * profileWeight
totalScore = 모든 weightedProfileScore 합계
thresholdResult =
  유효 질문 부족 또는 nullable 평가 존재 -> INCOMPLETE
  totalScore >= 80 AND every profileAverage >= 3 -> MEETS_THRESHOLD
  otherwise -> BELOW_THRESHOLD
```

모든 계산은 versioned deterministic 함수로 수행한다. LLM이 `thresholdResult` 또는 최종 `screeningDecision`을 자유 생성하지 않는다.

공통 기본 질문과 이력서 개인화 질문은 모두 `SCORING`으로 집계한다. 질문 하나가 profile 두 개에 연결되면 답변 하나에서 profile별 점수를 각각 만들지만, 질문 점수를 그대로 두 번 최종 총점에 더하지 않는다. 각 점수는 해당 profile 평균에 한 번씩 포함되고 최종 총점은 profile 평균에 weight를 적용한 값만 합산한다.

## Follow-up Contract Preparation

꼬리질문 생성 입력에 다음 snapshot이 필요하다.

- base session question ID와 base answer ID
- linked profile bindings 1~2개
- question mode와 required logic structure
- profile별 missing behavior points
- missing logic links
- 이미 확인된 evidence quote 목록
- follow-up attempt count와 제한 시간 source

생성 결과는 같은 question mode의 질문 한 개만 허용한다. 답변 저장 후 base/follow-up segment를 함께 재평가하되 원점수보다 낮은 결과는 적용하지 않는다.

제한 시간 source는 별도 꼬리질문 설정을 만들지 않고, 면접 세션 시작 시 `interview_time_policies.answer_time_sec`에서 복사한 session time-policy snapshot을 사용한다. 설정 원본 API는 C 소유 `API-040 PATCH /company/interviews/time-policy`, 세션 시작·타이머·답변 저장은 D 소유, 꼬리질문 생성과 재평가는 E 소유다. 진행 중인 세션은 이후 정책 변경의 영향을 받지 않는다.

## Persistence Impact

구현 순서와 Prisma/API compatibility 상세는 [`ncs-multi-profile-binding-implementation-plan.md`](./ncs-multi-profile-binding-implementation-plan.md)를 따른다.

현재 schema는 질문과 세션 snapshot에 단일 `ncs_profile_id`를 저장하고 `ncs_answer_evaluations`를 `(report_id, answer_id)`로 unique 처리한다. 최대 2 profile을 적용하려면 다음 변경 후보가 있다.

1. 공통 질문의 profile binding 관계
2. 세션 질문의 불변 profile binding snapshot
3. 답변·profile별 평가 unique key
4. base score, effective score, behavior/logic points 저장 또는 versioned JSON contract
5. 꼬리답변 evidence source와 parent answer linkage
6. report의 profile average, weighted score, threshold result와 scoring version

배열 문자열이나 comma-separated profile ID는 사용하지 않는다. 기존 single profile row를 binding 하나로 이관할 수 있는 전진 migration을 준비한다.

### Recommended Multi-profile Shape

현재 `question_bank`, `application_interview_questions`, `interview_session_questions`는 모두 `ncs_profile_id` 하나만 저장한다. evaluator는 `profileIds[]`를 받을 수 있지만 adapter가 단일 값을 배열 하나로 감싸 전달하며, `ncs_answer_evaluations`도 `(report_id, answer_id)` unique라 답변 하나의 profile별 결과 두 개를 저장할 수 없다.

권장 구조는 다음과 같다.

1. `question_ncs_bindings`: 공통 질문과 profile 1~2개의 편집·확정 관계
2. `application_question_ncs_bindings`: 개인화 질문과 profile 1~2개의 생성 결과 관계
3. `session_question_ncs_bindings`: 실제 응시 시점의 profile/version/criterion 불변 snapshot
4. `ncs_answer_evaluations`: unique key를 `(report_id, answer_id, ncs_profile_id)`로 확장
5. profile별 평가 row에 `behavior_points`, `logic_points`, `base_score`, `effective_score`, evidence source를 저장

예를 들어 질문 Q1이 `JOB_TECHNICAL`, `PROBLEM_SOLVING`에 연결되고 답변 A1이 생성되면, 평가 결과는 `(A1, JOB_TECHNICAL)`과 `(A1, PROBLEM_SOLVING)` 두 row다. 두 row는 같은 답변 원문을 사용하지만 서로 다른 행동 포인트와 근거로 평가된다. 꼬리답변 A2는 Q1/A1의 자식 segment로 연결하고, 두 profile 중 부족한 profile만 재평가할 수 있어야 한다.

## API Impact

정본 승격 시 최소 다음 API projection을 검토한다.

- 면접 설정 조회·저장: 전체 threshold, profile minimum, profile weight
- 질문 생성·확정: `ncsBindings[]`, `scoreContribution`, question mode
- 세션 질문: binding snapshot과 follow-up attempt state
- 답변 평가: profile별 0~5 점수와 source answer evidence
- 기업 평가 상세: profile average, weighted total, threshold result, truth validation notice

현재 singular `ncsProfileId`는 migration 기간에 deprecated compatibility field로 유지할 수 있으나 신규 NCS flow의 정본으로 사용하지 않는다.

`thresholdResult`는 AI 선별 추천에 사용한다. deterministic mapping은 `MEETS_THRESHOLD -> PASS`, `BELOW_THRESHOLD -> FAIL`이며 발표용 `NCS_INCOMPLETE_AS_FAIL_DEMO_V1`에서는 `INCOMPLETE -> FAIL`로 임시 매핑한다. 점수는 NULL로 유지하고 실제 application 상태는 자동 변경하지 않는다. 발표 후 `HOLD/재평가` 정책으로 교체한다.

## Open Decisions

| Decision | Recommended default | Owner |
| --- | --- | --- |
| behavior·logic 점수의 LLM output shape | 팀원 type을 기준으로 adapter 작성 | E/C |

## Resolved Decisions

| Decision | Resolution |
| --- | --- |
| 이력서 개인화 질문의 최종 점수 반영 | 공통 질문과 동일하게 `SCORING`으로 총점에 포함 |
| 꼬리질문 제한 시간 | 면접 세션의 `answerTimeSec`와 동일 |
| 기준 충족 결과 사용 | AI 선별 추천에 사용, 발표용 정책에서 `INCOMPLETE -> FAIL`; 점수 NULL과 실제 application 상태는 유지 |
| 기본 profile weight | `JOB_TECHNICAL=30`, `COLLABORATION_COMMUNICATION=30`, `PROBLEM_SOLVING=40`; 면접관 수정 가능, 합계 100 |
| canonical profile ID | 팀원 브랜치 기준 `JOB_TECHNICAL`, `COLLABORATION_COMMUNICATION`, `PROBLEM_SOLVING`; 기존 ID는 migration compatibility mapping |
| incomplete 발표 정책 | score/threshold는 NULL/INCOMPLETE 유지, AI decision만 임시 FAIL, application 상태 미변경 |

## Pre-implementation Checklist

- [ ] 팀원 evaluator input/output type 확보
- [ ] behavior ID와 logic structure ID 대조
- [ ] 다중 profile 평가 호출 단위 확정
- [x] 공통 질문과 개인화 질문의 score contribution 승인
- [x] follow-up 제한 시간 source 승인
- [ ] follow-up parent linkage 상세 계약 승인
- [ ] threshold result와 application 상태 전이 시점 승인
- [ ] API/enums/error contract 정본 수정
- [ ] architecture/data model 정본 수정
- [ ] forward-only migration 설계
- [ ] adapter와 persistence 테스트 case 먼저 작성
