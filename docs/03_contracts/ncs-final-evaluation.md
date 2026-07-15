# NCS Final Recruiting Evaluation Contract

## Status

- Contract status: `APPROVED_FOR_IMPLEMENTATION`
- Scoring version: `NCS_RECRUITING_SCORING_V1`
- Temporary decision policy: `NCS_INCOMPLETE_AS_FAIL_DEMO_V1`
- Scope: 채용면접 NCS 답변 평가, 꼬리질문 보강, 역량 집계, AI 판정, 저장과 근거 추적
- Out of scope: 질문 문장 생성 알고리즘

이 문서는 채용면접 NCS 최종 평가의 정본 계약이다. 기존 준비 문서나 브랜치 구현이 이 문서와 다르면 이 문서를 우선한다.

## Canonical Decisions

| Topic | Contract |
| --- | --- |
| Personalized question data | 현재 브랜치의 application 범위 개인화 질문과 batch 구조를 유지한다. |
| Question-to-profile relation | 공통 질문과 이력서 개인화 질문 모두 profile binding을 1~2개 가진다. |
| Session immutability | 세션 시작 시 질문 본문, 출처, profile binding, mode, version, 가중치와 시간 정책을 snapshot으로 고정한다. |
| Evaluation unit | base question 하나와 연결 profile 하나의 조합마다 평가 row 하나를 만든다. 질문 하나는 profile 최대 2개를 평가할 수 있다. |
| Question score | profile별 `behaviorPoints(0..3) + logicPoints(0..2)`, 최대 5점이다. |
| Profile aggregation | profile에 연결된 유효 base question의 `effectiveScore` 평균이다. |
| Minimum coverage | 세 profile 각각 유효 base question 점수가 최소 2개여야 한다. |
| Weight | 면접 설정의 profile별 가중치를 사용하며 합계는 정확히 100이어야 한다. 자동 기본값 대체를 금지한다. |
| Final threshold | 총점 80 이상이고 세 profile 평균이 각각 3/5 이상이면 기준 충족이다. |
| Follow-up | base question당 최대 1회, 같은 question mode와 세션 `answerTimeSec`를 사용한다. |
| Incomplete evaluation | 점수는 NULL, threshold result는 `INCOMPLETE`로 유지한다. 발표용 정책에서만 AI 판정을 `FAIL`로 매핑한다. |
| Persistence | 답변·profile별 정규화 평가 row와 profile별 report score를 정본으로 사용한다. |
| Evidence | base와 follow-up을 분리하고 모든 quote에 source answer ID를 저장한다. |
| Invalid configuration | 저장·세션 확정·평가 경계에서 처리를 중단하고 명시적 오류를 반환한다. 추측이나 기본값으로 보정하지 않는다. |

## Canonical Profile IDs

팀원 브랜치의 업무 의미가 드러나는 ID를 신규 정본으로 사용한다.

| Canonical ID | Display label | Evaluator profile | Legacy/current compatibility ID |
| --- | --- | --- | --- |
| `JOB_TECHNICAL` | 기술·직무 | `digital` | `DIGITAL` |
| `COLLABORATION_COMMUNICATION` | 협업·의사소통 | `communication` | `COMMUNICATION` |
| `PROBLEM_SOLVING` | 문제 해결력 | `problem-solving` | `PROBLEM_SOLVING` |

- 신규 API와 신규 binding row는 canonical ID만 쓴다.
- 기존 `DIGITAL`, `COMMUNICATION` row는 migration에서 canonical ID로 변환한다.
- compatibility read는 migration 기간에만 허용하며 신규 write에는 legacy ID를 허용하지 않는다.
- profile metadata가 없거나 지원하지 않는 값이면 질문 문구로 profile을 추측하지 않는다.

## Question And Session Binding

