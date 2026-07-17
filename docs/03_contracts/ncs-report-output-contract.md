# NCS Recruiting Report Output Contract

## 1. Purpose

이 문서는 NCS 평가 생산자와 기업 면접 리포트 구현 팀 사이의 인수인계 계약이다. 리포트 팀은 평가·DB migration이 완료되기 전에도 이 문서의 DTO와 fixture를 기준으로 화면과 조회 adapter를 병렬 구현할 수 있다.

- Producer: NCS 평가 worker, report 집계 service, API-020 projection
- Consumer: 기업 지원자 평가 상세와 면접 리포트 UI/API
- Endpoint: `GET /api/v1/company/applicants/{applicantId}/evaluation`
- Response location: `data.report.ncsEvaluation`
- Schema version: `ncs-report-evaluation-output-v1`
- Scoring version: `NCS_RECRUITING_SCORING_V1`
- Temporary decision policy: `NCS_INCOMPLETE_AS_FAIL_DEMO_V1`

점수 계산과 판정의 정본은 [`ncs-final-evaluation.md`](./ncs-final-evaluation.md)다. 이 문서는 계산 결과를 리포트에 전달하는 형태를 정본으로 정의한다.

## 2. Producer And Consumer Boundary

평가 생산자가 책임지는 값:

- profile별 행동·논리·base·effective score
- profile 평균, 가중치, 가중 점수와 총점
- 평가 완료 여부, threshold result, AI decision과 사유
- base/follow-up 근거 quote와 source answer ID
- 평가·점수·decision policy version
- 강점·보완점 finding과 근거 연결

리포트 팀이 책임지는 일:

- 전달된 값의 배치, 시각화와 접근성
- PASS, FAIL, INCOMPLETE 표시 구분
- profile, 질문, 근거 상세 탐색 UX
- 로딩·없음·실패 상태

리포트 팀이 하면 안 되는 일:

- profile 평균, 가중 점수, 총점 또는 PASS/FAIL 재계산
- NULL 점수를 0으로 치환
- 질문 문구에서 profile 추측
- AI decision을 실제 `screeningDecision`으로 자동 저장
- frontend에서 평가 관련 DB table을 직접 조합
- 이력서/JD 원문, 전체 transcript, prompt 또는 내부 chain-of-thought 노출

## 3. Canonical TypeScript Shape

