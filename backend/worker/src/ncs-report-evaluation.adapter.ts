import {
  GeneratedQuestionEvaluationRecord,
  GeneratedReportScoreRecord,
  NcsAnswerEvaluationRecord,
} from "./ai-result.repository";
import {
  NCS_PROFILE_VERSION,
  NCS_TEXT_EVALUATION_KIND,
  NCS_TEXT_EVALUATION_PROMPT_VERSION,
  NCS_TEXT_EVALUATION_RUBRIC_VERSION,
  NcsEvaluationConfidence,
  NcsProfileId,
  NcsQuestionMode,
  NcsTextEvaluationOutput,
  NcsTextEvaluationProvider,
} from "./ncs-text-evaluation.types";
import {
  evaluateNcsTextDeterministically,
  finalizeNcsTextEvaluation,
  parseNcsTextEvaluationInput,
  preflightNcsTextEvaluation,
} from "./ncs-text-evaluator";
import { NonRetryableAiWorkerFailure } from "./worker-errors";

export type NcsApiProfileId =
  | "JOB_TECHNICAL"
  | "COLLABORATION_COMMUNICATION"
  | "PROBLEM_SOLVING"
  | "COMMUNICATION"
  | "DIGITAL";

export interface NcsReportQuestionBindingSnapshot {
  criterionId?: number;
  criterionTitleSnapshot: string;
  ncsProfileId: NcsApiProfileId;
  ncsProfileVersion: string;
  alignmentStatus: string;
  alignmentScore?: number;
  evaluatorVersion?: string;
  bindingOrder: 1 | 2;
}

export interface NcsReportAnswerSnapshot {
  answerId: number;
  question?: string;
  transcript: string;
  sessionQuestionId?: number;
  criterionId?: number;
  criterionTitleSnapshot?: string;
  ncsProfileId?: NcsApiProfileId;
  ncsQuestionMode?: NcsQuestionMode;
  ncsProfileVersion?: string;
  alignmentStatus?: string;
  alignmentScore?: number;
  evaluatorVersion?: string;
  ncsBindings?: NcsReportQuestionBindingSnapshot[];
  isFollowUpAnswer?: boolean;
  parentAnswerId?: number;
}

export interface NcsReportEvaluationBatch {
  evaluations: NcsAnswerEvaluationRecord[];
  scores: GeneratedReportScoreRecord[];
  questionEvaluations: GeneratedQuestionEvaluationRecord[];
  allProfilesScored: boolean;
  usage?: {
    modelName: string;
    inputTokens?: number;
    outputTokens?: number;
  };
}

export function hasNcsAnswerSnapshots(answers: NcsReportAnswerSnapshot[]): boolean {
  return answers.some((answer) =>
    !answer.isFollowUpAnswer &&
    ((answer.ncsBindings?.length ?? 0) > 0 || answer.ncsProfileId !== undefined),
  );
}

export async function evaluateNcsReportAnswers(
  reportId: number,
  answers: NcsReportAnswerSnapshot[],
  expectedCriterionIds: number[],
  provider?: NcsTextEvaluationProvider,
): Promise<NcsReportEvaluationBatch> {
  const primaryAnswers = answers.filter((answer) => !answer.isFollowUpAnswer);
  const ncsAnswers = primaryAnswers.filter((answer) =>
    (answer.ncsBindings?.length ?? 0) > 0 || answer.ncsProfileId !== undefined,
  );
  if (ncsAnswers.length === 0) {
    throw new NonRetryableAiWorkerFailure("at least one primary NCS answer requires a session question snapshot");
  }

  const evaluated = await Promise.all(ncsAnswers.map((answer) => evaluateAnswer(reportId, answer, provider)));
  const evaluations = evaluated.flatMap((item) => item.evaluations);
  const scored = evaluations.filter((evaluation) => evaluation.output.scoreStatus === "SCORED");
  const scores = aggregateScores(scored);
  const questionEvaluations = scored.map(toQuestionEvaluation);
  const scoredCriterionIds = new Set(scores.map((score) => score.criterionId));
  const allProfilesScored =
    expectedCriterionIds.length > 0 && expectedCriterionIds.every((criterionId) => scoredCriterionIds.has(criterionId));

  const providerResults = evaluated.filter((item) => item.usage !== undefined);
  const usage = providerResults.length > 0
    ? {
        modelName: providerResults[0]!.usage!.modelName,
        inputTokens: sumOptional(providerResults.map((item) => item.usage!.inputTokens)),
        outputTokens: sumOptional(providerResults.map((item) => item.usage!.outputTokens)),
      }
    : undefined;

  return { evaluations, scores, questionEvaluations, allProfilesScored, usage };
}

