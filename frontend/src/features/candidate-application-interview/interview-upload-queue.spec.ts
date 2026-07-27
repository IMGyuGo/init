import assert from "node:assert/strict";
import test from "node:test";
import {
  createCandidateApiClient,
  createPublicInterviewApiClient,
  type SaveInterviewAnswerResponse,
} from "./api";
import {
  findOptimisticNextInterviewQuestion,
  InterviewUploadQueue,
  MemoryInterviewUploadJobStore,
  type InterviewUploadJob,
} from "./interview-upload-queue";

function createJob(id: string, questionId: number): InterviewUploadJob {
  return {
    uploadRequestId: id,
    sessionId: 41,
    questionId,
    mode: "mock",
    mediaKind: "video",
    fileBlob: new Blob([`answer-${questionId}`], { type: "video/webm" }),
    fileName: `answer-${questionId}.webm`,
    mimeType: "video/webm",
    answerRequest: { questionId, durationSeconds: 30 },
    state: "QUEUED",
    retryCount: 0,
    createdAt: questionId,
    updatedAt: questionId,
  };
}

function createAnswerResponse(questionId: number): SaveInterviewAnswerResponse {
  return {
    sessionId: 41,
    answer: {
      answerId: questionId,
      sessionId: 41,
      questionId,
      durationSeconds: 30,
      submittedAt: "2026-07-22T00:00:00.000Z",
    },
    idempotentReplay: false,
    nextQuestionAvailable: false,
    completionReady: false,
  };
}

test("processes restored jobs serially in creation order", async () => {
  const store = new MemoryInterviewUploadJobStore([
    createJob("00000000-0000-4000-8000-000000000002", 2),
    createJob("00000000-0000-4000-8000-000000000001", 1),
  ]);
  const events: string[] = [];
  let active = 0;
  let maxActive = 0;
  const queue = new InterviewUploadQueue(store, {
    upload: async (job) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      events.push(`upload:${job.questionId}`);
      await Promise.resolve();
      active -= 1;
      return { fileId: job.questionId, storageKey: `candidate/1/${job.fileName}` };
    },
    saveAnswer: async (job) => {
      events.push(`answer:${job.questionId}`);
      return createAnswerResponse(job.questionId);
    },
  }, { retryDelaysMs: [0, 0, 0] });

  await queue.resume();

  assert.equal(maxActive, 1);
  assert.deepEqual(events, ["upload:1", "answer:1", "upload:2", "answer:2"]);
  assert.deepEqual(await store.list(), []);
});

test("enqueue resolves after persistence without waiting for the network upload", async () => {
  const store = new MemoryInterviewUploadJobStore();
  let releaseUpload: (() => void) | undefined;
  let notifyUploadStarted: (() => void) | undefined;
  const uploadStarted = new Promise<void>((resolve) => {
    notifyUploadStarted = resolve;
  });
  const uploadReleased = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  const queue = new InterviewUploadQueue(store, {
    upload: async () => {
      notifyUploadStarted?.();
      await uploadReleased;
      return { fileId: 1, storageKey: "candidate/1/answer.webm" };
    },
    saveAnswer: async () => createAnswerResponse(1),
  });

  let enqueueResolved = false;
  const enqueuePromise = queue
    .enqueue(createJob("00000000-0000-4000-8000-000000000008", 8))
    .then(() => {
      enqueueResolved = true;
    });
  await uploadStarted;
  releaseUpload?.();
  await enqueuePromise;
  await queue.resume();

  assert.equal(enqueueResolved, true);
  assert.deepEqual(await store.list(), []);
});

test("retries answer saving without uploading the same blob again", async () => {
  const store = new MemoryInterviewUploadJobStore();
  let uploads = 0;
  let answerAttempts = 0;
  const queue = new InterviewUploadQueue(store, {
    upload: async (job) => {
      uploads += 1;
      return { fileId: 77, storageKey: `candidate/1/${job.fileName}` };
    },
    saveAnswer: async () => {
      answerAttempts += 1;
      if (answerAttempts === 1) throw new TypeError("network failed");
      return createAnswerResponse(3);
    },
  }, { retryDelaysMs: [0, 0, 0] });

  await queue.enqueue(createJob("00000000-0000-4000-8000-000000000003", 3));
  await queue.resume();

  assert.equal(uploads, 1);
  assert.equal(answerAttempts, 2);
  assert.deepEqual(await store.list(), []);
});

test("realtime transcript saves the answer before uploading media and does not save it twice", async () => {
  const store = new MemoryInterviewUploadJobStore();
  const events: string[] = [];
  const saved: number[] = [];
  const queue = new InterviewUploadQueue(store, {
    upload: async (job) => {
      events.push(`upload:${job.questionId}`);
      return { fileId: 88, storageKey: `candidate/1/${job.fileName}` };
    },
    saveAnswer: async (job, request) => {
      events.push(`answer:${job.questionId}`);
      assert.equal(request.mediaUploadRequestId, job.uploadRequestId);
      assert.equal(request.videoFileId, undefined);
      return createAnswerResponse(job.questionId);
    },
    onAnswerSaved: async (_job, result) => {
      saved.push(result.answer.answerId);
    },
  }, { retryDelaysMs: [0, 0, 0] });
  const job = {
    ...createJob("00000000-0000-4000-8000-000000000009", 9),
    answerRequest: { questionId: 9, durationSeconds: 30, transcript: "realtime transcript" },
  };

  await queue.enqueue(job);
  await queue.resume();

  assert.deepEqual(events, ["answer:9", "upload:9"]);
  assert.deepEqual(saved, [9]);
  assert.deepEqual(await store.list(), []);
});

