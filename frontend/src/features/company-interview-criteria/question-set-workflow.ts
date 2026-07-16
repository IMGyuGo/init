import type {
  GeneratedQuestionCandidate,
  InterviewSettings,
  NcsProfileId,
} from "./types";

const NCS_PROFILE_IDS: NcsProfileId[] = [
  "JOB_TECHNICAL",
  "COLLABORATION_COMMUNICATION",
  "PROBLEM_SOLVING",
];

export type AutoApplicableQuestion = {
  candidate: GeneratedQuestionCandidate;
  criterionId: number;
};

export type AutoApplyQuestionPlan = {
  applicable: AutoApplicableQuestion[];
  alreadySavedCount: number;
  rejectedCount: number;
};

export type CommonQuestionSetPlan = {
  items: Array<{
    questionId: number;
    criterionId: number | null;
    sortOrder: number;
  }>;
  sourceProcessLogId?: number;
  error?: string;
};

export function findStaleGeneratedQuestionIds(
  settings: InterviewSettings,
  candidates: GeneratedQuestionCandidate[],
  currentProcessLogId: number,
): number[] {
  const generatedContents = new Set(candidates.map((candidate) => normalizeText(candidate.content)).filter(Boolean));
  return settings.questions
    .filter((question) =>
      question.isActive &&
      question.origin === "AI_GENERATED" &&
      question.generationSource === "JD_CRITERIA" &&
      question.sourceProcessLogId !== currentProcessLogId &&
      !generatedContents.has(normalizeText(question.content)),
    )
    .map((question) => question.questionId);
}

export function buildAutoApplyQuestionPlan(
  settings: InterviewSettings,
  candidates: GeneratedQuestionCandidate[],
): AutoApplyQuestionPlan {
  const existingContents = new Set(
    settings.questions.filter((question) => question.isActive).map((question) => normalizeText(question.content)),
  );
  const plannedContents = new Set<string>();
  const applicable: AutoApplicableQuestion[] = [];
  let alreadySavedCount = 0;
  let rejectedCount = 0;

  for (const candidate of candidates) {
    const content = normalizeText(candidate.content);
    if (!content) {
      rejectedCount += 1;
      continue;
    }
    if (existingContents.has(content) || plannedContents.has(content)) {
      alreadySavedCount += 1;
      continue;
    }
    if (settings.evaluationFramework === "NCS_3_PROFILE_V1" && candidate.alignmentStatus !== "ALIGNED") {
      rejectedCount += 1;
      continue;
    }

    const criterionId = findCandidateCriterionId(settings, candidate);
    if (!criterionId) {
      rejectedCount += 1;
      continue;
    }

    applicable.push({ candidate, criterionId });
    plannedContents.add(content);
  }

  return { applicable, alreadySavedCount, rejectedCount };
}

export function buildCommonQuestionSetPlan(
  settings: InterviewSettings,
  expectedQuestionCount: number,
): CommonQuestionSetPlan {
  if (!Number.isInteger(expectedQuestionCount) || expectedQuestionCount < 1) {
    return { items: [], error: "공통 질문 개수를 1개 이상 저장해주세요." };
  }

  const criterionOrder = new Map(
    [...settings.criteria]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((criterion, index) => [criterion.criterionId, index]),
  );
  const eligible = settings.questions
    .filter((question) => isConfirmableQuestion(settings, question))
    .sort((left, right) => {
      const leftCriterionOrder = left.criterionId === null
        ? Number.MAX_SAFE_INTEGER
        : criterionOrder.get(left.criterionId) ?? Number.MAX_SAFE_INTEGER;
      const rightCriterionOrder = right.criterionId === null
        ? Number.MAX_SAFE_INTEGER
        : criterionOrder.get(right.criterionId) ?? Number.MAX_SAFE_INTEGER;
      return leftCriterionOrder - rightCriterionOrder || left.questionId - right.questionId;
    });

  if (eligible.length !== expectedQuestionCount) {
    return {
      items: [],
      error: `공통 질문은 ${expectedQuestionCount}개가 필요하지만 확정 가능한 질문은 ${eligible.length}개입니다. 질문을 추천받거나 목록을 정리해주세요.`,
    };
  }

  if (settings.evaluationFramework === "NCS_3_PROFILE_V1") {
    const coverage = new Map<NcsProfileId, number>(NCS_PROFILE_IDS.map((profileId) => [profileId, 0]));
    for (const question of eligible) {
      for (const binding of question.ncsBindings) {
        coverage.set(binding.ncsProfileId, (coverage.get(binding.ncsProfileId) ?? 0) + 1);
      }
    }
    const missingProfiles = NCS_PROFILE_IDS.filter((profileId) => (coverage.get(profileId) ?? 0) < 2);
    if (missingProfiles.length > 0) {
      return {
        items: [],
        error: "각 NCS 평가 기준에 연결된 공통 질문이 최소 2개씩 필요합니다.",
      };
    }
  }

  const processLogIds = Array.from(
    new Set(eligible.map((question) => question.sourceProcessLogId).filter((value): value is number => value !== null)),
  );

  return {
    items: eligible.map((question, index) => ({
      questionId: question.questionId,
      criterionId: question.criterionId,
      sortOrder: index + 1,
    })),
    sourceProcessLogId: processLogIds.length === 1 ? processLogIds[0] : undefined,
  };
}

function isConfirmableQuestion(
  settings: InterviewSettings,
  question: InterviewSettings["questions"][number],
): boolean {
  if (!question.isActive) return false;
  if (settings.evaluationFramework !== "NCS_3_PROFILE_V1") return true;
  if (
    question.generationSource !== "JD_CRITERIA" ||
    question.alignmentStatus !== "ALIGNED" ||
    !question.ncsProfileId ||
    !question.ncsQuestionMode ||
    !question.ncsProfileVersion ||
    !question.evaluatorVersion ||
    question.ncsBindings.length < 1 ||
    question.ncsBindings.length > 2
  ) {
    return false;
  }

  const profiles = new Set<NcsProfileId>();
  const criteria = new Set<number>();
  return question.ncsBindings.every((binding, index) => {
    const criterion = settings.criteria.find((item) => item.criterionId === binding.criterionId);
    const valid =
      binding.bindingOrder === index + 1 &&
      binding.alignmentStatus === "ALIGNED" &&
      Boolean(binding.ncsProfileVersion) &&
      Boolean(binding.evaluatorVersion) &&
      criterion?.ncsProfileId === binding.ncsProfileId &&
      criterion.ncsProfileVersion === binding.ncsProfileVersion &&
      !profiles.has(binding.ncsProfileId) &&
      !criteria.has(binding.criterionId);
    profiles.add(binding.ncsProfileId);
    criteria.add(binding.criterionId);
    return valid;
  });
}

function findCandidateCriterionId(
  settings: InterviewSettings,
  candidate: GeneratedQuestionCandidate,
): number | undefined {
  if (candidate.criterionId && settings.criteria.some((criterion) => criterion.criterionId === candidate.criterionId)) {
    return candidate.criterionId;
  }

  const title = normalizeText(candidate.criterionTitle ?? "");
  if (!title) return undefined;
  return (
    settings.criteria.find((criterion) => normalizeText(criterion.tagName) === title)?.criterionId ??
    settings.criteria.find((criterion) => title.includes(normalizeText(criterion.tagName)))?.criterionId ??
    settings.criteria.find((criterion) => normalizeText(criterion.category) === title)?.criterionId
  );
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
