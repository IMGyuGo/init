# NCS Active Profile V2 Report Output Contract

## 1. Purpose

이 문서는 `NCS_ACTIVE_PROFILE_V2` 세션의 active-only 평가 결과를 API-020과 리포트 UI에 전달하는 계약이다. 기존 [`ncs-report-output-contract.md`](./ncs-report-output-contract.md)의 `ncs-report-evaluation-output-v1` 의미와 fixture는 변경하지 않는다.

- Schema version: `ncs-report-evaluation-output-v2`
- Evaluation framework: `NCS_ACTIVE_PROFILE_V2`
- Scoring version: `NCS_RECRUITING_SCORING_V2`
- Decision policy: `NCS_INCOMPLETE_AS_FAIL_DEMO_V1`
- Producer: NCS worker, report aggregation service, API-020 projection
- Consumer: 기업 지원자 평가 상세와 리포트 UI

## 2. Active-only Rules

- 활성 profile 정본은 평가 시점의 공고 설정이 아니라 `interview_session_ncs_policies` snapshot이다.
- snapshot에는 `weight > 0`인 canonical profile 1~3개만 존재하며 weight 합계는 100이다.
- `profiles[]`, 답변별 평가 row, `report_scores`에는 snapshot의 활성 profile만 포함한다.
- 비활성 profile placeholder나 0점/NULL score card를 만들지 않는다.
- profile별 유효 scoring BASE 최소 문항 수는 snapshot의 `requiredQuestionCount`이며 V2 신규 snapshot은 1이다.
- follow-up은 문항 수에 포함하지 않고 원본 BASE의 evidence와 `effectiveScore` 보강에만 사용한다.
- 활성 profile 하나라도 평가할 수 없으면 `completionStatus=INCOMPLETE`, `thresholdResult=INCOMPLETE`, `totalScore=null`이다.
- `INCOMPLETE`를 0점으로 치환하지 않는다.

## 3. Scoring

```text
profileAverage(p) = average(valid BASE effectiveScore bound to p)
weightedProfileScore(p) = profileAverage(p) / 5 * configuredWeight(p)
totalScore = sum(weightedProfileScore for active profiles)

totalScore >= 80 AND every active profileAverage >= 3
  -> MEETS_THRESHOLD
otherwise
  -> BELOW_THRESHOLD
```

한 BASE 질문이 활성 profile 두 개에 binding되면 답변·profile별 평가 row를 각각 생성한다. 질문 점수를 총점에 직접 두 번 더하지 않고 각 profile 평균에 포함한 뒤 profile weight를 적용한다.

## 4. TypeScript Shape

V2는 V1의 question, evidence, finding, incomplete reason, notice 구조를 재사용한다. 아래에서 `NcsReportQuestionEvaluationV1` 등은 V1 계약의 동일 타입을 뜻한다.

```ts
interface NcsReportEvaluationOutputV2 {
  schemaVersion: "ncs-report-evaluation-output-v2";
  report: {
    reportId: number;
    applicationId: number;
    sessionId: number;
    reportStatus: "COMPLETED";
    generatedAt: string | null;
  };
  policy: {
    evaluationFramework: "NCS_ACTIVE_PROFILE_V2";
    scoringVersion: "NCS_RECRUITING_SCORING_V2";
    decisionPolicyVersion: string;
    scoreScale: 5;
    overallPassScore: 80;
    profileMinimumAverageScore: 3;
    activeProfileCount: 1 | 2 | 3;
  };
  result: {
    completionStatus: "COMPLETE" | "INCOMPLETE";
    thresholdResult: "MEETS_THRESHOLD" | "BELOW_THRESHOLD" | "INCOMPLETE";
    aiDecision: "PASS" | "FAIL";
    decisionReasonCode:
      | "THRESHOLD_MET"
      | "OVERALL_SCORE_BELOW_THRESHOLD"
      | "PROFILE_SCORE_BELOW_THRESHOLD"
      | "EVALUATION_INCOMPLETE";
    totalScore: number | null;
  };
  profiles: NcsReportProfileScoreV2[];
  questions: NcsReportQuestionEvaluationV1[];
  evidences: NcsReportEvidenceV1[];
  findings: NcsReportFindingV1[];
  incompleteReasons: NcsReportIncompleteReasonV1[];
  notices: NcsReportNoticeV1[];
}

interface NcsReportProfileScoreV2 {
  ncsProfileId:
    | "JOB_TECHNICAL"
    | "COLLABORATION_COMMUNICATION"
    | "PROBLEM_SOLVING";
  profileOrder: 1 | 2 | 3;
  displayName: string;
  status: "SCORED" | "INCOMPLETE";
  averageScore: number | null;
  normalizedScore: number | null;
  weight: number;
  weightedScore: number | null;
  minimumAverageScore: number;
  assignedQuestionCount: number;
  validQuestionCount: number;
  requiredQuestionCount: number;
  findingIds: string[];
}
```

## 5. Persistence And Projection

- `evaluation_reports.ncs_scoring_version`은 `NCS_RECRUITING_SCORING_V2`를 저장한다.
- `evaluation_reports.ncs_summary_json.schemaVersion`은 `ncs-report-evaluation-output-v2`다.
- `report_scores`에는 활성 profile row만 저장한다.
- API-020은 `ncs_scoring_version` 또는 summary `schemaVersion`으로 V1/V2를 분기한다.
- frontend는 `schemaVersion`으로 V1/V2를 검증하고 표시하며 점수나 판정을 재계산하지 않는다.
- 기존 완료 V1 session/report를 V2로 backfill하거나 재계산하지 않는다.

## 6. Privacy And Guardrail

- 전체 transcript, 이력서·포트폴리오·JD 원문, 내부 prompt와 chain-of-thought를 output에 포함하지 않는다.
- evidence는 source answer ID가 있는 검증된 exact quote만 포함한다.
- finding은 유효 evidence ID를 최소 하나 가져야 한다.
- guardrail `PASS` 또는 `REGENERATED` 전에 최종 저장하지 않는다.

## 7. Compatibility Tests

- 활성 profile 1/2/3개에서 `profiles.length`가 snapshot cardinality와 일치한다.
- 비활성 profile 평가 row와 score card가 없다.
- dual-binding BASE 하나가 두 profile 평가 row를 만든다.
- profile별 유효 BASE 1개로 V2 complete가 가능하다.
- incomplete profile이 있으면 total은 NULL이다.
- V1은 canonical profile 정확히 3개, profile별 required 2와 기존 fixture를 유지한다.
