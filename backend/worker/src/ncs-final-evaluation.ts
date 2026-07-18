export const NCS_SCORING_VERSION = "NCS_RECRUITING_SCORING_V1" as const;
export const NCS_SCORING_VERSION_V2 = "NCS_RECRUITING_SCORING_V2" as const;
export type NcsScoringVersion = typeof NCS_SCORING_VERSION | typeof NCS_SCORING_VERSION_V2;
export const NCS_DECISION_POLICY_VERSION = "NCS_INCOMPLETE_AS_FAIL_DEMO_V1" as const;

export const NCS_FINAL_PROFILE_IDS = [
  "JOB_TECHNICAL",
  "COLLABORATION_COMMUNICATION",
  "PROBLEM_SOLVING",
] as const;

export type NcsFinalProfileId = (typeof NCS_FINAL_PROFILE_IDS)[number];
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

export interface NcsSessionPolicyInput {
  ncsProfileId: NcsFinalProfileId;
  criterionId?: number;
  criterionTitleSnapshot: string;
  weight: number;
  minimumAverageScore: number;
  requiredQuestionCount: number;
  ncsProfileVersion: string;
}

export interface NcsEvaluationForAggregation {
  answerId: number;
  sessionQuestionId: number;
  ncsProfileId: NcsFinalProfileId;
  scoreStatus: "SCORED" | "INSUFFICIENT_INPUT" | "LOW_ALIGNMENT" | "BLOCKED";
  effectiveScore: number | null;
  evidenceCount: number;
}

export interface NcsIncompleteReason {
  code: NcsIncompleteReasonCode;
  message: string;
  ncsProfileId: NcsFinalProfileId | null;
  sessionQuestionId: number | null;
  answerId: number | null;
  retryable: boolean;
}

export interface NcsProfileAggregate {
  ncsProfileId: NcsFinalProfileId;
  profileOrder: 1 | 2 | 3;
  displayName: string;
  criterionId?: number;
  criterionTitleSnapshot: string;
  status: "SCORED" | "INCOMPLETE";
  averageScore: number | null;
  normalizedScore: number | null;
  weight: number;
  weightedScore: number | null;
  minimumAverageScore: number;
  assignedQuestionCount: number;
  validQuestionCount: number;
  requiredQuestionCount: number;
}

export interface NcsFinalEvaluation {
  scoringVersion: NcsScoringVersion;
  decisionPolicyVersion: typeof NCS_DECISION_POLICY_VERSION;
  completionStatus: "COMPLETE" | "INCOMPLETE";
  thresholdResult: "MEETS_THRESHOLD" | "BELOW_THRESHOLD" | "INCOMPLETE";
  aiDecision: "PASS" | "FAIL";
  decisionReasonCode:
    | "THRESHOLD_MET"
    | "OVERALL_SCORE_BELOW_THRESHOLD"
    | "PROFILE_SCORE_BELOW_THRESHOLD"
    | "EVALUATION_INCOMPLETE";
  totalScore: number | null;
  profiles: NcsProfileAggregate[];
  incompleteReasons: NcsIncompleteReason[];
}

const PROFILE_LABELS: Record<NcsFinalProfileId, string> = {
  JOB_TECHNICAL: "기술·직무",
  COLLABORATION_COMMUNICATION: "협업·의사소통",
  PROBLEM_SOLVING: "문제 해결력",
};

