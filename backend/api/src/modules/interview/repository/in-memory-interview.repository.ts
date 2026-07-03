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

export class InMemoryInterviewRepository implements InterviewRepository {
  private readonly questions: InterviewQuestion[] = [
    {
      questionId: 1,
      questionType: "INTRO",
      content: "자기소개와 현재 준비 중인 직무를 함께 설명해주세요.",
      sortOrder: 1,
      interviewType: "MOCK",
      isActive: true,
    },
    {
      questionId: 2,
      questionType: "TECHNICAL",
      content: "최근 프로젝트에서 내린 기술적 의사결정 하나와 그때 고려한 장단점을 설명해주세요.",
      sortOrder: 2,
      interviewType: "MOCK",
      isActive: true,
    },
    {
      questionId: 3,
      questionType: "EXPERIENCE",
      content: "새로운 도구나 기술을 빠르게 익혀서 적용했던 프로젝트 경험을 설명해주세요.",
      sortOrder: 3,
      interviewType: "MOCK",
      isActive: true,
    },
    {
      questionId: 4,
      questionType: "CLOSING",
      content: "면접관이 당신에 대해 꼭 기억했으면 하는 강점은 무엇인가요?",
      sortOrder: 4,
      interviewType: "MOCK",
      isActive: true,
    },
    {
      questionId: 101,
      questionType: "INTRO",
      content: "이 채용 포지션에 지원한 이유를 간단히 설명해주세요.",
      sortOrder: 1,
      interviewType: "RECRUITING",
      postingId: 1,
      isActive: true,
    },
    {
      questionId: 102,
      questionType: "TECHNICAL",
      content: "트래픽이 많은 채용 workflow를 위한 안정적인 API를 어떻게 설계하시겠습니까?",
      sortOrder: 2,
      interviewType: "RECRUITING",
      postingId: 1,
      isActive: true,
    },
    {
      questionId: 103,
      questionType: "SITUATION",
      content: "시간 압박이 있는 상황에서 운영 이슈를 디버깅했던 경험을 설명해주세요.",
      sortOrder: 3,
      interviewType: "RECRUITING",
      postingId: 1,
      isActive: true,
    },
    {
      questionId: 104,
      questionType: "CLOSING",
      content: "채용팀에 마지막으로 전하고 싶은 내용이 있다면 말씀해주세요.",
      sortOrder: 4,
      interviewType: "RECRUITING",
      postingId: 1,
      isActive: true,
    },
    {
      questionId: 201,
      questionType: "INTRO",
      content: "Android 개발자 지원자로서 본인을 소개해주세요.",
      sortOrder: 1,
      interviewType: "RECRUITING",
      postingId: 2,
      isActive: true,
    },
    {
      questionId: 202,
      questionType: "TECHNICAL",
      content: "Android 앱에서 상태 관리와 네트워크 계층을 어떻게 구성할지 설명해주세요.",
      sortOrder: 2,
      interviewType: "RECRUITING",
      postingId: 2,
      isActive: true,
    },
    {
      questionId: 203,
      questionType: "EXPERIENCE",
      content: "반복 개선을 통해 해결했던 모바일 UX 문제 경험을 설명해주세요.",
      sortOrder: 3,
      interviewType: "RECRUITING",
      postingId: 2,
      isActive: true,
    },
    {
      questionId: 204,
      questionType: "CLOSING",
      content: "앞으로 더 키우고 싶은 Android 엔지니어링 역량은 무엇인가요?",
      sortOrder: 4,
      interviewType: "RECRUITING",
      postingId: 2,
      isActive: true,
    },
  ];

  private readonly mockSessions = new Map<number, RuntimeInterviewSession>();
  private readonly recruitingSessions = new Map<number, RuntimeInterviewSession>();
  private readonly answers: InterviewAnswer[] = [];
  private readonly followUpProcesses = new Map<number, CompletedFollowUpProcess>();
  private readonly followUpQuestions = new Map<string, GeneratedFollowUpQuestion>();

  listQuestions(filter: InterviewQuestionFilter = {}): InterviewQuestion[] {
    return this.questions
      .filter((question) => question.isActive)
      .filter((question) => !filter.interviewType || question.interviewType === filter.interviewType)
      .filter((question) => filter.postingId === undefined || question.postingId === filter.postingId)
      .filter((question) => !filter.questionTypes || filter.questionTypes.includes(question.questionType))
      .filter((question) => filter.questionTypes || question.questionType !== "FOLLOW_UP")
      .sort((left, right) => left.sortOrder - right.sortOrder || left.questionId - right.questionId)
      .map((question) => this.cloneQuestion(question));
  }

  findQuestion(questionId: number): InterviewQuestion | undefined {
    const question = this.questions.find((candidate) => candidate.questionId === questionId && candidate.isActive);
    return question ? this.cloneQuestion(question) : undefined;
  }

  listOwnedMockSessions(candidateId: number): RuntimeInterviewSession[] {
    return [...this.mockSessions.values()]
      .filter((session) => session.candidateId === candidateId)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .map((session) => this.cloneSession(session));
  }

  findMockSession(sessionId: number): RuntimeInterviewSession | undefined {
    const session = this.mockSessions.get(sessionId);
    return session ? this.cloneSession(session) : undefined;
  }

  createMockSession(input: CreateMockInterviewSessionInput): RuntimeInterviewSession {
    const session: RuntimeInterviewSession = {
      sessionId: 10000 + this.mockSessions.size + 1,
      candidateId: input.candidateId,
      interviewType: "MOCK",
      status: "IN_PROGRESS",
      showQuestionText: input.showQuestionText,
      currentQuestionIndex: 0,
      questionIds: [...input.questionIds],
      startedAt: input.startedAt,
      updatedAt: input.updatedAt,
    };

    this.mockSessions.set(session.sessionId, this.cloneSession(session));
    return this.cloneSession(session);
  }

