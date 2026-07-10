import { CurrentUser } from "../../common/dev-auth/current-user";

export type ReportType = "MOCK_INTERVIEW_REPORT" | "RECRUITING_REPORT";
export type ReportStatus = "PENDING" | "GENERATING" | "COMPLETED" | "FAILED";
export type AiProcessType =
  | "DOCUMENT_EXTRACT"
  | "STT"
  | "FOLLOW_UP"
  | "REPORT_GENERATE"
  | "EMBEDDING"
  | "GUARDRAIL_VALIDATE"
  | "CRITERIA_SUGGEST"
  | "QUESTION_GENERATE"
  | "QUESTION_SET_GENERATE"
  | "POSTING_DRAFT_GENERATE";
export type AiProcessStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
export type GuardrailResult = "PASS" | "BLOCKED" | "REGENERATED";
export type ReportPipelineStep =
  | "EVALUATION_CONTEXT"
  | "ANSWER_EVALUATION"
  | "COMMUNICATION_ANALYSIS"
  | "REPORT_GENERATE";
export type FailureCategory = "RETRYABLE" | "NON_RETRYABLE" | "STT_RETRYABLE" | "REANSWER_REQUIRED";

export function isRetryableFailureCategory(category: FailureCategory): boolean {
  return category === "RETRYABLE" || category === "STT_RETRYABLE";
}

export interface EvaluationCriterionInput {
  criterionId: number;
  name: string;
  description?: string;
  weight: number;
}

export interface InterviewAnswerInput {
  answerId: number;
  questionId?: number;
  question: string;
  questionType?: "INTRO" | "TECHNICAL" | "EXPERIENCE" | "SITUATION" | "FOLLOW_UP" | "CLOSING";
  sortOrder?: number;
  isFollowUpAnswer?: boolean;
  parentAnswerId?: number;
  transcript?: string;
  nonverbalMetadata?: Record<string, unknown>;
  evaluationStatus?: "EVALUATED" | "STT_UNAVAILABLE";
  transcriptUnavailableReason?: string;
}

export interface ManualEvaluationInput {
  reviewerUserId: number;
  decision?: "UNDECIDED" | "PASS" | "HOLD" | "FAIL";
  memo?: string;
}

export interface EvaluationContextRequest {
  reportType: ReportType;
  company: {
    companyId: number;
    name: string;
    talentProfile?: string;
  };
  posting: {
    postingId: number;
    title: string;
    jobDescription: string;
  };
  application: {
    applicationId: number;
    candidateId: number;
    documentText?: string;
  };
  criteria: EvaluationCriterionInput[];
  answers: InterviewAnswerInput[];
  manualEvaluations?: ManualEvaluationInput[];
}

export interface AnswerEvaluationRequest {
  reportType: ReportType;
  criteria: EvaluationCriterionInput[];
  answers: InterviewAnswerInput[];
  documentText?: string;
}

export interface CommunicationAnalysisRequest {
  reportType: ReportType;
  consentConfirmed: boolean;
  mediaQuality: "GOOD" | "LOW_AUDIO" | "LOW_VIDEO" | "FACE_NOT_DETECTED";
  metrics?: {
    speechPace?: "SLOW" | "NORMAL" | "FAST";
    audioClarity?: number;
    eyeContactRatio?: number;
  };
  notes?: string[];
}

export interface GenerateReportRequest {
  reportType: ReportType;
  companyName?: string;
  jobTitle?: string;
  jobRole?: string;
  postingId?: number;
  jobDescription: string;
  documentText?: string;
  criteria: EvaluationCriterionInput[];
  answers: InterviewAnswerInput[];
}

export interface ReportCommand<TBody> {
  currentUser: CurrentUser;
  reportId: number;
  body: TBody;
}

export type EvidenceSourceType = "INTERVIEW_ANSWER" | "APPLICATION_DOCUMENT";
export type ReportEvaluationConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface ReportEvidence {
  sourceType: EvidenceSourceType;
  answerId?: number;
  documentId?: number;
  documentRef?: string;
  text: string;
}

