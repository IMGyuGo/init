import type {
  NcsReportEvaluationOutputV1,
  NcsReportProfileId,
  NcsReportQuestionProfileEvaluationV1,
} from "./ncs-report-contract";

function profileEvaluation(
  id: number,
  profileId: NcsReportProfileId,
  score: number,
  evidenceIds: number[],
  followUpApplied = false,
): NcsReportQuestionProfileEvaluationV1 {
  return {
    ncsEvaluationId: id,
    ncsProfileId: profileId,
    scoreStatus: "SCORED",
    behaviorPoints: Math.min(3, score),
    logicPoints: Math.max(0, score - 3),
    baseScore: followUpApplied ? Math.max(0, score - 1) : score,
    effectiveScore: score,
    followUpApplied,
    confidence: "HIGH",
    rationale: "답변에서 직무 행동과 판단 근거를 확인했습니다.",
    evidenceIds,
    incompleteReasonCodes: [],
  };
}

export const NCS_COMPLETE_PASS_FIXTURE: NcsReportEvaluationOutputV1 = {
  schemaVersion: "ncs-report-evaluation-output-v1",
  report: {
    reportId: 501,
    applicationId: 101,
    sessionId: 301,
    reportStatus: "COMPLETED",
    generatedAt: "2026-07-14T12:00:00.000Z",
  },
  policy: {
    scoringVersion: "NCS_RECRUITING_SCORING_V1",
    decisionPolicyVersion: "NCS_INCOMPLETE_AS_FAIL_DEMO_V1",
    scoreScale: 5,
    overallPassScore: 80,
    profileMinimumAverageScore: 3,
    requiredQuestionCountPerProfile: 2,
  },
  result: {
    completionStatus: "COMPLETE",
    thresholdResult: "MEETS_THRESHOLD",
    aiDecision: "PASS",
    decisionReasonCode: "THRESHOLD_MET",
    totalScore: 84,
  },
  profiles: [
    {
      ncsProfileId: "JOB_TECHNICAL",
      profileOrder: 1,
      displayName: "직무 수행 역량",
      status: "SCORED",
      averageScore: 4.5,
      normalizedScore: 90,
      weight: 40,
      weightedScore: 36,
      minimumAverageScore: 3,
      assignedQuestionCount: 2,
      validQuestionCount: 2,
      requiredQuestionCount: 2,
      findingIds: ["strength-tech"],
    },
    {
      ncsProfileId: "COLLABORATION_COMMUNICATION",
      profileOrder: 2,
      displayName: "협업·의사소통",
      status: "SCORED",
      averageScore: 4,
      normalizedScore: 80,
      weight: 30,
      weightedScore: 24,
      minimumAverageScore: 3,
      assignedQuestionCount: 2,
      validQuestionCount: 2,
      requiredQuestionCount: 2,
      findingIds: ["gap-collaboration"],
    },
    {
      ncsProfileId: "PROBLEM_SOLVING",
      profileOrder: 3,
      displayName: "문제 해결",
      status: "SCORED",
      averageScore: 4,
      normalizedScore: 80,
      weight: 30,
      weightedScore: 24,
      minimumAverageScore: 3,
      assignedQuestionCount: 2,
      validQuestionCount: 2,
      requiredQuestionCount: 2,
      findingIds: [],
    },
  ],
  questions: [
    {
      sessionQuestionId: 701,
      runtimeQuestionId: 601,
      questionSource: "JD_CRITERIA",
      questionText: "서비스 장애의 원인을 분석하고 복구한 경험을 구체적으로 설명해주세요.",
      questionMode: "EXPERIENCE_BEHAVIOR",
      sortOrder: 1,
      baseAnswerId: 801,
      profileEvaluations: [
        profileEvaluation(1001, "JOB_TECHNICAL", 5, [2001]),
        profileEvaluation(1002, "PROBLEM_SOLVING", 4, [2002]),
      ],
      followUp: null,
    },
    {
      sessionQuestionId: 702,
      runtimeQuestionId: 602,
      questionSource: "JD_CRITERIA",
      questionText: "캐시 정책을 설계할 때 고려한 기술적 기준과 팀 내 합의 과정을 설명해주세요.",
      questionMode: "TECHNICAL_KNOWLEDGE",
      sortOrder: 2,
      baseAnswerId: 802,
      profileEvaluations: [
        profileEvaluation(1003, "JOB_TECHNICAL", 4, [2003]),
        profileEvaluation(1004, "COLLABORATION_COMMUNICATION", 4, [2004]),
      ],
      followUp: null,
    },
    {
      sessionQuestionId: 703,
      runtimeQuestionId: 603,
      questionSource: "RESUME_PERSONALIZED",
      questionText: "의견이 다른 구성원과 해결책을 결정하고 적용 결과를 검증한 과정을 설명해주세요.",
      questionMode: "SITUATIONAL_DESIGN",
      sortOrder: 3,
      baseAnswerId: 803,
      profileEvaluations: [
        profileEvaluation(1005, "COLLABORATION_COMMUNICATION", 4, [2005, 2006], true),
        profileEvaluation(1006, "PROBLEM_SOLVING", 4, [2007]),
      ],
      followUp: {
        followUpQuestionId: 3001,
        followUpAnswerId: 804,
        questionText: "결정 이후 구성원의 동의를 어떻게 다시 확인했나요?",
        answerTimeSec: 60,
        answerStatus: "RECOVERED",
      },
    },
  ],
  evidences: [
    { evidenceId: 2001, ncsEvaluationId: 1001, ncsProfileId: "JOB_TECHNICAL", sessionQuestionId: 701, sourceAnswerId: 801, sourceKind: "BASE", quote: "로그와 지표를 비교해 병목 구간을 확인했습니다.", sortOrder: 1 },
    { evidenceId: 2002, ncsEvaluationId: 1002, ncsProfileId: "PROBLEM_SOLVING", sessionQuestionId: 701, sourceAnswerId: 801, sourceKind: "BASE", quote: "세 가지 대안의 복구 시간과 위험을 비교했습니다.", sortOrder: 1 },
    { evidenceId: 2003, ncsEvaluationId: 1003, ncsProfileId: "JOB_TECHNICAL", sessionQuestionId: 702, sourceAnswerId: 802, sourceKind: "BASE", quote: "TTL과 장애 시 fallback을 함께 검증했습니다.", sortOrder: 1 },
    { evidenceId: 2004, ncsEvaluationId: 1004, ncsProfileId: "COLLABORATION_COMMUNICATION", sessionQuestionId: 702, sourceAnswerId: 802, sourceKind: "BASE", quote: "비개발 직군에는 응답 지연 영향으로 설명했습니다.", sortOrder: 1 },
    { evidenceId: 2005, ncsEvaluationId: 1005, ncsProfileId: "COLLABORATION_COMMUNICATION", sessionQuestionId: 703, sourceAnswerId: 803, sourceKind: "BASE", quote: "각자의 우려를 표로 정리했습니다.", sortOrder: 1 },
    { evidenceId: 2006, ncsEvaluationId: 1005, ncsProfileId: "COLLABORATION_COMMUNICATION", sessionQuestionId: 703, sourceAnswerId: 804, sourceKind: "FOLLOW_UP", quote: "회의 후 결정 사항을 다시 확인받았습니다.", sortOrder: 2 },
    { evidenceId: 2007, ncsEvaluationId: 1006, ncsProfileId: "PROBLEM_SOLVING", sessionQuestionId: 703, sourceAnswerId: 803, sourceKind: "BASE", quote: "적용 후 오류율을 일주일 동안 비교했습니다.", sortOrder: 1 },
  ],
  findings: [
    {
      findingId: "strength-tech",
      type: "STRENGTH",
      ncsProfileId: "JOB_TECHNICAL",
      title: "기술 선택과 검증 근거가 구체적입니다.",
      detail: "원리, 적용 방식과 장애 위험 검증을 답변 근거로 확인했습니다.",
      evidenceIds: [2001, 2003],
      generationMode: "DETERMINISTIC",
    },
    {
      findingId: "gap-collaboration",
      type: "GAP",
      ncsProfileId: "COLLABORATION_COMMUNICATION",
      title: "합의 확인 과정을 반복 검토할 필요가 있습니다.",
      detail: "꼬리답변으로 보완됐지만 다른 답변에서도 반복 확인이 필요합니다.",
      evidenceIds: [2005, 2006],
      generationMode: "GUARDRAILED_AI",
    },
  ],
  incompleteReasons: [],
  notices: [
    {
      code: "NCS_EVALUATION_SCOPE",
      message: "AI는 답변의 논리 구조와 NCS 행동 근거를 평가합니다. 기술적 사실 여부와 실제 경험의 진위는 확정하지 않으며 면접관 검토가 필요합니다.",
    },
  ],
};