export function aggregateNcsFinalEvaluation(
  policies: NcsSessionPolicyInput[],
  evaluations: NcsEvaluationForAggregation[],
  structuralReasons: NcsIncompleteReason[] = [],
  scoringVersion: NcsScoringVersion = NCS_SCORING_VERSION,
): NcsFinalEvaluation {
  const incompleteReasons: NcsIncompleteReason[] = [...structuralReasons];
  const sttUnavailableKeys = new Set(
    structuralReasons
      .filter((item) => item.code === "STT_UNAVAILABLE" && item.answerId !== null)
      .map((item) => `${item.answerId}:${item.ncsProfileId ?? ""}`),
  );
  const policyByProfile = new Map<NcsFinalProfileId, NcsSessionPolicyInput>();
  for (const policy of policies) {
    if (policyByProfile.has(policy.ncsProfileId)) {
      incompleteReasons.push(reason(
        "SESSION_SNAPSHOT_MISSING",
        `Duplicate session policy for ${policy.ncsProfileId}.`,
        policy.ncsProfileId,
      ));
      continue;
    }
    policyByProfile.set(policy.ncsProfileId, policy);
  }
  const profileIds = scoringVersion === NCS_SCORING_VERSION_V2
    ? NCS_FINAL_PROFILE_IDS.filter((profileId) => policyByProfile.has(profileId))
    : [...NCS_FINAL_PROFILE_IDS];
  const validPolicySet = scoringVersion === NCS_SCORING_VERSION_V2
    ? policies.length >= 1 &&
      policies.length <= 3 &&
      policies.length === profileIds.length &&
      policies.every((policy) => policy.weight > 0 && policy.requiredQuestionCount >= 1)
    : policies.length === NCS_FINAL_PROFILE_IDS.length &&
      NCS_FINAL_PROFILE_IDS.every((profileId) => policyByProfile.has(profileId));
  if (!validPolicySet || policies.reduce((sum, policy) => sum + policy.weight, 0) !== 100) {
    incompleteReasons.push(reason(
      "SESSION_SNAPSHOT_MISSING",
      scoringVersion === NCS_SCORING_VERSION_V2
        ? "The session NCS V2 policy must contain one to three unique active profiles with weights totaling 100."
        : "The session NCS policy must contain three unique profiles with weights totaling 100.",
      null,
    ));
  }

  const profiles = profileIds.map((ncsProfileId, index): NcsProfileAggregate => {
    const policy = policyByProfile.get(ncsProfileId);
    const assigned = evaluations.filter((evaluation) => evaluation.ncsProfileId === ncsProfileId);
    const valid = assigned.filter((evaluation) =>
      evaluation.scoreStatus === "SCORED" &&
      evaluation.effectiveScore !== null &&
      evaluation.evidenceCount > 0,
    );
    const requiredQuestionCount = policy?.requiredQuestionCount ?? (scoringVersion === NCS_SCORING_VERSION_V2 ? 1 : 2);
    if (assigned.length < requiredQuestionCount) {
      incompleteReasons.push({
        ...reason(
          "MINIMUM_QUESTION_COUNT_NOT_MET",
          `${ncsProfileId} requires at least ${requiredQuestionCount} scored base questions.`,
          ncsProfileId,
        ),
      });
    }
    for (const evaluation of assigned) {
      if (evaluation.scoreStatus !== "SCORED") {
        if (
          evaluation.scoreStatus === "INSUFFICIENT_INPUT" &&
          sttUnavailableKeys.has(`${evaluation.answerId}:${ncsProfileId}`)
        ) {
          continue;
        }
        incompleteReasons.push({
          ...reason(scoreStatusReason(evaluation.scoreStatus), `Answer ${evaluation.answerId} is not scored.`, ncsProfileId),
          sessionQuestionId: evaluation.sessionQuestionId,
          answerId: evaluation.answerId,
        });
      } else if (evaluation.effectiveScore === null || evaluation.evidenceCount === 0) {
        incompleteReasons.push({
          ...reason("EVIDENCE_SOURCE_INVALID", `Answer ${evaluation.answerId} has no valid effective score evidence.`, ncsProfileId),
          sessionQuestionId: evaluation.sessionQuestionId,
          answerId: evaluation.answerId,
        });
      }
    }
    const complete = Boolean(policy) && assigned.length >= requiredQuestionCount && valid.length === assigned.length;
    const averageScore = complete
      ? round2(valid.reduce((sum, evaluation) => sum + evaluation.effectiveScore!, 0) / valid.length)
      : null;
    const normalizedScore = averageScore === null ? null : Math.round(averageScore * 20);
    const weightedScore = normalizedScore === null || !policy
      ? null
      : round2((normalizedScore * policy.weight) / 100);
    return {
      ncsProfileId,
      profileOrder: (index + 1) as 1 | 2 | 3,
      displayName: PROFILE_LABELS[ncsProfileId],
      ...(policy?.criterionId ? { criterionId: policy.criterionId } : {}),
      criterionTitleSnapshot: policy?.criterionTitleSnapshot ?? PROFILE_LABELS[ncsProfileId],
      status: complete ? "SCORED" : "INCOMPLETE",
      averageScore,
      normalizedScore,
      weight: policy?.weight ?? 0,
      weightedScore,
      minimumAverageScore: policy?.minimumAverageScore ?? 3,
      assignedQuestionCount: assigned.length,
      validQuestionCount: valid.length,
      requiredQuestionCount,
    };
  });

  const uniqueIncompleteReasons = dedupeReasons(incompleteReasons);
  const isComplete = uniqueIncompleteReasons.length === 0 && profiles.every((profile) => profile.status === "SCORED");
  if (!isComplete) {
    return {
      scoringVersion,
      decisionPolicyVersion: NCS_DECISION_POLICY_VERSION,
      completionStatus: "INCOMPLETE",
      thresholdResult: "INCOMPLETE",
      aiDecision: "FAIL",
      decisionReasonCode: "EVALUATION_INCOMPLETE",
      totalScore: null,
      profiles,
      incompleteReasons: uniqueIncompleteReasons,
    };
  }

  const totalScore = Math.round(profiles.reduce((sum, profile) => sum + profile.weightedScore!, 0));
  const profileBelow = profiles.some((profile) => profile.averageScore! < profile.minimumAverageScore);
  const thresholdMet = totalScore >= 80 && !profileBelow;
  return {
    scoringVersion,
    decisionPolicyVersion: NCS_DECISION_POLICY_VERSION,
    completionStatus: "COMPLETE",
    thresholdResult: thresholdMet ? "MEETS_THRESHOLD" : "BELOW_THRESHOLD",
    aiDecision: thresholdMet ? "PASS" : "FAIL",
    decisionReasonCode: thresholdMet
      ? "THRESHOLD_MET"
      : profileBelow
        ? "PROFILE_SCORE_BELOW_THRESHOLD"
        : "OVERALL_SCORE_BELOW_THRESHOLD",
    totalScore,
    profiles,
    incompleteReasons: [],
  };
}

function scoreStatusReason(status: NcsEvaluationForAggregation["scoreStatus"]): NcsIncompleteReasonCode {
  if (status === "LOW_ALIGNMENT") return "LOW_ALIGNMENT";
  if (status === "BLOCKED") return "GUARDRAIL_BLOCKED";
  return "INSUFFICIENT_INPUT";
}

function reason(
  code: NcsIncompleteReasonCode,
  message: string,
  ncsProfileId: NcsFinalProfileId | null,
): NcsIncompleteReason {
  return { code, message, ncsProfileId, sessionQuestionId: null, answerId: null, retryable: false };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function dedupeReasons(reasons: NcsIncompleteReason[]): NcsIncompleteReason[] {
  const seen = new Set<string>();
  return reasons.filter((item) => {
    const key = `${item.code}:${item.ncsProfileId ?? ""}:${item.sessionQuestionId ?? ""}:${item.answerId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