```ts
type NcsReportProfileId =
  | "JOB_TECHNICAL"
  | "COLLABORATION_COMMUNICATION"
  | "PROBLEM_SOLVING";

type NcsQuestionMode =
  | "EXPERIENCE_BEHAVIOR"
  | "TECHNICAL_KNOWLEDGE"
  | "SITUATIONAL_DESIGN";

type NcsScoreStatus =
  | "SCORED"
  | "INSUFFICIENT_INPUT"
  | "LOW_ALIGNMENT"
  | "BLOCKED";

type NcsThresholdResult =
  | "MEETS_THRESHOLD"
  | "BELOW_THRESHOLD"
  | "INCOMPLETE";

type NcsIncompleteReasonCode =
  | "MINIMUM_QUESTION_COUNT_NOT_MET"
  | "INSUFFICIENT_INPUT"
  | "LOW_ALIGNMENT"
  | "GUARDRAIL_BLOCKED"
  | "STT_UNAVAILABLE"
  | "SESSION_SNAPSHOT_MISSING"
  | "UNSUPPORTED_PROFILE_VERSION"
  | "EVIDENCE_SOURCE_INVALID"
  | "FOLLOW_UP_LINK_INVALID";

type NcsDecisionReasonCode =
  | "THRESHOLD_MET"
  | "OVERALL_SCORE_BELOW_THRESHOLD"
  | "PROFILE_SCORE_BELOW_THRESHOLD"
  | "EVALUATION_INCOMPLETE";

type NcsFollowUpAnswerStatus =
  | "NOT_ANSWERED"
  | "NOT_RECOVERED"
  | "PARTIALLY_RECOVERED"
  | "RECOVERED";

interface NcsReportEvaluationOutputV1 {
  schemaVersion: "ncs-report-evaluation-output-v1";
  report: {
    reportId: number;
    applicationId: number;
    sessionId: number;
    reportStatus: "COMPLETED";
    generatedAt: string | null;
  };
  policy: {
    scoringVersion: "NCS_RECRUITING_SCORING_V1";
    decisionPolicyVersion: string;
    scoreScale: 5;
    overallPassScore: 80;
    profileMinimumAverageScore: 3;
    requiredQuestionCountPerProfile: 2;
  };
  result: {
    completionStatus: "COMPLETE" | "INCOMPLETE";
    thresholdResult: NcsThresholdResult;
    aiDecision: "PASS" | "FAIL";
    decisionReasonCode: NcsDecisionReasonCode;
    totalScore: number | null;
  };
  profiles: NcsReportProfileScoreV1[];
  questions: NcsReportQuestionEvaluationV1[];
  evidences: NcsReportEvidenceV1[];
  findings: NcsReportFindingV1[];
  incompleteReasons: NcsReportIncompleteReasonV1[];
  notices: NcsReportNoticeV1[];
}

interface NcsReportProfileScoreV1 {
  ncsProfileId: NcsReportProfileId;
  profileOrder: 1 | 2 | 3;
  displayName: string;
  status: "SCORED" | "INCOMPLETE";
  averageScore: number | null;
  normalizedScore: number | null;
  weight: number;
  weightedScore: number | null;
  minimumAverageScore: 3;
  assignedQuestionCount: number;
  validQuestionCount: number;
  requiredQuestionCount: 2;
  findingIds: string[];
}

interface NcsReportQuestionEvaluationV1 {
  sessionQuestionId: number;
  runtimeQuestionId: number;
  questionSource: "JD_CRITERIA" | "RESUME_PERSONALIZED";
  questionText: string;
  questionMode: NcsQuestionMode;
  sortOrder: number;
  baseAnswerId: number | null;
  profileEvaluations: NcsReportQuestionProfileEvaluationV1[];
  followUp: NcsReportFollowUpV1 | null;
}

interface NcsReportQuestionProfileEvaluationV1 {
  ncsEvaluationId: number | null;
  ncsProfileId: NcsReportProfileId;
  scoreStatus: NcsScoreStatus;
  behaviorPoints: number | null;
  logicPoints: number | null;
  baseScore: number | null;
  effectiveScore: number | null;
  followUpApplied: boolean;
  confidence: "HIGH" | "MEDIUM" | "LOW" | null;
  rationale: string | null;
  evidenceIds: number[];
  incompleteReasonCodes: NcsIncompleteReasonCode[];
}

interface NcsReportFollowUpV1 {
  followUpQuestionId: number;
  followUpAnswerId: number | null;
  questionText: string;
  answerTimeSec: number;
  answerStatus: NcsFollowUpAnswerStatus;
}

interface NcsReportEvidenceV1 {
  evidenceId: number;
  ncsEvaluationId: number;
  ncsProfileId: NcsReportProfileId;
  sessionQuestionId: number;
  sourceAnswerId: number;
  sourceKind: "BASE" | "FOLLOW_UP";
  quote: string;
  sortOrder: number;
}

interface NcsReportFindingV1 {
  findingId: string;
  type: "STRENGTH" | "GAP";
  ncsProfileId: NcsReportProfileId;
  title: string;
  detail: string;
  evidenceIds: number[];
  generationMode: "DETERMINISTIC" | "GUARDRAILED_AI";
}

interface NcsReportIncompleteReasonV1 {
  code: NcsIncompleteReasonCode;
  message: string;
  ncsProfileId: NcsReportProfileId | null;
  sessionQuestionId: number | null;
  answerId: number | null;
  retryable: boolean;
}

interface NcsReportNoticeV1 {
  code: "NCS_EVALUATION_SCOPE" | "INCOMPLETE_FAIL_CLOSED";
  message: string;
}
```

## 4. Required Field Rules