```ts
type NcsQuestionBinding = {
  criterionId: number;
  criterionTitle: string;
  ncsProfileId:
    | "JOB_TECHNICAL"
    | "COLLABORATION_COMMUNICATION"
    | "PROBLEM_SOLVING";
  ncsProfileVersion: string;
  alignmentStatus: "ALIGNED" | "LOW_ALIGNMENT" | "REVIEW_REQUIRED";
  alignmentScore: number | null;
  evaluatorVersion: string | null;
};

type NcsQuestionSource = "JD_CRITERIA" | "RESUME_PERSONALIZED";
```

- 공통 질문은 공고 범위 binding을 사용한다.
- 이력서 개인화 질문은 application 범위 binding을 사용하며 다른 지원자와 공유하지 않는다.
- 세션 생성 transaction은 두 질문 출처의 binding을 `session_question_ncs_bindings`로 복사한다.
- 각 질문의 `ncsBindings` 길이는 1~2다. 0개, 3개 이상, 같은 profile 중복은 오류다.
- 세션 전체에서 각 profile에 연결된 scoring base question이 최소 2개여야 한다. 미달이면 세션 확정을 막는다.
- 세션 시작 이후 원본 질문, 평가 기준, 가중치 또는 profile version 변경은 기존 세션에 소급하지 않는다.

## Evaluation Input And Evidence Segments

평가기에는 문자열을 합쳐 출처를 지우지 않고 segment 목록을 전달한다.

```ts
type NcsAnswerSegment = {
  answerId: number;
  kind: "BASE" | "FOLLOW_UP";
  text: string;
};

type NcsProfileEvaluationInput = {
  reportId: number;
  sessionQuestionId: number;
  baseAnswerId: number;
  binding: NcsQuestionBinding;
  questionMode:
    | "EXPERIENCE_BEHAVIOR"
    | "TECHNICAL_KNOWLEDGE"
    | "SITUATIONAL_DESIGN";
  segments: NcsAnswerSegment[];
};
```

- profile, mode, version은 session snapshot만 신뢰한다.
- metadata가 누락된 과거 세션은 추측 평가하지 않고 `INCOMPLETE` 원인으로 기록한다.
- exact evidence는 `{ sourceAnswerId, sourceKind, quote }`로 저장한다.
- 동일 quote라도 base와 follow-up 출처가 다르면 별도 근거로 유지한다.

## Deterministic Scoring

LLM/evaluator는 행동 포인트, 논리 구조 포인트와 exact evidence를 반환한다. 최종 점수와 판정은 versioned deterministic 함수가 계산한다.

```text
baseScore(question, profile) = behaviorPoints(0..3) + logicPoints(0..2)
combinedScore = base + follow-up segment를 함께 평가한 0..5 점수
effectiveScore = follow-up 없음 ? baseScore : max(baseScore, combinedScore)
profileAverage = profile에 연결된 유효 effectiveScore 평균
weightedProfileScore = profileAverage / 5 * configuredWeight
totalScore = 세 weightedProfileScore의 합
```

- `behaviorPoints`, `logicPoints`, `baseScore`, `effectiveScore`는 정수다.
- 질문 하나가 profile 두 개에 연결되면 profile별 평가 row 두 개를 만든다.
- 같은 질문의 두 점수를 총점에 직접 더하지 않는다. 각 profile 평균에 한 번씩 포함한 뒤 profile weight만 적용한다.
- 공통 질문과 이력서 개인화 질문은 동일하게 `SCORING`으로 포함한다.

## Completeness And Decision

```ts
type NcsThresholdResult =
  | "MEETS_THRESHOLD"
  | "BELOW_THRESHOLD"
  | "INCOMPLETE";

type NcsAiDecision = "PASS" | "FAIL";
```

`INCOMPLETE` 조건은 다음 중 하나다.

- 세 profile 중 하나라도 유효 `SCORED` base question이 2개 미만
- required base question/profile 평가 중 `INSUFFICIENT_INPUT`, `LOW_ALIGNMENT`, `BLOCKED`가 존재
- STT 또는 답변 원문 없음
- session binding, profile, mode 또는 version snapshot 누락
- base/follow-up parent linkage 또는 evidence source가 깨짐

