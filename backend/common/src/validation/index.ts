import {
  NCS_PROFILE_IDS,
  type EvaluationFramework,
  type NcsProfileId,
  type QuestionUsageScope,
} from "../enums";

export type NcsValidationIssueCode =
  | "CANONICAL_PROFILE_CONFIGURATION_INVALID"
  | "ACTIVE_PROFILE_COUNT_INVALID"
  | "WEIGHT_INVALID"
  | "WEIGHT_SUM_INVALID"
  | "QUESTION_BINDING_CARDINALITY_INVALID"
  | "QUESTION_BINDING_DUPLICATE"
  | "QUESTION_BINDING_PROFILE_INVALID"
  | "INACTIVE_PROFILE_BOUND"
  | "QUESTION_COVERAGE_INVALID"
  | "STANDARD_COMMON_QUESTION_COUNT_INVALID"
  | "STANDARD_PERSONALIZED_QUESTION_COUNT_INVALID"
  | "DEMO_REQUIRES_ALL_PROFILES"
  | "DEMO_COMMON_BINDING_INVALID"
  | "DEMO_PERSONALIZED_BINDING_INVALID"
  | "DEMO_USAGE_SCOPE_INVALID"
  | "DEMO_FOLLOW_UP_BINDING_INVALID";

export type NcsValidationIssue = {
  code: NcsValidationIssueCode;
  path: string;
  message: string;
  ncsProfileId?: NcsProfileId;
};

export type NcsProfileWeightInput = {
  ncsProfileId: NcsProfileId;
  weight: number;
};

export type NcsCoverageQuestionInput = {
  kind: "BASE" | "FOLLOW_UP";
  isScoring: boolean;
  source: "JD_CRITERIA" | "RESUME_PERSONALIZED";
  usageScope: QuestionUsageScope;
  ncsProfileIds: readonly NcsProfileId[];
};

export type DemoPresetQuestionInput = {
  usageScope: QuestionUsageScope;
  ncsProfileIds: readonly NcsProfileId[];
};

const CANONICAL_PROFILE_SET = new Set<string>(NCS_PROFILE_IDS);

export function validateNcsProfileWeights(
  framework: EvaluationFramework,
  criteria: readonly NcsProfileWeightInput[],
): NcsValidationIssue[] {
  if (framework === "LEGACY") return [];

  const issues: NcsValidationIssue[] = [];
  const profileIds = criteria.map((criterion) => criterion.ncsProfileId);
  if (
    criteria.length !== NCS_PROFILE_IDS.length ||
    new Set(profileIds).size !== NCS_PROFILE_IDS.length ||
    !NCS_PROFILE_IDS.every((profileId) => profileIds.includes(profileId))
  ) {
    issues.push({
      code: "CANONICAL_PROFILE_CONFIGURATION_INVALID",
      path: "criteria",
      message: "Canonical NCS profiles must each appear exactly once.",
    });
  }

  criteria.forEach((criterion, index) => {
    if (!Number.isInteger(criterion.weight) || criterion.weight < 0 || criterion.weight > 100) {
      issues.push({
        code: "WEIGHT_INVALID",
        path: `criteria[${index}].weight`,
        message: "NCS profile weight must be an integer between 0 and 100.",
        ncsProfileId: criterion.ncsProfileId,
      });
    }
  });

  if (criteria.reduce((sum, criterion) => sum + criterion.weight, 0) !== 100) {
    issues.push({
      code: "WEIGHT_SUM_INVALID",
      path: "criteria",
      message: "NCS profile weights must sum to exactly 100.",
    });
  }

  if (framework === "NCS_ACTIVE_PROFILE_V2") {
    const activeCount = criteria.filter((criterion) => criterion.weight > 0).length;
    if (activeCount < 1 || activeCount > 3) {
      issues.push({
        code: "ACTIVE_PROFILE_COUNT_INVALID",
        path: "criteria",
        message: "NCS_ACTIVE_PROFILE_V2 requires between one and three active profiles.",
      });
    }
  }

  return issues;
}

export function activeNcsProfileIds(
  framework: EvaluationFramework,
  criteria: readonly NcsProfileWeightInput[],
): NcsProfileId[] {
  if (framework === "LEGACY") return [];
  if (framework === "NCS_3_PROFILE_V1") {
    return NCS_PROFILE_IDS.filter((profileId) => criteria.some((criterion) => criterion.ncsProfileId === profileId));
  }
  return NCS_PROFILE_IDS.filter((profileId) =>
    criteria.some((criterion) => criterion.ncsProfileId === profileId && criterion.weight > 0),
  );
}

export function validateNcsQuestionBindings(
  profileIds: readonly NcsProfileId[],
  activeProfileIds?: readonly NcsProfileId[],
  path = "ncsProfileIds",
): NcsValidationIssue[] {
  const issues: NcsValidationIssue[] = [];
  if (profileIds.length < 1 || profileIds.length > 2) {
    issues.push({
      code: "QUESTION_BINDING_CARDINALITY_INVALID",
      path,
      message: "A question must bind to one or two NCS profiles.",
    });
  }
  if (new Set(profileIds).size !== profileIds.length) {
    issues.push({
      code: "QUESTION_BINDING_DUPLICATE",
      path,
      message: "A question cannot bind the same NCS profile more than once.",
    });
  }
  profileIds.forEach((profileId) => {
    if (!CANONICAL_PROFILE_SET.has(profileId)) {
      issues.push({
        code: "QUESTION_BINDING_PROFILE_INVALID",
        path,
        message: "A question binding must use a canonical NCS profile.",
      });
    } else if (activeProfileIds && !activeProfileIds.includes(profileId)) {
      issues.push({
        code: "INACTIVE_PROFILE_BOUND",
        path,
        message: "A V2 scoring question cannot bind an inactive NCS profile.",
        ncsProfileId: profileId,
      });
    }
  });
  return issues;
}