async function evaluateAnswer(
  reportId: number,
  answer: NcsReportAnswerSnapshot,
  provider?: NcsTextEvaluationProvider,
): Promise<{
  evaluations: NcsAnswerEvaluationRecord[];
  usage?: { modelName: string; inputTokens?: number; outputTokens?: number };
}> {
  const snapshots = requiredSnapshots(answer);
  const question = answer.question?.trim();
  if (!question) {
    throw new NonRetryableAiWorkerFailure(`NCS question content is missing for answer ${answer.answerId}`);
  }
  const input = parseNcsTextEvaluationInput({
    questionMode: snapshots.ncsQuestionMode,
    question,
    answerText: answer.transcript,
    profileIds: snapshots.bindings.map((binding) => toEvaluatorProfileId(binding.ncsProfileId)),
    profileVersion: snapshots.bindings[0]?.ncsProfileVersion,
  });

  let output: NcsTextEvaluationOutput;
  let usage: { modelName: string; inputTokens?: number; outputTokens?: number } | undefined;
  if (snapshots.bindings.some((binding) => binding.alignmentStatus !== "ALIGNED")) {
    output = unscoredOutput(input.questionMode, "LOW_ALIGNMENT", Math.min(
      ...snapshots.bindings.map((binding) => binding.alignmentScore ?? 0),
    ), [
      "세션 질문 snapshot이 NCS 정렬 통과 상태가 아닙니다.",
    ]);
  } else if (provider) {
    const preflight = preflightNcsTextEvaluation(input, { providerMode: "openai" });
    if (preflight) {
      output = preflight;
    } else {
      const generated = await provider.evaluate(input);
      output = finalizeNcsTextEvaluation(input, generated.draft, {
        providerMode: "openai",
        model: generated.model,
      });
      usage = {
        modelName: generated.model,
        inputTokens: generated.usage?.inputTokens,
        outputTokens: generated.usage?.outputTokens,
      };
    }
  } else {
    output = evaluateNcsTextDeterministically(input);
  }

  if (output.scoreStatus === "SCORED" && exactEvidenceQuotes(output).length === 0) {
    output = unscoredOutput(input.questionMode, "INSUFFICIENT_INPUT", output.coverage, [
      "점수를 뒷받침하는 답변 원문 근거가 없습니다.",
    ], output.providerMode, output.model);
  }

  return {
    evaluations: snapshots.bindings.map((binding) => {
      const points = ncsFivePointBreakdown(output, toEvaluatorProfileId(binding.ncsProfileId));
      const evidences = output.scoreStatus === "SCORED"
        ? exactEvidenceQuotesForProfile(output, toEvaluatorProfileId(binding.ncsProfileId))
            .map((quote) => ({ sourceAnswerId: answer.answerId, sourceKind: "BASE" as const, quote }))
        : [];
      return {
      reportId,
      answerId: answer.answerId,
      sessionQuestionId: snapshots.sessionQuestionId,
      criterionId: binding.criterionId,
      criterionTitleSnapshot: binding.criterionTitleSnapshot,
      ncsProfileId: canonicalNcsProfileId(binding.ncsProfileId),
      ncsQuestionMode: snapshots.ncsQuestionMode,
      ncsProfileVersion: binding.ncsProfileVersion,
      output,
      question,
      behaviorPoints: points?.behaviorPoints ?? null,
      logicPoints: points?.logicPoints ?? null,
      baseScore: points?.baseScore ?? null,
      effectiveScore: points?.baseScore ?? null,
      followUpApplied: false,
      evidences,
    };}),
    usage,
  };
}

function aggregateScores(evaluations: NcsAnswerEvaluationRecord[]): GeneratedReportScoreRecord[] {
  const groups = new Map<number, NcsAnswerEvaluationRecord[]>();
  for (const evaluation of evaluations) {
    const items = groups.get(evaluation.criterionId) ?? [];
    items.push(evaluation);
    groups.set(evaluation.criterionId, items);
  }

  return [...groups.values()].map((items) => {
    const first = items[0];
    const outputs = items.map((item) => item.output);
    const totalScores = outputs.map((output) => requiredScore(output.scores.total));
    const score = Math.round(totalScores.reduce((sum, value) => sum + value, 0) / totalScores.length);
    const evidences = items.flatMap((item) =>
      exactEvidenceQuotes(item.output).map((text) => ({
        sourceType: "INTERVIEW_ANSWER" as const,
        answerId: item.answerId,
        text,
      })),
    );

    return {
      criterionId: first.criterionId,
      criterionName: first.criterionTitleSnapshot,
      score,
      rationale: `${first.criterionTitleSnapshot}의 유효 NCS 답변 ${items.length}개 total score 평균입니다.`,
      rubricAnchor: `${first.output.rubricVersion} / ${first.ncsProfileVersion}`,
      confidence: lowestConfidence(outputs.map((output) => output.confidence)),
      uncertaintyReasons: uniqueStrings(outputs.flatMap((output) => output.growth.gaps)),
      evidences: uniqueEvidence(evidences),
    };
  });
}