- 위 interface의 필드는 모두 required다. 값이 없을 수 있는 필드만 명시적으로 `null`을 사용한다.
- 배열은 데이터가 없으면 `[]`이며 `null`로 반환하지 않는다.
- `0`은 유효한 점수다. truthy 검사로 숨기지 않는다.
- `generatedAt`은 ISO 8601 문자열 또는 `null`이다.
- profile 표시 순서는 `JOB_TECHNICAL`, `COLLABORATION_COMMUNICATION`, `PROBLEM_SOLVING`이다.
- `averageScore`는 소수 둘째 자리까지, `normalizedScore`는 `round(averageScore * 20)` 정수다.
- `weightedScore`는 소수 둘째 자리까지, `totalScore`는 세 weighted score 합을 반올림한 정수다.
- `completionStatus=INCOMPLETE`이면 `thresholdResult=INCOMPLETE`, `totalScore=null`이다.
- 임시 정책에서 `INCOMPLETE`여도 `aiDecision=FAIL`이며 `decisionReasonCode=EVALUATION_INCOMPLETE`다.
- profile에 required 평가 미완료가 있으면 해당 profile의 `status=INCOMPLETE`와 점수 3개를 NULL로 둔다.
- `STT_UNAVAILABLE` 답변은 답변별 `scoreStatus=INSUFFICIENT_INPUT`으로 저장하되 행동, 논리, base, effective 점수와 evidence는 모두 NULL/빈 배열이다.
- 같은 답변의 최종 `incompleteReasons`에는 `STT_UNAVAILABLE`만 노출하고 파생된 일반 `INSUFFICIENT_INPUT`을 중복 추가하지 않는다. reason은 `answerId`, `sessionQuestionId`, `ncsProfileId`와 실제 인식 실패 사유를 포함한다.
- `STT_UNAVAILABLE_TEMP_ZERO` rubric과 가짜 0점 `ReportScore`는 신규 생성하지 않는다. 과거 행은 조회 호환만 유지하며 NCS 최종 집계 입력으로 재저장하지 않는다.
- STT provider 실패와 timeout은 인식 불가 판정이 아니다. `ai_process_logs`의 별도 실패 상태로 유지하며 `STT_UNAVAILABLE`로 변환하지 않는다.
- 다른 profile이 완전하면 해당 profile 점수는 유지할 수 있지만 전체 `totalScore`는 NULL이다.
- `aiDecision`은 AI 추천이며 실제 `screeningDecision`과 다른 필드다.

## 5. Evidence And Narrative Rules

- `evidences.quote`는 답변에서 검증된 exact quote이며 리포트 UI가 내용을 수정하거나 요약하지 않는다.
- 전체 transcript가 필요하면 별도 권한 API를 사용한다. 이 output에는 포함하지 않는다.
- finding은 반드시 하나 이상의 evidence ID를 가져야 한다. 근거 없는 finding은 저장·응답하지 않는다.
- `GUARDRAILED_AI` finding은 guardrail 통과 후에만 최종 output에 포함한다.
- 리포트 UI는 `rationale`과 finding을 표시할 수 있지만 이를 다시 AI에 보내 새 점수를 만들지 않는다.
- `NCS_EVALUATION_SCOPE` notice는 항상 포함한다.
- `INCOMPLETE_FAIL_CLOSED` notice는 임시 incomplete-as-fail 정책이 적용된 경우에만 포함한다.

권장 고정 안내문:

```text
AI는 답변의 논리 구조와 NCS 행동 근거를 평가합니다. 기술적 사실 여부와 실제 경험의 진위는 확정하지 않으며 면접관 검토가 필요합니다.
```

## 6. Database Source Mapping

리포트 팀은 아래 table을 직접 조회하지 않는다. API projection builder가 정본 데이터를 조합해 `NcsReportEvaluationOutputV1`을 만든다.

| Output | Canonical source | Required producer-side storage |
| --- | --- | --- |
| report IDs/status/generatedAt | `evaluation_reports` | 기존 식별자·상태·생성 시각 |
| threshold/AI decision/version | `evaluation_reports` | `ncs_threshold_result`, `ncs_ai_decision`, `ncs_decision_reason_code`, `ncs_scoring_version`, `ncs_decision_policy_version` |
| totalScore | `evaluation_reports.total_score` | incomplete면 NULL |
| profile average/weight/count | `report_scores` | `ncs_profile_id`, `average_score`, `normalized_score`, `weight`, `weighted_score`, `minimum_average_score`, `assigned_question_count`, `valid_question_count` |
| question/source/mode/order | `interview_session_questions` | 세션 불변 질문 snapshot |
| question profile binding | `session_question_ncs_bindings` | canonical profile, criterion, version, alignment snapshot |
| answer profile score | `ncs_answer_evaluations` | behavior/logic/base/effective score, status, confidence, rationale |
| follow-up | `follow_up_questions`, `interview_answers` | parent base answer, follow-up answer, same mode, answer time snapshot |
| exact evidence | `ncs_answer_evaluation_evidences` | evaluation ID, source answer ID/kind, quote, sort order |
| findings/notices | `evaluation_reports.ncs_summary_json` | display snapshot only, score 정본으로 사용 금지 |