export function validateNcsQuestionCoverage(
  framework: EvaluationFramework,
  criteria: readonly NcsProfileWeightInput[],
  questions: readonly NcsCoverageQuestionInput[],
  usageScope: QuestionUsageScope = "STANDARD",
): NcsValidationIssue[] {
  if (framework === "LEGACY") return [];
  const activeProfiles = activeNcsProfileIds(framework, criteria);
  const requiredCount = framework === "NCS_3_PROFILE_V1" ? 2 : 1;
  const issues: NcsValidationIssue[] = [];

  questions.forEach((question, index) => {
    if (question.kind !== "BASE" || !question.isScoring || question.usageScope !== usageScope) return;
    issues.push(...validateNcsQuestionBindings(question.ncsProfileIds, activeProfiles, `questions[${index}].ncsProfileIds`));
  });

  for (const profileId of activeProfiles) {
    const actualCount = questions.filter(
      (question) =>
        question.kind === "BASE" &&
        question.isScoring &&
        question.usageScope === usageScope &&
        question.ncsProfileIds.includes(profileId),
    ).length;
    if (actualCount < requiredCount) {
      issues.push({
        code: "QUESTION_COVERAGE_INVALID",
        path: "questions",
        message: `${profileId} requires at least ${requiredCount} scoring BASE question(s).`,
        ncsProfileId: profileId,
      });
    }
  }
  return issues;
}

export function validateStandardQuestionCounts(
  framework: EvaluationFramework,
  jdCriteriaQuestionCount: number,
  resumeQuestionCount: number,
): NcsValidationIssue[] {
  if (framework !== "NCS_ACTIVE_PROFILE_V2") return [];
  const issues: NcsValidationIssue[] = [];
  if (!Number.isInteger(jdCriteriaQuestionCount) || jdCriteriaQuestionCount < 3) {
    issues.push({
      code: "STANDARD_COMMON_QUESTION_COUNT_INVALID",
      path: "jdCriteriaQuestionCount",
      message: "NCS_ACTIVE_PROFILE_V2 requires at least three STANDARD common questions.",
    });
  }
  if (!Number.isInteger(resumeQuestionCount) || resumeQuestionCount < 1) {
    issues.push({
      code: "STANDARD_PERSONALIZED_QUESTION_COUNT_INVALID",
      path: "resumeQuestionCount",
      message: "NCS_ACTIVE_PROFILE_V2 requires at least one STANDARD personalized question.",
    });
  }
  return issues;
}

export function validateDemoPresetQuestions(
  criteria: readonly NcsProfileWeightInput[],
  commonQuestion: DemoPresetQuestionInput,
  personalizedQuestion: DemoPresetQuestionInput,
): NcsValidationIssue[] {
  const issues = validateNcsProfileWeights("NCS_ACTIVE_PROFILE_V2", criteria);
  const activeProfiles = activeNcsProfileIds("NCS_ACTIVE_PROFILE_V2", criteria);
  if (!NCS_PROFILE_IDS.every((profileId) => activeProfiles.includes(profileId))) {
    issues.push({
      code: "DEMO_REQUIRES_ALL_PROFILES",
      path: "criteria",
      message: "DEMO_PRESET requires all three canonical profiles to be active.",
    });
  }
  if (
    commonQuestion.usageScope !== "STANDARD" ||
    !sameProfileSet(commonQuestion.ncsProfileIds, ["COLLABORATION_COMMUNICATION"])
  ) {
    issues.push({
      code: commonQuestion.usageScope === "STANDARD" ? "DEMO_COMMON_BINDING_INVALID" : "DEMO_USAGE_SCOPE_INVALID",
      path: "commonQuestion",
      message: "The demo common source must be a STANDARD collaboration-only question.",
    });
  }
  if (
    personalizedQuestion.usageScope !== "DEMO_PRESET" ||
    !sameProfileSet(personalizedQuestion.ncsProfileIds, ["JOB_TECHNICAL", "PROBLEM_SOLVING"])
  ) {
    issues.push({
      code: personalizedQuestion.usageScope === "DEMO_PRESET"
        ? "DEMO_PERSONALIZED_BINDING_INVALID"
        : "DEMO_USAGE_SCOPE_INVALID",
      path: "personalizedQuestion",
      message: "The demo personalized question must use DEMO_PRESET and bind job plus problem solving.",
    });
  }
  return issues;
}

export function validateDemoFollowUpBindingInheritance(
  sourceProfileIds: readonly NcsProfileId[],
  followUpProfileIds: readonly NcsProfileId[],
): NcsValidationIssue[] {
  return sameProfileSet(sourceProfileIds, followUpProfileIds)
    ? []
    : [{
        code: "DEMO_FOLLOW_UP_BINDING_INVALID",
        path: "followUpProfileIds",
        message: "A DEMO_PRESET follow-up must inherit both source question bindings.",
      }];
}

function sameProfileSet(left: readonly NcsProfileId[], right: readonly NcsProfileId[]): boolean {
  return left.length === right.length && new Set(left).size === left.length && left.every((value) => right.includes(value));
}
