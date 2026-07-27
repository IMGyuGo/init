import type { InterviewSessionMode } from "./api";

export const DEMO_PRESET_TOTAL_QUESTIONS = 3;

export function getRecruitingRuntimeTotalQuestions(
  sessionMode: InterviewSessionMode | undefined,
  loadedQuestionCount: number,
): number {
  return sessionMode === "DEMO_PRESET"
    ? Math.max(DEMO_PRESET_TOTAL_QUESTIONS, loadedQuestionCount)
    : loadedQuestionCount;
}