완전한 평가의 threshold 계산은 다음과 같다.

```text
totalScore >= 80 AND every profileAverage >= 3
  -> MEETS_THRESHOLD
otherwise
  -> BELOW_THRESHOLD
```

발표용 임시 정책 `NCS_INCOMPLETE_AS_FAIL_DEMO_V1`은 다음처럼 매핑한다.

| Threshold result | AI decision | Score persistence |
| --- | --- | --- |
| `MEETS_THRESHOLD` | `PASS` | 실제 total/profile score 저장 |
| `BELOW_THRESHOLD` | `FAIL` | 실제 total/profile score 저장 |
| `INCOMPLETE` | `FAIL` | `totalScore=NULL`, 미완료 profile score도 NULL 유지 |

- `INCOMPLETE`를 0점으로 변환하지 않는다.
- AI decision reason에 `EVALUATION_INCOMPLETE`와 구체적인 미완료 원인을 저장·노출한다.
- 이 임시 AI 판정은 `applications.screening_decision` 또는 실제 전형 상태를 자동 변경하지 않는다.
- 발표 이후 별도 milestone에서 `INCOMPLETE -> HOLD/재평가` 정책으로 교체한다.

## Follow-up Contract

- trigger: base question에 연결된 profile 중 하나라도 `baseScore < 5`인 경우
- limit: base question당 최대 1회
- mode: base question과 동일
- time limit: 세션 시작 시 snapshot한 `answerTimeSec`
- prompt input: 부족한 behavior point, 부족한 logic link, 이미 확인된 evidence
- prompt rule: 이미 확인된 내용을 다시 묻지 않는다.
- scoring: base와 follow-up segment를 함께 재평가하고 `max(baseScore, combinedScore)`만 적용한다.
- source tracking: base/follow-up answer ID와 quote를 구분한다.
- fact trigger: `CLARIFICATION_CANDIDATE | FACT_CHECK_REQUIRED`. NCS 보완과 동시에 필요하면 질문 하나로 결합하고 `FACT_CLARIFICATION` 사유를 저장한다.
- fact re-evaluation: `BASE_FOLLOW_UP_V1` 조합으로 본 답변과 꼬리답변을 합쳐 다시 검증하고 최종 fact run을 교체한다.

꼬리질문 생성·재평가는 E, 세션 타이머·답변 저장은 D, 원본 시간 정책은 C가 소유한다.

## Fact Check Boundary

답변 사실 검증은 [`ncs-answer-fact-check.md`](./ncs-answer-fact-check.md)를 정본으로 사용한다.

- NCS 5점 평가와 사실 검증은 병렬 실행한다.
- 사실 검증 결과는 `behaviorPoints`, `logicPoints`, profile 평균, 가중치, 총점 또는 PASS/FAIL을 직접 변경하지 않는다.
- 고신뢰 핵심 기술 claim의 모순은 별도 `FACT_CHECK_REQUIRED` gate로 보류하며 점수 감점으로 표현하지 않는다.
- provider 실패는 `UNVERIFIABLE`과 구분하고 NCS 평가 또는 다음 기본 질문 이동을 막지 않는다.
- 팩트 확인 꼬리질문은 M4의 private session question 삽입 경로를 사용하며 질문당 최대 1회만 허용한다.
- 합산 재검증은 NCS 점수를 직접 감점하지 않고 fact gate만 갱신한다.

## Persistence Contract

정본 저장 단위는 다음과 같다.

1. `question_ncs_bindings`: 공통 질문의 profile 1~2개 관계
2. `application_question_ncs_bindings`: 개인화 질문의 profile 1~2개 관계
3. `session_question_ncs_bindings`: 세션 시점 불변 binding snapshot
4. `ncs_answer_evaluations`: `(report_id, base_answer_id, ncs_profile_id)`별 평가 결과
5. `ncs_answer_evaluation_evidences`: source answer ID가 있는 exact evidence
6. `report_scores`: profile 평균, weight, weighted score, pass score
7. `answer_fact_check_runs`: 답변별 fact provider 실행 상태와 deterministic gate
8. `answer_fact_check_claims`: 답변 exact claim, 판정과 신뢰도
9. `answer_fact_check_evidences`: claim이 참조한 source snapshot과 offset

