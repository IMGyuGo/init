import { Inject, Injectable, Optional } from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  CandidateDomainError,
  CandidateService,
  type CandidateFolderContext,
  type CandidateProfileAiContextV1,
  type CurrentCandidateUser,
  type FileAsset,
  type InterviewSession,
} from "../../candidate";
import { DeviceCheckDto } from "../dto/interview.device-check.dto";
import {
  AiInterviewRequestDto,
  CreateRealtimeInterviewSessionDto,
  InsertFollowUpQuestionDto,
  RuntimeFileAssetDto,
  SaveInterviewAnswerDto,
  StartMockInterviewDto,
} from "../dto/interview.runtime.dto";
import {
  AiHandoffResult,
  CompleteInterviewResult,
  InterviewAnswer,
  InterviewAnswerNonverbalMetadata,
  InterviewQuestion,
  InterviewQuestionListResult,
  InterviewQuestionView,
  InterviewRuntimeView,
  InsertFollowUpQuestionResult,
  NextInterviewQuestionResult,
  RealtimeInterviewProvider,
  RealtimeInterviewSessionResult,
  RuntimeInterviewSession,
  SaveInterviewAnswerResult,
  StartMockInterviewResult,
} from "../interview.runtime.types";
import { AiJobDispatcherService } from "../../report/service/ai-job-dispatcher.service";
import {
  CandidateMockInterviewPassService,
  type CandidateMockInterviewPassPort,
} from "../../payment/service/candidate-mock-interview-pass.service";
import {
  INTERVIEW_REPOSITORY,
  type CreateMockContextQuestionInput,
  type CreateMockInterviewSessionInput,
  type FollowUpQuestionPolicy,
  type InterviewRepository,
} from "../repository/interview.repository";
import {
  InMemoryInterviewMediaStorageAdapter,
  INTERVIEW_MEDIA_STORAGE,
  type InterviewMediaStoragePort,
} from "./interview-media-storage.adapter";
import {
  InterviewNonverbalMetadataValidationError,
  normalizeInterviewNonverbalMetadata,
} from "./interview-nonverbal-metadata";

const DEFAULT_MOCK_QUESTION_TYPES = ["INTRO", "TECHNICAL", "EXPERIENCE", "CLOSING"] as const;
const DEFAULT_REALTIME_MODEL = "gpt-realtime-2";
const DEFAULT_REALTIME_VOICE = "marin";
const DEFAULT_REALTIME_API_BASE_URL = "https://api.openai.com";
const MOCK_REALTIME_CLIENT_SECRET_TTL_MS = 2 * 60 * 1000;
export type UploadedInterviewMediaFile = {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
};

type AnswerRequestBody = {
  questionId: number;
  videoFileId?: number;
  videoFile?: RuntimeFileAssetDto;
  audioFileId?: number;
  audioFile?: RuntimeFileAssetDto;
  transcript?: string;
  durationSeconds: number;
  allowReanswer: boolean;
  skipReason?: "RECORDING_VALIDATION_FAILED";
  nonverbalMetadata?: InterviewAnswerNonverbalMetadata;
  retryAnswerId?: number;
};
type MockQuestionType = InterviewQuestion["questionType"];

type OpenAiRealtimeClientSecretResponse = {
  value?: string;
  expires_at?: number;
  client_secret?: {
    value?: string;
    expires_at?: number;
  };
  error?: {
    message?: string;
  };
};

@Injectable()
export class InterviewService {
  constructor(
    @Inject(CandidateService) private readonly candidateService: CandidateService,
    @Inject(INTERVIEW_REPOSITORY) private readonly interviewRepository: InterviewRepository,
    @Optional()
    @Inject(AiJobDispatcherService)
    private readonly aiJobDispatcher?: AiJobDispatcherService,
    @Optional()
    @Inject(INTERVIEW_MEDIA_STORAGE)
    private readonly mediaStorage: InterviewMediaStoragePort = new InMemoryInterviewMediaStorageAdapter(),
    @Optional()
    @Inject(CandidateMockInterviewPassService)
    private readonly mockInterviewPasses?: CandidateMockInterviewPassPort,
  ) {}

  async listOwnedMockInterviewSessions(currentUser: CurrentCandidateUser): Promise<RuntimeInterviewSession[]> {
    return this.interviewRepository.listOwnedMockSessions(currentUser.candidateId);
  }

  saveDeviceCheck(sessionId: number, dto: DeviceCheckDto, currentUser: CurrentCandidateUser) {
    return this.candidateService.saveDeviceCheck(sessionId, dto, currentUser);
  }

  startInterview(applicationId: number, currentUser: CurrentCandidateUser) {
    return this.candidateService.startInterview(applicationId, currentUser);
  }

  getInterviewRuntime(applicationId: number, currentUser: CurrentCandidateUser) {
    return this.candidateService.getInterviewRuntime(applicationId, currentUser);
  }

  async startMockInterview(
    dto: StartMockInterviewDto,
    currentUser: CurrentCandidateUser,
  ): Promise<{ data: StartMockInterviewResult; meta: { traceId: string; timestamp: string } }> {
    const requestBody = this.toRequestBody(dto, "mockInterview");
    const showQuestionText = requestBody.showQuestionText === true;
    const questionTypes = this.resolveMockQuestionTypes(requestBody);
    const folderId = this.normalizeOptionalFolderId(requestBody.folderId);
    const contextQuestions = folderId
      ? await this.buildFolderMockQuestionsForCurrentUser(folderId, questionTypes, currentUser)
      : undefined;
    const questionIds = contextQuestions ? undefined : await this.selectMockQuestionIds(questionTypes);
    const now = new Date().toISOString();
    const input = {
      candidateId: currentUser.candidateId,
      showQuestionText,
      questionIds,
      contextQuestions,
      startedAt: now,
      updatedAt: now,
    };
    const session = this.interviewRepository.createMockSessionWithPass
      ? await this.interviewRepository.createMockSessionWithPass(input)
      : await this.createMockSessionWithExternalPass(input, new Date(now));

    return this.envelope({
      ...(await this.toRuntimeView(session, "mock")),
      startedAt: now,
    });
  }

  async listMockInterviewHistory(currentUser: CurrentCandidateUser) {
    const sessions = await this.listOwnedMockInterviewSessions(currentUser);
    const items = await Promise.all(
      sessions.map(async (session) => ({
        sessionId: session.sessionId,
        reportId: session.sessionId,
        interviewType: "MOCK" as const,
        status: session.status,
        reportStatus: session.status === "COMPLETED" ? ("COMPLETED" as const) : ("PENDING" as const),
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        updatedAt: session.updatedAt,
        totalQuestions: session.questionIds.length,
        answeredCount: await this.countAnswers(session.sessionId),
      })),
    );

    return {
      data: { items },
      meta: {
        traceId: "local-candidate-module",
        timestamp: new Date().toISOString(),
        page: {
          page: 1,
          limit: Math.max(items.length, 1),
          totalItems: items.length,
          totalPages: items.length > 0 ? 1 : 0,
          hasNext: false,
        },
      },
    };
  }

  async getMockRuntime(sessionId: number, currentUser: CurrentCandidateUser) {
    const session = await this.getOwnedMockSession(sessionId, currentUser);
    this.assertInProgress(session);
    return this.envelope(await this.toRuntimeView(session, "mock"));
  }

  async listMockQuestions(sessionId: number, currentUser: CurrentCandidateUser) {
    const session = await this.syncCurrentQuestionToFirstUnanswered(await this.getOwnedMockSession(sessionId, currentUser));
    this.assertInProgress(session);
    return this.envelope(await this.toQuestionList(session));
  }

  async saveMockAnswer(sessionId: number, dto: SaveInterviewAnswerDto, currentUser: CurrentCandidateUser) {
    const session = await this.getOwnedMockSession(sessionId, currentUser);
    return this.saveAnswer(session, dto, currentUser);
  }

  async moveMockNextQuestion(sessionId: number, currentUser: CurrentCandidateUser) {
    const session = await this.getOwnedMockSession(sessionId, currentUser);
    return this.moveNextQuestion(session);
  }

  async completeMockInterview(sessionId: number, currentUser: CurrentCandidateUser) {
    const session = await this.getOwnedMockSession(sessionId, currentUser);
    return this.completeRuntimeSession(session);
  }