export const NCS_COMPLETE_FAIL_FIXTURE: NcsReportEvaluationOutputV1 = {
  ...NCS_COMPLETE_PASS_FIXTURE,
  result: {
    completionStatus: "COMPLETE",
    thresholdResult: "BELOW_THRESHOLD",
    aiDecision: "FAIL",
    decisionReasonCode: "OVERALL_SCORE_BELOW_THRESHOLD",
    totalScore: 72,
  },
  profiles: NCS_COMPLETE_PASS_FIXTURE.profiles.map((profile) =>
    profile.ncsProfileId === "PROBLEM_SOLVING"
      ? { ...profile, averageScore: 2, normalizedScore: 40, weightedScore: 12 }
      : profile,
  ),
};

export const NCS_PROFILE_THRESHOLD_FAIL_FIXTURE: NcsReportEvaluationOutputV1 = {
  ...NCS_COMPLETE_PASS_FIXTURE,
  result: {
    completionStatus: "COMPLETE",
    thresholdResult: "BELOW_THRESHOLD",
    aiDecision: "FAIL",
    decisionReasonCode: "PROFILE_SCORE_BELOW_THRESHOLD",
    totalScore: 82,
  },
  profiles: NCS_COMPLETE_PASS_FIXTURE.profiles.map((profile) => {
    if (profile.ncsProfileId === "JOB_TECHNICAL") {
      return { ...profile, averageScore: 5, normalizedScore: 100, weightedScore: 40 };
    }
    if (profile.ncsProfileId === "COLLABORATION_COMMUNICATION") {
      return { ...profile, averageScore: 4.5, normalizedScore: 90, weightedScore: 27 };
    }
    return { ...profile, averageScore: 2.5, normalizedScore: 50, weightedScore: 15 };
  }),
};

