import { SALTLUX_FIXED_DEMO } from "../../../shared/saltlux-fixed-demo";
import { InMemoryInterviewRepository } from "./in-memory-interview.repository";

describe("InMemoryInterviewRepository Saltlux fixed demo follow-up", () => {
  it("inserts the follow-up immediately after the personalized answer exactly once", () => {
    const repository = new InMemoryInterviewRepository();
    repository.saveRecruitingRuntimeSession({
      sessionId: 71,
      applicationId: 81,
      candidateId: 91,
      interviewType: "RECRUITING",
      sessionMode: "DEMO_PRESET",
      status: "IN_PROGRESS",
      showQuestionText: true,
      currentQuestionIndex: 0,
      questionIds: [101, 102, 103],
      startedAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T00:00:00.000Z",
    });
    const answer = repository.createAnswer({
      sessionId: 71,
      questionId: 102,
      durationSeconds: 20,
      submittedAt: "2026-07-20T00:00:10.000Z",
    });

    expect(repository.ensureSaltluxDemoFollowUp({
      sessionId: 71,
      answerId: answer.answerId,
      content: SALTLUX_FIXED_DEMO.questions.followUp,
      answerTimeSec: 22,
    })).toBe(true);
    expect(repository.ensureSaltluxDemoFollowUp({
      sessionId: 71,
      answerId: answer.answerId,
      content: SALTLUX_FIXED_DEMO.questions.followUp,
      answerTimeSec: 22,
    })).toBe(false);

    const session = repository.findRecruitingRuntimeSession(71);
    expect(session?.questionIds).toHaveLength(4);
    expect(repository.findQuestion(session?.questionIds[2] ?? 0)?.content).toBe(SALTLUX_FIXED_DEMO.questions.followUp);
  });
});
