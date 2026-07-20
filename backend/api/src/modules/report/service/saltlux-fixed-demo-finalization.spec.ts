import { SALTLUX_FIXED_DEMO } from "../../../shared/saltlux-fixed-demo";
import { buildSaltluxFixedDemoFinalization } from "./saltlux-fixed-demo-finalization";

const bindings = {
  job: {
    criterionId: 11,
    criterionTitleSnapshot: "직무 전문성",
    ncsProfileId: "JOB_TECHNICAL" as const,
    ncsProfileVersion: "NCS_ACTIVE_PROFILE_V2",
    alignmentStatus: "ALIGNED",
    bindingOrder: 1 as const,
  },
  collaboration: {
    criterionId: 12,
    criterionTitleSnapshot: "협업 및 의사소통",
    ncsProfileId: "COLLABORATION_COMMUNICATION" as const,
    ncsProfileVersion: "NCS_ACTIVE_PROFILE_V2",
    alignmentStatus: "ALIGNED",
    bindingOrder: 1 as const,
  },
  problem: {
    criterionId: 13,
    criterionTitleSnapshot: "문제 해결력",
    ncsProfileId: "PROBLEM_SOLVING" as const,
    ncsProfileVersion: "NCS_ACTIVE_PROFILE_V2",
    alignmentStatus: "ALIGNED",
    bindingOrder: 2 as const,
  },
};

describe("buildSaltluxFixedDemoFinalization", () => {
  it("builds a complete 88-point report with all three NCS profiles", () => {
    const result = buildSaltluxFixedDemoFinalization({
      reportId: 31,
      applicationId: 21,
      sessionId: 31,
      criteria: [
        { criterionId: 11, name: "직무 전문성", weight: 30 },
        { criterionId: 12, name: "협업 및 의사소통", weight: 30 },
        { criterionId: 13, name: "문제 해결력", weight: 40 },
      ],
      answers: [
        {
          answerId: 101,
          sessionQuestionId: 201,
          question: SALTLUX_FIXED_DEMO.questions.common,
          ncsBindings: [bindings.collaboration],
        },
        {
          answerId: 102,
          sessionQuestionId: 202,
          question: SALTLUX_FIXED_DEMO.questions.personalized,
          ncsBindings: [bindings.job, bindings.problem],
        },
        {
          answerId: 103,
          sessionQuestionId: 203,
          question: SALTLUX_FIXED_DEMO.questions.followUp,
          isFollowUpAnswer: true,
          parentAnswerId: 102,
          ncsBindings: [bindings.job, bindings.problem],
        },
      ],
    });

    expect(result.totalScore).toBe(88);
    expect(result.profiles).toHaveLength(3);
    expect(result.profiles.map((profile) => profile.ncsProfileId)).toEqual([
      "JOB_TECHNICAL",
      "COLLABORATION_COMMUNICATION",
      "PROBLEM_SOLVING",
    ]);
    expect(result.profiles.find((profile) => profile.ncsProfileId === "PROBLEM_SOLVING")?.score).toBe(5);
    expect(result.profiles.filter((profile) => profile.followUpApplied)).toHaveLength(2);
  });

  it("rejects finalization when the fixed follow-up answer is missing", () => {
    expect(() => buildSaltluxFixedDemoFinalization({
      reportId: 31,
      applicationId: 21,
      sessionId: 31,
      criteria: [],
      answers: [
        { answerId: 101, sessionQuestionId: 201, question: SALTLUX_FIXED_DEMO.questions.common },
        { answerId: 102, sessionQuestionId: 202, question: SALTLUX_FIXED_DEMO.questions.personalized },
      ],
    })).toThrow("솔트룩스 시연 리포트 입력이 완전하지 않습니다.");
  });
});
