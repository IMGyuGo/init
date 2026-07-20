import { SALTLUX_FIXED_DEMO } from "../../../shared/saltlux-fixed-demo";
import { shouldUseSaltluxFixedDemoReport } from "./saltlux-fixed-demo-report";

const answers = [
  { answerId: 1, question: SALTLUX_FIXED_DEMO.questions.common },
  { answerId: 2, question: SALTLUX_FIXED_DEMO.questions.personalized },
  {
    answerId: 3,
    question: SALTLUX_FIXED_DEMO.questions.followUp,
    isFollowUpAnswer: true as const,
    parentAnswerId: 2,
  },
];

describe("Saltlux fixed report recovery", () => {
  it("recovers the immutable snapshot even when the stored session mode is inconsistent", () => {
    expect(shouldUseSaltluxFixedDemoReport({
      companyName: "㈜솔트룩스",
      jobTitle: SALTLUX_FIXED_DEMO.jobTitle,
      sessionMode: "STANDARD",
      answers,
    })).toBe(true);
  });

  it("does not recover a different company or follow-up snapshot", () => {
    expect(shouldUseSaltluxFixedDemoReport({
      companyName: "당근",
      jobTitle: SALTLUX_FIXED_DEMO.jobTitle,
      sessionMode: "DEMO_PRESET",
      answers,
    })).toBe(false);
    expect(shouldUseSaltluxFixedDemoReport({
      companyName: "㈜솔트룩스",
      jobTitle: SALTLUX_FIXED_DEMO.jobTitle,
      sessionMode: "STANDARD",
      answers: answers.map((answer) =>
        answer.isFollowUpAnswer ? { ...answer, question: "다른 꼬리질문입니다." } : answer,
      ),
    })).toBe(false);
    expect(shouldUseSaltluxFixedDemoReport({
      companyName: "㈜솔트룩스",
      jobTitle: SALTLUX_FIXED_DEMO.jobTitle,
      sessionMode: "STANDARD",
      answers: [...answers, { answerId: 4, question: "추가 질문입니다." }],
    })).toBe(false);
  });
});
