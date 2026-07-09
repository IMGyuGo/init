import assert from "node:assert/strict";
import { PrismaInterviewRepository } from "./prisma-interview.repository";

test("prisma interview repository persists answers through interview_answers", async () => {
  const createCalls: unknown[] = [];
  const submittedAt = "2026-07-01T00:00:00.000Z";
  const nonverbalMetadata = {
    cameraWarnings: 1,
    microphoneWarnings: 0,
    longSilenceCount: 2,
    testModeUsed: false,
  };
  const repository = new PrismaInterviewRepository({
    interviewAnswer: {
      create: async (args: unknown) => {
        createCalls.push(args);
        return {
          answerId: 101n,
          sessionId: 10001n,
          questionId: 20001n,
          videoFileId: 30001n,
          audioFileId: null,
          transcript: null,
          nonverbalMetadata,
          durationSeconds: 42,
          submittedAt: new Date(submittedAt),
        };
      },
    },
  } as never);

  const answer = await repository.createAnswer({
    sessionId: 10001,
    questionId: 20001,
    videoFileId: 30001,
    nonverbalMetadata,
    durationSeconds: 42,
    submittedAt,
  });

  assert.deepEqual(createCalls, [
    {
      data: {
        sessionId: 10001n,
        questionId: 20001n,
        videoFileId: 30001n,
        audioFileId: null,
        nonverbalMetadata,
        durationSeconds: 42,
        submittedAt: new Date(submittedAt),
      },
    },
  ]);
  assert.equal(answer.answerId, 101);
  assert.equal(answer.sessionId, 10001);
  assert.equal(answer.questionId, 20001);
  assert.equal(answer.videoFileId, 30001);
  assert.deepEqual(answer.nonverbalMetadata, nonverbalMetadata);
});
