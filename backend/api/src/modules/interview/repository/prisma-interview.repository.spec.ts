import assert from "node:assert/strict";
import { PrismaInterviewRepository } from "./prisma-interview.repository";

test("prisma interview repository persists answers through interview_answers", async () => {
  const createCalls: unknown[] = [];
  const submittedAt = "2026-07-01T00:00:00.000Z";
  const transcript = "실시간 STT로 변환된 답변입니다.";
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
          transcript,
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
    transcript,
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
        transcript,
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
  assert.equal(answer.transcript, transcript);
  assert.deepEqual(answer.nonverbalMetadata, nonverbalMetadata);
});

test("prisma interview repository replaces transcript and nonverbal metadata together", async () => {
  const updateCalls: unknown[] = [];
  const submittedAt = "2026-07-01T00:01:00.000Z";
  const transcript = "재답변의 실시간 STT 결과입니다.";
  const nonverbalMetadata = {
    cameraWarnings: 0,
    microphoneWarnings: 0,
    longSilenceCount: 0,
    testModeUsed: false,
    integritySummary: { gazeAwayCount: 1, suspicionLevel: "LOW" },
  };
  const repository = new PrismaInterviewRepository({
    interviewAnswer: {
      update: async (args: unknown) => {
        updateCalls.push(args);
        return {
          answerId: 101n,
          sessionId: 10001n,
          questionId: 20001n,
          videoFileId: 30002n,
          audioFileId: null,
          transcript,
          nonverbalMetadata,
          durationSeconds: 36,
          submittedAt: new Date(submittedAt),
        };
      },
    },
  } as never);

  const answer = await repository.replaceAnswer({
    answerId: 101,
    videoFileId: 30002,
    transcript,
    nonverbalMetadata,
    durationSeconds: 36,
    submittedAt,
  });

  assert.deepEqual(updateCalls, [
    {
      where: { answerId: 101n },
      data: {
        videoFileId: 30002n,
        audioFileId: null,
        nonverbalMetadata,
        durationSeconds: 36,
        submittedAt: new Date(submittedAt),
        transcript,
      },
    },
  ]);
  assert.equal(answer.answerId, 101);
  assert.equal(answer.transcript, transcript);
  assert.deepEqual(answer.nonverbalMetadata, nonverbalMetadata);
});
