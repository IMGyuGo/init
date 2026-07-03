import type { InterviewAnswer, InterviewQuestion, RuntimeInterviewSession } from "../interview.runtime.types";

export const INTERVIEW_REPOSITORY = Symbol("INTERVIEW_REPOSITORY");

export type MaybePromise<T> = T | Promise<T>;

export interface CreateMockInterviewSessionInput {
  candidateId: number;
  showQuestionText: boolean;
  questionIds: number[];
  startedAt: string;
  updatedAt: string;
}

export interface CreateInterviewAnswerInput {
  sessionId: number;
  questionId: number;
  videoFileId?: number;
  audioFileId?: number;
  durationSeconds: number;
  submittedAt: string;
}

export interface CompletedFollowUpProcess {
  processLogId: number;
  sessionId: number;
  answerId: number;
  content: string;
  policy: "MOCK" | "RECRUITING";
}

export type FollowUpQuestionPolicy = "MOCK" | "RECRUITING";

export interface GeneratedFollowUpQuestion {
  followUpId: number;
  answerId: number;
  content: string;
  generationStatus: string;
  policy: FollowUpQuestionPolicy;
}

export interface CreateRuntimeFollowUpQuestionInput {
  session: RuntimeInterviewSession;
  sourceAnswer: InterviewAnswer;
  content: string;
}

export interface InterviewQuestionFilter {
  interviewType?: InterviewQuestion["interviewType"];
  postingId?: number;
  questionTypes?: readonly InterviewQuestion["questionType"][];
}

export interface InterviewRepository {
  listQuestions(filter?: InterviewQuestionFilter): MaybePromise<InterviewQuestion[]>;
  findQuestion(questionId: number): MaybePromise<InterviewQuestion | undefined>;
  listOwnedMockSessions(candidateId: number): MaybePromise<RuntimeInterviewSession[]>;
  findMockSession(sessionId: number): MaybePromise<RuntimeInterviewSession | undefined>;
  createMockSession(input: CreateMockInterviewSessionInput): MaybePromise<RuntimeInterviewSession>;
  findRecruitingRuntimeSession(sessionId: number): MaybePromise<RuntimeInterviewSession | undefined>;
  saveRecruitingRuntimeSession(session: RuntimeInterviewSession): MaybePromise<RuntimeInterviewSession>;
  saveRuntimeSession(session: RuntimeInterviewSession): MaybePromise<RuntimeInterviewSession>;
  listAnswersBySession(sessionId: number): MaybePromise<InterviewAnswer[]>;
  countAnswersBySession(sessionId: number): MaybePromise<number>;
  findAnswer(sessionId: number, questionId: number): MaybePromise<InterviewAnswer | undefined>;
  findAnswerById(sessionId: number, answerId: number): MaybePromise<InterviewAnswer | undefined>;
  findLatestAnswer(sessionId: number): MaybePromise<InterviewAnswer | undefined>;
  createAnswer(input: CreateInterviewAnswerInput): MaybePromise<InterviewAnswer>;
  findCompletedFollowUpProcess(processLogId: number): MaybePromise<CompletedFollowUpProcess | undefined>;
  findGeneratedFollowUpQuestion(
    answerId: number,
    policy: FollowUpQuestionPolicy,
  ): MaybePromise<GeneratedFollowUpQuestion | undefined>;
  createRuntimeFollowUpQuestion(input: CreateRuntimeFollowUpQuestionInput): MaybePromise<InterviewQuestion>;
}
