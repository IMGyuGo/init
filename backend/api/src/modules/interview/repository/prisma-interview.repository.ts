import { Injectable } from "@nestjs/common";
import {
  InterviewStatus as PrismaInterviewStatus,
  InterviewType as PrismaInterviewType,
  Prisma,
  QuestionType as PrismaQuestionType,
} from "@prisma/client";
import { ERROR_CODES } from "@init/common";
import { ApiException } from "../../../shared/api-exception";
import { PrismaService } from "../../../shared/prisma.service";
import {
  CANDIDATE_MOCK_INTERVIEW_FREE_PASS_EXPIRES_IN_DAYS,
  CANDIDATE_MOCK_INTERVIEW_INITIAL_FREE_PASSES,
} from "../../payment/service/candidate-mock-interview-pass.service";
import type { InterviewAnswer, InterviewQuestion, RuntimeInterviewSession } from "../interview.runtime.types";
import type {
  CreateInterviewAnswerInput,
  CreateMockContextQuestionInput,
  CreateMockInterviewSessionInput,
  EnsureSaltluxDemoFollowUpInput,
  InterviewQuestionFilter,
  InterviewRepository,
  InterviewSttProcessRecord,
  ReanswerRequiredFailure,
  ReplaceInterviewAnswerInput,
} from "./interview.repository";

const FALLBACK_MOCK_QUESTIONS: Omit<InterviewQuestion, "questionId" | "isActive" | "interviewType">[] = [
  {
    questionType: "INTRO",
    content: "자기소개와 현재 준비 중인 직무를 함께 설명해주세요.",
    sortOrder: 1,
  },
  {
    questionType: "TECHNICAL",
    content: "최근 프로젝트에서 가장 어려웠던 기술적 문제와 해결 과정을 설명해주세요.",
    sortOrder: 2,
  },
  {
    questionType: "EXPERIENCE",
    content: "새로운 기술을 빠르게 학습하고 적용했던 경험을 설명해주세요.",
    sortOrder: 3,
  },
  {
    questionType: "CLOSING",
    content: "면접관에게 꼭 기억되었으면 하는 본인의 강점은 무엇인가요?",
    sortOrder: 4,
  },
];

const FALLBACK_RECRUITING_QUESTIONS: Omit<InterviewQuestion, "questionId" | "isActive" | "interviewType">[] = [
  {
    questionType: "INTRO",
    content: "해당 채용 포지션에 지원한 이유를 간단히 설명해주세요.",
    sortOrder: 1,
  },
  {
    questionType: "TECHNICAL",
    content: "지원 직무와 관련된 프로젝트에서 본인이 맡았던 역할을 설명해주세요.",
    sortOrder: 2,
  },
  {
    questionType: "SITUATION",
    content: "시간이 부족한 상황에서 문제를 해결했던 경험을 설명해주세요.",
    sortOrder: 3,
  },
  {
    questionType: "CLOSING",
    content: "마지막으로 회사에 전하고 싶은 내용을 말해주세요.",
    sortOrder: 4,
  },
];

const ANSWER_SESSION_QUESTION_SELECT = {
  runtimeQuestionId: true,
  sessionQuestionId: true,
  criterionId: true,
  criterionTitleSnapshot: true,
  ncsProfileId: true,
  ncsQuestionMode: true,
  ncsProfileVersion: true,
  alignmentStatus: true,
  alignmentScore: true,
  evaluatorVersion: true,
  ncsBindings: {
    orderBy: { bindingOrder: "asc" as const },
    select: {
      criterionId: true,
      criterionTitleSnapshot: true,
      ncsProfileId: true,
      ncsProfileVersion: true,
      alignmentStatus: true,
      alignmentScore: true,
      evaluatorVersion: true,
      bindingOrder: true,
    },
  },
} as const;

@Injectable()
export class PrismaInterviewRepository implements InterviewRepository {
  private readonly mockSessionQuestionIds = new Map<number, number[]>();
  private readonly recruitingSessionQuestionIds = new Map<number, number[]>();
  private mockFallbackQuestionsReady = false;

  constructor(private readonly prisma: PrismaService) {}

  async listQuestions(filter: InterviewQuestionFilter = {}): Promise<InterviewQuestion[]> {
    let questions = await this.queryQuestions(filter);
    if (questions.length > 0) {
      return questions;
    }

    if (filter.interviewType === "MOCK") {
      await this.ensureMockFallbackQuestions();
    }
    if (filter.interviewType === "RECRUITING" && filter.postingId !== undefined) {
      await this.ensureRecruitingFallbackQuestions(filter.postingId);
    }

    questions = await this.queryQuestions(filter);
    return questions;
  }

  async findQuestion(questionId: number): Promise<InterviewQuestion | undefined> {
    const question = await this.prisma.question.findUnique({ where: { questionId: BigInt(questionId) } });
    if (question) {
      const isPersistedSessionQuestion =
        !question.isActive
          ? Boolean(
              await this.prisma.interviewSessionQuestion.findFirst({
                where: { questionId: question.questionId },
                select: { sessionId: true },
              }),
            )
          : false;

      return question.isActive || isPersistedSessionQuestion
        ? this.toQuestion(question, question.postingId === null ? "MOCK" : "RECRUITING")
        : undefined;
    }

    const runtimeQuestion = await this.prisma.interviewSessionQuestion.findUnique({
      where: { runtimeQuestionId: BigInt(questionId) },
      include: { session: { select: { interviewType: true } } },
    });
    if (!runtimeQuestion?.questionType || !runtimeQuestion.content) return undefined;
    return {
      questionId,
      questionType: runtimeQuestion.questionType,
      content: runtimeQuestion.content,
      sortOrder: runtimeQuestion.sortOrder,
      interviewType: runtimeQuestion.session.interviewType,
      isActive: false,
    };
  }