export const NCS_INCOMPLETE_FIXTURE: NcsReportEvaluationOutputV1 = {
  ...NCS_COMPLETE_PASS_FIXTURE,
  result: {
    completionStatus: "INCOMPLETE",
    thresholdResult: "INCOMPLETE",
    aiDecision: "FAIL",
    decisionReasonCode: "EVALUATION_INCOMPLETE",
    totalScore: null,
  },
  profiles: NCS_COMPLETE_PASS_FIXTURE.profiles.map((profile) =>
    profile.ncsProfileId === "PROBLEM_SOLVING"
      ? { ...profile, status: "INCOMPLETE", averageScore: null, normalizedScore: null, weightedScore: null, validQuestionCount: 1 }
      : profile,
  ),
  questions: NCS_COMPLETE_PASS_FIXTURE.questions.map((question) =>
    question.sessionQuestionId === 703
      ? {
          ...question,
          profileEvaluations: question.profileEvaluations.map((evaluation) =>
            evaluation.ncsProfileId === "PROBLEM_SOLVING"
              ? {
                  ...evaluation,
                  ncsEvaluationId: null,
                  scoreStatus: "INSUFFICIENT_INPUT",
                  behaviorPoints: null,
                  logicPoints: null,
                  baseScore: null,
                  effectiveScore: null,
                  confidence: null,
                  rationale: null,
                  evidenceIds: [],
                  incompleteReasonCodes: ["INSUFFICIENT_INPUT"],
                }
              : evaluation,
          ),
        }
      : question,
  ),
  incompleteReasons: [
    {
      code: "INSUFFICIENT_INPUT",
      message: "문제 해결 역량을 평가할 답변 근거가 충분하지 않습니다.",
      ncsProfileId: "PROBLEM_SOLVING",
      sessionQuestionId: 703,
      answerId: 803,
      retryable: false,
    },
  ],
  evidences: NCS_COMPLETE_PASS_FIXTURE.evidences.filter((evidence) => evidence.evidenceId !== 2007),
  notices: [
    ...NCS_COMPLETE_PASS_FIXTURE.notices,
    {
      code: "INCOMPLETE_FAIL_CLOSED",
      message: "필수 평가가 완료되지 않아 발표용 임시 정책에 따라 AI 추천은 불합격으로 표시됩니다.",
    },
  ],
};
