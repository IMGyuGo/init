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

export type NcsApiProfileId = "PROBLEM_SOLVING" | "COMMUNICATION" | "DIGITAL";

export interface NcsReportAnswerSnapshot {
  answerId: number;
  question: string;
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
  isFollowUpAnswer?: boolean;
}

export interface NcsReportEvaluationBatch {
  evaluations: NcsAnswerEvaluationRecord[];
  scores: GeneratedReportScoreRecord[];
  questionEvaluations: GeneratedQuestionEvaluationRecord[];
  allProfilesScored: boolean;
}

export function hasNcsAnswerSnapshots(answers: NcsReportAnswerSnapshot[]): boolean {
  return answers.some((answer) => !answer.isFollowUpAnswer && answer.ncsProfileId !== undefined);
}

export async function evaluateNcsReportAnswers(
  reportId: number,
  answers: NcsReportAnswerSnapshot[],
  expectedCriterionIds: number[],
  provider?: NcsTextEvaluationProvider,
): Promise<NcsReportEvaluationBatch> {
  const primaryAnswers = answers.filter((answer) => !answer.isFollowUpAnswer);
  if (primaryAnswers.length === 0 || primaryAnswers.some((answer) => !answer.ncsProfileId)) {
    throw new NonRetryableAiWorkerFailure("every primary NCS answer requires a session question snapshot");
  }

  const evaluations = await Promise.all(primaryAnswers.map((answer) => evaluateAnswer(reportId, answer, provider)));
  const scored = evaluations.filter((evaluation) => evaluation.output.scoreStatus === "SCORED");
  const scores = aggregateScores(scored);
  const questionEvaluations = scored.map(toQuestionEvaluation);
  const scoredCriterionIds = new Set(scores.map((score) => score.criterionId));
  const allProfilesScored =
    expectedCriterionIds.length > 0 && expectedCriterionIds.every((criterionId) => scoredCriterionIds.has(criterionId));

  return { evaluations, scores, questionEvaluations, allProfilesScored };
}

async function evaluateAnswer(
  reportId: number,
  answer: NcsReportAnswerSnapshot,
  provider?: NcsTextEvaluationProvider,
): Promise<NcsAnswerEvaluationRecord> {
  const snapshot = requiredSnapshot(answer);
  const input = parseNcsTextEvaluationInput({
    questionMode: snapshot.ncsQuestionMode,
    question: answer.question,
    answerText: answer.transcript,
    profileIds: [toEvaluatorProfileId(snapshot.ncsProfileId)],
    profileVersion: snapshot.ncsProfileVersion,
  });

  let output: NcsTextEvaluationOutput;
  if (snapshot.alignmentStatus !== "ALIGNED") {
    output = unscoredOutput(input.questionMode, "LOW_ALIGNMENT", snapshot.alignmentScore ?? 0, [
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
    reportId,
    answerId: answer.answerId,
    sessionQuestionId: snapshot.sessionQuestionId,
    criterionId: snapshot.criterionId,
    criterionTitleSnapshot: snapshot.criterionTitleSnapshot,
    ncsProfileId: snapshot.ncsProfileId,
    ncsQuestionMode: snapshot.ncsQuestionMode,
    ncsProfileVersion: snapshot.ncsProfileVersion,
    output,
    question: answer.question,
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

function requiredSnapshot(answer: NcsReportAnswerSnapshot) {
  if (
    !answer.sessionQuestionId ||
    !answer.criterionId ||
    !answer.criterionTitleSnapshot?.trim() ||
    !answer.ncsProfileId ||
    !answer.ncsQuestionMode ||
    !answer.ncsProfileVersion
  ) {
    throw new NonRetryableAiWorkerFailure(`NCS session question snapshot is incomplete for answer ${answer.answerId}`);
  }
  if (answer.ncsProfileVersion !== NCS_PROFILE_VERSION) {
    throw new NonRetryableAiWorkerFailure(`unsupported NCS profile version: ${answer.ncsProfileVersion}`);
  }
  return {
    sessionQuestionId: answer.sessionQuestionId,
    criterionId: answer.criterionId,
    criterionTitleSnapshot: answer.criterionTitleSnapshot.trim(),
    ncsProfileId: answer.ncsProfileId,
    ncsQuestionMode: answer.ncsQuestionMode,
    ncsProfileVersion: answer.ncsProfileVersion,
    alignmentStatus: answer.alignmentStatus,
    alignmentScore: answer.alignmentScore,
  };
}

function toEvaluatorProfileId(profileId: NcsApiProfileId): NcsProfileId {
  return {
    PROBLEM_SOLVING: "problem-solving",
    COMMUNICATION: "communication",
    DIGITAL: "digital",
  }[profileId] as NcsProfileId;
}

function exactEvidenceQuotes(output: NcsTextEvaluationOutput): string[] {
  return uniqueStrings([
    ...output.competencies.flatMap((competency) => competency.behaviors.flatMap((behavior) => behavior.evidenceQuotes)),
    ...output.evidenceMaturity.dimensions.flatMap((dimension) => dimension.evidenceQuotes),
    ...output.evidenceMaturity.sharedEvidence.map((evidence) => evidence.quote),
  ]);
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