function toQuestionEvaluation(evaluation: NcsAnswerEvaluationRecord): GeneratedQuestionEvaluationRecord {
  return {
    criterionId: evaluation.criterionId,
    criterionName: evaluation.criterionTitleSnapshot,
    answerId: evaluation.answerId,
    question: evaluation.question,
    rubricAnchor: `${evaluation.output.rubricVersion} / ${evaluation.ncsProfileVersion}`,
    confidence: evaluation.output.confidence,
    uncertaintyReasons: [...evaluation.output.growth.gaps],
    evidences: exactEvidenceQuotes(evaluation.output).map((text) => ({
      sourceType: "INTERVIEW_ANSWER",
      answerId: evaluation.answerId,
      text,
    })),
  };
}

function requiredSnapshots(answer: NcsReportAnswerSnapshot) {
  if (
    !answer.sessionQuestionId ||
    !answer.ncsQuestionMode ||
    (!answer.ncsBindings?.length && (
      !answer.criterionId ||
      !answer.criterionTitleSnapshot?.trim() ||
      !answer.ncsProfileId ||
      !answer.ncsProfileVersion
    ))
  ) {
    throw new NonRetryableAiWorkerFailure(`NCS session question snapshot is incomplete for answer ${answer.answerId}`);
  }
  const bindings = answer.ncsBindings?.length
    ? answer.ncsBindings
    : [{
        criterionId: answer.criterionId,
        criterionTitleSnapshot: answer.criterionTitleSnapshot ?? "",
        ncsProfileId: answer.ncsProfileId!,
        ncsProfileVersion: answer.ncsProfileVersion!,
        alignmentStatus: answer.alignmentStatus ?? "REVIEW_REQUIRED",
        alignmentScore: answer.alignmentScore,
        evaluatorVersion: answer.evaluatorVersion,
        bindingOrder: 1 as const,
      }];
  if (
    bindings.length < 1 ||
    bindings.length > 2 ||
    new Set(bindings.map((binding) => canonicalNcsProfileId(binding.ncsProfileId))).size !== bindings.length
  ) {
    throw new NonRetryableAiWorkerFailure(`NCS binding snapshot is invalid for answer ${answer.answerId}`);
  }
  for (const binding of bindings) {
    if (!binding.criterionId || !binding.criterionTitleSnapshot.trim()) {
      throw new NonRetryableAiWorkerFailure(`NCS binding snapshot is incomplete for answer ${answer.answerId}`);
    }
    if (binding.ncsProfileVersion !== NCS_PROFILE_VERSION) {
      throw new NonRetryableAiWorkerFailure(`unsupported NCS profile version: ${binding.ncsProfileVersion}`);
    }
  }
  return {
    sessionQuestionId: answer.sessionQuestionId,
    ncsQuestionMode: answer.ncsQuestionMode,
    bindings: bindings.map((binding) => ({
      ...binding,
      criterionId: binding.criterionId!,
      criterionTitleSnapshot: binding.criterionTitleSnapshot.trim(),
    })),
  };
}

function toEvaluatorProfileId(profileId: NcsApiProfileId): NcsProfileId {
  return {
    PROBLEM_SOLVING: "problem-solving",
    COMMUNICATION: "communication",
    COLLABORATION_COMMUNICATION: "communication",
    DIGITAL: "digital",
    JOB_TECHNICAL: "digital",
  }[profileId] as NcsProfileId;
}

function canonicalNcsProfileId(
  profileId: NcsApiProfileId,
): "JOB_TECHNICAL" | "COLLABORATION_COMMUNICATION" | "PROBLEM_SOLVING" {
  if (profileId === "DIGITAL" || profileId === "JOB_TECHNICAL") return "JOB_TECHNICAL";
  if (profileId === "COMMUNICATION" || profileId === "COLLABORATION_COMMUNICATION") {
    return "COLLABORATION_COMMUNICATION";
  }
  return "PROBLEM_SOLVING";
}