추천 storage 방향은 다음과 같으며 우리 NE-M1/NE-M6 구현 범위에 포함한다.

1. 정규화된 evaluation/score/evidence row를 점수 정본으로 유지한다.
2. `evaluation_reports.ncs_summary_json`은 findings/notices를 고정하는 display snapshot으로만 사용한다.
3. API service가 정규화 row와 snapshot을 조합한다.
4. 리포트 frontend와 report 문장 생성기는 DB 구조를 알지 않는다.
5. `ai_process_logs.output_ref`에는 전체 리포트를 넣지 않고 `reportId`, `schemaVersion`, 결과 상태 참조만 기록한다.

## 7. API Projection

API-020 응답은 기존 report 필드와 호환되며 NCS report에서 다음 field를 추가한다.

```ts
type ApplicantEvaluationReport = {
  reportId: number;
  status: string;
  totalScore: number | null;
  summary: string | null;
  generatedAt: string | null;
  scores: unknown[];
  ncsEvaluation: NcsReportEvaluationOutputV1 | null;
};
```

- NCS 평가가 준비되지 않았으면 `ncsEvaluation=null`이다.
- NCS 평가가 완료됐지만 불완전하면 `ncsEvaluation` 객체를 반환하고 그 내부에서 `INCOMPLETE`를 표현한다.
- 기존 `ncsAnswerEvaluations`는 migration 기간에만 compatibility projection으로 유지한다.
- 신규 리포트 UI는 `ncsEvaluation`을 우선 사용한다.
- breaking field 변경은 기존 V1을 수정하지 않고 `ncs-report-evaluation-output-v2`를 만든다.

## 8. Complete PASS Fixture

아래 fixture는 질문 3개가 profile 두 개씩 평가되어 각 profile의 최소 2문항을 충족하는 예시다.

