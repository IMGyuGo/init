import {
  AiQuestionGenerationProcessRecord,
  CriterionTagRecord,
  EvaluationCriterionRecord,
  EvaluationFramework,
  PostingStatus,
  PostingRecord,
  QuestionRecord,
  QuestionOrigin,
  QuestionGenerationPolicyRecord,
  QuestionSetRecord,
  ResumeQuestionApplicationRecord,
  ResumeQuestionRetryJobRecord,
  QuestionType,
  TimePolicyRecord,
  NcsProfileId,
} from '../company-interview.types';

export const COMPANY_INTERVIEW_REPOSITORY = Symbol(
  'COMPANY_INTERVIEW_REPOSITORY',
);

export type UpdateCriterionInput = {
  criterionId?: number;
  tagId: number;
  description: string | null;
  weight: number;
  passScore?: number | null;
  sortOrder: number;
  ncsProfileId: EvaluationCriterionRecord['ncsProfileId'];
  ncsQuestionMode: EvaluationCriterionRecord['ncsQuestionMode'];
  ncsProfileVersion: string | null;
};

export type CreateCriterionTagInput = {
  jobRole: string;
  name: string;
  description: string | null;
  category: string;
};

export type CreateQuestionInput = {
  companyId: number;
  postingId: number;
  criterionId: number;
  questionType: QuestionType;
  content: string;
  origin: QuestionOrigin;
  generationSource: QuestionRecord['generationSource'];
  ncsProfileId: QuestionRecord['ncsProfileId'];
  ncsQuestionMode: QuestionRecord['ncsQuestionMode'];
  ncsProfileVersion: string | null;
  alignmentStatus: QuestionRecord['alignmentStatus'];
  alignmentScore: number | null;
  alignmentReason: string | null;
  evaluatorVersion: string | null;
  sourceProcessLogId: number | null;
  ncsBindings: QuestionRecord['ncsBindings'];
};

export type UpdateQuestionInput = {
  criterionId: number;
  questionType: QuestionType;
  content: string;
  isAiEdited: boolean;
  generationSource: QuestionRecord['generationSource'];
  ncsProfileId: QuestionRecord['ncsProfileId'];
  ncsQuestionMode: QuestionRecord['ncsQuestionMode'];
  ncsProfileVersion: string | null;
  alignmentStatus: QuestionRecord['alignmentStatus'];
  alignmentScore: number | null;
  alignmentReason: string | null;
  evaluatorVersion: string | null;
  ncsBindings: QuestionRecord['ncsBindings'];
};

export type UpdateTimePolicyInput = {
  preparationTimeSec: number;
  answerTimeSec: number;
  retryAllowed: boolean;
};

export type UpdateQuestionGenerationPolicyInput = {
  evaluationFramework: EvaluationFramework;
  jdCriteriaQuestionCount: number;
  resumeQuestionCount: number;
  expectedPolicyVersion?: number;
};

export type ReplaceCriteriaResult = {
  criteria: EvaluationCriterionRecord[];
  policy: QuestionGenerationPolicyRecord;
};

export type ReplaceCriteriaOptions = {
  deactivatedProfileIds: NcsProfileId[];
};

export type ConfirmQuestionSetInput = {
  postingId: number;
  title: string;
  sourceProcessLogId?: number;
  items: Array<{
    questionId: number;
    criterionId?: number | null;
    sortOrder: number;
  }>;
};

export interface CompanyInterviewRepository {
  findPosting(postingId: number): Promise<PostingRecord | undefined>;
  findDefaultPosting(companyId: number): Promise<PostingRecord | undefined>;
  updatePostingStatus(postingId: number, status: PostingStatus): Promise<void>;
  listCriteria(postingId: number): Promise<EvaluationCriterionRecord[]>;
  findCriterion(criterionId: number): Promise<EvaluationCriterionRecord | undefined>;
  listQuestions(postingId: number): Promise<QuestionRecord[]>;
  findQuestion(questionId: number): Promise<QuestionRecord | undefined>;
  findDuplicateQuestion(
    postingId: number,
    content: string,
  ): Promise<QuestionRecord | undefined>;
  findQuestionGenerationProcess(
    processLogId: number,
  ): Promise<AiQuestionGenerationProcessRecord | undefined>;
  listTags(): Promise<CriterionTagRecord[]>;
  findTag(tagId: number): Promise<CriterionTagRecord | undefined>;
  createTag(input: CreateCriterionTagInput): Promise<CriterionTagRecord>;
  getTimePolicy(postingId: number): Promise<TimePolicyRecord>;
  hasTimePolicy(postingId: number): Promise<boolean>;
  getQuestionGenerationPolicy(
    postingId: number,
  ): Promise<QuestionGenerationPolicyRecord | undefined>;
  isConfigurationLocked(postingId: number): Promise<boolean>;
  replaceCriteria(
    postingId: number,
    evaluationFramework: EvaluationFramework,
    criteria: UpdateCriterionInput[],
    options?: ReplaceCriteriaOptions,
  ): Promise<ReplaceCriteriaResult>;
  updateQuestionGenerationPolicy(
    postingId: number,
    input: UpdateQuestionGenerationPolicyInput,
  ): Promise<QuestionGenerationPolicyRecord | undefined>;
  createQuestion(input: CreateQuestionInput): Promise<QuestionRecord>;
  updateQuestion(questionId: number, input: UpdateQuestionInput): Promise<QuestionRecord>;
  deactivateQuestion(questionId: number): Promise<QuestionRecord>;
  updateTimePolicy(
    postingId: number,
    input: UpdateTimePolicyInput,
  ): Promise<TimePolicyRecord>;
  confirmQuestionSet(input: ConfirmQuestionSetInput): Promise<QuestionSetRecord>;
  findActiveQuestionSet(postingId: number): Promise<QuestionSetRecord | undefined>;
  findResumeQuestionGeneration(applicationId: number, usageScope?: 'STANDARD' | 'DEMO_PRESET'): Promise<ResumeQuestionApplicationRecord | undefined>;
  listResumeQuestionGenerations(postingId: number): Promise<ResumeQuestionApplicationRecord[]>;
  createResumeQuestionRetry(input: {
    state: ResumeQuestionApplicationRecord;
    reason: string | null;
  }): Promise<ResumeQuestionRetryJobRecord>;
  markResumeQuestionRetryQueueFailed(processLogId: number, reason: string): Promise<void>;
}