function exactEvidenceQuotes(output: NcsTextEvaluationOutput): string[] {
  return uniqueStrings([
    ...output.competencies.flatMap((competency) => competency.behaviors.flatMap((behavior) => behavior.evidenceQuotes)),
    ...output.evidenceMaturity.dimensions.flatMap((dimension) => dimension.evidenceQuotes),
    ...output.evidenceMaturity.sharedEvidence.map((evidence) => evidence.quote),
  ]);
}

const LOGIC_DIMENSIONS_BY_MODE: Record<NcsQuestionMode, string[]> = {
  EXPERIENCE_BEHAVIOR: ["situation-task", "owned-action", "result-impact", "reflection-transfer"],
  TECHNICAL_KNOWLEDGE: ["concept-accuracy", "causal-reasoning", "technical-application", "technical-risk-validation"],
  SITUATIONAL_DESIGN: ["problem-constraints", "alternatives-tradeoffs", "execution-plan", "validation-adaptation"],
};

function ncsFivePointBreakdown(
  output: NcsTextEvaluationOutput,
  profileId: NcsProfileId,
): { behaviorPoints: number; logicPoints: number; baseScore: number } | null {
  if (output.scoreStatus !== "SCORED") return null;
  const competency = output.competencies.find((candidate) => candidate.profileId === profileId);
  if (!competency) return null;
  const behaviorPoints = Math.min(3, competency.behaviors.filter((behavior) => behavior.observed).length);
  const relevantDimensionIds = new Set(LOGIC_DIMENSIONS_BY_MODE[output.questionMode]);
  const connectedDimensionCount = output.evidenceMaturity.dimensions.filter(
    (dimension) => relevantDimensionIds.has(dimension.dimensionId) && dimension.score > 0,
  ).length;
  const logicPoints = connectedDimensionCount === 0
    ? 0
    : connectedDimensionCount === relevantDimensionIds.size
      ? 2
      : 1;
  return { behaviorPoints, logicPoints, baseScore: behaviorPoints + logicPoints };
}

function exactEvidenceQuotesForProfile(output: NcsTextEvaluationOutput, profileId: NcsProfileId): string[] {
  const competencyQuotes = output.competencies
    .filter((competency) => competency.profileId === profileId)
    .flatMap((competency) => competency.behaviors.flatMap((behavior) => behavior.evidenceQuotes));
  const relevantDimensionIds = new Set(LOGIC_DIMENSIONS_BY_MODE[output.questionMode]);
  const logicQuotes = output.evidenceMaturity.dimensions
    .filter((dimension) => relevantDimensionIds.has(dimension.dimensionId))
    .flatMap((dimension) => dimension.evidenceQuotes);
  return uniqueStrings([...competencyQuotes, ...logicQuotes]);
}

function unscoredOutput(
  questionMode: NcsQuestionMode,
  scoreStatus: "INSUFFICIENT_INPUT" | "LOW_ALIGNMENT",
  coverage: number,
  reasons: string[],
  providerMode: "mock" | "openai" = "mock",
  model?: string,
): NcsTextEvaluationOutput {
  return {
    kind: NCS_TEXT_EVALUATION_KIND,
    rubricVersion: NCS_TEXT_EVALUATION_RUBRIC_VERSION,
    promptVersion: NCS_TEXT_EVALUATION_PROMPT_VERSION,
    providerMode,
    ...(model ? { model } : {}),
    scoreStatus,
    scores: { competency: null, evidence: null, total: null },
    coverage,
    confidence: "LOW",
    questionMode,
    competencies: [],
    evidenceMaturity: { dimensions: [], sharedEvidence: [] },
    growth: {
      strengths: [],
      gaps: reasons,
      nextAction: "질문에 맞는 구체적인 본인 행동과 결과 근거를 추가하세요.",
      followUpQuestion: "당시 본인이 직접 수행한 행동과 확인한 결과를 구체적으로 설명해 주세요.",
    },
    guardrail: {
      result: "PASS",
      reasons,
      exactQuotesValid: true,
      sharedEvidenceValid: true,
      confidenceValid: true,
      forbiddenWordingDetected: false,
      promptInjectionDetected: false,
    },
  };
}

function lowestConfidence(values: NcsEvaluationConfidence[]): NcsEvaluationConfidence {
  if (values.includes("LOW")) return "LOW";
  if (values.includes("MEDIUM")) return "MEDIUM";
  return "HIGH";
}

function requiredScore(value: number | null): number {
  if (value === null) throw new NonRetryableAiWorkerFailure("SCORED NCS output requires total score");
  return value;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function uniqueEvidence<T extends { answerId?: number; text: string }>(values: T[]): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.answerId ?? ""}:${value.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sumOptional(values: Array<number | undefined>): number | undefined {
  return values.some((value) => value !== undefined)
    ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : undefined;
}