`ncs_answer_evaluations` 신규 점수 필드는 다음 범위를 따른다.

```text
behavior_points  0..3 nullable
logic_points     0..2 nullable
base_score       0..5 nullable
effective_score  0..5 nullable
score_status     SCORED | INSUFFICIENT_INPUT | LOW_ALIGNMENT | BLOCKED
```

- `SCORED`가 아니면 신규 점수 필드는 모두 NULL이다.
- 기존 0~100 `competency_score`, `evidence_score`, `total_score`는 상세 evaluator 진단과 migration 호환용으로 유지할 수 있지만 최종 NCS 채용 점수에는 사용하지 않는다.
- 팀원 브랜치의 report-level JSON은 조회 최적화용 snapshot으로 저장할 수 있으나 정본은 답변별 평가 row와 report score다.

## Report Output Boundary

리포트 팀에 전달하는 조회 정본은 [`ncs-report-output-contract.md`](./ncs-report-output-contract.md)의 `NcsReportEvaluationOutputV1`이다.

- API-020은 NCS 리포트에서 `data.report.ncsEvaluation`을 반환한다.
- NCS 평가 worker와 report 집계 service가 점수, 판정, 근거와 표시 snapshot을 결합해 단일 read model을 만든다.
- 리포트 frontend와 문장 생성기는 profile 평균, 가중 점수, 총점 또는 PASS/FAIL을 다시 계산하지 않는다.
- 정규화된 답변별 평가·profile 집계·근거 row가 점수 정본이며 `evaluation_reports.ncs_summary_json`은 finding과 notice를 고정하는 표시 snapshot으로만 사용한다.
- 기존 `ncsAnswerEvaluations` 응답은 migration 호환용이다. 신규 리포트 UI는 `ncsEvaluation`을 우선 소비한다.
- output에는 전체 transcript, 이력서/JD 원문, 내부 prompt 또는 chain-of-thought를 포함하지 않는다.
- `INCOMPLETE` output은 `totalScore=NULL`을 유지하며 0점으로 변환하지 않는다.

## Validation And Errors

| Boundary | Invalid case | Behavior |
| --- | --- | --- |
| Criteria save | profile weight 합계가 100이 아님, 음수·비정수 | 저장 중단, `INTERVIEW_NCS_WEIGHT_INVALID` |
| Question/binding save | binding 0개·3개 이상·중복·지원하지 않는 ID | 저장 중단, `INTERVIEW_NCS_BINDING_INVALID` |
| Session freeze | profile별 scoring base question 2개 미만 | 세션 확정 중단, `INTERVIEW_NCS_QUESTION_COVERAGE_INVALID` |
| Evaluation | 과거 session snapshot 누락 또는 지원하지 않는 version | `INCOMPLETE`, 점수 NULL, 임시 AI decision FAIL |
| Evaluation | STT/근거 부족/미정렬/guardrail 차단 | 해당 score status와 NULL 점수 저장, 전체 `INCOMPLETE` |

잘못된 설정을 기본 가중치로 조용히 대체하거나 질문 문구에서 profile을 추측하지 않는다.

## Ownership And Review

| Area | Owner | Required review |
| --- | --- | --- |
| 평가 기준 가중치와 설정 API/UI | C | E, PM |
| 개인화 질문과 application binding | C/E | D, A |
| 세션 binding/time snapshot과 최소 문항 gate | D | C, E |
| evaluator adapter, 꼬리질문, 점수·근거 저장 | E | C, D |
| Prisma migration, shared enum/error | A | C, D, E |
| AI 판정과 발표 후 incomplete 정책 교체 | PM/B | A, C, D, E |
