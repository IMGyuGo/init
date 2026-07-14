import type { ApplicantEvaluation } from "./types";

type NcsAnswerEvaluation = NonNullable<ApplicantEvaluation["report"]>["ncsAnswerEvaluations"][number];

export type NcsEvaluationView = {
  ncsEvaluationId: number;
  answerId: number;
  criterionTitle: string;
  profileLabel: string;
  questionModeLabel: string;
  question: string;
  scoreStatus: NcsAnswerEvaluation["scoreStatus"];
  statusLabel: string;
  statusMessage: string;
  statusTone: "success" | "warning" | "danger";
  competencyScore: number | null;
  evidenceScore: number | null;
  totalScore: number | null;
  coveragePercent: number;
  confidenceLabel: string;
  evidenceQuotes: string[];
  strengths: string[];
  gaps: string[];
  nextAction: string | null;
};

const PROFILE_LABELS: Record<NcsAnswerEvaluation["ncsProfileId"], string> = {
  PROBLEM_SOLVING: "문제해결",
  COMMUNICATION: "의사소통",
  DIGITAL: "디지털",
};

const QUESTION_MODE_LABELS: Record<NcsAnswerEvaluation["ncsQuestionMode"], string> = {
  EXPERIENCE_BEHAVIOR: "경험·행동",
  TECHNICAL_KNOWLEDGE: "기술 지식",
  SITUATIONAL_DESIGN: "상황 설계",
};

const CONFIDENCE_LABELS: Record<NcsAnswerEvaluation["confidence"], string> = {
  HIGH: "높음",
  MEDIUM: "보통",
  LOW: "낮음",
};

const STATUS_VIEW: Record<
  NcsAnswerEvaluation["scoreStatus"],
  Pick<NcsEvaluationView, "statusLabel" | "statusMessage" | "statusTone">
> = {
  SCORED: {
    statusLabel: "평가 완료",
    statusMessage: "",
    statusTone: "success",
  },
  INSUFFICIENT_INPUT: {
    statusLabel: "평가 불충분",
    statusMessage: "답변 근거가 충분하지 않아 점수를 산정하지 않았습니다.",
    statusTone: "warning",
  },
  LOW_ALIGNMENT: {
    statusLabel: "기준 불일치",
    statusMessage: "질문과 평가 기준의 정렬도가 낮아 점수를 산정하지 않았습니다.",
    statusTone: "warning",
  },
  BLOCKED: {
    statusLabel: "검증 차단",
    statusMessage: "평가 결과 검증을 통과하지 못해 점수를 저장하지 않았습니다.",
    statusTone: "danger",
  },
};

export function buildNcsEvaluationViews(
  evaluations: NcsAnswerEvaluation[],
  answers: ApplicantEvaluation["answers"],
): NcsEvaluationView[] {
  const questionByAnswerId = new Map(answers.map((answer) => [answer.answerId, answer.questionContent]));

  return evaluations.map((evaluation) => {
    const statusView = STATUS_VIEW[evaluation.scoreStatus];
    const details = evaluation.scoreStatus === "SCORED"
      ? extractCanonicalResultDetails(evaluation.result)
      : EMPTY_RESULT_DETAILS;

    return {
      ncsEvaluationId: evaluation.ncsEvaluationId,
      answerId: evaluation.answerId,
      criterionTitle: evaluation.criterionTitleSnapshot,
      profileLabel: PROFILE_LABELS[evaluation.ncsProfileId],
      questionModeLabel: QUESTION_MODE_LABELS[evaluation.ncsQuestionMode],
      question: questionByAnswerId.get(evaluation.answerId)?.trim() || "질문 정보 없음",
      scoreStatus: evaluation.scoreStatus,
      ...statusView,
      competencyScore: evaluation.scores.competency,
      evidenceScore: evaluation.scores.evidence,
      totalScore: evaluation.scores.total,
      coveragePercent: Math.round(Math.min(1, Math.max(0, evaluation.coverage)) * 100),
      confidenceLabel: CONFIDENCE_LABELS[evaluation.confidence],
      evidenceQuotes: details.evidenceQuotes,
      strengths: details.strengths,
      gaps: details.gaps,
      nextAction: details.nextAction,
    };
  });
}

type CanonicalResultDetails = {
  evidenceQuotes: string[];
  strengths: string[];
  gaps: string[];
  nextAction: string | null;
};

const EMPTY_RESULT_DETAILS: CanonicalResultDetails = {
  evidenceQuotes: [],
  strengths: [],
  gaps: [],
  nextAction: null,
};

function extractCanonicalResultDetails(value: unknown): CanonicalResultDetails {
  const result = asRecord(value);
  if (!result) return EMPTY_RESULT_DETAILS;

  const quotes: string[] = [];
  for (const competency of asRecordArray(result.competencies)) {
    for (const behavior of asRecordArray(competency.behaviors)) {
      quotes.push(...asStringArray(behavior.evidenceQuotes));
    }
  }
  const evidenceMaturity = asRecord(result.evidenceMaturity);
  for (const dimension of asRecordArray(evidenceMaturity?.dimensions)) {
    quotes.push(...asStringArray(dimension.evidenceQuotes));
  }

  const growth = asRecord(result.growth);
  return {
    evidenceQuotes: [...new Set(quotes)],
    strengths: asStringArray(growth?.strengths),
    gaps: asStringArray(growth?.gaps),
    nextAction: asNonEmptyString(growth?.nextAction),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(asRecord).filter((item): item is Record<string, unknown> => item !== null) : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(asNonEmptyString).filter((item): item is string => item !== null)
    : [];
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
