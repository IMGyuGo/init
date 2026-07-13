export type RecordedClientNextStepType =
  | "STANDARD_QUESTION"
  | "FOLLOW_UP_QUESTION"
  | "INTERVIEW_COMPLETE"
  | "NOT_READY";

export type ClientNextStepType = RecordedClientNextStepType | "UNKNOWN";

type QuestionLike = {
  questionId: number;
  questionType?: string;
};

type ResolveClientNextStepTypeInput = {
  sourceQuestionId: number;
  outcome: string;
  nextReady: boolean;
  questions: QuestionLike[];
  totalQuestions: number;
};

const FOLLOW_UP_READY_OUTCOMES = new Set([
  "FOLLOW_UP_READY",
  "REALTIME_STT_FOLLOW_UP_READY",
]);

export function resolveClientNextStepType({
  sourceQuestionId,
  outcome,
  nextReady,
  questions,
  totalQuestions,
}: ResolveClientNextStepTypeInput): RecordedClientNextStepType {
  if (!nextReady) {
    return "NOT_READY";
  }
  if (FOLLOW_UP_READY_OUTCOMES.has(outcome)) {
    return "FOLLOW_UP_QUESTION";
  }
  if (outcome === "INTERVIEW_COMPLETE_READY") {
    return "INTERVIEW_COMPLETE";
  }

  const sourceIndex = questions.findIndex((question) => question.questionId === sourceQuestionId);
  const nextQuestion = sourceIndex >= 0 ? questions[sourceIndex + 1] : undefined;
  if (nextQuestion) {
    return nextQuestion.questionType === "FOLLOW_UP" ? "FOLLOW_UP_QUESTION" : "STANDARD_QUESTION";
  }
  if (sourceIndex >= 0 && sourceIndex >= Math.max(0, totalQuestions - 1)) {
    return "INTERVIEW_COMPLETE";
  }

  return "STANDARD_QUESTION";
}