test("offline jobs wait without consuming retries and resume when online", async () => {
  const store = new MemoryInterviewUploadJobStore();
  let online = false;
  let uploads = 0;
  const queue = new InterviewUploadQueue(store, {
    upload: async () => {
      uploads += 1;
      return { fileId: 1, storageKey: "candidate/1/answer.webm" };
    },
    saveAnswer: async () => createAnswerResponse(4),
  }, { isOnline: () => online, retryDelaysMs: [0, 0, 0] });
  const job = createJob("00000000-0000-4000-8000-000000000004", 4);

  await queue.enqueue(job);
  await queue.resume();
  assert.equal(uploads, 0);
  assert.equal((await store.list())[0]?.retryCount, 0);

  online = true;
  await queue.resume();
  assert.equal(uploads, 1);
  assert.deepEqual(await store.list(), []);
});

test("terminal 4xx failures remain available for recovery", async () => {
  const store = new MemoryInterviewUploadJobStore();
  const queue = new InterviewUploadQueue(store, {
    upload: async () => {
      throw { status: 409, message: "conflict" };
    },
    saveAnswer: async () => createAnswerResponse(5),
  }, { retryDelaysMs: [0, 0, 0] });

  await queue.enqueue(createJob("00000000-0000-4000-8000-000000000005", 5));
  await queue.resume();

  const [failed] = await store.list();
  assert.equal(failed?.state, "FAILED");
  assert.equal(failed?.retryCount, 0);
});

test("retries a failed persisted job only after explicit recovery", async () => {
  const failedJob = {
    ...createJob("00000000-0000-4000-8000-000000000007", 7),
    state: "FAILED" as const,
    lastError: "network failed",
  };
  const store = new MemoryInterviewUploadJobStore([failedJob]);
  let uploads = 0;
  const queue = new InterviewUploadQueue(store, {
    upload: async (job) => {
      uploads += 1;
      return { fileId: 7, storageKey: `candidate/1/${job.fileName}` };
    },
    saveAnswer: async () => createAnswerResponse(7),
  }, { retryDelaysMs: [0, 0, 0] });

  await queue.resume();
  assert.equal(uploads, 0);

  await queue.retryFailed(failedJob.uploadRequestId);
  assert.equal(uploads, 1);
  assert.deepEqual(await store.list(), []);
});

test("candidate and public API clients append uploadRequestId to multipart media", async () => {
  const formBodies: FormData[] = [];
  const fetcher: typeof fetch = async (_input, init) => {
    formBodies.push(init?.body as FormData);
    return new Response(JSON.stringify({
      data: {
        fileId: 1,
        ownerUserId: 1,
        storageKey: "candidate/1/answer.webm",
        originalName: "answer.webm",
        mimeType: "video/webm",
        sizeBytes: 4,
        status: "ACTIVE",
        createdAt: "2026-07-22T00:00:00.000Z",
      },
      meta: { traceId: "test", timestamp: "2026-07-22T00:00:00.000Z" },
    }), { status: 201, headers: { "content-type": "application/json" } });
  };
  const file = new File(["test"], "answer.webm", { type: "video/webm" });
  const requestId = "00000000-0000-4000-8000-000000000006";

  await createCandidateApiClient({ fetcher }).uploadInterviewMedia(41, file, requestId);
  await createPublicInterviewApiClient({ fetcher, publicAccessToken: "token" })
    .uploadInterviewMedia(41, file, requestId);

  assert.equal(formBodies[0]?.get("uploadRequestId"), requestId);
  assert.equal(formBodies[1]?.get("uploadRequestId"), requestId);
});

test("selects the next unanswered question after a completed follow-up", () => {
  const questions = [
    { questionId: 1, questionType: "INTRO" as const, sortOrder: 1, audioPrompt: "q1", answered: true, current: false },
    { questionId: 2, questionType: "FOLLOW_UP" as const, sortOrder: 2, audioPrompt: "q2", answered: false, current: true },
    { questionId: 3, questionType: "TECHNICAL" as const, sortOrder: 3, audioPrompt: "q3", answered: true, current: false },
    { questionId: 4, questionType: "TECHNICAL" as const, sortOrder: 4, audioPrompt: "q4", answered: false, current: false },
  ];

  assert.equal(findOptimisticNextInterviewQuestion(questions, 2)?.questionId, 4);
  assert.equal(findOptimisticNextInterviewQuestion(questions, 4), undefined);
  assert.equal(findOptimisticNextInterviewQuestion(questions, 99), undefined);
});
