import {
  SALTLUX_FIXED_DEMO,
  estimateKoreanSpeechSeconds,
  isSaltluxFixedDemoPosting,
  saltluxFixedDemoAnswerScriptForQuestion,
} from "./saltlux-fixed-demo";

describe("Saltlux fixed presentation fixture", () => {
  it("matches only the intended company and exact posting title", () => {
    expect(isSaltluxFixedDemoPosting("㈜솔트룩스", SALTLUX_FIXED_DEMO.jobTitle)).toBe(true);
    expect(isSaltluxFixedDemoPosting("당근", SALTLUX_FIXED_DEMO.jobTitle)).toBe(false);
    expect(isSaltluxFixedDemoPosting("솔트룩스", "AI Backend Engineer")).toBe(false);
  });

  it("keeps every question and prepared answer within 30 seconds", () => {
    const pairs = [
      [SALTLUX_FIXED_DEMO.questions.common, SALTLUX_FIXED_DEMO.answerScripts.common],
      [SALTLUX_FIXED_DEMO.questions.personalized, SALTLUX_FIXED_DEMO.answerScripts.personalized],
      [SALTLUX_FIXED_DEMO.questions.followUp, SALTLUX_FIXED_DEMO.answerScripts.followUp],
    ] as const;

    for (const [question, answer] of pairs) {
      expect(estimateKoreanSpeechSeconds(answer)).toBeLessThanOrEqual(SALTLUX_FIXED_DEMO.answerTimeSec);
      expect(
        estimateKoreanSpeechSeconds(question) + estimateKoreanSpeechSeconds(answer),
      ).toBeLessThanOrEqual(SALTLUX_FIXED_DEMO.maxQuestionAndAnswerSeconds);
    }
  });

  it("maps only the three fixed questions to their prepared answer scripts", () => {
    expect(saltluxFixedDemoAnswerScriptForQuestion(SALTLUX_FIXED_DEMO.questions.common))
      .toBe(SALTLUX_FIXED_DEMO.answerScripts.common);
    expect(saltluxFixedDemoAnswerScriptForQuestion(SALTLUX_FIXED_DEMO.questions.personalized))
      .toBe(SALTLUX_FIXED_DEMO.answerScripts.personalized);
    expect(saltluxFixedDemoAnswerScriptForQuestion(SALTLUX_FIXED_DEMO.questions.followUp))
      .toBe(SALTLUX_FIXED_DEMO.answerScripts.followUp);
    expect(saltluxFixedDemoAnswerScriptForQuestion("일반 면접 질문입니다."))
      .toBeUndefined();
  });
});