  async listOwnedMockSessions(candidateId: number): Promise<RuntimeInterviewSession[]> {
    const sessions = await this.prisma.interviewSession.findMany({
      where: {
        candidateId: BigInt(candidateId),
        interviewType: PrismaInterviewType.MOCK,
        deletedAt: null,
      },
      orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }, { sessionId: "desc" }],
    });
    return Promise.all(sessions.map((session) => this.toRuntimeSession(session)));
  }

  async findMockSession(sessionId: number): Promise<RuntimeInterviewSession | undefined> {
    const session = await this.prisma.interviewSession.findFirst({
      where: {
        sessionId: BigInt(sessionId),
        interviewType: PrismaInterviewType.MOCK,
        deletedAt: null,
      },
    });
    return session ? this.toRuntimeSession(session) : undefined;
  }

  async updateMockSessionTitle(sessionId: number, title: string | null): Promise<RuntimeInterviewSession> {
    const session = await this.prisma.interviewSession.update({
      where: { sessionId: BigInt(sessionId) },
      data: { title },
    });
    return this.toRuntimeSession(session);
  }

  async deleteMockSession(sessionId: number, candidateId: number): Promise<boolean> {
    const result = await this.prisma.interviewSession.updateMany({
      where: {
        sessionId: BigInt(sessionId),
        candidateId: BigInt(candidateId),
        interviewType: PrismaInterviewType.MOCK,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });
    return result.count === 1;
  }

  async createMockSession(input: CreateMockInterviewSessionInput): Promise<RuntimeInterviewSession> {
    const result = await this.prisma.$transaction((transaction) => this.createMockSessionInTransaction(transaction, input));
    this.mockSessionQuestionIds.set(Number(result.session.sessionId), result.questionIds);
    return this.toRuntimeSession(result.session, result.questionIds);
  }

  async createMockSessionWithPass(input: CreateMockInterviewSessionInput): Promise<RuntimeInterviewSession> {
    const result = await this.prisma.$transaction(async (transaction) => {
      const lockKey = 228_000_000_000n + BigInt(input.candidateId);
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
      await this.ensureInitialMockPassInTransaction(transaction, input.candidateId, new Date(input.startedAt));
      await this.assertAvailableMockPassInTransaction(transaction, input.candidateId, new Date(input.startedAt));
      const created = await this.createMockSessionInTransaction(transaction, input);
      if (input.questionProcessLogId) {
        const consumedAt = new Date().toISOString();
        const consumed = await transaction.$executeRaw`
          UPDATE ai_process_logs
          SET input_ref = jsonb_set(COALESCE(input_ref, '{}')::jsonb, '{consumedAt}', to_jsonb(${consumedAt}::text))::text,
              session_id = ${created.session.sessionId}
          WHERE process_log_id = ${BigInt(input.questionProcessLogId)}
            AND process_type = 'QUESTION_GENERATE'::"AiProcessType"
            AND status = 'COMPLETED'::"AiProcessStatus"
            AND NOT (COALESCE(input_ref, '{}')::jsonb ? 'consumedAt')
        `;
        if (consumed !== 1) {
          throw new ApiException(ERROR_CODES.COMMON_CONFLICT, "이미 사용했거나 사용할 수 없는 AI 질문 생성 결과입니다.", 409);
        }
      }
      await transaction.candidateMockInterviewPassLedger.create({
        data: {
          candidateId: BigInt(input.candidateId),
          usedSessionId: created.session.sessionId,
          source: "USAGE",
          changeAmount: -1,
          expiresAt: null,
        },
      });
      return created;
    });
    this.mockSessionQuestionIds.set(Number(result.session.sessionId), result.questionIds);
    return this.toRuntimeSession(result.session, result.questionIds);
  }

  private async createMockSessionInTransaction(
    transaction: Prisma.TransactionClient,
    input: CreateMockInterviewSessionInput,
  ): Promise<{ session: InterviewSessionRecord; questionIds: number[] }> {
    const questionIds = input.questionIds ?? [];
    const contextQuestions = input.contextQuestions ?? [];
    if (questionIds.length > 0 && contextQuestions.length > 0) {
      throw new ApiException(ERROR_CODES.COMMON_VALIDATION_FAILED, "모의면접 질문 입력이 중복되었습니다.", 400);
    }

    const session = await transaction.interviewSession.create({
      data: {
        candidateId: BigInt(input.candidateId),
        interviewType: PrismaInterviewType.MOCK,
        status: PrismaInterviewStatus.IN_PROGRESS,
        showQuestionText: input.showQuestionText,
        startedAt: new Date(input.startedAt),
      },
    });

    if (questionIds.length > 0) {
      await transaction.interviewSessionQuestion.createMany({
        data: questionIds.map((questionId, index) => ({
          sessionId: session.sessionId,
          questionId: BigInt(questionId),
          sortOrder: index + 1,
        })),
      });
      return { session, questionIds };
    }

    const runtimeQuestionIds: number[] = [];
    for (const item of contextQuestions) {
      const runtimeQuestionId = await this.allocatePrivateRuntimeQuestionId(transaction);
      await transaction.interviewSessionQuestion.create({
        data: {
          sessionId: session.sessionId,
          questionId: null,
          runtimeQuestionId,
          questionType: item.questionType as PrismaQuestionType,
          content: item.content,
          sortOrder: item.sortOrder,
        },
      });
      runtimeQuestionIds.push(Number(runtimeQuestionId));
    }
    return { session, questionIds: runtimeQuestionIds };
  }

  private async ensureInitialMockPassInTransaction(
    transaction: Prisma.TransactionClient,
    candidateId: number,
    now: Date,
  ): Promise<void> {
    const existing = await transaction.candidateMockInterviewPassLedger.findFirst({
      where: { candidateId: BigInt(candidateId), source: "FREE_SIGNUP" },
      select: { ledgerId: true },
    });
    if (existing) return;
    await transaction.candidateMockInterviewPassLedger.create({
      data: {
        candidateId: BigInt(candidateId),
        source: "FREE_SIGNUP",
        changeAmount: CANDIDATE_MOCK_INTERVIEW_INITIAL_FREE_PASSES,
        expiresAt: addDays(now, CANDIDATE_MOCK_INTERVIEW_FREE_PASS_EXPIRES_IN_DAYS),
      },
    });
  }

  private async assertAvailableMockPassInTransaction(
    transaction: Prisma.TransactionClient,
    candidateId: number,
    now: Date,
  ): Promise<void> {
    const rows = await transaction.candidateMockInterviewPassLedger.findMany({
      where: {
        candidateId: BigInt(candidateId),
        OR: [{ changeAmount: { lt: 0 } }, { expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { changeAmount: true },
    });
    const availablePasses = rows.reduce((sum, row) => sum + row.changeAmount, 0);
    if (availablePasses >= 1) return;
    throw new ApiException(ERROR_CODES.COMMON_CONFLICT, "사용 가능한 모의면접 이용권이 부족합니다.", 409, [
      { field: "mockInterviewPass", reason: "PASS_REQUIRED", availablePasses: Math.max(0, availablePasses) },
    ]);
  }

  async findRecruitingRuntimeSession(sessionId: number): Promise<RuntimeInterviewSession | undefined> {
    const session = await this.prisma.interviewSession.findFirst({
      where: { sessionId: BigInt(sessionId), interviewType: PrismaInterviewType.RECRUITING },
      include: { application: true },
    });
    return session ? this.toRuntimeSession(session) : undefined;
  }

  async saveRecruitingRuntimeSession(session: RuntimeInterviewSession): Promise<RuntimeInterviewSession> {
    this.recruitingSessionQuestionIds.set(session.sessionId, [...session.questionIds]);
    return this.saveRuntimeSession(session);
  }

  async saveRuntimeSession(session: RuntimeInterviewSession): Promise<RuntimeInterviewSession> {
    if (session.interviewType === "MOCK") {
      this.mockSessionQuestionIds.set(session.sessionId, [...session.questionIds]);
    }
    if (session.interviewType === "RECRUITING") {
      this.recruitingSessionQuestionIds.set(session.sessionId, [...session.questionIds]);
    }

    const updated = await this.prisma.$transaction(async (transaction) => {
      const saved = await transaction.interviewSession.update({
        where: { sessionId: BigInt(session.sessionId) },
        data: {
          status: session.status as PrismaInterviewStatus,
          showQuestionText: session.showQuestionText,
          startedAt: session.startedAt ? new Date(session.startedAt) : undefined,
          completedAt: session.completedAt ? new Date(session.completedAt) : null,
        },
        include: { application: true },
      });
      await this.syncSessionQuestions(transaction, session.sessionId, session.questionIds);
      return saved;
    });
    return this.toRuntimeSession(updated, session.questionIds, session.currentQuestionIndex);
  }

  private async syncSessionQuestions(
    transaction: Prisma.TransactionClient,
    sessionId: number,
    questionIds: number[],
  ): Promise<void> {
    const existing = await transaction.interviewSessionQuestion.findMany({
      where: { sessionId: BigInt(sessionId) },
      select: { sessionQuestionId: true, questionId: true, runtimeQuestionId: true },
    });
    const existingByRuntimeId = new Map(
      existing.map((item) => [Number(item.runtimeQuestionId ?? item.questionId), item]),
    );
    const requested = new Set(questionIds);
    const removedPrivateQuestion = existing.find(
      (item) => item.runtimeQuestionId !== null && !requested.has(Number(item.runtimeQuestionId)),
    );
    if (removedPrivateQuestion) {
      throw new ApiException(ERROR_CODES.COMMON_CONFLICT, "개인 모의면접 질문은 진행 중인 세션에서 제거할 수 없습니다.", 409);
    }

    await transaction.interviewSessionQuestion.updateMany({
      where: { sessionId: BigInt(sessionId) },
      data: { sortOrder: { increment: 10_000 } },
    });

    for (const [index, questionId] of questionIds.entries()) {
      const found = existingByRuntimeId.get(questionId);
      if (found) {
        await transaction.interviewSessionQuestion.update({
          where: { sessionQuestionId: found.sessionQuestionId },
          data: { sortOrder: index + 1 },
        });
      } else {
        await transaction.interviewSessionQuestion.create({
          data: {
            sessionId: BigInt(sessionId),
            questionId: BigInt(questionId),
            sortOrder: index + 1,
          },
        });
      }
    }

    const removedIds = existing
      .filter((item) => !requested.has(Number(item.runtimeQuestionId ?? item.questionId)))
      .map((item) => item.sessionQuestionId);
    if (removedIds.length > 0) {
      await transaction.interviewSessionQuestion.deleteMany({
        where: { sessionQuestionId: { in: removedIds } },
      });
    }
  }

  async listAnswersBySession(sessionId: number): Promise<InterviewAnswer[]> {
    const answers = await this.prisma.interviewAnswer.findMany({
      where: { sessionId: BigInt(sessionId) },
      orderBy: [{ submittedAt: "asc" }, { answerId: "asc" }],
      include: { sessionQuestion: { select: ANSWER_SESSION_QUESTION_SELECT } },
    });
    return answers.map((answer) => this.toAnswer(answer));
  }

  countAnswersBySession(sessionId: number): Promise<number> {
    return this.prisma.interviewAnswer.count({ where: { sessionId: BigInt(sessionId) } });
  }

  async findAnswer(sessionId: number, questionId: number): Promise<InterviewAnswer | undefined> {
    const answer = await this.prisma.interviewAnswer.findFirst({
      where: {
        sessionId: BigInt(sessionId),
        OR: [
          { questionId: BigInt(questionId) },
          { sessionQuestion: { is: { runtimeQuestionId: BigInt(questionId) } } },
        ],
      },
      orderBy: { answerId: "asc" },
      include: { sessionQuestion: { select: ANSWER_SESSION_QUESTION_SELECT } },
    });
    return answer ? this.toAnswer(answer) : undefined;
  }

  async findAnswerById(sessionId: number, answerId: number): Promise<InterviewAnswer | undefined> {
    const answer = await this.prisma.interviewAnswer.findFirst({
      where: { sessionId: BigInt(sessionId), answerId: BigInt(answerId) },
      include: { sessionQuestion: { select: ANSWER_SESSION_QUESTION_SELECT } },
    });
    return answer ? this.toAnswer(answer) : undefined;
  }

  async findAnswerByMediaUploadRequestId(sessionId: number, mediaUploadRequestId: string): Promise<InterviewAnswer | undefined> {
    const answer = await this.prisma.interviewAnswer.findFirst({
      where: { sessionId: BigInt(sessionId), mediaUploadRequestId },
      include: { sessionQuestion: { select: ANSWER_SESSION_QUESTION_SELECT } },
    });
    return answer ? this.toAnswer(answer) : undefined;
  }

  countPendingMediaAnswers(sessionId: number): Promise<number> {
    return this.prisma.interviewAnswer.count({
      where: {
        sessionId: BigInt(sessionId),
        mediaUploadRequestId: { not: null },
        videoFileId: null,
        audioFileId: null,
      },
    });
  }

  async findLatestAnswer(sessionId: number): Promise<InterviewAnswer | undefined> {
    const answer = await this.prisma.interviewAnswer.findFirst({
      where: { sessionId: BigInt(sessionId) },
      orderBy: [{ submittedAt: "desc" }, { answerId: "desc" }],
      include: { sessionQuestion: { select: ANSWER_SESSION_QUESTION_SELECT } },
    });
    return answer ? this.toAnswer(answer) : undefined;
  }

  async createAnswer(input: CreateInterviewAnswerInput): Promise<InterviewAnswer> {
    const sessionQuestion = await this.prisma.interviewSessionQuestion.findFirst({
      where: {
        sessionId: BigInt(input.sessionId),
        OR: [
          { questionId: BigInt(input.questionId) },
          { runtimeQuestionId: BigInt(input.questionId) },
        ],
      },
      select: { sessionQuestionId: true, questionId: true },
    });
    if (!sessionQuestion) {
      throw new ApiException(ERROR_CODES.COMMON_NOT_FOUND, "세션 질문을 찾을 수 없습니다.", 404);
    }
    const answer = await this.prisma.interviewAnswer.create({
      data: {
        sessionId: BigInt(input.sessionId),
        questionId: sessionQuestion.questionId,
        sessionQuestionId: sessionQuestion.sessionQuestionId,
        videoFileId: input.videoFileId ? BigInt(input.videoFileId) : null,
        audioFileId: input.audioFileId ? BigInt(input.audioFileId) : null,
        mediaUploadRequestId: input.mediaUploadRequestId ?? null,
        ...(input.transcript !== undefined ? { transcript: input.transcript } : {}),
        ...(input.nonverbalMetadata !== undefined ? { nonverbalMetadata: this.toPrismaJson(input.nonverbalMetadata) } : {}),
        durationSeconds: input.durationSeconds,
        submittedAt: new Date(input.submittedAt),
      },
      include: { sessionQuestion: { select: ANSWER_SESSION_QUESTION_SELECT } },
    });
    return this.toAnswer(answer);
  }

  async createAnswerIdempotent(input: CreateInterviewAnswerInput) {
    return this.prisma.$transaction(async (transaction) => {
      const sessionQuestion = await transaction.interviewSessionQuestion.findFirst({
        where: {
          sessionId: BigInt(input.sessionId),
          OR: [
            { questionId: BigInt(input.questionId) },
            { runtimeQuestionId: BigInt(input.questionId) },
          ],
        },
        select: { sessionQuestionId: true, questionId: true },
      });
      if (!sessionQuestion) {
        throw new ApiException(ERROR_CODES.COMMON_NOT_FOUND, "세션 질문을 찾을 수 없습니다.", 404);
      }

      const lockKey = 310_000_000_000n + sessionQuestion.sessionQuestionId;
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
      const existing = await transaction.interviewAnswer.findFirst({
        where: {
          sessionId: BigInt(input.sessionId),
          sessionQuestionId: sessionQuestion.sessionQuestionId,
        },
        orderBy: { answerId: "asc" },
        include: { sessionQuestion: { select: ANSWER_SESSION_QUESTION_SELECT } },
      });
      if (existing) {
        return { answer: this.toAnswer(existing), created: false };
      }

      const answer = await transaction.interviewAnswer.create({
        data: {
          sessionId: BigInt(input.sessionId),
          questionId: sessionQuestion.questionId,
          sessionQuestionId: sessionQuestion.sessionQuestionId,
          videoFileId: input.videoFileId ? BigInt(input.videoFileId) : null,
          audioFileId: input.audioFileId ? BigInt(input.audioFileId) : null,
          mediaUploadRequestId: input.mediaUploadRequestId ?? null,
          ...(input.transcript !== undefined ? { transcript: input.transcript } : {}),
          ...(input.nonverbalMetadata !== undefined ? { nonverbalMetadata: this.toPrismaJson(input.nonverbalMetadata) } : {}),
          durationSeconds: input.durationSeconds,
          submittedAt: new Date(input.submittedAt),
        },
        include: { sessionQuestion: { select: ANSWER_SESSION_QUESTION_SELECT } },
      });
      return { answer: this.toAnswer(answer), created: true };
    });
  }

  async ensureSaltluxDemoFollowUp(input: EnsureSaltluxDemoFollowUpInput): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRawUnsafe(
        'SELECT "answer_id" FROM "interview_answers" WHERE "answer_id" = $1 AND "session_id" = $2 FOR UPDATE',
        BigInt(input.answerId),
        BigInt(input.sessionId),
      );
      const answer = await transaction.interviewAnswer.findFirst({
        where: { answerId: BigInt(input.answerId), sessionId: BigInt(input.sessionId) },
        include: {
          session: { select: { sessionMode: true, status: true } },
          sessionQuestion: {
            include: { ncsBindings: { orderBy: { bindingOrder: "asc" } } },
          },
        },
      });
      const sourceQuestion = answer?.sessionQuestion;
      if (!answer || !sourceQuestion) {
        throw new ApiException(ERROR_CODES.COMMON_CONFLICT, "시연 꼬리질문 원본 답변을 찾을 수 없습니다.", 409);
      }
      if (answer.session.sessionMode !== "DEMO_PRESET" || answer.session.status !== "IN_PROGRESS") {
        return false;
      }

      const key = { answerId: answer.answerId, policy: "RECRUITING" } as const;
      const existing = await transaction.followUpQuestion.findUnique({
        where: { answerIdPolicy: key },
      });
      if (existing?.insertedSessionQuestionId) {
        return false;
      }

      const [sequence] = await transaction.$queryRawUnsafe<Array<{ questionId: bigint }>>(
        `SELECT nextval('interview_runtime_question_id_seq') AS "questionId"`,
      );
      if (!sequence) {
        throw new ApiException(ERROR_CODES.COMMON_CONFLICT, "시연 꼬리질문 ID를 발급하지 못했습니다.", 409);
      }

      const reorderOffset = 1_000_000;
      await transaction.$executeRawUnsafe(
        `UPDATE interview_session_questions
         SET sort_order = sort_order + $3
         WHERE session_id = $1 AND sort_order > $2`,
        answer.sessionId,
        sourceQuestion.sortOrder,
        reorderOffset,
      );
      await transaction.$executeRawUnsafe(
        `UPDATE interview_session_questions
         SET sort_order = sort_order - $3
         WHERE session_id = $1 AND sort_order > $2`,
        answer.sessionId,
        sourceQuestion.sortOrder + reorderOffset,
        reorderOffset - 1,
      );

      const inserted = await transaction.interviewSessionQuestion.create({
        data: {
          sessionId: answer.sessionId,
          questionId: null,
          personalizedQuestionId: null,
          runtimeQuestionId: sequence.questionId,
          criterionId: sourceQuestion.criterionId,
          criterionTitleSnapshot: sourceQuestion.criterionTitleSnapshot,
          // Runtime follow-ups are not generated question-bank rows. Keep this null so the
          // interview_session_questions generation-source/shape constraints accept the row.
          generationSource: null,
          usageScope: sourceQuestion.usageScope,
          questionType: "FOLLOW_UP",
          content: input.content,
          ncsProfileId: sourceQuestion.ncsProfileId,
          ncsQuestionMode: sourceQuestion.ncsQuestionMode,
          ncsProfileVersion: sourceQuestion.ncsProfileVersion,
          alignmentStatus: sourceQuestion.alignmentStatus,
          alignmentScore: sourceQuestion.alignmentScore,
          alignmentReason: sourceQuestion.alignmentReason,
          evaluatorVersion: sourceQuestion.evaluatorVersion,
          policyVersion: sourceQuestion.policyVersion,
          criteriaVersion: sourceQuestion.criteriaVersion,
          sortOrder: sourceQuestion.sortOrder + 1,
          ncsBindings: {
            create: sourceQuestion.ncsBindings.map((binding) => ({
              criterionId: binding.criterionId,
              criterionTitleSnapshot: binding.criterionTitleSnapshot,
              ncsProfileId: binding.ncsProfileId,
              ncsProfileVersion: binding.ncsProfileVersion,
              alignmentStatus: binding.alignmentStatus,
              alignmentScore: binding.alignmentScore,
              alignmentReason: binding.alignmentReason,
              evaluatorVersion: binding.evaluatorVersion,
              bindingOrder: binding.bindingOrder,
            })),
          },
        },
      });

      await transaction.followUpQuestion.upsert({
        where: { answerIdPolicy: key },
        create: {
          answerId: answer.answerId,
          sourceSessionQuestionId: sourceQuestion.sessionQuestionId,
          insertedSessionQuestionId: inserted.sessionQuestionId,
          content: input.content,
          generationStatus: "INSERTED",
          policy: "RECRUITING",
          reason: "NCS_EVIDENCE_GAP",
          questionMode: sourceQuestion.ncsQuestionMode,
          answerTimeSec: input.answerTimeSec,
          insertedAt: new Date(),
        },
        update: {
          sourceSessionQuestionId: sourceQuestion.sessionQuestionId,
          insertedSessionQuestionId: inserted.sessionQuestionId,
          content: input.content,
          generationStatus: "INSERTED",
          reason: "NCS_EVIDENCE_GAP",
          skipReason: null,
          questionMode: sourceQuestion.ncsQuestionMode,
          answerTimeSec: input.answerTimeSec,
          insertedAt: new Date(),
        },
      });
      return true;
    });
  }

  async updateAnswer(input: CreateInterviewAnswerInput & { answerId: number }): Promise<InterviewAnswer> {
    const answer = await this.prisma.interviewAnswer.update({
      where: { answerId: BigInt(input.answerId) },
      data: {
        videoFileId: input.videoFileId ? BigInt(input.videoFileId) : null,
        audioFileId: input.audioFileId ? BigInt(input.audioFileId) : null,
        ...(input.mediaUploadRequestId !== undefined ? { mediaUploadRequestId: input.mediaUploadRequestId } : {}),
        transcript: input.transcript ?? null,
        nonverbalMetadata: this.toNullablePrismaJson(input.nonverbalMetadata),
        durationSeconds: input.durationSeconds,
        submittedAt: new Date(input.submittedAt),
      },
      include: { sessionQuestion: { select: ANSWER_SESSION_QUESTION_SELECT } },
    });
    return this.toAnswer(answer);
  }

  async attachMediaToAnswer(input: { sessionId: number; mediaUploadRequestId: string; fileId: number; mediaKind: "video" | "audio" }): Promise<InterviewAnswer | undefined> {
    const existing = await this.prisma.interviewAnswer.findFirst({
      where: { sessionId: BigInt(input.sessionId), mediaUploadRequestId: input.mediaUploadRequestId },
    });
    if (!existing) return undefined;
    const answer = await this.prisma.interviewAnswer.update({
      where: { answerId: existing.answerId },
      data: input.mediaKind === "video" ? { videoFileId: BigInt(input.fileId) } : { audioFileId: BigInt(input.fileId) },
      include: { sessionQuestion: { select: ANSWER_SESSION_QUESTION_SELECT } },
    });
    return this.toAnswer(answer);
  }

  async replaceAnswer(input: ReplaceInterviewAnswerInput): Promise<InterviewAnswer> {
    const answer = await this.prisma.interviewAnswer.update({
      where: { answerId: BigInt(input.answerId) },
      data: {
        videoFileId: input.videoFileId ? BigInt(input.videoFileId) : null,
        audioFileId: input.audioFileId ? BigInt(input.audioFileId) : null,
        nonverbalMetadata: this.toNullablePrismaJson(input.nonverbalMetadata),
        durationSeconds: input.durationSeconds,
        submittedAt: new Date(input.submittedAt),
        transcript: input.transcript ?? null,
      },
      include: { sessionQuestion: { select: ANSWER_SESSION_QUESTION_SELECT } },
    });
    return this.toAnswer(answer);
  }

  async listReanswerRequiredFailures(sessionId: number, answerId: number): Promise<ReanswerRequiredFailure[]> {
    const logs = await this.prisma.aiProcessLog.findMany({
      where: {
        sessionId: BigInt(sessionId),
        processType: { in: ["STT", "FOLLOW_UP"] },
        status: "FAILED",
        failureCategory: "REANSWER_REQUIRED",
      },
      orderBy: [{ createdAt: "desc" }, { processLogId: "desc" }],
    });
    return logs
      .filter((log) => parseAiJobAnswerId(log.inputRef) === answerId)
      .map((log) => ({
        processLogId: Number(log.processLogId),
        createdAt: log.createdAt.toISOString(),
        failureCategory: "REANSWER_REQUIRED",
        failureReason: log.failureReason ?? undefined,
      }));
  }

  async listSttProcesses(sessionId: number, answerId: number): Promise<InterviewSttProcessRecord[]> {
    const logs = await this.prisma.aiProcessLog.findMany({
      where: {
        sessionId: BigInt(sessionId),
        processType: "STT",
      },
      orderBy: [{ createdAt: "desc" }, { processLogId: "desc" }],
    });
    return logs
      .filter((log) => parseAiJobAnswerId(log.inputRef) === answerId)
      .map((log) => ({
        processLogId: Number(log.processLogId),
        status: log.status,
        failureCategory: log.failureCategory ?? undefined,
        failureReason: log.failureReason ?? undefined,
        createdAt: log.createdAt.toISOString(),
        completedAt: log.completedAt?.toISOString(),
      }));
  }

  async listTranscriptProcesses(sessionId: number, answerId: number): Promise<InterviewSttProcessRecord[]> {
    const logs = await this.prisma.aiProcessLog.findMany({
      where: {
        sessionId: BigInt(sessionId),
        OR: [
          { processType: "STT" },
          { processType: "FOLLOW_UP", status: "FAILED", failureCategory: "REANSWER_REQUIRED" },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { processLogId: "desc" }],
    });
    return logs
      .filter((log) => parseAiJobAnswerId(log.inputRef) === answerId)
      .map((log) => ({
        processLogId: Number(log.processLogId),
        status: log.status,
        failureCategory: log.failureCategory ?? undefined,
        failureReason: log.failureReason ?? undefined,
        createdAt: log.createdAt.toISOString(),
        completedAt: log.completedAt?.toISOString(),
      }));
  }
  private async allocatePrivateRuntimeQuestionId(transaction: Prisma.TransactionClient): Promise<bigint> {
    const [sequence] = await transaction.$queryRaw<Array<{ questionId: bigint }>>`
      SELECT nextval('interview_runtime_question_id_seq') AS "questionId"
    `;
    if (!sequence) throw new Error("Failed to allocate a private runtime question ID.");
    return sequence.questionId;
  }

  private async queryQuestions(filter: InterviewQuestionFilter): Promise<InterviewQuestion[]> {
    if (filter.interviewType === "RECRUITING" && filter.postingId !== undefined && !filter.questionTypes) {
      const activeQuestionSetQuestions = await this.queryActiveQuestionSetQuestions(filter.postingId);
      if (activeQuestionSetQuestions.length > 0) {
        return activeQuestionSetQuestions;
      }
    }

    const where: Prisma.QuestionWhereInput = {
      isActive: true,
      postingId:
        filter.postingId !== undefined
          ? BigInt(filter.postingId)
          : filter.interviewType === "MOCK"
            ? null
            : filter.interviewType === "RECRUITING"
              ? { not: null }
              : undefined,
      questionType: filter.questionTypes
        ? { in: [...filter.questionTypes] as PrismaQuestionType[] }
        : { not: PrismaQuestionType.FOLLOW_UP },
    };
    const questions = await this.prisma.question.findMany({
      where,
      orderBy: [{ questionType: "asc" }, { questionId: "asc" }],
    });
    return questions
      .map((question) => this.toQuestion(question, filter.interviewType))
      .sort((left, right) => left.sortOrder - right.sortOrder || left.questionId - right.questionId);
  }

  private async queryActiveQuestionSetQuestions(postingId: number): Promise<InterviewQuestion[]> {
    const questionSet = await (this.prisma as any).interviewQuestionSet.findFirst({
      where: { postingId: BigInt(postingId), status: "ACTIVE" },
      orderBy: { questionSetId: "desc" },
      include: {
        items: {
          orderBy: { sortOrder: "asc" },
          include: { question: true },
        },
      },
    });
    if (!questionSet) return [];

    const items = questionSet.items as ActiveQuestionSetItemRecord[];
    return items
      .filter(
        (item: ActiveQuestionSetItemRecord): item is ActiveQuestionSetItemWithQuestion =>
          Boolean(
            item.question?.isActive &&
              item.question.postingId !== null &&
              Number(item.question.postingId) === postingId &&
              item.question.questionType !== PrismaQuestionType.FOLLOW_UP,
          ),
      )
      .map((item) => ({
        ...this.toQuestion(item.question, "RECRUITING"),
        sortOrder: item.sortOrder,
      }))
      .sort((left: InterviewQuestion, right: InterviewQuestion) => left.sortOrder - right.sortOrder || left.questionId - right.questionId);
  }

  private async ensureMockFallbackQuestions(): Promise<void> {
    if (this.mockFallbackQuestionsReady) return;

    const company = await this.prisma.company.findFirst({ orderBy: { companyId: "asc" }, select: { companyId: true } });
    if (!company) return;

    await this.ensureQuestions(company.companyId, null, FALLBACK_MOCK_QUESTIONS);
    this.mockFallbackQuestionsReady = true;
  }

  private async ensureRecruitingFallbackQuestions(postingId: number): Promise<void> {
    const posting = await this.prisma.posting.findUnique({
      where: { postingId: BigInt(postingId) },
      select: { companyId: true, postingId: true },
    });
    if (!posting) return;

    await this.ensureQuestions(posting.companyId, posting.postingId, FALLBACK_RECRUITING_QUESTIONS);
  }

  private async ensureQuestions(
    companyId: bigint,
    postingId: bigint | null,
    questions: Omit<InterviewQuestion, "questionId" | "isActive" | "interviewType">[],
  ): Promise<void> {
    for (const question of questions) {
      const exists = await this.prisma.question.findFirst({
        where: {
          companyId,
          postingId,
          questionType: question.questionType as PrismaQuestionType,
          content: question.content,
        },
        select: { questionId: true },
      });
      if (exists) continue;

      await this.prisma.question.create({
        data: {
          companyId,
          postingId,
          criterionId: null,
          questionType: question.questionType as PrismaQuestionType,
          content: question.content,
          isActive: true,
        },
      });
    }
  }

  private async toRuntimeSession(
    session: InterviewSessionRecord,
    questionIdsOverride?: number[],
    currentQuestionIndexOverride?: number,
  ): Promise<RuntimeInterviewSession> {
    const sessionId = Number(session.sessionId);
    const questionIds = questionIdsOverride ?? (await this.resolveSessionQuestionIds(session));
    const currentQuestionIndex =
      currentQuestionIndexOverride ?? (await this.resolveCurrentQuestionIndex(sessionId, questionIds));
    const startedAt = session.startedAt?.toISOString();
    const completedAt = session.completedAt?.toISOString();

    return {
      sessionId,
      applicationId: session.applicationId ? Number(session.applicationId) : undefined,
      candidateId: Number(session.candidateId),
      interviewType: session.interviewType,
      title: session.title ?? null,
      status: session.status,
      showQuestionText: session.showQuestionText,
      preparationTimeSecSnapshot: session.preparationTimeSecSnapshot ?? undefined,
      answerTimeSecSnapshot: session.answerTimeSecSnapshot ?? undefined,
      ncsScoringVersion: session.ncsScoringVersion ?? undefined,
      sessionMode: session.sessionMode === "DEMO_PRESET" ? "DEMO_PRESET" : "STANDARD",
      currentQuestionIndex,
      questionIds,
      startedAt,
      completedAt,
      updatedAt: completedAt ?? startedAt ?? new Date().toISOString(),
    };
  }

  private async resolveSessionQuestionIds(session: InterviewSessionRecord): Promise<number[]> {
    const sessionId = Number(session.sessionId);
    const persisted = await this.prisma.interviewSessionQuestion.findMany({
      where: { sessionId: session.sessionId },
      orderBy: { sortOrder: "asc" },
      select: { questionId: true, runtimeQuestionId: true },
    });
    if (persisted.length > 0) {
      return persisted
        .map((item) => item.runtimeQuestionId ?? item.questionId)
        .filter((questionId): questionId is bigint => questionId !== null)
        .map(Number);
    }

    if (session.interviewType === PrismaInterviewType.MOCK) {
      const cached = this.mockSessionQuestionIds.get(sessionId);
      if (cached) return [...cached];
      const questionIds = (await this.listQuestions({ interviewType: "MOCK" })).map((question) => question.questionId);
      return this.restoreAnsweredQuestionOrder(sessionId, questionIds);
    }

    const cached = this.recruitingSessionQuestionIds.get(sessionId);
    if (cached) return [...cached];

    const postingId = session.application?.postingId ? Number(session.application.postingId) : undefined;
    if (postingId !== undefined) {
      const postingQuestions = await this.listQuestions({ interviewType: "RECRUITING", postingId });
      if (postingQuestions.length > 0) {
        return this.restoreAnsweredQuestionOrder(sessionId, postingQuestions.map((question) => question.questionId));
      }
    }

    const fallbackBySortOrder = new Map<number, InterviewQuestion>();
    (await this.listQuestions({ interviewType: "RECRUITING" })).forEach((question) => {
      if (!fallbackBySortOrder.has(question.sortOrder)) fallbackBySortOrder.set(question.sortOrder, question);
    });
    return this.restoreAnsweredQuestionOrder(
      sessionId,
      [...fallbackBySortOrder.values()].map((question) => question.questionId),
    );
  }

  private async restoreAnsweredQuestionOrder(sessionId: number, baseQuestionIds: number[]): Promise<number[]> {
    const answers = await this.prisma.interviewAnswer.findMany({
      where: { sessionId: BigInt(sessionId) },
      orderBy: [{ submittedAt: "asc" }, { answerId: "asc" }],
      select: {
        questionId: true,
        sessionQuestion: { select: { runtimeQuestionId: true } },
      },
    });
    const restoredQuestionIds: number[] = [];
    const seenQuestionIds = new Set<number>();

    for (const answer of answers) {
      const resolved = answer.sessionQuestion?.runtimeQuestionId ?? answer.questionId;
      if (resolved === null || resolved === undefined) continue;
      const questionId = Number(resolved);
      if (seenQuestionIds.has(questionId)) continue;
      restoredQuestionIds.push(questionId);
      seenQuestionIds.add(questionId);
    }

    for (const questionId of baseQuestionIds) {
      if (seenQuestionIds.has(questionId)) continue;
      restoredQuestionIds.push(questionId);
      seenQuestionIds.add(questionId);
    }

    return restoredQuestionIds;
  }

  private async resolveCurrentQuestionIndex(sessionId: number, questionIds: number[]): Promise<number> {
    if (questionIds.length === 0) return 0;
    const answers = await this.prisma.interviewAnswer.findMany({
      where: { sessionId: BigInt(sessionId) },
      select: {
        questionId: true,
        sessionQuestion: { select: { runtimeQuestionId: true } },
      },
    });
    const answeredIds = new Set(
      answers
        .map((answer) => answer.sessionQuestion?.runtimeQuestionId ?? answer.questionId)
        .filter((questionId): questionId is bigint => questionId !== null && questionId !== undefined)
        .map(Number),
    );
    const firstUnansweredIndex = questionIds.findIndex((questionId) => !answeredIds.has(questionId));
    return firstUnansweredIndex >= 0 ? firstUnansweredIndex : questionIds.length - 1;
  }

  private toQuestion(question: QuestionRecord, interviewType?: InterviewQuestion["interviewType"]): InterviewQuestion {
    return {
      questionId: Number(question.questionId),
      questionType: question.questionType,
      content: question.content,
      sortOrder: this.questionSortOrder(question.questionType),
      interviewType: interviewType ?? (question.postingId === null ? "MOCK" : "RECRUITING"),
      postingId: question.postingId === null ? undefined : Number(question.postingId),
      criterionId: question.criterionId === null ? undefined : Number(question.criterionId),
      isActive: question.isActive,
    };
  }

  private toAnswer(answer: AnswerRecord): InterviewAnswer {
    const questionId = answer.sessionQuestion?.runtimeQuestionId ?? answer.questionId;
    const ncsEvaluationSnapshot = this.toNcsEvaluationSnapshot(answer.sessionQuestion);
    return {
      answerId: Number(answer.answerId),
      sessionId: Number(answer.sessionId),
      questionId: Number(questionId ?? 0),
      ...(answer.sessionQuestionId ? { sessionQuestionId: Number(answer.sessionQuestionId) } : {}),
      videoFileId: answer.videoFileId ? Number(answer.videoFileId) : undefined,
      audioFileId: answer.audioFileId ? Number(answer.audioFileId) : undefined,
      transcript: answer.transcript ?? undefined,
      nonverbalMetadata: this.toAnswerNonverbalMetadata(answer.nonverbalMetadata),
      durationSeconds: answer.durationSeconds ?? 0,
      submittedAt: (answer.submittedAt ?? new Date()).toISOString(),
      ...(ncsEvaluationSnapshot ? { ncsEvaluationSnapshot } : {}),
    };
  }

  async listNcsSessionPolicies(sessionId: number) {
    const policies = await this.prisma.interviewSessionNcsPolicy.findMany({
      where: { sessionId: BigInt(sessionId) },
      orderBy: { ncsProfileId: "asc" },
    });
    return policies.flatMap((policy) => {
      const ncsProfileId = this.toNcsProfileId(policy.ncsProfileId);
      if (!ncsProfileId) return [];
      return [{
        ncsProfileId,
        criterionId: policy.criterionId ? Number(policy.criterionId) : undefined,
        criterionTitleSnapshot: policy.criterionTitleSnapshot,
        weight: policy.weight,
        minimumAverageScore: Number(policy.minimumAverageScore),
        requiredQuestionCount: policy.requiredQuestionCount,
        ncsProfileVersion: policy.ncsProfileVersion,
      }];
    });
  }

  private toNcsEvaluationSnapshot(sessionQuestion: AnswerRecord["sessionQuestion"]): InterviewAnswer["ncsEvaluationSnapshot"] {
    if (!sessionQuestion) {
      return undefined;
    }
    const ncsBindings = (sessionQuestion.ncsBindings ?? [])
      .map((binding) => {
        const ncsProfileId = this.toNcsProfileId(binding.ncsProfileId);
        if (!ncsProfileId || (binding.bindingOrder !== 1 && binding.bindingOrder !== 2)) return null;
        return {
          criterionId: binding.criterionId ? Number(binding.criterionId) : undefined,
          criterionTitleSnapshot: binding.criterionTitleSnapshot,
          ncsProfileId,
          ncsProfileVersion: binding.ncsProfileVersion,
          alignmentStatus: binding.alignmentStatus,
          alignmentScore: binding.alignmentScore === null ? undefined : Number(binding.alignmentScore),
          evaluatorVersion: binding.evaluatorVersion ?? undefined,
          bindingOrder: binding.bindingOrder,
        } as const;
      })
      .filter((binding): binding is NonNullable<typeof binding> => binding !== null);
    const ncsProfileId = ncsBindings[0]?.ncsProfileId ?? this.toNcsProfileId(sessionQuestion.ncsProfileId);
    if (!ncsProfileId) {
      return undefined;
    }
    return {
      sessionQuestionId: Number(sessionQuestion.sessionQuestionId),
      criterionId: sessionQuestion.criterionId ? Number(sessionQuestion.criterionId) : undefined,
      criterionTitleSnapshot: sessionQuestion.criterionTitleSnapshot ?? undefined,
      ncsProfileId,
      ncsQuestionMode: this.toNcsQuestionMode(sessionQuestion.ncsQuestionMode),
      ncsProfileVersion: sessionQuestion.ncsProfileVersion ?? undefined,
      alignmentStatus: sessionQuestion.alignmentStatus ?? undefined,
      alignmentScore: sessionQuestion.alignmentScore === null ? undefined : Number(sessionQuestion.alignmentScore),
      evaluatorVersion: sessionQuestion.evaluatorVersion ?? undefined,
      ...(ncsBindings.length > 0 ? { ncsBindings } : {}),
    };
  }

  private toNcsProfileId(
    value: string | null,
  ): "JOB_TECHNICAL" | "COLLABORATION_COMMUNICATION" | "PROBLEM_SOLVING" | undefined {
    if (value === "DIGITAL" || value === "JOB_TECHNICAL") return "JOB_TECHNICAL";
    if (value === "COMMUNICATION" || value === "COLLABORATION_COMMUNICATION") {
      return "COLLABORATION_COMMUNICATION";
    }
    return value === "PROBLEM_SOLVING" ? value : undefined;
  }

  private toNcsQuestionMode(
    value: string | null,
  ): "EXPERIENCE_BEHAVIOR" | "TECHNICAL_KNOWLEDGE" | "SITUATIONAL_DESIGN" | undefined {
    return value === "EXPERIENCE_BEHAVIOR" || value === "TECHNICAL_KNOWLEDGE" || value === "SITUATIONAL_DESIGN"
      ? value
      : undefined;
  }

  private toPrismaJson(value: Record<string, unknown>): Prisma.InputJsonObject {
    return value as Prisma.InputJsonObject;
  }

  private toNullablePrismaJson(
    value: Record<string, unknown> | undefined,
  ): Prisma.InputJsonObject | typeof Prisma.JsonNull {
    return value === undefined ? Prisma.JsonNull : this.toPrismaJson(value);
  }

  private toAnswerNonverbalMetadata(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }
    return value as Record<string, unknown>;
  }

  private questionSortOrder(questionType: PrismaQuestionType): number {
    return {
      INTRO: 1,
      TECHNICAL: 2,
      EXPERIENCE: 3,
      SITUATION: 4,
      FOLLOW_UP: 5,
      CLOSING: 6,
    }[questionType];
  }
}