```json
{
  "schemaVersion": "ncs-report-evaluation-output-v1",
  "report": {
    "reportId": 501,
    "applicationId": 101,
    "sessionId": 301,
    "reportStatus": "COMPLETED",
    "generatedAt": "2026-07-14T12:00:00.000Z"
  },
  "policy": {
    "scoringVersion": "NCS_RECRUITING_SCORING_V1",
    "decisionPolicyVersion": "NCS_INCOMPLETE_AS_FAIL_DEMO_V1",
    "scoreScale": 5,
    "overallPassScore": 80,
    "profileMinimumAverageScore": 3,
    "requiredQuestionCountPerProfile": 2
  },
  "result": {
    "completionStatus": "COMPLETE",
    "thresholdResult": "MEETS_THRESHOLD",
    "aiDecision": "PASS",
    "decisionReasonCode": "THRESHOLD_MET",
    "totalScore": 84
  },
  "profiles": [
    {
      "ncsProfileId": "JOB_TECHNICAL",
      "profileOrder": 1,
      "displayName": "기술·직무",
      "status": "SCORED",
      "averageScore": 4.5,
      "normalizedScore": 90,
      "weight": 30,
      "weightedScore": 27,
      "minimumAverageScore": 3,
      "assignedQuestionCount": 2,
      "validQuestionCount": 2,
      "requiredQuestionCount": 2,
      "findingIds": ["strength-job-1"]
    },
    {
      "ncsProfileId": "COLLABORATION_COMMUNICATION",
      "profileOrder": 2,
      "displayName": "협업·의사소통",
      "status": "SCORED",
      "averageScore": 3.5,
      "normalizedScore": 70,
      "weight": 30,
      "weightedScore": 21,
      "minimumAverageScore": 3,
      "assignedQuestionCount": 2,
      "validQuestionCount": 2,
      "requiredQuestionCount": 2,
      "findingIds": ["gap-communication-1"]
    },
    {
      "ncsProfileId": "PROBLEM_SOLVING",
      "profileOrder": 3,
      "displayName": "문제 해결력",
      "status": "SCORED",
      "averageScore": 4.5,
      "normalizedScore": 90,
      "weight": 40,
      "weightedScore": 36,
      "minimumAverageScore": 3,
      "assignedQuestionCount": 2,
      "validQuestionCount": 2,
      "requiredQuestionCount": 2,
      "findingIds": []
    }
  ],
  "questions": [
    {
      "sessionQuestionId": 701,
      "runtimeQuestionId": 9001,
      "questionSource": "JD_CRITERIA",
      "questionText": "장애 원인을 분석하고 기술 대안을 선택한 경험을 설명해 주세요.",
      "questionMode": "EXPERIENCE_BEHAVIOR",
      "sortOrder": 1,
      "baseAnswerId": 801,
      "profileEvaluations": [
        {
          "ncsEvaluationId": 1001,
          "ncsProfileId": "JOB_TECHNICAL",
          "scoreStatus": "SCORED",
          "behaviorPoints": 3,
          "logicPoints": 1,
          "baseScore": 4,
          "effectiveScore": 4,
          "followUpApplied": false,
          "confidence": "HIGH",
          "rationale": "기술 선택과 검증 근거가 확인되었습니다.",
          "evidenceIds": [2001],
          "incompleteReasonCodes": []
        },
        {
          "ncsEvaluationId": 1002,
          "ncsProfileId": "PROBLEM_SOLVING",
          "scoreStatus": "SCORED",
          "behaviorPoints": 2,
          "logicPoints": 2,
          "baseScore": 4,
          "effectiveScore": 4,
          "followUpApplied": false,
          "confidence": "HIGH",
          "rationale": "원인 분석과 대안 비교가 확인되었습니다.",
          "evidenceIds": [2002],
          "incompleteReasonCodes": []
        }
      ],
      "followUp": null
    },
    {
      "sessionQuestionId": 702,
      "runtimeQuestionId": 9002,
      "questionSource": "RESUME_PERSONALIZED",
      "questionText": "Redis 적용 이유를 팀에 설명하고 합의한 과정을 설명해 주세요.",
      "questionMode": "TECHNICAL_KNOWLEDGE",
      "sortOrder": 2,
      "baseAnswerId": 802,
      "profileEvaluations": [
        {
          "ncsEvaluationId": 1003,
          "ncsProfileId": "JOB_TECHNICAL",
          "scoreStatus": "SCORED",
          "behaviorPoints": 3,
          "logicPoints": 2,
          "baseScore": 5,
          "effectiveScore": 5,
          "followUpApplied": false,
          "confidence": "HIGH",
          "rationale": "원리, 적용과 위험 검증이 모두 확인되었습니다.",
          "evidenceIds": [2003],
          "incompleteReasonCodes": []
        },
        {
          "ncsEvaluationId": 1004,
          "ncsProfileId": "COLLABORATION_COMMUNICATION",
          "scoreStatus": "SCORED",
          "behaviorPoints": 2,
          "logicPoints": 2,
          "baseScore": 4,
          "effectiveScore": 4,
          "followUpApplied": false,
          "confidence": "MEDIUM",
          "rationale": "설명과 의견 조율 근거가 확인되었습니다.",
          "evidenceIds": [2004],
          "incompleteReasonCodes": []
        }
      ],
      "followUp": null
    },
    {
      "sessionQuestionId": 703,
      "runtimeQuestionId": 9003,
      "questionSource": "RESUME_PERSONALIZED",
      "questionText": "협업 중 의견 충돌을 해결하고 결과를 검증한 경험을 설명해 주세요.",
      "questionMode": "EXPERIENCE_BEHAVIOR",
      "sortOrder": 3,
      "baseAnswerId": 803,
      "profileEvaluations": [
        {
          "ncsEvaluationId": 1005,
          "ncsProfileId": "COLLABORATION_COMMUNICATION",
          "scoreStatus": "SCORED",
          "behaviorPoints": 1,
          "logicPoints": 1,
          "baseScore": 2,
          "effectiveScore": 3,
          "followUpApplied": true,
          "confidence": "MEDIUM",
          "rationale": "꼬리답변에서 합의 확인 근거가 보완되었습니다.",
          "evidenceIds": [2005, 2006],
          "incompleteReasonCodes": []
        },
        {
          "ncsEvaluationId": 1006,
          "ncsProfileId": "PROBLEM_SOLVING",
          "scoreStatus": "SCORED",
          "behaviorPoints": 3,
          "logicPoints": 2,
          "baseScore": 5,
          "effectiveScore": 5,
          "followUpApplied": false,
          "confidence": "HIGH",
          "rationale": "분석, 대안과 결과 검증이 모두 확인되었습니다.",
          "evidenceIds": [2007],
          "incompleteReasonCodes": []
        }
      ],
      "followUp": {
        "followUpQuestionId": 3001,
        "followUpAnswerId": 804,
        "questionText": "상대가 합의 내용을 이해했는지 어떻게 확인했나요?",
        "answerTimeSec": 90,
        "answerStatus": "PARTIALLY_RECOVERED"
      }
    }
  ],
  "evidences": [
    { "evidenceId": 2001, "ncsEvaluationId": 1001, "ncsProfileId": "JOB_TECHNICAL", "sessionQuestionId": 701, "sourceAnswerId": 801, "sourceKind": "BASE", "quote": "로그와 지표를 비교해 병목 구간을 확인했습니다.", "sortOrder": 1 },
    { "evidenceId": 2002, "ncsEvaluationId": 1002, "ncsProfileId": "PROBLEM_SOLVING", "sessionQuestionId": 701, "sourceAnswerId": 801, "sourceKind": "BASE", "quote": "세 가지 대안의 복구 시간과 위험을 비교했습니다.", "sortOrder": 1 },
    { "evidenceId": 2003, "ncsEvaluationId": 1003, "ncsProfileId": "JOB_TECHNICAL", "sessionQuestionId": 702, "sourceAnswerId": 802, "sourceKind": "BASE", "quote": "TTL과 장애 시 fallback을 함께 검증했습니다.", "sortOrder": 1 },
    { "evidenceId": 2004, "ncsEvaluationId": 1004, "ncsProfileId": "COLLABORATION_COMMUNICATION", "sessionQuestionId": 702, "sourceAnswerId": 802, "sourceKind": "BASE", "quote": "비개발 직군에는 응답 지연 영향으로 설명했습니다.", "sortOrder": 1 },
    { "evidenceId": 2005, "ncsEvaluationId": 1005, "ncsProfileId": "COLLABORATION_COMMUNICATION", "sessionQuestionId": 703, "sourceAnswerId": 803, "sourceKind": "BASE", "quote": "각자의 우려를 표로 정리했습니다.", "sortOrder": 1 },
    { "evidenceId": 2006, "ncsEvaluationId": 1005, "ncsProfileId": "COLLABORATION_COMMUNICATION", "sessionQuestionId": 703, "sourceAnswerId": 804, "sourceKind": "FOLLOW_UP", "quote": "회의 후 결정 사항을 다시 확인받았습니다.", "sortOrder": 2 },
    { "evidenceId": 2007, "ncsEvaluationId": 1006, "ncsProfileId": "PROBLEM_SOLVING", "sessionQuestionId": 703, "sourceAnswerId": 803, "sourceKind": "BASE", "quote": "적용 후 오류율을 일주일 동안 비교했습니다.", "sortOrder": 1 }
  ],
  "findings": [
    {
      "findingId": "strength-job-1",
      "type": "STRENGTH",
      "ncsProfileId": "JOB_TECHNICAL",
      "title": "기술 선택과 검증 근거가 구체적입니다.",
      "detail": "원리, 적용 방식과 장애 위험 검증을 답변 근거로 확인했습니다.",
      "evidenceIds": [2001, 2003],
      "generationMode": "DETERMINISTIC"
    },
    {
      "findingId": "gap-communication-1",
      "type": "GAP",
      "ncsProfileId": "COLLABORATION_COMMUNICATION",
      "title": "합의 확인 과정은 추가 검토가 필요합니다.",
      "detail": "꼬리답변으로 보완됐지만 다른 답변에서도 반복 확인이 필요합니다.",
      "evidenceIds": [2005, 2006],
      "generationMode": "GUARDRAILED_AI"
    }
  ],
  "incompleteReasons": [],
  "notices": [
    {
      "code": "NCS_EVALUATION_SCOPE",
      "message": "AI는 답변의 논리 구조와 NCS 행동 근거를 평가합니다. 기술적 사실 여부와 실제 경험의 진위는 확정하지 않으며 면접관 검토가 필요합니다."
    }
  ]
}
```

