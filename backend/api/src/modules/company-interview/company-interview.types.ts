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

export type NcsProfileId =
  | 'JOB_TECHNICAL'
  | 'COLLABORATION_COMMUNICATION'
  | 'PROBLEM_SOLVING';
export type NcsQuestionMode =
  | 'EXPERIENCE_BEHAVIOR'
  | 'TECHNICAL_KNOWLEDGE'
  | 'SITUATIONAL_DESIGN';
export type QuestionGenerationSource = 'JD_CRITERIA' | 'RESUME_PERSONALIZED';
export type QuestionAlignmentStatus =
  | 'NOT_EVALUATED'
  | 'ALIGNED'
  | 'LOW_ALIGNMENT'
  | 'REVIEW_REQUIRED';
export type ResumeQuestionGenerationStatus =
  | 'DISABLED'
  | 'WAITING_APPLICATION'
  | 'WAITING_DOCUMENT'
  | 'GENERATING'
  | 'READY'
  | 'REVIEW_REQUIRED'
  | 'FAILED'
  | 'STALE';

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
  generationSource: QuestionGenerationSource | null;
  ncsProfileId: NcsProfileId | null;
  ncsQuestionMode: NcsQuestionMode | null;
  ncsProfileVersion: string | null;
  alignmentStatus: QuestionAlignmentStatus | null;
  alignmentScore: number | null;
  alignmentReason: string | null;
  evaluatorVersion: string | null;
  sourceProcessLogId: number | null;
  ncsBindings: QuestionNcsBindingRecord[];
};

export type QuestionNcsBindingRecord = {
  criterionId: number;
  ncsProfileId: NcsProfileId;
  ncsProfileVersion: string;
  alignmentStatus: QuestionAlignmentStatus;
  alignmentScore: number | null;
  alignmentReason: string | null;
  evaluatorVersion: string | null;
  bindingOrder: number;
};

export type AiQuestionGenerationProcessRecord = {
  processLogId: number;
  processType: string;
  status: AiProcessStatus;
  inputRef: string | null;
  outputRef: string | null;
};

export type PersonalizedQuestionRecord = {
  personalizedQuestionId: number;
  criterionId: number | null;
  source: 'RESUME_PERSONALIZED';
  questionType: QuestionType;
  content: string;
  ncsProfileId: NcsProfileId;
  ncsQuestionMode: NcsQuestionMode;
  ncsProfileVersion: string;
  alignmentStatus: 'ALIGNED' | 'REVIEW_REQUIRED';
  alignmentScore: number | null;
  alignmentReason: string | null;
  evaluatorVersion: string | null;
  sortOrder: number;
};

export type ResumeQuestionBatchRecord = {
  batchId: number;
  latestProcessLogId: number;
  processStatus: AiProcessStatus;
  status: 'GENERATING' | 'READY' | 'REVIEW_REQUIRED' | 'FAILED' | 'STALE';
  policyVersion: number;
  criteriaVersion: number;
  inputVersion: string;
  resumeDocumentHash: string;
  jdSnapshotHash: string;
  attemptCount: number;
  questions: PersonalizedQuestionRecord[];
};

export type ResumeQuestionApplicationRecord = {
  applicationId: number;
  postingId: number;
  companyId: number;
  applicationStatus: string;
  documentStatus: string | null;
  documentId: number | null;
  policy: QuestionGenerationPolicyRecord;
  currentInputVersion: string | null;
  currentResumeDocumentHash: string | null;
  currentJdSnapshotHash: string | null;
  currentBatch: ResumeQuestionBatchRecord | null;
  hasStaleBatch: boolean;
};

export type ResumeQuestionRetryJobRecord = {
  processLogId: number;
  applicationId: number;
  postingId: number;
  documentId: number;
  policyVersion: number;
  criteriaVersion: number;
  inputVersion: string;
  resumeDocumentHash: string;
  jdSnapshotHash: string;
  attempt: number;
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