function parseAiJobAnswerId(inputRef: string | null): number | undefined {
  if (!inputRef) return undefined;
  try {
    const input = JSON.parse(inputRef) as Record<string, unknown>;
    const payload = input.payload;
    const nestedAnswerId = payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).answerId
      : undefined;
    const answerId = Number(nestedAnswerId ?? input.answerId);
    return Number.isInteger(answerId) && answerId > 0 ? answerId : undefined;
  } catch {
    return undefined;
  }
}

type QuestionRecord = {
  questionId: bigint;
  companyId: bigint;
  postingId: bigint | null;
  criterionId: bigint | null;
  questionType: PrismaQuestionType;
  content: string;
  isActive: boolean;
};

type ActiveQuestionSetItemRecord = {
  sortOrder: number;
  question: QuestionRecord | null;
};

type ActiveQuestionSetItemWithQuestion = ActiveQuestionSetItemRecord & {
  question: QuestionRecord;
};

type AnswerRecord = {
  answerId: bigint;
  sessionId: bigint;
  questionId: bigint | null;
  sessionQuestionId: bigint | null;
  videoFileId: bigint | null;
  audioFileId: bigint | null;
  transcript: string | null;
  nonverbalMetadata: unknown;
  durationSeconds: number | null;
  submittedAt: Date | null;
  sessionQuestion?: {
    runtimeQuestionId: bigint | null;
    sessionQuestionId: bigint;
    criterionId: bigint | null;
    criterionTitleSnapshot: string | null;
    ncsProfileId: string | null;
    ncsQuestionMode: string | null;
    ncsProfileVersion: string | null;
    alignmentStatus: string | null;
    alignmentScore: unknown | null;
    evaluatorVersion: string | null;
    ncsBindings: Array<{
      criterionId: bigint | null;
      criterionTitleSnapshot: string;
      ncsProfileId: string;
      ncsProfileVersion: string;
      alignmentStatus: string;
      alignmentScore: unknown | null;
      evaluatorVersion: string | null;
      bindingOrder: number;
    }>;
  } | null;
};

type InterviewSessionRecord = {
  sessionId: bigint;
  applicationId: bigint | null;
  candidateId: bigint;
  interviewType: PrismaInterviewType;
  title: string | null;
  status: PrismaInterviewStatus;
  showQuestionText: boolean;
  preparationTimeSecSnapshot: number | null;
  answerTimeSecSnapshot: number | null;
  ncsScoringVersion: string | null;
  sessionMode: string;
  startedAt: Date | null;
  completedAt: Date | null;
  application?: { postingId: bigint } | null;
};

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