## 9. Additional Required Fixtures

리포트 팀은 위 PASS fixture 외에 아래 두 fixture를 같은 shape로 작성한다.

### Complete FAIL

- `completionStatus=COMPLETE`
- 총점 80 미만 또는 profile 하나의 `averageScore < 3`
- `thresholdResult=BELOW_THRESHOLD`
- `aiDecision=FAIL`
- `totalScore`는 실제 숫자
- `decisionReasonCode`는 원인에 따라 `OVERALL_SCORE_BELOW_THRESHOLD` 또는 `PROFILE_SCORE_BELOW_THRESHOLD`
- `incompleteReasons=[]`

### Incomplete Fail-closed

- `completionStatus=INCOMPLETE`
- `thresholdResult=INCOMPLETE`
- `aiDecision=FAIL`
- `decisionReasonCode=EVALUATION_INCOMPLETE`
- `totalScore=null`
- incomplete profile의 평균·정규화·가중 점수는 NULL
- 해당 question profile evaluation의 0~5 점수는 모두 NULL
- `incompleteReasons`에 구조화 사유 포함
- `INCOMPLETE_FAIL_CLOSED` notice 포함
- 화면은 `0점`이 아니라 `점수 산정 불가`와 임시 불합격 사유를 표시

## 10. Consumer Acceptance Criteria

