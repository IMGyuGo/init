import { strict as assert } from "node:assert";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  CandidateDomainError,
  CandidateService,
  DEV_CANDIDATE_USER,
  InMemoryCandidateRepository,
} from "../../candidate";
import { InMemoryInterviewRepository } from "../repository/in-memory-interview.repository";
import { UploadInterviewMediaDto } from "../dto/upload-interview-media.dto";
import { InterviewController } from "../controller/interview.controller";
import { PublicInterviewController } from "../public/public-interview.controller";
import { InMemoryInterviewMediaStorageAdapter } from "./interview-media-storage.adapter";
import { InterviewService } from "./interview.service";

const UPLOAD_REQUEST_ID = "7b93470b-53d2-4c88-a275-e6e35ae5b97d";

function createFixture() {
  const candidateRepository = new InMemoryCandidateRepository();
  const candidateService = new CandidateService(candidateRepository);
  const interviewRepository = new InMemoryInterviewRepository();
  const mediaStorage = new InMemoryInterviewMediaStorageAdapter();
  const service = new InterviewService(candidateService, interviewRepository, undefined, mediaStorage);
  return { candidateRepository, interviewRepository, mediaStorage, service };
}

function createMediaFile(sizeBytes = 2_048) {
  return {
    originalName: "answer.webm",
    mimeType: "video/webm",
    sizeBytes,
    buffer: Buffer.alloc(sizeBytes, 1),
  };
}

test("same uploadRequestId reuses one file asset and skips a duplicate S3 put", async () => {
  const { mediaStorage, service } = createFixture();
  const started = await service.startMockInterview({ questionTypes: ["INTRO"] }, DEV_CANDIDATE_USER);

  const first = await service.uploadInterviewMedia(
    started.data.sessionId,
    createMediaFile(),
    DEV_CANDIDATE_USER,
    UPLOAD_REQUEST_ID,
  );
  const replay = await service.uploadInterviewMedia(
    started.data.sessionId,
    createMediaFile(),
    DEV_CANDIDATE_USER,
    UPLOAD_REQUEST_ID,
  );

  assert.equal(replay.data.fileId, first.data.fileId);
  assert.equal(mediaStorage.objects.length, 1);
  assert.match(first.data.storageKey, new RegExp(UPLOAD_REQUEST_ID));
});

test("same uploadRequestId rejects different metadata without overwriting S3", async () => {
  const { mediaStorage, service } = createFixture();
  const started = await service.startMockInterview({ questionTypes: ["INTRO"] }, DEV_CANDIDATE_USER);
  await service.uploadInterviewMedia(
    started.data.sessionId,
    createMediaFile(),
    DEV_CANDIDATE_USER,
    UPLOAD_REQUEST_ID,
  );

  await assert.rejects(
    () => service.uploadInterviewMedia(
      started.data.sessionId,
      createMediaFile(4_096),
      DEV_CANDIDATE_USER,
      UPLOAD_REQUEST_ID,
    ),
    (error: unknown) => error instanceof CandidateDomainError
      && error.statusCode === 409
      && error.code === "COMMON_CONFLICT",
  );
  assert.equal(mediaStorage.objects.length, 1);
});

test("legacy media uploads without uploadRequestId still create independent assets", async () => {
  const { mediaStorage, service } = createFixture();
  const started = await service.startMockInterview({ questionTypes: ["INTRO"] }, DEV_CANDIDATE_USER);

  const first = await service.uploadInterviewMedia(started.data.sessionId, createMediaFile(), DEV_CANDIDATE_USER);
  const second = await service.uploadInterviewMedia(started.data.sessionId, createMediaFile(), DEV_CANDIDATE_USER);

  assert.notEqual(second.data.fileId, first.data.fileId);
  assert.equal(mediaStorage.objects.length, 2);
});

test("media upload DTO accepts an optional UUID and rejects arbitrary request IDs", async () => {
  const valid = plainToInstance(UploadInterviewMediaDto, { uploadRequestId: UPLOAD_REQUEST_ID });
  assert.equal((await validate(valid)).length, 0);

  const legacy = plainToInstance(UploadInterviewMediaDto, {});
  assert.equal((await validate(legacy)).length, 0);

  const invalid = plainToInstance(UploadInterviewMediaDto, { uploadRequestId: "retry-1" });
  const errors = await validate(invalid);
  assert.equal(errors.length, 1);
  assert.ok(errors[0]?.constraints?.isUuid);
});

