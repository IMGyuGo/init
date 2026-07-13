export type PostingStatus =
  | 'DRAFT'
  | 'OPEN'
  | 'CLOSING_SOON'
  | 'CLOSED'
  | 'ARCHIVED';

export type QuestionType =
  | 'INTRO'
  | 'TECHNICAL'
  | 'EXPERIENCE'
  | 'SITUATION'
  | 'FOLLOW_UP'
  | 'CLOSING';

export const QUESTION_TYPES: QuestionType[] = [
  'INTRO',
  'TECHNICAL',
  'EXPERIENCE',
  'SITUATION',
  'FOLLOW_UP',
  'CLOSING',
];

export type QuestionOrigin = 'MANUAL' | 'AI_GENERATED';

export const QUESTION_ORIGINS: QuestionOrigin[] = [
  'MANUAL',
  'AI_GENERATED',
];

export type AiProcessStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export type EvaluationFramework = 'LEGACY' | 'NCS_3_PROFILE_V1';
export const EVALUATION_FRAMEWORKS: EvaluationFramework[] = [
  'LEGACY',
  'NCS_3_PROFILE_V1',
];

export type NcsProfileId = 'PROBLEM_SOLVING' | 'COMMUNICATION' | 'DIGITAL';
export type NcsQuestionMode =
  | 'EXPERIENCE_BEHAVIOR'
  | 'TECHNICAL_KNOWLEDGE'
  | 'SITUATIONAL_DESIGN';
export type QuestionGenerationSource = 'JD_CRITERIA' | 'RESUME_PERSONALIZED';
export type ResumeQuestionGenerationStatus = 'DISABLED' | 'WAITING_APPLICATION';

export type PostingRecord = {
  postingId: number;
  companyId: number;
  title: string;
  status: PostingStatus;
  jobRole: string;
  jobDescription: string | null;
};

export type CriterionTagRecord = {
  tagId: number;
  jobRole: string;
  name: string;
  description: string | null;
  category: string;
  isActive: boolean;
  sortOrder: number;
  ncsProfileId: NcsProfileId | null;
  defaultNcsQuestionMode: NcsQuestionMode | null;
  ncsProfileVersion: string | null;
};

export type EvaluationCriterionRecord = {
  criterionId: number;
  postingId: number;
  tagId: number;
  description: string | null;
  weight: number;
  passScore: number | null;
  sortOrder: number;
  ncsProfileId: NcsProfileId | null;
  ncsQuestionMode: NcsQuestionMode | null;
  ncsProfileVersion: string | null;
};

export type QuestionGenerationPolicyRecord = {
  postingId: number;
  evaluationFramework: EvaluationFramework;
  jdCriteriaQuestionCount: number;
  resumeQuestionCount: number;
  policyVersion: number;
  criteriaVersion: number;
};

export type QuestionRecord = {
  questionId: number;
  companyId: number;
  postingId: number | null;
  criterionId: number | null;
  questionType: QuestionType;
  content: string;
  origin: QuestionOrigin;
  isAiEdited: boolean;
  isActive: boolean;
};

export type TimePolicyRecord = {
  postingId: number;
  preparationTimeSec: number;
  answerTimeSec: number;
  retryAllowed: boolean;
};

export type QuestionSetItemRecord = {
  questionSetItemId: number;
  questionId: number;
  criterionId: number | null;
  sortOrder: number;
  question?: QuestionRecord;
};

export type QuestionSetRecord = {
  questionSetId: number;
  postingId: number;
  title: string;
  status: string;
  createdByProcessLogId: number | null;
  items: QuestionSetItemRecord[];
};