- V1 shape만으로 backend DB 없이 PASS/FAIL/INCOMPLETE 화면을 개발할 수 있다.
- 리포트 UI는 점수를 재계산하지 않고 전달값을 표시한다.
- 총점 0과 NULL을 구분한다.
- profile 두 개가 연결된 질문을 중복 질문으로 렌더링하지 않는다.
- base와 follow-up evidence 출처를 구분한다.
- incomplete FAIL과 정상 기준 미달 FAIL을 다른 사유로 표시한다.
- AI decision과 면접관 screening decision을 같은 값으로 취급하지 않는다.
- evidence ID가 없는 finding을 표시하지 않는다.
- 전체 transcript, 이력서 원문과 내부 prompt를 노출하지 않는다.
- mobile/desktop에서 긴 질문, 긴 finding과 quote가 겹치거나 잘리지 않는다.

## 11. Producer Acceptance Criteria

- API-020이 `data.report.ncsEvaluation`에 V1 output을 반환한다.
- API-031 완료 시 동일 V1 output을 재구성할 수 있는 정규화 row와 summary snapshot을 저장한다.
- `INCOMPLETE`를 0점으로 바꾸지 않는다.
- DB의 legacy profile ID는 API projection 전에 canonical ID로 변환한다.
- output의 모든 evidence ID와 finding evidence ID가 유효하다.
- profile별 assigned/valid count와 question evaluation cardinality가 일치한다.
- `ai_process_logs.output_ref`에는 전체 평가·quote·transcript를 저장하지 않는다.
- contract fixture와 실제 projection을 비교하는 contract test를 둔다.

## 12. V2 Evolution Boundary

이 문서의 V1 shape는 `NCS_3_PROFILE_V1` 전용이며 profile 3개와 `requiredQuestionCount=2` 의미를 유지한다. `NCS_ACTIVE_PROFILE_V2`는 활성 profile 1~3개, profile별 BASE 최소 1개와 비활성 score card 제외를 표현해야 하므로 다음 원칙으로 `ncs-report-evaluation-output-v2`를 별도 추가한다.

- V1 응답, fixture, 완료 session/report를 수정하거나 재계산하지 않는다.
- V2 `profiles[]`에는 세션 policy snapshot에 존재하는 활성 profile만 포함한다.
- V2 required count는 session snapshot의 `required_question_count`를 반환한다.
- 비활성 profile의 0점/NULL placeholder row를 만들지 않는다.
- total과 threshold는 [`ncs-active-profile-demo-preset-foundation.md`](./ncs-active-profile-demo-preset-foundation.md)의 active-only 공식을 사용한다.
- frontend는 `schemaVersion`으로 V1/V2를 분기하고 어느 버전도 재계산하지 않는다.
