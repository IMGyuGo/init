export type NcsReportProfileId =
  | "JOB_TECHNICAL"
  | "COLLABORATION_COMMUNICATION"
  | "PROBLEM_SOLVING";

export type NcsQuestionMode =
  | "EXPERIENCE_BEHAVIOR"
  | "TECHNICAL_KNOWLEDGE"
  | "SITUATIONAL_DESIGN";

export type NcsScoreStatus = "SCORED" | "INSUFFICIENT_INPUT" | "LOW_ALIGNMENT" | "BLOCKED";

export type NcsThresholdResult = "MEETS_THRESHOLD" | "BELOW_THRESHOLD" | "INCOMPLETE";

export type NcsIncompleteReasonCode =
  | "MINIMUM_QUESTION_COUNT_NOT_MET"
  | "INSUFFICIENT_INPUT"
  | "LOW_ALIGNMENT"
  | "GUARDRAIL_BLOCKED"
  | "STT_UNAVAILABLE"
  | "SESSION_SNAPSHOT_MISSING"
  | "UNSUPPORTED_PROFILE_VERSION"
  | "EVIDENCE_SOURCE_INVALID"
  | "FOLLOW_UP_LINK_INVALID";

export type NcsDecisionReasonCode =
  | "THRESHOLD_MET"
  | "OVERALL_SCORE_BELOW_THRESHOLD"
  | "PROFILE_SCORE_BELOW_THRESHOLD"
  | "EVALUATION_INCOMPLETE";

export type NcsFollowUpAnswerStatus =
  | "NOT_ANSWERED"
  | "NOT_RECOVERED"
  | "PARTIALLY_RECOVERED"
  | "RECOVERED";

export type NcsReportEvaluationOutputV1 = {
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
};

export type NcsReportProfileScoreV2 = Omit<NcsReportProfileScoreV1, "requiredQuestionCount"> & {
  requiredQuestionCount: number;
};

export type NcsReportEvaluationOutputV2 = Omit<
  NcsReportEvaluationOutputV1,
  "schemaVersion" | "policy" | "profiles"
> & {
  schemaVersion: "ncs-report-evaluation-output-v2";
  policy: {
    evaluationFramework: "NCS_ACTIVE_PROFILE_V2";
    scoringVersion: "NCS_RECRUITING_SCORING_V2";
    decisionPolicyVersion: string;
    scoreScale: 5;
    overallPassScore: 80;
    profileMinimumAverageScore: 3;
    activeProfileCount: number;
  };
  profiles: NcsReportProfileScoreV2[];
};

export type NcsReportEvaluationOutput = NcsReportEvaluationOutputV1 | NcsReportEvaluationOutputV2;

export type NcsReportProfileScoreV1 = {
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
};

export type NcsReportQuestionEvaluationV1 = {
  sessionQuestionId: number;
  runtimeQuestionId: number;
  questionSource: "JD_CRITERIA" | "RESUME_PERSONALIZED";
  questionText: string;
  questionMode: NcsQuestionMode;
  sortOrder: number;
  baseAnswerId: number | null;
  profileEvaluations: NcsReportQuestionProfileEvaluationV1[];
  followUp: NcsReportFollowUpV1 | null;
};

export type NcsReportQuestionProfileEvaluationV1 = {
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
};

export type NcsReportFollowUpV1 = {
  followUpQuestionId: number;
  followUpAnswerId: number | null;
  questionText: string;
  answerTimeSec: number;
  answerStatus: NcsFollowUpAnswerStatus;
};

export type NcsReportEvidenceV1 = {
  evidenceId: number;
  ncsEvaluationId: number;
  ncsProfileId: NcsReportProfileId;
  sessionQuestionId: number;
  sourceAnswerId: number;
  sourceKind: "BASE" | "FOLLOW_UP";
  quote: string;
  sortOrder: number;
};

export type NcsReportFindingV1 = {
  findingId: string;
  type: "STRENGTH" | "GAP";
  ncsProfileId: NcsReportProfileId;
  title: string;
  detail: string;
  evidenceIds: number[];
  generationMode: "DETERMINISTIC" | "GUARDRAILED_AI";
};

export type NcsReportIncompleteReasonV1 = {
  code: NcsIncompleteReasonCode;
  message: string;
  ncsProfileId: NcsReportProfileId | null;
  sessionQuestionId: number | null;
  answerId: number | null;
  retryable: boolean;
};

export type NcsReportNoticeV1 = {
  code: "NCS_EVALUATION_SCOPE" | "INCOMPLETE_FAIL_CLOSED";
  message: string;
};
