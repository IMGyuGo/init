import {
  CriterionTagRecord,
  EvaluationCriterionRecord,
  PostingRecord,
  QuestionRecord,
  QuestionOrigin,
  QuestionSetRecord,
  QuestionType,
  TimePolicyRecord,
} from '../company-interview.types';

export const COMPANY_INTERVIEW_REPOSITORY = Symbol(
  'COMPANY_INTERVIEW_REPOSITORY',
);

export type UpdateCriterionInput = {
  criterionId?: number;
  tagId: number;
  weight: number;
  passScore?: number | null;
  sortOrder: number;
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
};

export type UpdateQuestionInput = {
  criterionId: number;
  questionType: QuestionType;
  content: string;
  isAiEdited: boolean;
};

export type UpdateTimePolicyInput = {
  preparationTimeSec: number;
  answerTimeSec: number;
  retryAllowed: boolean;
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
  listCriteria(postingId: number): Promise<EvaluationCriterionRecord[]>;
  findCriterion(criterionId: number): Promise<EvaluationCriterionRecord | undefined>;
  listQuestions(postingId: number): Promise<QuestionRecord[]>;
  findQuestion(questionId: number): Promise<QuestionRecord | undefined>;
  findDuplicateQuestion(
    postingId: number,
    content: string,
  ): Promise<QuestionRecord | undefined>;
  listTags(): Promise<CriterionTagRecord[]>;
  findTag(tagId: number): Promise<CriterionTagRecord | undefined>;
  createTag(input: CreateCriterionTagInput): Promise<CriterionTagRecord>;
  getTimePolicy(postingId: number): Promise<TimePolicyRecord>;
  replaceCriteria(
    postingId: number,
    criteria: UpdateCriterionInput[],
  ): Promise<EvaluationCriterionRecord[]>;
  createQuestion(input: CreateQuestionInput): Promise<QuestionRecord>;
  updateQuestion(questionId: number, input: UpdateQuestionInput): Promise<QuestionRecord>;
  deactivateQuestion(questionId: number): Promise<QuestionRecord>;
  updateTimePolicy(
    postingId: number,
    input: UpdateTimePolicyInput,
  ): Promise<TimePolicyRecord>;
  confirmQuestionSet(input: ConfirmQuestionSetInput): Promise<QuestionSetRecord>;
  findActiveQuestionSet(postingId: number): Promise<QuestionSetRecord | undefined>;
}