  findRecruitingRuntimeSession(sessionId: number): RuntimeInterviewSession | undefined {
    const session = this.recruitingSessions.get(sessionId);
    return session ? this.cloneSession(session) : undefined;
  }

  saveRecruitingRuntimeSession(session: RuntimeInterviewSession): RuntimeInterviewSession {
    this.recruitingSessions.set(session.sessionId, this.cloneSession(session));
    return this.cloneSession(session);
  }

  saveRuntimeSession(session: RuntimeInterviewSession): RuntimeInterviewSession {
    if (session.interviewType === "MOCK") {
      this.mockSessions.set(session.sessionId, this.cloneSession(session));
    } else {
      this.recruitingSessions.set(session.sessionId, this.cloneSession(session));
    }
    return this.cloneSession(session);
  }

  listAnswersBySession(sessionId: number): InterviewAnswer[] {
    return this.answers
      .filter((answer) => answer.sessionId === sessionId)
      .sort((left, right) => this.questionSortOrder(left.questionId) - this.questionSortOrder(right.questionId))
      .map((answer) => this.cloneAnswer(answer));
  }

  countAnswersBySession(sessionId: number): number {
    return this.answers.filter((answer) => answer.sessionId === sessionId).length;
  }

  findAnswer(sessionId: number, questionId: number): InterviewAnswer | undefined {
    const answer = this.answers.find(
      (candidate) => candidate.sessionId === sessionId && candidate.questionId === questionId,
    );
    return answer ? this.cloneAnswer(answer) : undefined;
  }

  findAnswerById(sessionId: number, answerId: number): InterviewAnswer | undefined {
    const answer = this.answers.find(
      (candidate) => candidate.sessionId === sessionId && candidate.answerId === answerId,
    );
    return answer ? this.cloneAnswer(answer) : undefined;
  }

  findLatestAnswer(sessionId: number): InterviewAnswer | undefined {
    const answer = [...this.answers].reverse().find((candidate) => candidate.sessionId === sessionId);
    return answer ? this.cloneAnswer(answer) : undefined;
  }

  createAnswer(input: CreateInterviewAnswerInput): InterviewAnswer {
    const answer: InterviewAnswer = {
      answerId: this.answers.length + 1,
      sessionId: input.sessionId,
      questionId: input.questionId,
      videoFileId: input.videoFileId,
      audioFileId: input.audioFileId,
      durationSeconds: input.durationSeconds,
      submittedAt: input.submittedAt,
    };
    this.answers.push(this.cloneAnswer(answer));
    return this.cloneAnswer(answer);
  }

  findCompletedFollowUpProcess(processLogId: number): CompletedFollowUpProcess | undefined {
    const process = this.followUpProcesses.get(processLogId);
    return process ? { ...process } : undefined;
  }

  findGeneratedFollowUpQuestion(
    answerId: number,
    policy: FollowUpQuestionPolicy,
  ): GeneratedFollowUpQuestion | undefined {
    const question = this.followUpQuestions.get(this.followUpKey(answerId, policy));
    if (!question || question.generationStatus !== "GENERATED") {
      return undefined;
    }
    return { ...question };
  }

  createRuntimeFollowUpQuestion(input: CreateRuntimeFollowUpQuestionInput): InterviewQuestion {
    const sourceQuestion = this.questions.find((question) => question.questionId === input.sourceAnswer.questionId);
    const followUpQuestion: InterviewQuestion = {
      questionId: Math.max(...this.questions.map((question) => question.questionId), 0) + 1,
      questionType: "FOLLOW_UP",
      content: input.content,
      sortOrder: (sourceQuestion?.sortOrder ?? input.session.currentQuestionIndex + 1) + 0.5,
      interviewType: input.session.interviewType,
      postingId: input.session.interviewType === "RECRUITING" ? sourceQuestion?.postingId : undefined,
      isActive: true,
    };
    this.questions.push(followUpQuestion);
    return this.cloneQuestion(followUpQuestion);
  }

  saveGeneratedFollowUpQuestionForTest(
    answerId: number,
    policy: FollowUpQuestionPolicy,
    content: string,
    generationStatus = "GENERATED",
  ): GeneratedFollowUpQuestion {
    const question: GeneratedFollowUpQuestion = {
      followUpId: this.followUpQuestions.size + 1,
      answerId,
      content,
      generationStatus,
      policy,
    };
    this.followUpQuestions.set(this.followUpKey(answerId, policy), question);
    return { ...question };
  }

  saveAnswerTranscript(answerId: number, transcript: string): void {
    const answer = this.answers.find((candidate) => candidate.answerId === answerId);
    if (answer) {
      answer.transcript = transcript;
    }
  }

  saveCompletedFollowUpProcess(process: CompletedFollowUpProcess): void {
    this.followUpProcesses.set(process.processLogId, { ...process });
  }

  private questionSortOrder(questionId: number): number {
    return this.questions.find((question) => question.questionId === questionId)?.sortOrder ?? questionId;
  }

  private cloneQuestion(question: InterviewQuestion): InterviewQuestion {
    return { ...question };
  }

  private cloneAnswer(answer: InterviewAnswer): InterviewAnswer {
    return { ...answer };
  }

  private cloneSession(session: RuntimeInterviewSession): RuntimeInterviewSession {
    return { ...session, questionIds: [...session.questionIds] };
  }

  private followUpKey(answerId: number, policy: FollowUpQuestionPolicy): string {
    return `${policy}:${answerId}`;
  }
}
