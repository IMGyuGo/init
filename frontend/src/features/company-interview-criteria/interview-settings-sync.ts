import type { InterviewSettings } from "./types";

export function reconcileSettingsAfterCriteriaSave(
  currentSettings: InterviewSettings,
  savedCriteria: InterviewSettings["criteria"],
): InterviewSettings {
  const savedCriterionIds = new Set(savedCriteria.map((criterion) => criterion.criterionId));

  return {
    ...currentSettings,
    criteria: savedCriteria,
    questions: currentSettings.questions.filter(
      (question) => question.criterionId === null || savedCriterionIds.has(question.criterionId),
    ),
  };
}

export function reconcileSettingsAfterQuestionSetConfirm(
  currentSettings: InterviewSettings,
): InterviewSettings {
  return {
    ...currentSettings,
    questionGenerationPolicy: {
      ...currentSettings.questionGenerationPolicy,
      questionSetRequiresReconfirmation: false,
    },
    questionSetRequiresReconfirmation: false,
  };
}