  async requestMockStt(sessionId: number, dto: AiInterviewRequestDto, currentUser: CurrentCandidateUser) {
    const session = await this.getOwnedMockSession(sessionId, currentUser);
    return this.createAiHandoff(session, dto, "STT", currentUser);
  }

  async requestMockFollowUpQuestion(sessionId: number, dto: AiInterviewRequestDto, currentUser: CurrentCandidateUser) {
    const session = await this.getOwnedMockSession(sessionId, currentUser);
    return this.createAiHandoff(session, dto, "FOLLOW_UP", currentUser);
  }

  async createMockRealtimeSession(
    sessionId: number,
    dto: CreateRealtimeInterviewSessionDto,
    currentUser: CurrentCandidateUser,
  ) {
    const session = await this.getOwnedMockSession(sessionId, currentUser);
    return this.createRealtimeSession(session, dto, currentUser);
  }

  async insertMockFollowUpQuestion(
    sessionId: number,
    dto: InsertFollowUpQuestionDto,
    currentUser: CurrentCandidateUser,
  ) {
    const session = await this.getOwnedMockSession(sessionId, currentUser);
    return this.insertFollowUpQuestion(session, dto);
  }

  async listRecruitingQuestions(sessionId: number, currentUser: CurrentCandidateUser) {
    const session = await this.syncCurrentQuestionToFirstUnanswered(
      await this.getRecruitingRuntimeSession(sessionId, currentUser),
    );
    this.assertReadyOrInProgress(session);
    return this.envelope(await this.toQuestionList(session));
  }

  async saveRecruitingAnswer(sessionId: number, dto: SaveInterviewAnswerDto, currentUser: CurrentCandidateUser) {
    const session = await this.getRecruitingRuntimeSession(sessionId, currentUser);
    return this.saveAnswer(session, dto, currentUser);
  }

  async moveRecruitingNextQuestion(sessionId: number, currentUser: CurrentCandidateUser) {
    const session = await this.getRecruitingRuntimeSession(sessionId, currentUser);
    return this.moveNextQuestion(session);
  }

  async completeRecruitingInterview(sessionId: number, currentUser: CurrentCandidateUser) {
    const session = await this.getRecruitingRuntimeSession(sessionId, currentUser);
    if (session.status === "COMPLETED") {
      await this.candidateService.completeRecruitingInterviewSession(sessionId, currentUser);
      const answeredCount = await this.countAnswers(session.sessionId);
      return this.envelope({
        sessionId: session.sessionId,
        applicationId: session.applicationId,
        interviewType: session.interviewType,
        status: "COMPLETED",
        completedAt: session.completedAt ?? new Date().toISOString(),
        answeredCount,
        totalQuestions: session.questionIds.length,
      });
    }
    const result = await this.completeRuntimeSession(session);
    await this.candidateService.completeRecruitingInterviewSession(sessionId, currentUser);
    return result;
  }

  async requestRecruitingStt(sessionId: number, dto: AiInterviewRequestDto, currentUser: CurrentCandidateUser) {
    const session = await this.getRecruitingRuntimeSession(sessionId, currentUser);
    return this.createAiHandoff(session, dto, "STT", currentUser);
  }

  async requestRecruitingFollowUpQuestion(sessionId: number, dto: AiInterviewRequestDto, currentUser: CurrentCandidateUser) {
    const session = await this.getRecruitingRuntimeSession(sessionId, currentUser);
    return this.createAiHandoff(session, dto, "FOLLOW_UP", currentUser);
  }

  async createRecruitingRealtimeSession(
    sessionId: number,
    dto: CreateRealtimeInterviewSessionDto,
    currentUser: CurrentCandidateUser,
  ) {
    const session = await this.getRecruitingRuntimeSession(sessionId, currentUser);
    return this.createRealtimeSession(session, dto, currentUser);
  }

  async insertRecruitingFollowUpQuestion(
    sessionId: number,
    dto: InsertFollowUpQuestionDto,
    currentUser: CurrentCandidateUser,
  ) {
    const session = await this.getRecruitingRuntimeSession(sessionId, currentUser);
    return this.insertFollowUpQuestion(session, dto);
  }

