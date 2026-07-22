import type {
  InterviewAnswer,
  InterviewAnswerNonverbalMetadata,
  InterviewQuestion,
  RuntimeInterviewSession,
} from "../interview.runtime.types";

export const INTERVIEW_REPOSITORY = Symbol("INTERVIEW_REPOSITORY");

export type MaybePromise<T> = T | Promise<T>;

export interface CreateMockInterviewSessionInput {
  candidateId: number;
  questionProcessLogId?: number;
  showQuestionText: boolean;
  questionIds?: number[];
  contextQuestions?: CreateMockContextQuestionInput[];
  startedAt: string;
  updatedAt: string;
}

export interface CreateMockContextQuestionInput {
  questionType: InterviewQuestion["questionType"];
  content: string;
  sortOrder: number;
}

export interface CreateInterviewAnswerInput {
  sessionId: number;
  questionId: number;
  videoFileId?: number;
  audioFileId?: number;
  mediaUploadRequestId?: string;
  transcript?: string;
  nonverbalMetadata?: InterviewAnswerNonverbalMetadata;
  durationSeconds: number;
  submittedAt: string;
}

export interface CreateInterviewAnswerIdempotentResult {
  answer: InterviewAnswer;
  created: boolean;
}

export interface ReplaceInterviewAnswerInput {
  answerId: number;
  videoFileId?: number;
  audioFileId?: number;
  transcript?: string;
  nonverbalMetadata?: InterviewAnswerNonverbalMetadata;
  durationSeconds: number;
  submittedAt: string;
}

export interface ReanswerRequiredFailure {
  processLogId: number;
  createdAt: string;
  failureCategory: "REANSWER_REQUIRED";
  failureReason?: string;
}

export interface InterviewSttProcessRecord {
  processLogId: number;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  failureCategory?: string;
  failureReason?: string;
  createdAt: string;
  completedAt?: string;
}

export interface UpdateInterviewAnswerInput extends CreateInterviewAnswerInput {
  answerId: number;
}

export interface AttachInterviewAnswerMediaInput {
  sessionId: number;
  mediaUploadRequestId: string;
  fileId: number;
  mediaKind: "video" | "audio";
}

export interface EnsureSaltluxDemoFollowUpInput {
  sessionId: number;
  answerId: number;
  content: string;
  answerTimeSec: number;
}

export interface InterviewSessionNcsPolicySnapshot {
  ncsProfileId: "JOB_TECHNICAL" | "COLLABORATION_COMMUNICATION" | "PROBLEM_SOLVING";
  criterionId?: number;
  criterionTitleSnapshot: string;
  weight: number;
  minimumAverageScore: number;
  requiredQuestionCount: number;
  ncsProfileVersion: string;
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
  updateMockSessionTitle(sessionId: number, title: string | null): MaybePromise<RuntimeInterviewSession>;
  deleteMockSession(sessionId: number, candidateId: number): MaybePromise<boolean>;
  createMockSession(input: CreateMockInterviewSessionInput): MaybePromise<RuntimeInterviewSession>;
  createMockSessionWithPass?(input: CreateMockInterviewSessionInput): Promise<RuntimeInterviewSession>;
  findRecruitingRuntimeSession(sessionId: number): MaybePromise<RuntimeInterviewSession | undefined>;
  saveRecruitingRuntimeSession(session: RuntimeInterviewSession): MaybePromise<RuntimeInterviewSession>;
  saveRuntimeSession(session: RuntimeInterviewSession): MaybePromise<RuntimeInterviewSession>;
  listAnswersBySession(sessionId: number): MaybePromise<InterviewAnswer[]>;
  listNcsSessionPolicies?(sessionId: number): MaybePromise<InterviewSessionNcsPolicySnapshot[]>;
  countAnswersBySession(sessionId: number): MaybePromise<number>;
  findAnswer(sessionId: number, questionId: number): MaybePromise<InterviewAnswer | undefined>;
  findAnswerById(sessionId: number, answerId: number): MaybePromise<InterviewAnswer | undefined>;
  findAnswerByMediaUploadRequestId(sessionId: number, mediaUploadRequestId: string): MaybePromise<InterviewAnswer | undefined>;
  findLatestAnswer(sessionId: number): MaybePromise<InterviewAnswer | undefined>;
  createAnswer(input: CreateInterviewAnswerInput): MaybePromise<InterviewAnswer>;
  createAnswerIdempotent(input: CreateInterviewAnswerInput): MaybePromise<CreateInterviewAnswerIdempotentResult>;
  ensureSaltluxDemoFollowUp?(input: EnsureSaltluxDemoFollowUpInput): MaybePromise<boolean>;
  replaceAnswer(input: ReplaceInterviewAnswerInput): MaybePromise<InterviewAnswer>;
  listReanswerRequiredFailures(sessionId: number, answerId: number): MaybePromise<ReanswerRequiredFailure[]>;
  listSttProcesses(sessionId: number, answerId: number): MaybePromise<InterviewSttProcessRecord[]>;
  listTranscriptProcesses(sessionId: number, answerId: number): MaybePromise<InterviewSttProcessRecord[]>;
  updateAnswer(input: UpdateInterviewAnswerInput): MaybePromise<InterviewAnswer>;
  attachMediaToAnswer(input: AttachInterviewAnswerMediaInput): MaybePromise<InterviewAnswer | undefined>;
  countPendingMediaAnswers(sessionId: number): MaybePromise<number>;
}