export interface ReportScore {
  criterionId: number;
  criterionName: string;
  score: number;
  rationale: string;
  rubricAnchor: string;
  confidence: ReportEvaluationConfidence;
  uncertaintyReasons: string[];
  evidences: ReportEvidence[];
}

export interface QuestionEvaluation {
  criterionId: number;
  criterionName: string;
  answerId: number;
  question: string;
  rubricAnchor: string;
  confidence: ReportEvaluationConfidence;
  uncertaintyReasons: string[];
  evidences: ReportEvidence[];
}

export interface GeneratedReport {
  summary: string;
  totalScore: number;
  scores: ReportScore[];
  questionEvaluations: QuestionEvaluation[];
}

export interface EvaluationContext {
  reportType: ReportType;
  companyId: number;
  postingId: number;
  applicationId: number;
  candidateId: number;
  jobDescription: string;
  criteria: EvaluationCriterionInput[];
  answers: InterviewAnswerInput[];
  documentText?: string;
  manualEvaluations: ManualEvaluationInput[];
}

export interface CommunicationAnalysis {
  usage: "AUXILIARY_ONLY";
  mediaQuality: CommunicationAnalysisRequest["mediaQuality"];
  metrics: NonNullable<CommunicationAnalysisRequest["metrics"]>;
  notes: string[];
  decisionWeight: 0;
}

export interface GuardrailDecision {
  result: GuardrailResult;
  reason: string | null;
  failureCategory?: FailureCategory | null;
}

export type GuardrailValidationTarget = "REPORT" | "SCORES";

export interface GuardrailValidationRequest {
  reportType: ReportType;
  target: GuardrailValidationTarget;
  policyName?: string;
  processLogId?: number;
  regenerated?: boolean;
  regenerationReason?: string;
  summary?: string;
  totalScore?: number;
  scores: ReportScore[];
  questionEvaluations?: QuestionEvaluation[];
}

export interface GuardrailValidationResult {
  target: GuardrailValidationTarget;
  processLogId: number;
  guardrail: GuardrailDecision;
  guardrailLogId?: number;
}

export interface FailureReason {
  category: FailureCategory;
  reason: string;
  retryable: boolean;
}

export interface ProcessLogSnapshot {
  processLogId: number;
  processType: AiProcessType;
  step: ReportPipelineStep;
  status: AiProcessStatus;
  failure?: FailureReason;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  modelName?: string;
  inputTokens?: number;
  outputTokens?: number;
  audioSeconds?: number;
  estimatedCostUsd?: number;
  costMetadataJson?: string;
}

export interface QueuedAiProcessSnapshot {
  processLogId: number;
  processType: AiProcessType;
  status: AiProcessStatus;
  inputRef: string;
  outputRef?: string;
  output?: unknown;
  applicationId?: number;
  sessionId?: number;
  failure?: FailureReason;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  modelName?: string;
  inputTokens?: number;
  outputTokens?: number;
  audioSeconds?: number;
  estimatedCostUsd?: number;
  costMetadataJson?: string;
}

export interface EvaluationReportSnapshot {
  reportId: number;
  reportType: ReportType;
  status: ReportStatus;
  summary?: string;
  totalScore?: number;
  failure?: FailureReason;
}

export interface StoredCounts {
  scoreCount: number;
  evidenceCount: number;
  guardrailLogCount: number;
}

export interface AiProcessRefs {
  applicationId?: number;
  sessionId?: number;
}

export interface PipelineResult {
  processLogId: number;
  processType: AiProcessType;
  step: ReportPipelineStep;
  status: AiProcessStatus;
  report: EvaluationReportSnapshot;
  failure?: FailureReason;
}

export interface EvaluationContextResult extends PipelineResult {
  context: EvaluationContext;
}

export interface AnswerEvaluationResult extends PipelineResult {
  scores: ReportScore[];
  questionEvaluations: QuestionEvaluation[];
  guardrail: GuardrailDecision;
  stored: StoredCounts;
}

export interface CommunicationAnalysisResult extends PipelineResult {
  communicationAnalysis: CommunicationAnalysis;
}

export interface GenerateReportResult extends PipelineResult, GeneratedReport {
  guardrail: GuardrailDecision;
  stored: StoredCounts;
}
