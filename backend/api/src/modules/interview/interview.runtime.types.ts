import type { FileAsset, InterviewStatus, InterviewType } from "../candidate";

export type QuestionType = "INTRO" | "TECHNICAL" | "EXPERIENCE" | "SITUATION" | "FOLLOW_UP" | "CLOSING";

export interface InterviewQuestion {
  questionId: number;
  questionType: QuestionType;
  content: string;
  sortOrder: number;
  interviewType: InterviewType;
  jobRole?: string;
  postingId?: number;
  criterionId?: number;
  isActive: boolean;
}

export interface RuntimeInterviewSession {
  sessionId: number;
  applicationId?: number;
  candidateId: number;
  interviewType: InterviewType;
  status: InterviewStatus;
  showQuestionText: boolean;
  currentQuestionIndex: number;
  questionIds: number[];
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
}

export interface InterviewAnswer {
  answerId: number;
  sessionId: number;
  questionId: number;
  videoFileId?: number;
  audioFileId?: number;
  transcript?: string;
  durationSeconds: number;
  submittedAt: string;
}

export interface InterviewQuestionView {
  questionId: number;
  questionType: QuestionType;
  sortOrder: number;
  content?: string;
  audioPrompt: string;
  answered: boolean;
  current: boolean;
}

export interface InterviewRuntimeView {
  sessionId: number;
  applicationId?: number;
  interviewType: InterviewType;
  status: InterviewStatus;
  showQuestionText: boolean;
  currentQuestion?: InterviewQuestionView;
  totalQuestions: number;
  answeredCount: number;
  canRecord: boolean;
  nextQuestionEndpoint: string;
  answerUploadEndpoint: string;
}

export interface StartMockInterviewResult extends InterviewRuntimeView {
  startedAt: string;
}

export interface InterviewQuestionListResult {
  sessionId: number;
  interviewType: InterviewType;
  showQuestionText: boolean;
  currentQuestionId?: number;
  questions: InterviewQuestionView[];
}

export interface SaveInterviewAnswerResult {
  sessionId: number;
  answer: InterviewAnswer;
  videoFile?: FileAsset;
  audioFile?: FileAsset;
  nextQuestionAvailable: boolean;
}

export interface NextInterviewQuestionResult {
  sessionId: number;
  previousQuestionId: number;
  currentQuestion?: InterviewQuestionView;
  isLastQuestion: boolean;
}

export interface CompleteInterviewResult {
  sessionId: number;
  applicationId?: number;
  interviewType: InterviewType;
  status: "COMPLETED";
  completedAt: string;
  answeredCount: number;
  totalQuestions: number;
}

export interface AiHandoffResult {
  accepted: true;
  processType: "STT" | "FOLLOW_UP";
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  sessionId: number;
  applicationId?: number;
  answerId: number;
  questionId: number;
  fileId?: number;
  fileAssetId?: number;
  videoFileId?: number;
  audioFileId?: number;
  processLogId?: number;
  inputRef?: string;
  queued?: boolean;
  callbackTopic: string;
}

export interface InsertFollowUpQuestionResult {
  sessionId: number;
  processLogId: number;
  sourceAnswerId: number;
  sourceQuestionId: number;
  question: InterviewQuestionView;
  inserted: boolean;
  totalQuestions: number;
  nextQuestionAvailable: boolean;
}