test("realtime transcript answer is saved before media and media upload attaches it later", async () => {
  const { interviewRepository, service } = createFixture();
  const started = await service.startMockInterview({ questionTypes: ["INTRO"] }, DEV_CANDIDATE_USER);
  const questionId = started.data.currentQuestion!.questionId;

  const saved = await service.saveMockAnswer(started.data.sessionId, {
    questionId,
    durationSeconds: 12,
    transcript: "realtime transcript",
    mediaUploadRequestId: UPLOAD_REQUEST_ID,
  }, DEV_CANDIDATE_USER);

  assert.equal(saved.data.answer.videoFileId, undefined);
  const uploaded = await service.uploadInterviewMedia(
    started.data.sessionId,
    createMediaFile(),
    DEV_CANDIDATE_USER,
    UPLOAD_REQUEST_ID,
  );
  const answers = await interviewRepository.listAnswersBySession(started.data.sessionId);

  assert.equal(answers[0]?.videoFileId, uploaded.data.fileId);
});

test("file-less answer without realtime transcript is rejected", async () => {
  const { service } = createFixture();
  const started = await service.startMockInterview({ questionTypes: ["INTRO"] }, DEV_CANDIDATE_USER);
  const questionId = started.data.currentQuestion!.questionId;

  await assert.rejects(
    () => service.saveMockAnswer(started.data.sessionId, {
      questionId,
      durationSeconds: 12,
      mediaUploadRequestId: UPLOAD_REQUEST_ID,
    }, DEV_CANDIDATE_USER),
    (error: unknown) => error instanceof CandidateDomainError && error.code === "COMMON_VALIDATION_FAILED",
  );
});

test("candidate and public media controllers forward uploadRequestId", async () => {
  const candidateCalls: unknown[][] = [];
  const candidateController = new InterviewController({
    uploadInterviewMedia: async (...args: unknown[]) => {
      candidateCalls.push(args);
      return { data: { fileId: 1 }, meta: {} };
    },
  } as never);
  await candidateController.uploadInterviewMedia(
    { currentUser: DEV_CANDIDATE_USER } as never,
    "41",
    { originalname: "answer.webm", mimetype: "video/webm", size: 4, buffer: Buffer.alloc(4) },
    { uploadRequestId: UPLOAD_REQUEST_ID },
  );
  assert.equal(candidateCalls[0]?.[3], UPLOAD_REQUEST_ID);

  const publicCalls: unknown[][] = [];
  const publicController = new PublicInterviewController({
    uploadMedia: async (...args: unknown[]) => {
      publicCalls.push(args);
      return { data: { fileId: 1 }, meta: {} };
    },
  } as never);
  await publicController.uploadMedia(
    { publicInterviewAccess: { sessionId: 41 } } as never,
    "41",
    { originalname: "answer.webm", mimetype: "video/webm", size: 4, buffer: Buffer.alloc(4) },
    { uploadRequestId: UPLOAD_REQUEST_ID },
  );
  assert.equal(publicCalls[0]?.[3], UPLOAD_REQUEST_ID);
});

test("a unique-race winner with different metadata is still rejected", async () => {
  const repository = new InMemoryCandidateRepository();
  repository.findFileAssetByUploadRequestId = async () => undefined;
  repository.createFileAsset = async (input) => ({
    ...input,
    fileId: 99,
    originalName: "different.webm",
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
  });
  const candidateService = new CandidateService(repository);

  await assert.rejects(
    () => candidateService.createInterviewFileAsset({
      storageKey: `candidate/1/interviews/${UPLOAD_REQUEST_ID}-answer.webm`,
      originalName: "answer.webm",
      mimeType: "video/webm",
      sizeBytes: 2_048,
      uploadRequestId: UPLOAD_REQUEST_ID,
    }, DEV_CANDIDATE_USER),
    (error: unknown) => error instanceof CandidateDomainError
      && error.statusCode === 409
      && error.code === "COMMON_CONFLICT",
  );
});
