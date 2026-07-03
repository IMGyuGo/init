import { Injectable } from "@nestjs/common";
import {
  InterviewStatus as PrismaInterviewStatus,
  InterviewType as PrismaInterviewType,
  Prisma,
  QuestionType as PrismaQuestionType,
} from "@prisma/client";
import { PrismaService } from "../../../shared/prisma.service";
import type { InterviewAnswer, InterviewQuestion, RuntimeInterviewSession } from "../interview.runtime.types";
import type {
  CompletedFollowUpProcess,
  CreateInterviewAnswerInput,
  CreateMockInterviewSessionInput,
  CreateRuntimeFollowUpQuestionInput,
  FollowUpQuestionPolicy,
  GeneratedFollowUpQuestion,
  InterviewQuestionFilter,
  InterviewRepository,
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
    return question && question.isActive ? this.toQuestion(question) : undefined;
  }

  async listOwnedMockSessions(candidateId: number): Promise<RuntimeInterviewSession[]> {
    const sessions = await this.prisma.interviewSession.findMany({
      where: { candidateId: BigInt(candidateId), interviewType: PrismaInterviewType.MOCK },
      orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }, { sessionId: "desc" }],
    });
    return Promise.all(sessions.map((session) => this.toRuntimeSession(session)));
  }

  async findMockSession(sessionId: number): Promise<RuntimeInterviewSession | undefined> {
    const session = await this.prisma.interviewSession.findFirst({
      where: { sessionId: BigInt(sessionId), interviewType: PrismaInterviewType.MOCK },
    });
    return session ? this.toRuntimeSession(session) : undefined;
  }

  async createMockSession(input: CreateMockInterviewSessionInput): Promise<RuntimeInterviewSession> {
    const session = await this.prisma.interviewSession.create({
      data: {
        candidateId: BigInt(input.candidateId),
        interviewType: PrismaInterviewType.MOCK,
        status: PrismaInterviewStatus.IN_PROGRESS,
        showQuestionText: input.showQuestionText,
        startedAt: new Date(input.startedAt),
      },
    });
    this.mockSessionQuestionIds.set(Number(session.sessionId), [...input.questionIds]);
    return this.toRuntimeSession(session, input.questionIds);
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

    const updated = await this.prisma.interviewSession.update({
      where: { sessionId: BigInt(session.sessionId) },
      data: {
        status: session.status as PrismaInterviewStatus,
        showQuestionText: session.showQuestionText,
        startedAt: session.startedAt ? new Date(session.startedAt) : undefined,
        completedAt: session.completedAt ? new Date(session.completedAt) : null,
      },
      include: { application: true },
    });
    return this.toRuntimeSession(updated, session.questionIds, session.currentQuestionIndex);
  }

  async listAnswersBySession(sessionId: number): Promise<InterviewAnswer[]> {
    const answers = await this.prisma.interviewAnswer.findMany({
      where: { sessionId: BigInt(sessionId) },
      orderBy: [{ submittedAt: "asc" }, { answerId: "asc" }],
    });
    return answers.map((answer) => this.toAnswer(answer));
  }

  countAnswersBySession(sessionId: number): Promise<number> {
    return this.prisma.interviewAnswer.count({ where: { sessionId: BigInt(sessionId) } });
  }

  async findAnswer(sessionId: number, questionId: number): Promise<InterviewAnswer | undefined> {
    const answer = await this.prisma.interviewAnswer.findFirst({
      where: { sessionId: BigInt(sessionId), questionId: BigInt(questionId) },
      orderBy: { answerId: "asc" },
    });
    return answer ? this.toAnswer(answer) : undefined;
  }

  async findAnswerById(sessionId: number, answerId: number): Promise<InterviewAnswer | undefined> {
    const answer = await this.prisma.interviewAnswer.findFirst({
      where: { sessionId: BigInt(sessionId), answerId: BigInt(answerId) },
    });
    return answer ? this.toAnswer(answer) : undefined;
  }

  async findLatestAnswer(sessionId: number): Promise<InterviewAnswer | undefined> {
    const answer = await this.prisma.interviewAnswer.findFirst({
      where: { sessionId: BigInt(sessionId) },
      orderBy: [{ submittedAt: "desc" }, { answerId: "desc" }],
    });
    return answer ? this.toAnswer(answer) : undefined;
  }

  async createAnswer(input: CreateInterviewAnswerInput): Promise<InterviewAnswer> {
    const answer = await this.prisma.interviewAnswer.create({
      data: {
        sessionId: BigInt(input.sessionId),
        questionId: BigInt(input.questionId),
        videoFileId: input.videoFileId ? BigInt(input.videoFileId) : null,
        audioFileId: input.audioFileId ? BigInt(input.audioFileId) : null,
        durationSeconds: input.durationSeconds,
        submittedAt: new Date(input.submittedAt),
      },
    });
    return this.toAnswer(answer);
  }

  async findCompletedFollowUpProcess(processLogId: number): Promise<CompletedFollowUpProcess | undefined> {
    const processLog = await this.prisma.aiProcessLog.findUnique({
      where: { processLogId: BigInt(processLogId) },
    });
    if (!processLog || processLog.processType !== "FOLLOW_UP" || processLog.status !== "COMPLETED" || !processLog.outputRef) {
      return undefined;
    }

    const output = parseFollowUpOutput(processLog.outputRef);
    if (!output) {
      return undefined;
    }

    return {
      processLogId,
      sessionId: output.sessionId,
      answerId: output.answerId,
      content: output.content,
      policy: output.policy,
    };
  }

  async findGeneratedFollowUpQuestion(
    answerId: number,
    policy: FollowUpQuestionPolicy,
  ): Promise<GeneratedFollowUpQuestion | undefined> {
    const followUpQuestion = await this.prisma.followUpQuestion.findUnique({
      where: { answerIdPolicy: { answerId: BigInt(answerId), policy } },
    });
    if (!followUpQuestion || followUpQuestion.generationStatus !== "GENERATED") {
      return undefined;
    }
    return {
      followUpId: Number(followUpQuestion.followUpId),
      answerId: Number(followUpQuestion.answerId),
      content: followUpQuestion.content,
      generationStatus: followUpQuestion.generationStatus,
      policy: followUpQuestion.policy as FollowUpQuestionPolicy,
    };
  }

  async createRuntimeFollowUpQuestion(input: CreateRuntimeFollowUpQuestionInput): Promise<InterviewQuestion> {
    const sourceQuestion = await this.prisma.question.findUnique({
      where: { questionId: BigInt(input.sourceAnswer.questionId) },
      select: { companyId: true, postingId: true },
    });
    const fallbackCompany = sourceQuestion
      ? undefined
      : await this.prisma.company.findFirst({ orderBy: { companyId: "asc" }, select: { companyId: true } });
    const companyId = sourceQuestion?.companyId ?? fallbackCompany?.companyId;
    if (!companyId) {
      throw new Error("Company is required to create a runtime follow-up question.");
    }

    let postingId = input.session.interviewType === "RECRUITING" ? sourceQuestion?.postingId ?? null : null;
    if (input.session.interviewType === "RECRUITING" && !postingId && input.session.applicationId) {
      const application = await this.prisma.application.findUnique({
        where: { applicationId: BigInt(input.session.applicationId) },
        select: { postingId: true },
      });
      postingId = application?.postingId ?? null;
    }

    const question = await this.prisma.question.create({
      data: {
        companyId,
        postingId,
        criterionId: null,
        questionType: PrismaQuestionType.FOLLOW_UP,
        content: input.content,
        isActive: true,
      },
    });
    return this.toQuestion(question, input.session.interviewType);
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
      status: session.status,
      showQuestionText: session.showQuestionText,
      currentQuestionIndex,
      questionIds,
      startedAt,
      completedAt,
      updatedAt: completedAt ?? startedAt ?? new Date().toISOString(),
    };
  }

  private async resolveSessionQuestionIds(session: InterviewSessionRecord): Promise<number[]> {
    const sessionId = Number(session.sessionId);
    if (session.interviewType === PrismaInterviewType.MOCK) {
      const cached = this.mockSessionQuestionIds.get(sessionId);
      if (cached) return [...cached];
      return (await this.listQuestions({ interviewType: "MOCK" })).map((question) => question.questionId);
    }

    const cached = this.recruitingSessionQuestionIds.get(sessionId);
    if (cached) return [...cached];

    const postingId = session.application?.postingId ? Number(session.application.postingId) : undefined;
    if (postingId !== undefined) {
      const postingQuestions = await this.listQuestions({ interviewType: "RECRUITING", postingId });
      if (postingQuestions.length > 0) return postingQuestions.map((question) => question.questionId);
    }

    const fallbackBySortOrder = new Map<number, InterviewQuestion>();
    (await this.listQuestions({ interviewType: "RECRUITING" })).forEach((question) => {
      if (!fallbackBySortOrder.has(question.sortOrder)) fallbackBySortOrder.set(question.sortOrder, question);
    });
    return [...fallbackBySortOrder.values()].map((question) => question.questionId);
  }

  private async resolveCurrentQuestionIndex(sessionId: number, questionIds: number[]): Promise<number> {
    if (questionIds.length === 0) return 0;
    const answers = await this.prisma.interviewAnswer.findMany({
      where: { sessionId: BigInt(sessionId), questionId: { in: questionIds.map((questionId) => BigInt(questionId)) } },
      select: { questionId: true },
    });
    const answeredIds = new Set(answers.map((answer) => Number(answer.questionId)));
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
    return {
      answerId: Number(answer.answerId),
      sessionId: Number(answer.sessionId),
      questionId: Number(answer.questionId ?? 0),
      videoFileId: answer.videoFileId ? Number(answer.videoFileId) : undefined,
      audioFileId: answer.audioFileId ? Number(answer.audioFileId) : undefined,
      transcript: answer.transcript ?? undefined,
      durationSeconds: answer.durationSeconds ?? 0,
      submittedAt: (answer.submittedAt ?? new Date()).toISOString(),
    };
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

function parseFollowUpOutput(outputRef: string): Omit<CompletedFollowUpProcess, "processLogId"> | undefined {
  try {
    const output = JSON.parse(outputRef) as Record<string, unknown>;
    const sessionId = Number(output.sessionId);
    const answerId = Number(output.answerId);
    const content = typeof output.content === "string" ? output.content.trim() : "";
    const policy = output.policy;
    if (
      !Number.isInteger(sessionId) ||
      sessionId <= 0 ||
      !Number.isInteger(answerId) ||
      answerId <= 0 ||
      !content ||
      (policy !== "MOCK" && policy !== "RECRUITING")
    ) {
      return undefined;
    }

    return {
      sessionId,
      answerId,
      content,
      policy,
    };
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
  videoFileId: bigint | null;
  audioFileId: bigint | null;
  transcript: string | null;
  durationSeconds: number | null;
  submittedAt: Date | null;
};

type InterviewSessionRecord = {
  sessionId: bigint;
  applicationId: bigint | null;
  candidateId: bigint;
  interviewType: PrismaInterviewType;
  status: PrismaInterviewStatus;
  showQuestionText: boolean;
  startedAt: Date | null;
  completedAt: Date | null;
  application?: { postingId: bigint } | null;
};
