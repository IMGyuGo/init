import assert from "node:assert/strict";
import type { InterviewAnswer, RuntimeInterviewSession } from "../interview.runtime.types";
import { SALTLUX_FIXED_DEMO, SALTLUX_FIXED_DEMO_FIXTURE_ID } from "../../../shared/saltlux-fixed-demo";
import { InterviewService } from "./interview.service";

describe("Saltlux fixed demo interview handoff", () => {
  it("replaces realtime transcript input with the prepared answer and fixed follow-up", async () => {
    const service = createService();
    const payload = await buildAiJobPayload(
      service,
      SALTLUX_FIXED_DEMO.questions.personalized,
      {
        previousQuestion: SALTLUX_FIXED_DEMO.questions.personalized,
        transcript: "실시간 STT가 잘못 인식한 문장",
        jobDescription: "AI 검색 백엔드 개발",
      },
      "FOLLOW_UP",
    );

    assert.equal(payload.transcript, SALTLUX_FIXED_DEMO.answerScripts.personalized);
    assert.equal(payload.presentationFixtureId, SALTLUX_FIXED_DEMO_FIXTURE_ID);
    assert.equal(payload.fixedFollowUpQuestion, SALTLUX_FIXED_DEMO.questions.followUp);
  });

  it("adds the prepared transcript to STT jobs for the exact fixed question", async () => {
    const service = createService();
    const payload = await buildAiJobPayload(
      service,
      SALTLUX_FIXED_DEMO.questions.common,
      { audioFileId: 91 },
      "STT",
    );

    assert.equal(payload.fixedTranscript, SALTLUX_FIXED_DEMO.answerScripts.common);
    assert.equal(payload.presentationFixtureId, SALTLUX_FIXED_DEMO_FIXTURE_ID);
  });
});

function createService() {
  return new InterviewService(
    {
      getInterviewFileAsset: async () => ({ storageKey: "candidate/66/fixed-demo-answer.webm" }),
    } as never,
    {
      findQuestion: async () => ({
        questionId: 41,
        questionType: "EXPERIENCE",
        content: SALTLUX_FIXED_DEMO.questions.common,
        sortOrder: 1,
        interviewType: "RECRUITING",
        isActive: false,
      }),
    } as never,
  );
}

async function buildAiJobPayload(
  service: InterviewService,
  question: string,
  requestBody: Record<string, unknown>,
  processType: "STT" | "FOLLOW_UP",
) {
  const session = {
    sessionId: 31,
    interviewType: "RECRUITING",
    sessionMode: "DEMO_PRESET",
  } as RuntimeInterviewSession;
  const answer = {
    answerId: 51,
    sessionId: 31,
    questionId: 41,
    audioFileId: 91,
    durationSeconds: 20,
    submittedAt: "2026-07-20T00:00:00.000Z",
  } as InterviewAnswer;
  const repository = service as unknown as {
    interviewRepository: { findQuestion: () => Promise<{ content: string }> };
  };
  repository.interviewRepository.findQuestion = async () => ({
    questionId: 41,
    questionType: "EXPERIENCE",
    content: question,
    sortOrder: 1,
    interviewType: "RECRUITING",
    isActive: false,
  }) as never;

  return (service as unknown as {
    buildAiJobPayload(
      session: RuntimeInterviewSession,
      answer: InterviewAnswer,
      requestBody: Record<string, unknown>,
      processType: "STT" | "FOLLOW_UP",
      currentUser: { userId: number; candidateId: number; userType: "CANDIDATE" },
    ): Promise<Record<string, unknown>>;
  }).buildAiJobPayload(
    session,
    answer,
    requestBody,
    processType,
    { userId: 77, candidateId: 66, userType: "CANDIDATE" },
  );
}