  async uploadInterviewMedia(
    sessionId: number,
    file: UploadedInterviewMediaFile | undefined,
    currentUser: CurrentCandidateUser,
  ) {
    const session = await this.getOwnedRuntimeSession(sessionId, currentUser);
    this.assertInProgress(session);
    if (!file) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "Interview media file is required.", 400, [
        { field: "file", reason: "multipart file is required" },
      ]);
    }

    const storageKey = this.buildInterviewMediaStorageKey(currentUser.candidateId, session.sessionId, file.originalName);
    await this.mediaStorage.putObject({
      key: storageKey,
      body: file.buffer,
      contentLength: file.sizeBytes,
      contentType: file.mimeType,
    });

    const fileAsset = await this.candidateService.createInterviewFileAsset(
      {
        storageKey,
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
      },
      currentUser,
    );

    return this.envelope(fileAsset);
  }

  async buildCanonicalSttPayload(
    sessionId: number,
    answerId: number,
    audioFileId: number,
    currentUser: CurrentCandidateUser,
  ): Promise<Record<string, unknown>> {
    this.assertPositiveIntegerId(sessionId, "sessionId");
    this.assertPositiveIntegerId(answerId, "answerId");
    this.assertPositiveIntegerId(audioFileId, "audioFileId");

    const session = await this.getOwnedRuntimeSession(sessionId, currentUser);
    const answer = await this.interviewRepository.findAnswerById(session.sessionId, answerId);
    if (!answer) {
      throw new CandidateDomainError("COMMON_NOT_FOUND", "Interview answer was not found.", 404, [
        { field: "answerId", reason: "answer not found for session" },
      ]);
    }

    return this.buildCanonicalSttPayloadForAnswer(session, answer, audioFileId, undefined, currentUser);
  }

  private async getOwnedRuntimeSession(
    sessionId: number,
    currentUser: CurrentCandidateUser,
  ): Promise<RuntimeInterviewSession> {
    const mockSession = await this.interviewRepository.findMockSession(sessionId);
    if (mockSession) {
      if (mockSession.candidateId !== currentUser.candidateId) {
        throw new CandidateDomainError("COMMON_FORBIDDEN", "Interview session does not belong to current candidate.", 403, [
          { field: "sessionId", reason: "candidate owner mismatch" },
        ]);
      }
      return mockSession;
    }

    return this.getRecruitingRuntimeSession(sessionId, currentUser);
  }

  private buildInterviewMediaStorageKey(candidateId: number, sessionId: number, originalName: string): string {
    const safeName = originalName
      .replace(/\\/g, "/")
      .split("/")
      .pop()
      ?.replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      || "interview-media.webm";
    return `candidate/${candidateId}/interviews/${Date.now()}-${sessionId}-${safeName}`;
  }

  private async getRecruitingRuntimeSession(
    sessionId: number,
    currentUser: CurrentCandidateUser,
  ): Promise<RuntimeInterviewSession> {
    const { application, session } = await this.candidateService.getOwnedRecruitingInterviewSession(
      sessionId,
      currentUser,
    );
    let runtimeSession = await this.interviewRepository.findRecruitingRuntimeSession(session.sessionId);
    if (!runtimeSession) {
      runtimeSession = await this.createRecruitingRuntimeSession(application.applicationId, application.postingId, session);
    }

    runtimeSession.status = session.status;
    runtimeSession.showQuestionText = session.showQuestionText;
    runtimeSession.updatedAt = session.updatedAt;
    runtimeSession.completedAt = session.completedAt;
    return this.interviewRepository.saveRecruitingRuntimeSession(runtimeSession);
  }

  private async createRecruitingRuntimeSession(
    applicationId: number,
    postingId: number,
    session: InterviewSession,
  ): Promise<RuntimeInterviewSession> {
    return {
      sessionId: session.sessionId,
      applicationId,
      candidateId: session.candidateId,
      interviewType: "RECRUITING",
      status: session.status,
      showQuestionText: session.showQuestionText,
      currentQuestionIndex: 0,
      questionIds: await this.selectRecruitingQuestionIds(postingId),
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      updatedAt: session.updatedAt,
    };
  }

  private async getOwnedMockSession(sessionId: number, currentUser: CurrentCandidateUser): Promise<RuntimeInterviewSession> {
    this.assertPositiveIntegerId(sessionId, "sessionId");
    const session = await this.interviewRepository.findMockSession(sessionId);
    if (!session) {
      throw new CandidateDomainError("COMMON_NOT_FOUND", "Interview session was not found.", 404, [
        { field: "sessionId", reason: "mock interview session not found" },
      ]);
    }
    if (session.candidateId !== currentUser.candidateId) {
      throw new CandidateDomainError("COMMON_FORBIDDEN", "Interview session does not belong to current candidate.", 403, [
        { field: "sessionId", reason: "candidate owner mismatch" },
      ]);
    }
    return session;
  }

  private async saveAnswer(
    session: RuntimeInterviewSession,
    dto: SaveInterviewAnswerDto,
    currentUser: CurrentCandidateUser,
  ): Promise<{ data: SaveInterviewAnswerResult; meta: { traceId: string; timestamp: string } }> {
    const requestBody = this.assertAnswerRequest(dto);
    if (!requestBody.allowReanswer && !requestBody.retryAnswerId) {
      session = await this.syncCurrentQuestionToFirstUnanswered(session);
    }

    this.assertInProgress(session);

    let existingAnswer: InterviewAnswer | undefined;
    if (requestBody.retryAnswerId) {
      existingAnswer = await this.interviewRepository.findAnswerById(session.sessionId, requestBody.retryAnswerId);
      if (!existingAnswer || existingAnswer.questionId !== requestBody.questionId) {
        throw new CandidateDomainError("COMMON_CONFLICT", "Retry answer does not match the current question answer.", 409, [
          { field: "retryAnswerId", reason: "retryAnswerId must match the saved answer for the current question" },
        ]);
      }
      const retryQuestionIndex = session.questionIds.indexOf(requestBody.questionId);
      if (retryQuestionIndex < 0) {
        throw new CandidateDomainError("COMMON_CONFLICT", "Retry question does not belong to the session.", 409, [
          { field: "questionId", reason: "questionId must belong to the current session" },
        ]);
      }
      session.currentQuestionIndex = retryQuestionIndex;
    } else {
      const currentQuestionId = this.currentQuestionId(session);
      if (requestBody.questionId !== currentQuestionId) {
        throw new CandidateDomainError("COMMON_CONFLICT", "Answer must match the current question.", 409, [
          { field: "questionId", reason: `current question is ${currentQuestionId}` },
        ]);
      }
      existingAnswer = await this.interviewRepository.findAnswer(session.sessionId, requestBody.questionId);
      if (existingAnswer && !requestBody.allowReanswer) {
        throw new CandidateDomainError("COMMON_CONFLICT", "Current question has already been answered.", 409, [
          { field: "questionId", reason: "question already answered" },
        ]);
      }
    }
    if (!existingAnswer && requestBody.allowReanswer) {
      throw new CandidateDomainError("COMMON_CONFLICT", "Reanswer requires an existing answer.", 409, [
        { field: "questionId", reason: "question answer is missing" },
      ]);
    }

    const skippedForRecordingValidation = requestBody.skipReason === "RECORDING_VALIDATION_FAILED";
    const videoFile = skippedForRecordingValidation
      ? undefined
      : await this.resolveAnswerFile(
          requestBody.videoFileId,
          requestBody.videoFile,
          currentUser,
          "videoFileId",
        );
    const audioFile = skippedForRecordingValidation
      ? undefined
      : await this.resolveAnswerFile(
          requestBody.audioFileId,
          requestBody.audioFile,
          currentUser,
          "audioFileId",
        );
    if (!skippedForRecordingValidation && !videoFile && !audioFile) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "At least one media file is required.", 400, [
        { field: "file", reason: "videoFile/videoFileId or audioFile/audioFileId is required" },
      ]);
    }

    const submittedAt = new Date().toISOString();
    const submittedTranscript = requestBody.transcript?.trim() || undefined;
    const answerInput = {
      sessionId: session.sessionId,
      questionId: requestBody.questionId,
      videoFileId: videoFile?.fileId,
      audioFileId: audioFile?.fileId,
      transcript: skippedForRecordingValidation ? "[NO_ANSWER] Recording validation failed twice." : submittedTranscript,
      nonverbalMetadata: requestBody.nonverbalMetadata,
      durationSeconds: requestBody.durationSeconds,
      submittedAt,
    };
    const answer = requestBody.allowReanswer && existingAnswer
      ? await this.replaceAnswerAfterReanswerRequest(session, existingAnswer, {
          videoFileId: videoFile?.fileId,
          audioFileId: audioFile?.fileId,
          transcript: submittedTranscript,
          nonverbalMetadata: requestBody.nonverbalMetadata,
          durationSeconds: requestBody.durationSeconds,
          submittedAt,
        })
      : requestBody.retryAnswerId && existingAnswer
        ? await this.interviewRepository.updateAnswer({
            ...answerInput,
            answerId: existingAnswer.answerId,
          })
        : await this.interviewRepository.createAnswer(answerInput);
    session.updatedAt = submittedAt;
    await this.interviewRepository.saveRuntimeSession(session);

    return this.envelope({
      sessionId: session.sessionId,
      answer,
      videoFile,
      audioFile,
      nextQuestionAvailable: session.currentQuestionIndex < session.questionIds.length - 1,
    });
  }

  private async moveNextQuestion(
    session: RuntimeInterviewSession,
  ): Promise<{ data: NextInterviewQuestionResult; meta: { traceId: string; timestamp: string } }> {
    this.assertInProgress(session);
    const previousQuestion = await this.currentQuestion(session);
    const previousQuestionId = previousQuestion.questionId;
    const answer = await this.interviewRepository.findAnswer(session.sessionId, previousQuestionId);
    if (!answer) {
      const answeredCount = await this.countAnswers(session.sessionId);
      if (session.currentQuestionIndex > 0 && answeredCount === session.currentQuestionIndex) {
        const answeredQuestionIndex = session.currentQuestionIndex - 1;
        const answeredQuestionId = session.questionIds[answeredQuestionIndex];
        if (answeredQuestionId) {
          const answeredQuestion = await this.requiredQuestion(answeredQuestionId);
          const previousAnswer = await this.interviewRepository.findAnswer(session.sessionId, answeredQuestionId);
          if (previousAnswer) {
            await this.insertGeneratedFollowUpQuestionIfReady(
              session,
              answeredQuestion,
              previousAnswer,
              answeredQuestionIndex,
            );
          }
        }

        return this.envelope({
          sessionId: session.sessionId,
          previousQuestionId: session.questionIds[session.currentQuestionIndex - 1],
          currentQuestion: await this.toQuestionView(
            session,
            await this.currentQuestion(session),
            true,
            session.currentQuestionIndex + 1,
          ),
          isLastQuestion: session.currentQuestionIndex === session.questionIds.length - 1,
        });
      }
      throw new CandidateDomainError("COMMON_CONFLICT", "Current question must be answered before moving next.", 409, [
        { field: "questionId", reason: "current question answer is missing" },
      ]);
    }

    await this.insertGeneratedFollowUpQuestionIfReady(session, previousQuestion, answer);
    if (session.currentQuestionIndex >= session.questionIds.length - 1) {
      throw new CandidateDomainError("COMMON_CONFLICT", "Already at the last question.", 409, [
        { field: "questionId", reason: "last question reached" },
      ]);
    }

    session.currentQuestionIndex += 1;
    session.updatedAt = new Date().toISOString();
    const updatedSession = await this.interviewRepository.saveRuntimeSession(session);
    return this.envelope({
      sessionId: updatedSession.sessionId,
      previousQuestionId,
      currentQuestion: await this.toQuestionView(
        updatedSession,
        await this.currentQuestion(updatedSession),
        true,
        updatedSession.currentQuestionIndex + 1,
      ),
      isLastQuestion: updatedSession.currentQuestionIndex === updatedSession.questionIds.length - 1,
    });
  }

  private async insertGeneratedFollowUpQuestionIfReady(
    session: RuntimeInterviewSession,
    previousQuestion: InterviewQuestion,
    answer: InterviewAnswer,
    insertAfterIndex = session.currentQuestionIndex,
  ): Promise<boolean> {
    if (previousQuestion.questionType === "FOLLOW_UP") {
      return false;
    }

    const nextQuestionId = session.questionIds[insertAfterIndex + 1];
    if (nextQuestionId) {
      const nextQuestion = await this.interviewRepository.findQuestion(nextQuestionId);
      if (nextQuestion?.questionType === "FOLLOW_UP") {
        return false;
      }
    }
    if (!(await this.canAddRuntimeFollowUpQuestion(session))) {
      return false;
    }

    const policy: FollowUpQuestionPolicy = session.interviewType === "MOCK" ? "MOCK" : "RECRUITING";
    const generatedFollowUp = await this.interviewRepository.findGeneratedFollowUpQuestion(answer.answerId, policy);
    const content = generatedFollowUp?.content.trim();
    if (!content) {
      return false;
    }

    const followUpQuestion = await this.interviewRepository.createRuntimeFollowUpQuestion({
      session,
      sourceAnswer: answer,
      content,
    });
    if (session.questionIds.includes(followUpQuestion.questionId)) {
      return false;
    }

    session.questionIds.splice(insertAfterIndex + 1, 0, followUpQuestion.questionId);
    session.updatedAt = new Date().toISOString();
    await this.interviewRepository.saveRuntimeSession(session);
    return true;
  }

  private async completeRuntimeSession(
    session: RuntimeInterviewSession,
  ): Promise<{ data: CompleteInterviewResult; meta: { traceId: string; timestamp: string } }> {
    this.assertInProgress(session);
    const answeredCount = await this.countAnswers(session.sessionId);
    if (answeredCount !== session.questionIds.length) {
      throw new CandidateDomainError("COMMON_CONFLICT", "All required questions must be answered.", 409, [
        { field: "answers", reason: `${answeredCount}/${session.questionIds.length} questions answered` },
      ]);
    }

    const completedAt = new Date().toISOString();
    session.status = "COMPLETED";
    session.completedAt = completedAt;
    session.updatedAt = completedAt;
    const updatedSession = await this.interviewRepository.saveRuntimeSession(session);

    return this.envelope({
      sessionId: updatedSession.sessionId,
      applicationId: updatedSession.applicationId,
      interviewType: updatedSession.interviewType,
      status: "COMPLETED",
      completedAt,
      answeredCount,
      totalQuestions: updatedSession.questionIds.length,
    });
  }

  private async createAiHandoff(
    session: RuntimeInterviewSession,
    dto: AiInterviewRequestDto,
    processType: "STT" | "FOLLOW_UP",
    currentUser: CurrentCandidateUser,
  ): Promise<{ data: AiHandoffResult; meta: { traceId: string; timestamp: string } }> {
    this.assertNotCompleted(session);
    const requestBody = this.toRequestBody(dto ?? {}, "aiRequest") as AiInterviewRequestDto;
    this.assertNoRawAiPayload(requestBody as Record<string, unknown>);
    const answer = await this.resolveAnswerForAi(session, dto);
    const fileId = answer.audioFileId ?? answer.videoFileId;
    const callbackTopic =
      processType === "STT"
        ? "ai.interview.stt.requested"
        : "ai.interview.follow-up-question.requested";
    const payload = await this.buildAiJobPayload(session, answer, requestBody, processType, currentUser);
    const persistedPayload = { ...payload };
    if (processType === "FOLLOW_UP") {
      const profileContext = await this.candidateService.getCandidateProfileAiContext(currentUser);
      const profileUpdatedAt = await this.candidateService.getCandidateProfileUpdatedAt(currentUser);
      payload.profileContext = profileContext;
      persistedPayload.profileContext = this.toProfileContextLogRef(profileContext, profileUpdatedAt);
    }
    const dispatched = this.aiJobDispatcher
      ? await this.aiJobDispatcher.dispatch({
          processType,
          input: {
            kind: this.aiJobKind(session.interviewType, processType),
            requestedBy: {
              userId: currentUser.userId,
              userType: currentUser.userType,
              candidateId: currentUser.candidateId,
            },
            payload,
          },
          persistedInput: {
            kind: this.aiJobKind(session.interviewType, processType),
            requestedBy: {
              userId: currentUser.userId,
              userType: currentUser.userType,
              candidateId: currentUser.candidateId,
            },
            payload: persistedPayload,
          },
          refs: {
            sessionId: session.sessionId,
            applicationId: session.applicationId,
          },
        })
      : undefined;

    return this.envelope({
      accepted: true,
      processType,
      status: dispatched?.status ?? "PENDING",
      queued: dispatched?.queued,
      processLogId: dispatched?.processLogId,
      inputRef: dispatched?.inputRef,
      sessionId: session.sessionId,
      applicationId: session.applicationId,
      answerId: answer.answerId,
      questionId: answer.questionId,
      fileId,
      fileAssetId: fileId,
      videoFileId: answer.videoFileId,
      audioFileId: answer.audioFileId,
      callbackTopic,
    });
  }

  private async createRealtimeSession(
    session: RuntimeInterviewSession,
    dto: CreateRealtimeInterviewSessionDto,
    currentUser: CurrentCandidateUser,
  ): Promise<{ data: RealtimeInterviewSessionResult; meta: { traceId: string; timestamp: string } }> {
    this.assertInProgress(session);
    this.assertRealtimeSessionRequest(dto);

    const provider = this.realtimeSessionProvider();
    const result = provider === "openai"
      ? await this.createOpenAiRealtimeSession(session, currentUser)
      : this.createMockRealtimeSessionResult(session, currentUser);

    return this.envelope(result);
  }

  private assertRealtimeSessionRequest(dto: CreateRealtimeInterviewSessionDto): void {
    const requestBody = this.toRequestBody(dto ?? {}, "realtimeSession");
    if (requestBody.mode !== undefined && requestBody.mode !== "realtime-voice") {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "Realtime session mode is invalid.", 400, [
        { field: "mode", reason: "mode must be realtime-voice" },
      ]);
    }
    if (requestBody.transport !== undefined && requestBody.transport !== "webrtc") {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "Realtime session transport is invalid.", 400, [
        { field: "transport", reason: "transport must be webrtc" },
      ]);
    }
  }

  private realtimeSessionProvider(): RealtimeInterviewProvider {
    return process.env.AI_INTERVIEWER_REALTIME_PROVIDER === "openai" ? "openai" : "mock";
  }

  private createMockRealtimeSessionResult(
    session: RuntimeInterviewSession,
    currentUser: CurrentCandidateUser,
  ): RealtimeInterviewSessionResult {
    const expiresAt = new Date(Date.now() + MOCK_REALTIME_CLIENT_SECRET_TTL_MS).toISOString();
    return {
      accepted: true,
      sessionId: session.sessionId,
      applicationId: session.applicationId,
      interviewType: session.interviewType,
      mode: "realtime-voice",
      provider: "mock",
      model: "mock-realtime-interviewer",
      voice: session.interviewType === "MOCK" ? "mock-ko-coach" : "mock-ko-recruiting",
      transport: "webrtc",
      clientSecret: `mock-realtime-client-secret-${session.sessionId}-${currentUser.candidateId}`,
      clientSecretType: "ephemeral",
      expiresAt,
      endpoint: "mock://realtime/calls",
    };
  }

  private async createOpenAiRealtimeSession(
    session: RuntimeInterviewSession,
    currentUser: CurrentCandidateUser,
  ): Promise<RealtimeInterviewSessionResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new CandidateDomainError("COMMON_CONFLICT", "OpenAI realtime session provider is not configured.", 409, [
        { field: "OPENAI_API_KEY", reason: "OPENAI_API_KEY is required when AI_INTERVIEWER_REALTIME_PROVIDER=openai" },
      ]);
    }

    const model = process.env.OPENAI_REALTIME_MODEL || DEFAULT_REALTIME_MODEL;
    const voice = process.env.OPENAI_REALTIME_VOICE || DEFAULT_REALTIME_VOICE;
    const response = await fetch(this.realtimeClientSecretsEndpoint(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": `candidate-${currentUser.candidateId}`,
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model,
          instructions: this.buildRealtimeInterviewInstructions(session),
          audio: {
            input: {
              turn_detection: {
                type: "server_vad",
                create_response: false,
                interrupt_response: false,
              },
            },
            output: {
              voice,
            },
          },
        },
      }),
    });
    const rawBody = await response.text();
    const payload = this.parseOpenAiRealtimeClientSecret(rawBody);
    if (!response.ok) {
      const errorReason = payload.error?.message ?? (rawBody.slice(0, 200) || `status ${response.status}`);
      throw new CandidateDomainError("COMMON_EXTERNAL_SERVICE_FAILED", "OpenAI realtime session creation failed.", 502, [
        { field: "openai", reason: errorReason },
      ]);
    }

    const clientSecret = payload.value ?? payload.client_secret?.value;
    if (!clientSecret) {
      throw new CandidateDomainError("COMMON_EXTERNAL_SERVICE_FAILED", "OpenAI realtime client secret was not returned.", 502, [
        { field: "clientSecret", reason: "OpenAI response did not include an ephemeral client secret" },
      ]);
    }

    return {
      accepted: true,
      sessionId: session.sessionId,
      applicationId: session.applicationId,
      interviewType: session.interviewType,
      mode: "realtime-voice",
      provider: "openai",
      model,
      voice,
      transport: "webrtc",
      clientSecret,
      clientSecretType: "ephemeral",
      expiresAt: this.realtimeExpiresAt(payload.expires_at ?? payload.client_secret?.expires_at),
      endpoint: this.realtimeCallsEndpoint(),
    };
  }

  private parseOpenAiRealtimeClientSecret(rawBody: string): OpenAiRealtimeClientSecretResponse {
    if (!rawBody) return {};
    try {
      return JSON.parse(rawBody) as OpenAiRealtimeClientSecretResponse;
    } catch {
      return {};
    }
  }

  private realtimeExpiresAt(expiresAt?: number): string {
    if (expiresAt && Number.isFinite(expiresAt)) {
      return new Date(expiresAt * 1000).toISOString();
    }
    return new Date(Date.now() + MOCK_REALTIME_CLIENT_SECRET_TTL_MS).toISOString();
  }

  private realtimeClientSecretsEndpoint(): string {
    return `${this.realtimeApiBaseUrl()}/v1/realtime/client_secrets`;
  }

  private realtimeCallsEndpoint(): string {
    return `${this.realtimeApiBaseUrl()}/v1/realtime/calls`;
  }

  private realtimeApiBaseUrl(): string {
    return (process.env.OPENAI_REALTIME_API_BASE_URL || DEFAULT_REALTIME_API_BASE_URL).replace(/\/+$/, "");
  }

  private buildRealtimeInterviewInstructions(session: RuntimeInterviewSession): string {
    if (session.interviewType === "MOCK") {
      return [
        "You are an AI mock interviewer for Korean interview practice.",
        "Stay silent until the browser client sends a response.create event over the realtime data channel.",
        "Read the provided Korean interview question exactly once, or read the backend-generated follow-up question exactly once, when the client asks you to read a question.",
        "Say only the provided encouragement line when the client asks you to encourage a silent candidate.",
        "Do not generate realtime follow-up questions, answer evaluations, or extra coaching during the session.",
        "Keep a calm coaching tone and do not make hiring decisions.",
        "Do not infer protected attributes or evaluate appearance, accent, gender, age, school, region, disability, or health.",
      ].join(" ");
    }

    return [
      "You are an AI recruiting interviewer for a structured Korean hiring interview.",
      "Stay silent until the browser client sends a response.create event over the realtime data channel.",
      "Read the provided Korean interview question exactly once, or read the backend-generated follow-up question exactly once, when the client asks you to read a question.",
      "Say only the provided encouragement line when the client asks you to encourage a silent candidate.",
      "Do not generate realtime follow-up questions, answer evaluations, or extra coaching during the session.",
      "The backend follow-up pipeline handles follow-up question generation after answer submission.",
      "Keep a neutral interview tone and do not make final hiring decisions.",
      "Do not infer protected attributes or evaluate appearance, accent, gender, age, school, region, disability, or health.",
    ].join(" ");
  }

  private async insertFollowUpQuestion(
    session: RuntimeInterviewSession,
    dto: InsertFollowUpQuestionDto,
  ): Promise<{ data: InsertFollowUpQuestionResult; meta: { traceId: string; timestamp: string } }> {
    this.assertInProgress(session);
    const processLogId = this.assertInsertRequest(dto);
    const process = await this.interviewRepository.findCompletedFollowUpProcess(processLogId);
    if (!process) {
      throw new CandidateDomainError("COMMON_NOT_FOUND", "Completed follow-up process was not found.", 404, [
        { field: "processLogId", reason: "completed FOLLOW_UP process not found" },
      ]);
    }
    if (process.sessionId !== session.sessionId) {
      throw new CandidateDomainError("COMMON_FORBIDDEN", "Follow-up process does not belong to this interview session.", 403, [
        { field: "processLogId", reason: "session mismatch" },
      ]);
    }
    if (
      (session.interviewType === "MOCK" && process.policy !== "MOCK") ||
      (session.interviewType === "RECRUITING" && process.policy !== "RECRUITING")
    ) {
      throw new CandidateDomainError("COMMON_CONFLICT", "Follow-up policy does not match interview type.", 409, [
        { field: "policy", reason: `expected ${session.interviewType}` },
      ]);
    }

    const answer = await this.interviewRepository.findAnswerById(session.sessionId, process.answerId);
    if (!answer) {
      throw new CandidateDomainError("COMMON_NOT_FOUND", "Interview answer for follow-up was not found.", 404, [
        { field: "answerId", reason: "answer not found for session" },
      ]);
    }
    const sourceQuestionIndex = session.questionIds.indexOf(answer.questionId);
    const sourceIsCurrentQuestion = sourceQuestionIndex === session.currentQuestionIndex;
    const sourceIsPreviousQuestion = sourceQuestionIndex === session.currentQuestionIndex - 1;
    if (!sourceIsCurrentQuestion && !sourceIsPreviousQuestion) {
      throw new CandidateDomainError("COMMON_CONFLICT", "Follow-up must be added before answering another question.", 409, [
        { field: "questionId", reason: "source answer is not the current or previous question" },
      ]);
    }
    if (sourceIsPreviousQuestion) {
      const currentQuestionAnswer = await this.interviewRepository.findAnswer(
        session.sessionId,
        this.currentQuestionId(session),
      );
      if (currentQuestionAnswer) {
        throw new CandidateDomainError("COMMON_CONFLICT", "Follow-up must be added before answering another question.", 409, [
          { field: "questionId", reason: "current question is already answered" },
        ]);
      }
    }
    const sourceQuestion = await this.requiredQuestion(answer.questionId);
    if (sourceQuestion.questionType === "FOLLOW_UP") {
      throw new CandidateDomainError("COMMON_CONFLICT", "Follow-up questions cannot create another follow-up question.", 409, [
        { field: "questionType", reason: "source question is FOLLOW_UP" },
      ]);
    }

    let question = await this.findExistingRuntimeFollowUpQuestion(session, sourceQuestionIndex, process.content);
    let questionIndex = question ? session.questionIds.indexOf(question.questionId) : -1;
    let inserted = false;

    if (!question) {
      if (!(await this.canAddRuntimeFollowUpQuestion(session))) {
        throw new CandidateDomainError("COMMON_CONFLICT", "Follow-up question limit has been reached.", 409, [
          { field: "followUpQuestions", reason: "maximum one follow-up question per base question" },
        ]);
      }

      question = await this.interviewRepository.createRuntimeFollowUpQuestion({
        session,
        sourceAnswer: answer,
        content: process.content,
      });
      questionIndex = session.questionIds.indexOf(question.questionId);
      if (questionIndex < 0) {
        questionIndex = sourceQuestionIndex + 1;
        session.questionIds.splice(questionIndex, 0, question.questionId);
        inserted = true;
      }
    }

    session.currentQuestionIndex = questionIndex;
    session.updatedAt = new Date().toISOString();
    session = await this.interviewRepository.saveRuntimeSession(session);

    return this.envelope({
      sessionId: session.sessionId,
      processLogId,
      sourceAnswerId: answer.answerId,
      sourceQuestionId: answer.questionId,
      question: await this.toQuestionView(session, question, false, questionIndex + 1),
      inserted,
      totalQuestions: session.questionIds.length,
      nextQuestionAvailable: session.currentQuestionIndex < session.questionIds.length - 1,
    });
  }

  private async replaceAnswerAfterReanswerRequest(
    session: RuntimeInterviewSession,
    answer: InterviewAnswer,
    input: {
      videoFileId?: number;
      audioFileId?: number;
      transcript?: string;
      nonverbalMetadata?: InterviewAnswerNonverbalMetadata;
      durationSeconds: number;
      submittedAt: string;
    },
  ): Promise<InterviewAnswer> {
    await this.assertReanswerAllowed(session, answer);
    return this.interviewRepository.replaceAnswer({
      answerId: answer.answerId,
      videoFileId: input.videoFileId,
      audioFileId: input.audioFileId,
      transcript: input.transcript,
      nonverbalMetadata: input.nonverbalMetadata,
      durationSeconds: input.durationSeconds,
      submittedAt: input.submittedAt,
    });
  }

  private async assertReanswerAllowed(session: RuntimeInterviewSession, answer: InterviewAnswer): Promise<void> {
    if (answer.transcript?.trim()) {
      throw new CandidateDomainError("COMMON_CONFLICT", "Reanswer is allowed only when transcript is missing.", 409, [
        { field: "answerId", reason: "answer already has transcript" },
      ]);
    }

    const failures = await this.interviewRepository.listReanswerRequiredFailures(session.sessionId, answer.answerId);
    if (failures.length !== 1) {
      throw new CandidateDomainError("COMMON_CONFLICT", "Reanswer is allowed only once after REANSWER_REQUIRED.", 409, [
        { field: "answerId", reason: failures.length > 1 ? "reanswer limit exceeded" : "REANSWER_REQUIRED failure not found" },
      ]);
    }

    const failure = failures[0];
    if (!failure) {
      throw new CandidateDomainError("COMMON_CONFLICT", "REANSWER_REQUIRED failure was not found.", 409, [
        { field: "answerId", reason: "REANSWER_REQUIRED failure not found" },
      ]);
    }

    if (Date.parse(answer.submittedAt) > Date.parse(failure.createdAt)) {
      throw new CandidateDomainError("COMMON_CONFLICT", "Reanswer has already been submitted.", 409, [
        { field: "answerId", reason: "answer was submitted after the latest REANSWER_REQUIRED failure" },
      ]);
    }
  }

  private aiJobKind(interviewType: RuntimeInterviewSession["interviewType"], processType: "STT" | "FOLLOW_UP"): string {
    if (processType === "STT") {
      return interviewType === "MOCK" ? "MOCK_INTERVIEW_STT" : "RECRUITING_INTERVIEW_STT";
    }
    return interviewType === "MOCK" ? "MOCK_FOLLOW_UP" : "RECRUITING_FOLLOW_UP";
  }

  private toProfileContextLogRef(context: CandidateProfileAiContextV1, profileUpdatedAt: string | null): Record<string, unknown> {
    const serialized = JSON.stringify(context);
    return {
      schemaVersion: context.schemaVersion,
      counts: {
        educations: context.educations.length,
        careers: context.careers.length,
        activities: context.activities.length,
        credentials: context.credentials.length,
      },
      charLength: serialized.length,
      contextHash: createHash("sha256").update(serialized).digest("hex"),
      profileUpdatedAt,
      scrubbed: true,
    };
  }

  private async buildAiJobPayload(
    session: RuntimeInterviewSession,
    answer: InterviewAnswer,
    requestBody: AiInterviewRequestDto,
    processType: "STT" | "FOLLOW_UP",
    currentUser: CurrentCandidateUser,
  ): Promise<Record<string, unknown>> {
    if (processType === "STT") {
      return this.buildCanonicalSttPayloadForAnswer(
        session,
        answer,
        requestBody.audioFileId ?? requestBody.fileAssetId,
        requestBody.durationSeconds,
        currentUser,
      );
    }

    const previousQuestion = requestBody.previousQuestion ?? (await this.requiredQuestion(answer.questionId)).content;
    const transcript = requestBody.transcript ?? answer.transcript;
    if (!transcript?.trim()) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "Transcript is required for follow-up question.", 400, [
        { field: "transcript", reason: "transcript is required" },
      ]);
    }

    const jobDescription = session.interviewType === "RECRUITING" ? requestBody.jobDescription : undefined;
    const documentSummary = session.interviewType === "RECRUITING" ? requestBody.documentSummary : undefined;
    if (session.interviewType === "RECRUITING" && !jobDescription?.trim() && !documentSummary?.trim()) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "Recruiting follow-up context is required.", 400, [
        { field: "jobDescription", reason: "jobDescription or documentSummary is required" },
        { field: "documentSummary", reason: "jobDescription or documentSummary is required" },
      ]);
    }

    return {
      answerId: answer.answerId,
      previousQuestion,
      transcript,
      jobDescription,
      documentSummary,
      sessionId: session.sessionId,
    };
  }

  private async buildCanonicalSttPayloadForAnswer(
    session: RuntimeInterviewSession,
    answer: InterviewAnswer,
    requestedFileId: unknown,
    requestedDurationSeconds: unknown,
    currentUser: CurrentCandidateUser,
  ): Promise<Record<string, unknown>> {
    if (requestedFileId !== undefined && !this.isPositiveInteger(requestedFileId)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "STT audio file reference is invalid.", 400, [
        { field: "audioFileId", reason: "audioFileId or fileAssetId must be a positive integer" },
      ]);
    }

    const audioFileId = (requestedFileId as number | undefined) ?? answer.audioFileId ?? answer.videoFileId;
    if (!audioFileId) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "STT audio file reference is required.", 400, [
        { field: "audioFileId", reason: "audioFileId or fileAssetId is required" },
      ]);
    }
    if (audioFileId !== answer.audioFileId && audioFileId !== answer.videoFileId) {
      throw new CandidateDomainError("COMMON_CONFLICT", "File asset does not belong to the selected interview answer.", 409, [
        { field: "audioFileId", reason: "audioFileId must match the answer audioFileId or videoFileId" },
      ]);
    }

    const audioFile = await this.candidateService.getInterviewFileAsset(audioFileId, currentUser, "audioFileId");
    return {
      answerId: answer.answerId,
      audioFileId,
      audioS3Key: audioFile.storageKey,
      durationSeconds: requestedDurationSeconds ?? answer.durationSeconds,
      sessionId: session.sessionId,
    };
  }

  private assertNoRawAiPayload(requestBody: Record<string, unknown>): void {
    const forbiddenFields = ["audioContent", "audioBuffer", "audioBase64", "audioBytes", "fileContent", "fileBuffer", "fileBase64"];
    const forbiddenField = forbiddenFields.find((field) => Object.hasOwn(requestBody, field));
    if (!forbiddenField) {
      return;
    }

    throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "AI interview requests must reference uploaded files.", 400, [
      { field: forbiddenField, reason: "raw media payload must be uploaded to object storage first" },
    ]);
  }

  private async resolveAnswerForAi(session: RuntimeInterviewSession, dto: AiInterviewRequestDto): Promise<InterviewAnswer> {
    const requestBody = this.toRequestBody(dto ?? {}, "aiRequest");
    const rawAnswerId = requestBody.answerId;
    if (rawAnswerId !== undefined && !this.isPositiveInteger(rawAnswerId)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "answerId is invalid.", 400, [
        { field: "answerId", reason: "answerId must be a positive integer" },
      ]);
    }
    const rawFileAssetId = requestBody.fileAssetId;
    if (rawFileAssetId !== undefined && !this.isPositiveInteger(rawFileAssetId)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "fileAssetId is invalid.", 400, [
        { field: "fileAssetId", reason: "fileAssetId must be a positive integer" },
      ]);
    }
    const answerId = rawAnswerId as number | undefined;
    const fileAssetId = rawFileAssetId as number | undefined;

    const answer = answerId
      ? await this.interviewRepository.findAnswerById(session.sessionId, answerId)
      : await this.interviewRepository.findLatestAnswer(session.sessionId);
    if (!answer) {
      throw new CandidateDomainError("COMMON_NOT_FOUND", "Interview answer was not found.", 404, [
        { field: "answerId", reason: "answer not found for session" },
      ]);
    }
    if (fileAssetId && answer.audioFileId !== fileAssetId && answer.videoFileId !== fileAssetId) {
      throw new CandidateDomainError("COMMON_CONFLICT", "File asset does not belong to the selected interview answer.", 409, [
        { field: "fileAssetId", reason: "file asset id must match the answer audioFileId or videoFileId" },
      ]);
    }
    return answer;
  }

  private async resolveAnswerFile(
    fileId: number | undefined,
    file: RuntimeFileAssetDto | undefined,
    currentUser: CurrentCandidateUser,
    field: string,
  ): Promise<FileAsset | undefined> {
    if (fileId && file) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "Use either fileId or file metadata, not both.", 400, [
        { field, reason: "duplicate file reference" },
      ]);
    }
    if (fileId) {
      return this.candidateService.getInterviewFileAsset(fileId, currentUser, field);
    }
    if (file) {
      return this.candidateService.createInterviewFileAsset(file, currentUser);
    }
    return undefined;
  }

  private async toRuntimeView(session: RuntimeInterviewSession, routeKind: "mock" | "recruiting"): Promise<InterviewRuntimeView> {
    return {
      sessionId: session.sessionId,
      applicationId: session.applicationId,
      interviewType: session.interviewType,
      status: session.status,
      showQuestionText: this.shouldExposeQuestionText(session),
      currentQuestion:
        session.status === "IN_PROGRESS"
          ? await this.toQuestionView(
              session,
              await this.currentQuestion(session),
              true,
              session.currentQuestionIndex + 1,
            )
          : undefined,
      totalQuestions: session.questionIds.length,
      answeredCount: await this.countAnswers(session.sessionId),
      canRecord: session.status === "IN_PROGRESS",
      nextQuestionEndpoint:
        routeKind === "mock"
          ? `/api/v1/candidate/mock-interviews/${session.sessionId}/next-question`
          : `/api/v1/candidate/interviews/${session.sessionId}/next-question`,
      answerUploadEndpoint:
        routeKind === "mock"
          ? `/api/v1/candidate/mock-interviews/${session.sessionId}/answers`
          : `/api/v1/candidate/interviews/${session.sessionId}/answers`,
    };
  }

  private async toQuestionList(session: RuntimeInterviewSession): Promise<InterviewQuestionListResult> {
    return {
      sessionId: session.sessionId,
      interviewType: session.interviewType,
      showQuestionText: this.shouldExposeQuestionText(session),
      currentQuestionId: session.status === "IN_PROGRESS" ? this.currentQuestionId(session) : undefined,
      questions: await Promise.all(
        session.questionIds.map(async (questionId, index) =>
          this.toQuestionView(
            session,
            await this.requiredQuestion(questionId),
            index === session.currentQuestionIndex,
            index + 1,
          ),
        ),
      ),
    };
  }

  private async toQuestionView(
    session: RuntimeInterviewSession,
    question: InterviewQuestion,
    current: boolean,
    runtimeSortOrder?: number,
  ): Promise<InterviewQuestionView> {
    return {
      questionId: question.questionId,
      questionType: question.questionType,
      sortOrder: runtimeSortOrder ?? question.sortOrder,
      content: this.shouldExposeQuestionText(session) ? question.content : undefined,
      audioPrompt: `audio://interview-questions/${question.questionId}`,
      answered: Boolean(await this.interviewRepository.findAnswer(session.sessionId, question.questionId)),
      current,
    };
  }

  private shouldExposeQuestionText(session: RuntimeInterviewSession): boolean {
    return session.interviewType === "RECRUITING" || session.showQuestionText;
  }

  private resolveMockQuestionTypes(requestBody: Record<string, unknown>): MockQuestionType[] {
    const requestedTypes = Array.isArray(requestBody.questionTypes) && requestBody.questionTypes.length > 0
      ? requestBody.questionTypes
      : [...DEFAULT_MOCK_QUESTION_TYPES];
    if (!requestedTypes.every((questionType) => this.isQuestionType(questionType))) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "Question type is invalid.", 400, [
        { field: "questionTypes", reason: "unsupported question type" },
      ]);
    }
    if (requestedTypes.length > 6 || new Set(requestedTypes).size !== requestedTypes.length) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "Question types are invalid.", 400, [
        { field: "questionTypes", reason: "questionTypes must contain at most 6 unique values" },
      ]);
    }

    return requestedTypes as MockQuestionType[];
  }

  private normalizeOptionalFolderId(value: unknown): number | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (!this.isPositiveInteger(value)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "folderId is invalid.", 400, [
        { field: "folderId", reason: "folderId must be a positive integer" },
      ]);
    }
    return value;
  }

  private async selectMockQuestionIds(requestedTypes: readonly MockQuestionType[]): Promise<number[]> {
    const questions = await this.interviewRepository.listQuestions({
      interviewType: "MOCK",
      questionTypes: requestedTypes,
    });
    if (questions.length === 0) {
      return (await this.interviewRepository.listQuestions({ interviewType: "MOCK" })).map((question) => question.questionId);
    }
    return questions.map((question) => question.questionId);
  }

  private async buildFolderMockQuestionsForCurrentUser(
    folderId: number,
    questionTypes: readonly MockQuestionType[],
    currentUser: CurrentCandidateUser,
  ): Promise<CreateMockContextQuestionInput[]> {
    const folder = await this.candidateService.getMockInterviewFolderContext(folderId, currentUser);
    return this.buildFolderMockQuestions(folder, questionTypes);
  }

  private async createMockSessionWithExternalPass(
    input: CreateMockInterviewSessionInput,
    now: Date,
  ): Promise<RuntimeInterviewSession> {
    await this.mockInterviewPasses?.consumePass(input.candidateId, 1, undefined, now);
    return this.interviewRepository.createMockSession(input);
  }

  private buildFolderMockQuestions(
    folder: CandidateFolderContext,
    questionTypes: readonly MockQuestionType[],
  ): CreateMockContextQuestionInput[] {
    return questionTypes.map((questionType, index) => ({
      questionType,
      sortOrder: index + 1,
      content: this.buildFolderMockQuestionContent(folder, questionType),
    }));
  }

  private buildFolderMockQuestionContent(folder: CandidateFolderContext, questionType: MockQuestionType): string {
    const sources = [
      folder.resumeFile ? "이력서" : undefined,
      folder.githubUrl ? "GitHub" : undefined,
      folder.blogUrl ? "기술 블로그" : undefined,
      folder.portfolioUrl ? "포트폴리오" : undefined,
      folder.motivation ? "지원동기" : undefined,
      folder.extraNote ? "추가 설명" : undefined,
    ].filter((value): value is string => Boolean(value));
    const context = sources.length > 0 ? `제출한 ${sources.join(", ")} 자료` : "등록한 지원서 세트";

    if (questionType === "INTRO") {
      return `${context}를 바탕으로 본인을 소개하고 이 포지션을 준비한 이유를 설명해주세요.`;
    }
    if (questionType === "TECHNICAL") {
      return `${context} 중 이력서와 프로젝트 URL에서 가장 강하게 드러나는 기술 경험 하나를 골라 설계 의사결정과 트레이드오프를 설명해주세요.`;
    }
    if (questionType === "EXPERIENCE") {
      return `${context}와 연결되는 프로젝트나 협업 경험을 STAR 구조로 설명하고 본인이 직접 만든 결과를 말해주세요.`;
    }
    if (questionType === "SITUATION") {
      return `${context}를 기준으로 장애, 일정 압박, 요구사항 변경 중 하나를 겪었다고 가정하고 어떻게 판단하고 대응할지 설명해주세요.`;
    }
    if (questionType === "FOLLOW_UP") {
      return `${context}에서 면접관이 추가로 확인해야 할 약한 근거나 빈칸을 하나 짚고 더 구체적인 사례를 설명해주세요.`;
    }
    return `${context}를 바탕으로 면접관에게 마지막으로 강조하고 싶은 강점과 보완 계획을 말해주세요.`;
  }

  private async selectRecruitingQuestionIds(postingId: number): Promise<number[]> {
    const questions = await this.interviewRepository.listQuestions({
      interviewType: "RECRUITING",
      postingId,
    });
    if (questions.length > 0) {
      return questions.map((question) => question.questionId);
    }

    const fallbackBySortOrder = new Map<number, InterviewQuestion>();
    (await this.interviewRepository.listQuestions({ interviewType: "RECRUITING" })).forEach((question) => {
      if (!fallbackBySortOrder.has(question.sortOrder)) {
        fallbackBySortOrder.set(question.sortOrder, question);
      }
    });
    return [...fallbackBySortOrder.values()].map((question) => question.questionId);
  }

  private assertAnswerRequest(dto: SaveInterviewAnswerDto): AnswerRequestBody {
    const requestBody = this.toRequestBody(dto, "answer");
    if (!this.isPositiveInteger(requestBody.questionId)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "questionId is invalid.", 400, [
        { field: "questionId", reason: "questionId must be a positive integer" },
      ]);
    }
    if (requestBody.retryAnswerId !== undefined && !this.isPositiveInteger(requestBody.retryAnswerId)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "retryAnswerId is invalid.", 400, [
        { field: "retryAnswerId", reason: "retryAnswerId must be a positive integer" },
      ]);
    }
    if (requestBody.allowReanswer === true && requestBody.retryAnswerId !== undefined) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "retryAnswerId cannot be combined with allowReanswer.", 400, [
        { field: "retryAnswerId", reason: "retryAnswerId and allowReanswer are mutually exclusive" },
      ]);
    }
    const skippedForRecordingValidation = requestBody.skipReason === "RECORDING_VALIDATION_FAILED";
    if (skippedForRecordingValidation) {
      if (requestBody.durationSeconds !== 0) {
        throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "durationSeconds is invalid.", 400, [
          { field: "durationSeconds", reason: "durationSeconds must be 0 when skipReason is RECORDING_VALIDATION_FAILED" },
        ]);
      }
      if (requestBody.videoFileId || requestBody.videoFile || requestBody.audioFileId || requestBody.audioFile) {
        throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "Skipped answer cannot include media files.", 400, [
          { field: "file", reason: "media files are not allowed for skipped answers" },
        ]);
      }
    } else if (!this.isPositiveInteger(requestBody.durationSeconds)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "durationSeconds is invalid.", 400, [
        { field: "durationSeconds", reason: "durationSeconds must be a positive integer" },
      ]);
    }
    if (requestBody.videoFileId !== undefined && !this.isPositiveInteger(requestBody.videoFileId)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "videoFileId is invalid.", 400, [
        { field: "videoFileId", reason: "videoFileId must be a positive integer" },
      ]);
    }
    if (requestBody.audioFileId !== undefined && !this.isPositiveInteger(requestBody.audioFileId)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "audioFileId is invalid.", 400, [
        { field: "audioFileId", reason: "audioFileId must be a positive integer" },
      ]);
    }
    let nonverbalMetadata: InterviewAnswerNonverbalMetadata | undefined;
    try {
      nonverbalMetadata = normalizeInterviewNonverbalMetadata(requestBody.nonverbalMetadata);
    } catch (error) {
      const reason = error instanceof InterviewNonverbalMetadataValidationError
        ? error.reason
        : "nonverbalMetadata is invalid";
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "nonverbalMetadata is invalid.", 400, [
        { field: "nonverbalMetadata", reason },
      ]);
    }

    return {
      ...(requestBody as Omit<AnswerRequestBody, "allowReanswer">),
      allowReanswer: requestBody.allowReanswer === true,
      nonverbalMetadata,
    };
  }

  private assertInsertRequest(dto: InsertFollowUpQuestionDto): number {
    const requestBody = this.toRequestBody(dto, "followUpPromotion");
    if (!this.isPositiveInteger(requestBody.processLogId)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "processLogId is invalid.", 400, [
        { field: "processLogId", reason: "processLogId must be a positive integer" },
      ]);
    }
    return requestBody.processLogId;
  }

  private async countFollowUpQuestions(session: RuntimeInterviewSession): Promise<number> {
    const questions = await Promise.all(session.questionIds.map((questionId) => this.interviewRepository.findQuestion(questionId)));
    return questions.filter((question) => question?.questionType === "FOLLOW_UP").length;
  }

  private async canAddRuntimeFollowUpQuestion(session: RuntimeInterviewSession): Promise<boolean> {
    const questions = await Promise.all(session.questionIds.map((questionId) => this.interviewRepository.findQuestion(questionId)));
    const followUpQuestionCount = questions.filter((question) => question?.questionType === "FOLLOW_UP").length;
    const baseQuestionCount = questions.filter((question) => question && question.questionType !== "FOLLOW_UP").length;
    return followUpQuestionCount < baseQuestionCount;
  }

  private async findExistingRuntimeFollowUpQuestion(
    session: RuntimeInterviewSession,
    sourceQuestionIndex: number,
    content: string,
  ): Promise<InterviewQuestion | undefined> {
    const normalizedContent = content.trim();
    for (let index = sourceQuestionIndex + 1; index < session.questionIds.length; index += 1) {
      const questionId = session.questionIds[index];
      if (!questionId) continue;

      const question = await this.interviewRepository.findQuestion(questionId);
      if (question?.questionType === "FOLLOW_UP" && question.content.trim() === normalizedContent) {
        return question;
      }
    }
    return undefined;
  }

  private assertInProgress(session: RuntimeInterviewSession): void {
    if (session.status !== "IN_PROGRESS") {
      throw new CandidateDomainError("COMMON_CONFLICT", "Interview is not in progress.", 409, [
        { field: "interviewStatus", reason: `current status is ${session.status}` },
      ]);
    }
  }

  private assertReadyOrInProgress(session: RuntimeInterviewSession): void {
    if (!["NOT_READY", "READY", "IN_PROGRESS"].includes(session.status)) {
      throw new CandidateDomainError("COMMON_CONFLICT", "Interview is not ready.", 409, [
        { field: "interviewStatus", reason: `current status is ${session.status}` },
      ]);
    }
  }

  private assertNotCompleted(session: RuntimeInterviewSession): void {
    if (session.status === "COMPLETED") {
      throw new CandidateDomainError("COMMON_CONFLICT", "Interview has already been completed.", 409, [
        { field: "interviewStatus", reason: "interview already completed" },
      ]);
    }
  }

  private async currentQuestion(session: RuntimeInterviewSession): Promise<InterviewQuestion> {
    return this.requiredQuestion(this.currentQuestionId(session));
  }

  private currentQuestionId(session: RuntimeInterviewSession): number {
    const questionId = session.questionIds[session.currentQuestionIndex];
    if (!questionId) {
      throw new CandidateDomainError("COMMON_NOT_FOUND", "Current question was not found.", 404);
    }
    return questionId;
  }

  private async syncCurrentQuestionToFirstUnanswered(session: RuntimeInterviewSession): Promise<RuntimeInterviewSession> {
    if (session.status !== "IN_PROGRESS") {
      return session;
    }

    const answers = await Promise.all(
      session.questionIds.map((questionId) => this.interviewRepository.findAnswer(session.sessionId, questionId)),
    );
    const firstUnansweredIndex = answers.findIndex((answer) => !answer);
    if (firstUnansweredIndex < 0 || firstUnansweredIndex === session.currentQuestionIndex) {
      return session;
    }

    session.currentQuestionIndex = firstUnansweredIndex;
    session.updatedAt = new Date().toISOString();
    return this.interviewRepository.saveRuntimeSession(session);
  }

  private async requiredQuestion(questionId: number): Promise<InterviewQuestion> {
    const question = await this.interviewRepository.findQuestion(questionId);
    if (!question) {
      throw new CandidateDomainError("COMMON_NOT_FOUND", "Interview question was not found.", 404, [
        { field: "questionId", reason: "question not found" },
      ]);
    }
    return question;
  }

  private async countAnswers(sessionId: number): Promise<number> {
    return this.interviewRepository.countAnswersBySession(sessionId);
  }

  private assertPositiveIntegerId(value: number, field: string): void {
    if (!Number.isInteger(value) || value < 1) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "Path parameter is invalid.", 400, [
        { field, reason: `${field} must be a positive integer` },
      ]);
    }
  }

  private isPositiveInteger(value: unknown): value is number {
    return Number.isInteger(value) && Number(value) > 0;
  }

  private isQuestionType(value: unknown): boolean {
    return ["INTRO", "TECHNICAL", "EXPERIENCE", "SITUATION", "FOLLOW_UP", "CLOSING"].includes(String(value));
  }

  private toRequestBody(value: unknown, field: string): Record<string, unknown> {
    if (value === undefined) {
      return {};
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "Request body is invalid.", 400, [
        { field, reason: `${field} must be an object` },
      ]);
    }
    return value as Record<string, unknown>;
  }

  private envelope<T>(data: T): { data: T; meta: { traceId: string; timestamp: string } } {
    return {
      data,
      meta: {
        traceId: "local-candidate-module",
        timestamp: new Date().toISOString(),
      },
    };
  }
}
