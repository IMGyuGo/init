import {
  GeneratedQuestionEvaluationRecord,
  GeneratedReportScoreRecord,
  AnswerFactCheckRunRecord,
  NcsAnswerEvaluationRecord,
} from "./ai-result.repository";
import {
  ANSWER_FACT_CHECK_MOCK_MODEL_VERSION,
  evaluateAnswerFactCheck,
  runAnswerFactCheck,
} from "./answer-fact-check";
import {
  NO_EXTERNAL_KNOWLEDGE_VERSION,
  AnswerFactCheckProvider,
  FactCheckProviderMode,
  FactEvidenceLedgerItem,
} from "./answer-fact-check.types";
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
import {
  aggregateNcsFinalEvaluation,
  type NcsFinalEvaluation,
  type NcsIncompleteReason,
  type NcsSessionPolicyInput,
} from "./ncs-final-evaluation";

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
  evaluationStatus?: "EVALUATED" | "STT_UNAVAILABLE";
  transcriptUnavailableReason?: string;
  isFollowUpAnswer?: boolean;
  parentAnswerId?: number;
  followUpReason?: "NCS_EVIDENCE_GAP" | "FACT_CLARIFICATION" | "GENERAL_EVIDENCE_GAP";
}

export interface NcsReportEvaluationBatch {
  evaluations: NcsAnswerEvaluationRecord[];
  factChecks: AnswerFactCheckRunRecord[];
  scores: GeneratedReportScoreRecord[];
  questionEvaluations: GeneratedQuestionEvaluationRecord[];
  allProfilesScored: boolean;
  finalEvaluation?: NcsFinalEvaluation;
  usage?: {
    modelName: string;
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface NcsAnswerFactCheckContext {
  provider?: AnswerFactCheckProvider;
  providerMode: FactCheckProviderMode;
  configuredModelVersion: string;
  knowledgeSnapshotVersion: string;
  evidenceLedger: FactEvidenceLedgerItem[];
}

export interface NcsFollowUpPlan {
  required: boolean;
  questionMode: NcsQuestionMode;
  answerTimeSec: number;
  baseScores: Array<{
    ncsProfileId: "JOB_TECHNICAL" | "COLLABORATION_COMMUNICATION" | "PROBLEM_SOLVING";
    scoreStatus: NcsTextEvaluationOutput["scoreStatus"];
    baseScore: number | null;
  }>;
  focusPoints: string[];
  logicalStructureGap?: string;
  alreadyConfirmedEvidence: string[];
}

export interface FactClarificationPlan {
  required: boolean;
  providerStatus: "COMPLETED" | "FAILED" | "TIMEOUT" | "INVALID_OUTPUT";
  gateStatus: "PASS_THROUGH" | "CLARIFICATION_CANDIDATE" | "FACT_CHECK_REQUIRED" | null;
  clarificationClaims: Array<{
    claimText: string;
    verdict: "CONTRADICTED" | "AMBIGUOUS" | "UNVERIFIABLE";
    rationale: string;
  }>;
  supportedClaims: string[];
  usage?: { modelName: string; inputTokens?: number; outputTokens?: number };
}

export async function planFactClarification(
  payload: Record<string, unknown>,
  context: NcsAnswerFactCheckContext,
): Promise<FactClarificationPlan> {
  const answerId = Number(payload.answerId);
  const questionMode = isNcsQuestionMode(payload.ncsQuestionMode) ? payload.ncsQuestionMode : undefined;
  const previousQuestion = typeof payload.previousQuestion === "string" ? payload.previousQuestion.trim() : "";
  const transcript = typeof payload.transcript === "string" ? payload.transcript.trim() : "";
  if (!Number.isSafeInteger(answerId) || answerId <= 0 || !questionMode || !previousQuestion || !transcript) {
    throw new NonRetryableAiWorkerFailure("fact clarification snapshot is incomplete");
  }
  const execution = await evaluateAnswerFactCheck({
    input: {
      answerId,
      question: previousQuestion,
      answerText: transcript,
      questionMode,
      knowledgeSnapshotVersion: context.knowledgeSnapshotVersion,
      evidenceLedger: context.evidenceLedger,
    },
    provider: context.provider,
    providerMode: context.providerMode,
    configuredModelVersion: context.configuredModelVersion,
  });
  const record = execution.record;
  const required = record.providerStatus === "COMPLETED" && (
    record.gateStatus === "CLARIFICATION_CANDIDATE" || record.gateStatus === "FACT_CHECK_REQUIRED"
  );
  return {
    required,
    providerStatus: record.providerStatus,
    gateStatus: record.gateStatus,
    clarificationClaims: required
      ? record.claims
          .filter((claim) => claim.verdict === "AMBIGUOUS" || (
            claim.verdict === "CONTRADICTED" && claim.claimRole === "ANSWER_CORE"
          ))
          .map((claim) => ({
            claimText: claim.claimText,
            verdict: claim.verdict as "CONTRADICTED" | "AMBIGUOUS" | "UNVERIFIABLE",
            rationale: claim.rationale,
          }))
      : [],
    supportedClaims: record.claims
      .filter((claim) => claim.verdict === "SUPPORTED")
      .map((claim) => claim.claimText),
    usage: execution.usage,
  };
}

export function planNcsFollowUp(payload: Record<string, unknown>): NcsFollowUpPlan | undefined {
  if (!Array.isArray(payload.ncsBindings) || payload.ncsBindings.length === 0) return undefined;
  const answerId = Number(payload.answerId);
  const sessionQuestionId = Number(payload.sessionQuestionId);
  const questionMode = isNcsQuestionMode(payload.ncsQuestionMode) ? payload.ncsQuestionMode : undefined;
  const previousQuestion = typeof payload.previousQuestion === "string" ? payload.previousQuestion.trim() : "";
  const transcript = typeof payload.transcript === "string" ? payload.transcript.trim() : "";
  const answerTimeSec = Number(payload.answerTimeSec);
  if (
    !Number.isSafeInteger(answerId) || answerId <= 0 ||
    !Number.isSafeInteger(sessionQuestionId) || sessionQuestionId <= 0 ||
    !questionMode || !previousQuestion || !transcript ||
    !Number.isInteger(answerTimeSec) || answerTimeSec <= 0
  ) {
    throw new NonRetryableAiWorkerFailure("NCS follow-up snapshot is incomplete");
  }
  const ncsBindings = payload.ncsBindings.map((value, index) => parseFollowUpBinding(value, index));
  const snapshots = requiredSnapshots({
    answerId,
    sessionQuestionId,
    question: previousQuestion,
    transcript,
    ncsQuestionMode: questionMode,
    ncsBindings,
  });
  const input = parseNcsTextEvaluationInput({
    questionMode,
    question: previousQuestion,
    answerText: transcript,
    profileIds: snapshots.bindings.map((binding) => toEvaluatorProfileId(binding.ncsProfileId)),
    profileVersion: snapshots.bindings[0]?.ncsProfileVersion,
  });
  const output = evaluateNcsTextDeterministically(input);
  const baseScores = snapshots.bindings.map((binding) => {
    const points = ncsFivePointBreakdown(output, toEvaluatorProfileId(binding.ncsProfileId));
    return {
      ncsProfileId: canonicalNcsProfileId(binding.ncsProfileId),
      scoreStatus: output.scoreStatus,
      baseScore: points?.baseScore ?? null,
    };
  });
  const focusPoints = uniqueStrings([
    ...output.competencies.flatMap((competency) =>
      competency.behaviors.filter((behavior) => !behavior.observed).map((behavior) => behavior.label),
    ),
    ...output.growth.gaps,
  ]);
  const relevantDimensionIds = new Set(LOGIC_DIMENSIONS_BY_MODE[questionMode]);
  const missingLogic = output.evidenceMaturity.dimensions
    .filter((dimension) => relevantDimensionIds.has(dimension.dimensionId) && dimension.score === 0)
    .map((dimension) => dimension.label);
  return {
    required: baseScores.some((score) => score.baseScore === null || score.baseScore < 5),
    questionMode,
    answerTimeSec,
    baseScores,
    focusPoints: uniqueStrings([...focusPoints, ...missingLogic]),
    ...(missingLogic.length > 0 ? { logicalStructureGap: missingLogic.join(", ") } : {}),
    alreadyConfirmedEvidence: exactEvidenceQuotes(output),
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
  sessionPolicies?: NcsSessionPolicyInput[],
  factCheckContext?: NcsAnswerFactCheckContext,
): Promise<NcsReportEvaluationBatch> {
  const primaryAnswers = answers.filter((answer) => !answer.isFollowUpAnswer);
  const structuralReasons: NcsIncompleteReason[] = [];
  const snapshotCandidates = primaryAnswers.filter((answer) =>
    (answer.ncsBindings?.length ?? 0) > 0 || answer.ncsProfileId !== undefined,
  );
  const ncsAnswers = sessionPolicies === undefined
    ? snapshotCandidates
    : snapshotCandidates.filter((answer) => {
        const reasons = currentSnapshotReasons(answer);
        structuralReasons.push(...reasons);
        return reasons.length === 0;
      });
  if (sessionPolicies !== undefined) {
    for (const answer of primaryAnswers.filter((item) => !snapshotCandidates.includes(item))) {
      structuralReasons.push(structuralReason(
        "SESSION_SNAPSHOT_MISSING",
        `Answer ${answer.answerId} has no NCS session question snapshot.`,
        answer,
      ));
    }
  }
  if (ncsAnswers.length === 0) {
    if (sessionPolicies === undefined) {
      throw new NonRetryableAiWorkerFailure("at least one primary NCS answer requires a session question snapshot");
    }
    return {
      evaluations: [],
      factChecks: [],
      scores: [],
      questionEvaluations: [],
      allProfilesScored: false,
      finalEvaluation: aggregateNcsFinalEvaluation(sessionPolicies, [], structuralReasons),
    };
  }

  const followUpsByParent = new Map<number, NcsReportAnswerSnapshot[]>();
  for (const followUp of answers.filter((answer) => answer.isFollowUpAnswer)) {
    if (!followUp.parentAnswerId || !snapshotCandidates.some((answer) => answer.answerId === followUp.parentAnswerId)) {
      if (sessionPolicies !== undefined) {
        structuralReasons.push(structuralReason(
          "FOLLOW_UP_LINK_INVALID",
          `Follow-up answer ${followUp.answerId} is not linked to a valid base answer.`,
          followUp,
        ));
      }
      continue;
    }
    const items = followUpsByParent.get(followUp.parentAnswerId!) ?? [];
    items.push(followUp);
    followUpsByParent.set(followUp.parentAnswerId!, items);
  }
  if (sessionPolicies !== undefined) {
    for (const [parentAnswerId, followUps] of followUpsByParent) {
      if (followUps.length > 1) {
        structuralReasons.push({
          code: "FOLLOW_UP_LINK_INVALID",
          message: `Base answer ${parentAnswerId} has more than one follow-up answer.`,
          ncsProfileId: null,
          sessionQuestionId: followUps[0]?.sessionQuestionId ?? null,
          answerId: parentAnswerId,
          retryable: false,
        });
      }
    }
  }
  for (const answer of ncsAnswers) {
    if (answer.evaluationStatus === "STT_UNAVAILABLE") {
      const profileIds = answer.ncsBindings?.length
        ? answer.ncsBindings.map((binding) => canonicalNcsProfileId(binding.ncsProfileId))
        : answer.ncsProfileId
          ? [canonicalNcsProfileId(answer.ncsProfileId)]
          : [];
      const message = answer.transcriptUnavailableReason?.trim()
        ? `Answer ${answer.answerId} cannot be evaluated because STT is unavailable: ${answer.transcriptUnavailableReason.trim()}`
        : `Answer ${answer.answerId} cannot be evaluated because STT is unavailable.`;
      structuralReasons.push(...profileIds.map((profileId) => structuralReason(
        "STT_UNAVAILABLE",
        message,
        answer,
        false,
        profileId,
      )));
    }
  }
  const evaluated = await Promise.all(ncsAnswers.map((answer) =>
    evaluateAnswer(
      reportId,
      answer,
      followUpsByParent.get(answer.answerId)?.[0],
      provider,
      factCheckContext ?? defaultFactCheckContext(),
    ),
  ));
  const evaluations = evaluated.flatMap((item) => item.evaluations);
  const factChecks = evaluated.map((item) => item.factCheck);
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

  const finalEvaluation = sessionPolicies
      ? aggregateNcsFinalEvaluation(sessionPolicies, evaluations.map((evaluation) => ({
        answerId: evaluation.answerId,
        sessionQuestionId: evaluation.sessionQuestionId,
        ncsProfileId: evaluation.ncsProfileId,
        scoreStatus: evaluation.output.scoreStatus,
        effectiveScore: evaluation.effectiveScore,
        evidenceCount: evaluation.evidences.length,
      })), structuralReasons)
    : undefined;
  return { evaluations, factChecks, scores, questionEvaluations, allProfilesScored, usage, finalEvaluation };
}

function currentSnapshotReasons(answer: NcsReportAnswerSnapshot): NcsIncompleteReason[] {
  const reasons: NcsIncompleteReason[] = [];
  if (!answer.sessionQuestionId || !answer.question?.trim() || !answer.ncsQuestionMode) {
    reasons.push(structuralReason(
      "SESSION_SNAPSHOT_MISSING",
      `Answer ${answer.answerId} has an incomplete session question snapshot.`,
      answer,
    ));
    return reasons;
  }
  const bindings = answer.ncsBindings?.length
    ? answer.ncsBindings
    : answer.ncsProfileId && answer.ncsProfileVersion && answer.criterionId && answer.criterionTitleSnapshot?.trim()
      ? [{
          criterionId: answer.criterionId,
          criterionTitleSnapshot: answer.criterionTitleSnapshot,
          ncsProfileId: answer.ncsProfileId,
          ncsProfileVersion: answer.ncsProfileVersion,
          alignmentStatus: answer.alignmentStatus ?? "REVIEW_REQUIRED",
          alignmentScore: answer.alignmentScore,
          evaluatorVersion: answer.evaluatorVersion,
          bindingOrder: 1 as const,
        }]
      : [];
  if (bindings.length < 1 || bindings.length > 2) {
    reasons.push(structuralReason(
      "SESSION_SNAPSHOT_MISSING",
      `Answer ${answer.answerId} must have one or two NCS bindings.`,
      answer,
    ));
    return reasons;
  }
  if (new Set(bindings.map((binding) => canonicalNcsProfileId(binding.ncsProfileId))).size !== bindings.length) {
    reasons.push(structuralReason(
      "SESSION_SNAPSHOT_MISSING",
      `Answer ${answer.answerId} has duplicate NCS bindings.`,
      answer,
    ));
  }
  for (const binding of bindings) {
    if (!binding.criterionId || !binding.criterionTitleSnapshot.trim()) {
      reasons.push(structuralReason(
        "SESSION_SNAPSHOT_MISSING",
        `Answer ${answer.answerId} has an incomplete NCS binding.`,
        answer,
      ));
    }
    if (binding.ncsProfileVersion !== NCS_PROFILE_VERSION) {
      reasons.push(structuralReason(
        "UNSUPPORTED_PROFILE_VERSION",
        `Answer ${answer.answerId} uses unsupported NCS profile version ${binding.ncsProfileVersion}.`,
        answer,
      ));
    }
  }
  return reasons;
}

function structuralReason(
  code: NcsIncompleteReason["code"],
  message: string,
  answer: NcsReportAnswerSnapshot,
  retryable = false,
  ncsProfileId?: NcsIncompleteReason["ncsProfileId"],
): NcsIncompleteReason {
  return {
    code,
    message,
    ncsProfileId: ncsProfileId ?? (answer.ncsProfileId ? canonicalNcsProfileId(answer.ncsProfileId) : null),
    sessionQuestionId: answer.sessionQuestionId ?? null,
    answerId: answer.answerId,
    retryable,
  };
}

async function evaluateAnswer(
  reportId: number,
  answer: NcsReportAnswerSnapshot,
  followUp: NcsReportAnswerSnapshot | undefined,
  provider?: NcsTextEvaluationProvider,
  factCheckContext: NcsAnswerFactCheckContext = defaultFactCheckContext(),
): Promise<{
  evaluations: NcsAnswerEvaluationRecord[];
  factCheck: AnswerFactCheckRunRecord;
  usage?: { modelName: string; inputTokens?: number; outputTokens?: number };
}> {
  const snapshots = requiredSnapshots(answer);
  const question = answer.question?.trim();
  if (!question) {
    throw new NonRetryableAiWorkerFailure(`NCS question content is missing for answer ${answer.answerId}`);
  }
  const baseInput = parseNcsTextEvaluationInput({
    questionMode: snapshots.ncsQuestionMode,
    question,
    answerText: answer.transcript,
    profileIds: snapshots.bindings.map((binding) => toEvaluatorProfileId(binding.ncsProfileId)),
    profileVersion: snapshots.bindings[0]?.ncsProfileVersion,
  });

  const composedAnswerText = followUp?.transcript.trim()
    ? `${answer.transcript}\n${followUp.transcript}`
    : answer.transcript;
  const [baseResult, factCheckResult] = await Promise.all([
    runNcsEvaluation(baseInput, snapshots.bindings, provider),
    runAnswerFactCheck({
      reportId,
      ...(followUp?.transcript.trim() ? {
        followUpAnswerId: followUp.answerId,
        inputCompositionVersion: "BASE_FOLLOW_UP_V1" as const,
      } : {}),
      input: {
        answerId: answer.answerId,
        question,
        answerText: composedAnswerText,
        questionMode: snapshots.ncsQuestionMode,
        knowledgeSnapshotVersion: factCheckContext.knowledgeSnapshotVersion,
        evidenceLedger: factCheckContext.evidenceLedger,
      },
      provider: factCheckContext.provider,
      providerMode: factCheckContext.providerMode,
      configuredModelVersion: factCheckContext.configuredModelVersion,
    }),
  ]);
  const baseOutput = baseResult.output;
  const basePoints = new Map(snapshots.bindings.map((binding) => [
    canonicalNcsProfileId(binding.ncsProfileId),
    ncsFivePointBreakdown(baseOutput, toEvaluatorProfileId(binding.ncsProfileId)),
  ]));
  const shouldReevaluate =
    Boolean(followUp?.transcript.trim()) &&
    baseOutput.scoreStatus === "SCORED";
  const combinedResult = shouldReevaluate && followUp
    ? await runNcsEvaluation(parseNcsTextEvaluationInput({
        questionMode: snapshots.ncsQuestionMode,
        question,
        answerText: composedAnswerText,
        profileIds: snapshots.bindings.map((binding) => toEvaluatorProfileId(binding.ncsProfileId)),
        profileVersion: snapshots.bindings[0]?.ncsProfileVersion,
      }), snapshots.bindings, provider)
    : undefined;
  const output = combinedResult?.output.scoreStatus === "SCORED" ? combinedResult.output : baseOutput;
  const usage = mergeEvaluationUsage(
    mergeEvaluationUsage(baseResult.usage, combinedResult?.usage),
    factCheckResult.usage,
  );

  return {
    evaluations: snapshots.bindings.map((binding) => {
      const profileId = canonicalNcsProfileId(binding.ncsProfileId);
      const initialPoints = basePoints.get(profileId) ?? null;
      const combinedPoints = combinedResult?.output.scoreStatus === "SCORED"
        ? ncsFivePointBreakdown(combinedResult.output, toEvaluatorProfileId(binding.ncsProfileId))
        : null;
      const points = initialPoints && combinedPoints && combinedPoints.baseScore > initialPoints.baseScore
        ? combinedPoints
        : initialPoints;
      const evidences = output.scoreStatus === "SCORED"
        ? exactEvidenceQuotesForProfile(output, toEvaluatorProfileId(binding.ncsProfileId))
            .flatMap((quote) => evidenceSourcesForQuote(quote, answer, combinedResult ? followUp : undefined))
        : [];
      return {
      reportId,
      answerId: answer.answerId,
      sessionQuestionId: snapshots.sessionQuestionId,
      criterionId: binding.criterionId,
      criterionTitleSnapshot: binding.criterionTitleSnapshot,
      ncsProfileId: profileId,
      ncsQuestionMode: snapshots.ncsQuestionMode,
      ncsProfileVersion: binding.ncsProfileVersion,
      output,
      question,
      behaviorPoints: initialPoints?.behaviorPoints ?? null,
      logicPoints: initialPoints?.logicPoints ?? null,
      baseScore: initialPoints?.baseScore ?? null,
      effectiveScore: points?.baseScore ?? null,
      followUpApplied: Boolean(combinedResult),
      evidences,
    };}),
    factCheck: factCheckResult.record,
    usage,
  };
}

function defaultFactCheckContext(): NcsAnswerFactCheckContext {
  return {
    providerMode: "mock",
    configuredModelVersion: ANSWER_FACT_CHECK_MOCK_MODEL_VERSION,
    knowledgeSnapshotVersion: NO_EXTERNAL_KNOWLEDGE_VERSION,
    evidenceLedger: [],
  };
}

async function runNcsEvaluation(
  input: ReturnType<typeof parseNcsTextEvaluationInput>,
  bindings: NcsReportQuestionBindingSnapshot[],
  provider?: NcsTextEvaluationProvider,
): Promise<{
  output: NcsTextEvaluationOutput;
  usage?: { modelName: string; inputTokens?: number; outputTokens?: number };
}> {
  let output: NcsTextEvaluationOutput;
  let usage: { modelName: string; inputTokens?: number; outputTokens?: number } | undefined;
  if (bindings.some((binding) => binding.alignmentStatus !== "ALIGNED")) {
    output = unscoredOutput(input.questionMode, "LOW_ALIGNMENT", Math.min(
      ...bindings.map((binding) => binding.alignmentScore ?? 0),
    ), ["세션 질문 snapshot이 NCS 정렬 통과 상태가 아닙니다."]);
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
  return { output, usage };
}

function evidenceSourcesForQuote(
  quote: string,
  baseAnswer: NcsReportAnswerSnapshot,
  followUp?: NcsReportAnswerSnapshot,
): NcsAnswerEvaluationRecord["evidences"] {
  const sources: NcsAnswerEvaluationRecord["evidences"] = [];
  if (baseAnswer.transcript.includes(quote)) {
    sources.push({ sourceAnswerId: baseAnswer.answerId, sourceKind: "BASE", quote });
  }
  if (followUp?.transcript.includes(quote)) {
    sources.push({ sourceAnswerId: followUp.answerId, sourceKind: "FOLLOW_UP", quote });
  }
  return sources;
}

function mergeEvaluationUsage(
  first?: { modelName: string; inputTokens?: number; outputTokens?: number },
  second?: { modelName: string; inputTokens?: number; outputTokens?: number },
): { modelName: string; inputTokens?: number; outputTokens?: number } | undefined {
  if (!first && !second) return undefined;
  return {
    modelName: second?.modelName ?? first!.modelName,
    inputTokens: sumOptional([first?.inputTokens, second?.inputTokens]),
    outputTokens: sumOptional([first?.outputTokens, second?.outputTokens]),
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

function isNcsQuestionMode(value: unknown): value is NcsQuestionMode {
  return value === "EXPERIENCE_BEHAVIOR" ||
    value === "TECHNICAL_KNOWLEDGE" ||
    value === "SITUATIONAL_DESIGN";
}

function parseFollowUpBinding(value: unknown, index: number): NcsReportQuestionBindingSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new NonRetryableAiWorkerFailure(`ncsBindings[${index}] must be an object`);
  }
  const record = value as Record<string, unknown>;
  const profileId = record.ncsProfileId;
  const bindingOrder = Number(record.bindingOrder);
  const criterionId = Number(record.criterionId);
  if (
    !isNcsApiProfileId(profileId) ||
    (bindingOrder !== 1 && bindingOrder !== 2) ||
    !Number.isSafeInteger(criterionId) || criterionId <= 0 ||
    typeof record.criterionTitleSnapshot !== "string" || !record.criterionTitleSnapshot.trim() ||
    typeof record.ncsProfileVersion !== "string" || !record.ncsProfileVersion.trim() ||
    typeof record.alignmentStatus !== "string" || !record.alignmentStatus.trim()
  ) {
    throw new NonRetryableAiWorkerFailure(`ncsBindings[${index}] is invalid`);
  }
  const alignmentScore = Number(record.alignmentScore);
  return {
    criterionId,
    criterionTitleSnapshot: record.criterionTitleSnapshot.trim(),
    ncsProfileId: profileId,
    ncsProfileVersion: record.ncsProfileVersion.trim(),
    alignmentStatus: record.alignmentStatus.trim(),
    ...(Number.isFinite(alignmentScore) ? { alignmentScore } : {}),
    ...(typeof record.evaluatorVersion === "string" && record.evaluatorVersion.trim()
      ? { evaluatorVersion: record.evaluatorVersion.trim() }
      : {}),
    bindingOrder,
  };
}

function isNcsApiProfileId(value: unknown): value is NcsApiProfileId {
  return value === "JOB_TECHNICAL" ||
    value === "COLLABORATION_COMMUNICATION" ||
    value === "PROBLEM_SOLVING" ||
    value === "COMMUNICATION" ||
    value === "DIGITAL";
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
