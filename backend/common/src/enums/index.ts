export const USER_TYPES = ["ADMIN", "COMPANY", "CANDIDATE"] as const;
export type UserType = (typeof USER_TYPES)[number];

export const CURRENT_USER_TYPES = USER_TYPES;
export type CurrentUserType = (typeof CURRENT_USER_TYPES)[number];

export const AUTH_PROVIDERS = ["LOCAL", "GOOGLE"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export const USER_STATUSES = ["ACTIVE", "PENDING", "SUSPENDED", "DEACTIVATED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const POSTING_STATUSES = ["DRAFT", "OPEN", "CLOSING_SOON", "CLOSED", "ARCHIVED"] as const;
export type PostingStatus = (typeof POSTING_STATUSES)[number];

export const APPLICATION_STATUSES = ["DRAFT", "SUBMITTED", "IN_REVIEW", "INTERVIEW_WAITING", "INTERVIEW_DONE", "COMPLETED", "CANCELED"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const DOCUMENT_STATUSES = ["NOT_SUBMITTED", "SUBMITTED", "EXTRACTING", "EXTRACTED", "FAILED"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const INTERVIEW_STATUSES = ["NOT_READY", "READY", "IN_PROGRESS", "COMPLETED", "FAILED"] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export const REPORT_STATUSES = ["PENDING", "GENERATING", "COMPLETED", "FAILED"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const SCREENING_DECISIONS = ["UNDECIDED", "PASS", "HOLD", "FAIL"] as const;
export type ScreeningDecision = (typeof SCREENING_DECISIONS)[number];

export const INTERVIEW_TYPES = ["MOCK", "RECRUITING"] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number];

export const REPORT_TYPES = ["MOCK_INTERVIEW_REPORT", "RECRUITING_REPORT"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const DOCUMENT_TYPES = ["RESUME", "PORTFOLIO"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const CONSENT_TYPES = ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS", "AI_INTERVIEW_RECORDING"] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

export const QUESTION_TYPES = ["INTRO", "TECHNICAL", "EXPERIENCE", "SITUATION", "FOLLOW_UP", "CLOSING"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const NOTIFICATION_CHANNELS = ["EMAIL", "IN_APP"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const AI_PROCESS_TYPES = [
  "DOCUMENT_EXTRACT",
  "STT",
  "FOLLOW_UP",
  "REPORT_GENERATE",
  "EMBEDDING",
  "GUARDRAIL_VALIDATE",
  "CRITERIA_SUGGEST",
  "QUESTION_GENERATE",
  "QUESTION_SET_GENERATE",
  "POSTING_DRAFT_GENERATE",
] as const;
export type AiProcessType = (typeof AI_PROCESS_TYPES)[number];

export const AI_PROCESS_STATUSES = ["PENDING", "RUNNING", "COMPLETED", "FAILED"] as const;
export type AiProcessStatus = (typeof AI_PROCESS_STATUSES)[number];

export const GUARDRAIL_RESULTS = ["PASS", "BLOCKED", "REGENERATED"] as const;
export type GuardrailResult = (typeof GUARDRAIL_RESULTS)[number];

export const EMBEDDING_SOURCE_TYPES = ["POSTING_JD", "CRITERION_TAG", "QUESTION", "APPLICATION_DOCUMENT", "INTERVIEW_ANSWER", "EVALUATION_REPORT"] as const;
export type EmbeddingSourceType = (typeof EMBEDDING_SOURCE_TYPES)[number];

export const isUserType = (value: unknown): value is UserType =>
  typeof value === "string" && USER_TYPES.includes(value as UserType);
