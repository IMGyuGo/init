import { Injectable } from '@nestjs/common';
import {
  CriterionTagRecord,
  EvaluationCriterionRecord,
  PostingRecord,
  QuestionRecord,
  QuestionSetRecord,
  TimePolicyRecord,
} from '../company-interview.types';
import {
  CompanyInterviewRepository,
  ConfirmQuestionSetInput,
  CreateCriterionTagInput,
  CreateQuestionInput,
  UpdateCriterionInput,
  UpdateQuestionInput,
  UpdateTimePolicyInput,
} from './company-interview.repository';

@Injectable()
export class InMemoryCompanyInterviewRepository
  implements CompanyInterviewRepository
{
  private readonly postings: PostingRecord[] = [
    {
      postingId: 1,
      companyId: 1,
      title: '2026 신입 백엔드 채용',
      status: 'OPEN',
      jobRole: 'Backend Developer',
      jobDescription: 'NestJS와 PostgreSQL 기반 서비스 개발',
    },
    {
      postingId: 2,
      companyId: 1,
      title: '2026 신입 프론트엔드 채용',
      status: 'OPEN',
      jobRole: 'Frontend Developer',
      jobDescription: 'Next.js 기반 서비스 개발',
    },
  ];

  private criterionTags: CriterionTagRecord[] = [
    {
      tagId: 1,
      jobRole: 'Common',
      name: '직무/기술 역량',
      description: 'JD와 연결되는 기술 지식, 구현 경험, 설계 판단을 답변 근거로 확인한다.',
      category: '서비스 기본 평가',
      isActive: true,
      sortOrder: 1,
    },
    {
      tagId: 2,
      jobRole: 'Common',
      name: '문제 해결력',
      description: '문제 원인을 나누어 확인하고 제약, 대안, 해결 과정을 설명하는지 확인한다.',
      category: '서비스 기본 평가',
      isActive: true,
      sortOrder: 2,
    },
    {
      tagId: 3,
      jobRole: 'Common',
      name: '실행력과 성과',
      description: '본인이 맡은 행동, 완성도, 결과나 개선 효과가 답변에 드러나는지 확인한다.',
      category: '서비스 기본 평가',
      isActive: true,
      sortOrder: 3,
    },
    {
      tagId: 4,
      jobRole: 'Common',
      name: '협업/커뮤니케이션',
      description: '상황, 역할, 의사소통 방식, 협업 조정 과정을 구조적으로 전달하는지 확인한다.',
      category: '서비스 기본 평가',
      isActive: true,
      sortOrder: 4,
    },
    {
      tagId: 5,
      jobRole: 'Common',
      name: '학습/성장성',
      description: '새로운 도구나 도메인을 학습하고 실제 문제에 적용한 흐름을 확인한다.',
      category: '서비스 기본 평가',
      isActive: true,
      sortOrder: 5,
    },
    {
      tagId: 6,
      jobRole: 'Common',
      name: '책임감/신뢰성',
      description: '맡은 범위를 끝까지 확인하고 재발 방지, 검증, 공유까지 수행했는지 확인한다.',
      category: '서비스 기본 평가',
      isActive: true,
      sortOrder: 6,
    },
  ];

  private evaluationCriteria: EvaluationCriterionRecord[] = [
    {
      criterionId: 1,
      postingId: 1,
      tagId: 1,
      weight: 30,
      passScore: 70,
      sortOrder: 1,
    },
    {
      criterionId: 2,
      postingId: 1,
      tagId: 2,
      weight: 20,
      passScore: 70,
      sortOrder: 2,
    },
    {
      criterionId: 3,
      postingId: 1,
      tagId: 3,
      weight: 20,
      passScore: 70,
      sortOrder: 3,
    },
    {
      criterionId: 4,
      postingId: 1,
      tagId: 4,
      weight: 15,
      passScore: 70,
      sortOrder: 4,
    },
    {
      criterionId: 5,
      postingId: 1,
      tagId: 5,
      weight: 10,
      passScore: 70,
      sortOrder: 5,
    },
    {
      criterionId: 6,
      postingId: 1,
      tagId: 6,
      weight: 5,
      passScore: 70,
      sortOrder: 6,
    },
    {
      criterionId: 7,
      postingId: 2,
      tagId: 1,
      weight: 100,
      passScore: 70,
      sortOrder: 1,
    },
  ];

  private questions: QuestionRecord[] = [
    {
      questionId: 1,
      companyId: 1,
      postingId: 1,
      criterionId: 1,
      questionType: 'TECHNICAL',
      content: 'REST API 계약을 먼저 문서화해야 하는 이유를 설명해주세요.',
      origin: 'MANUAL',
      isAiEdited: false,
      isActive: true,
    },
    {
      questionId: 2,
      companyId: 1,
      postingId: 1,
      criterionId: 2,
      questionType: 'TECHNICAL',
      content: '평가 기준과 질문 뱅크의 관계를 어떻게 모델링하시겠습니까?',
      origin: 'MANUAL',
      isAiEdited: false,
      isActive: true,
    },
    {
      questionId: 3,
      companyId: 1,
      postingId: 1,
      criterionId: 3,
      questionType: 'EXPERIENCE',
      content: '다른 담당자와 API 계약 충돌을 조정했던 경험을 말해주세요.',
      origin: 'MANUAL',
      isAiEdited: false,
      isActive: true,
    },
    {
      questionId: 4,
      companyId: 1,
      postingId: 2,
      criterionId: 7,
      questionType: 'TECHNICAL',
      content: 'Next.js App Router의 서버/클라이언트 컴포넌트 경계를 설명해주세요.',
      origin: 'MANUAL',
      isAiEdited: false,
      isActive: true,
    },
  ];

  private timePolicies: TimePolicyRecord[] = [
    {
      postingId: 1,
      preparationTimeSec: 0,
      answerTimeSec: 90,
      retryAllowed: false,
    },
  ];

  private nextCriterionId = 8;
  private nextTagId = 7;
  private nextQuestionId = 5;
  private nextQuestionSetId = 1;
  private nextQuestionSetItemId = 1;
  private questionSets: QuestionSetRecord[] = [];

  async findPosting(postingId: number): Promise<PostingRecord | undefined> {
    return this.postings.find((posting) => posting.postingId === postingId);
  }

  async findDefaultPosting(companyId: number): Promise<PostingRecord | undefined> {
    return this.postings.find((posting) => posting.companyId === companyId);
  }

  async listCriteria(postingId: number): Promise<EvaluationCriterionRecord[]> {
    return this.evaluationCriteria
      .filter((criterion) => criterion.postingId === postingId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async findCriterion(
    criterionId: number,
  ): Promise<EvaluationCriterionRecord | undefined> {
    return this.evaluationCriteria.find(
      (criterion) => criterion.criterionId === criterionId,
    );
  }

  async listQuestions(postingId: number): Promise<QuestionRecord[]> {
    return this.questions
      .filter((question) => question.postingId === postingId && question.isActive && question.questionType !== 'FOLLOW_UP')
      .sort((a, b) => a.questionId - b.questionId);
  }

  async findQuestion(questionId: number): Promise<QuestionRecord | undefined> {
    return this.questions.find((question) => question.questionId === questionId);
  }

  async findDuplicateQuestion(
    postingId: number,
    content: string,
  ): Promise<QuestionRecord | undefined> {
    const normalized = content.trim().replace(/\s+/g, ' ').toLowerCase();
    return this.questions.find(
      (question) =>
        question.postingId === postingId &&
        question.isActive &&
        question.content.trim().replace(/\s+/g, ' ').toLowerCase() ===
          normalized,
    );
  }

  async listTags(): Promise<CriterionTagRecord[]> {
    return this.criterionTags
      .filter((tag) => tag.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.tagId - b.tagId);
  }

  async findTag(tagId: number): Promise<CriterionTagRecord | undefined> {
    return this.criterionTags.find(
      (tag) => tag.tagId === tagId && tag.isActive,
    );
  }

  async createTag(input: CreateCriterionTagInput): Promise<CriterionTagRecord> {
    const tag: CriterionTagRecord = {
      tagId: this.nextTagId++,
      jobRole: input.jobRole,
      name: input.name.trim(),
      description: input.description,
      category: input.category.trim(),
      isActive: true,
      sortOrder: Math.max(0, ...this.criterionTags.map((item) => item.sortOrder)) + 1,
    };

    this.criterionTags = [...this.criterionTags, tag];
    return tag;
  }

  async getTimePolicy(postingId: number): Promise<TimePolicyRecord> {
    return (
      this.timePolicies.find((policy) => policy.postingId === postingId) ?? {
        postingId,
        preparationTimeSec: 0,
        answerTimeSec: 90,
        retryAllowed: false,
      }
    );
  }

  async replaceCriteria(
    postingId: number,
    criteria: UpdateCriterionInput[],
  ): Promise<EvaluationCriterionRecord[]> {
    const nextCriterionIds = new Set(
      criteria
        .map((criterion) => criterion.criterionId)
        .filter((criterionId): criterionId is number => criterionId !== undefined),
    );
    const removedCriterionIds = this.evaluationCriteria
      .filter(
        (criterion) =>
          criterion.postingId === postingId &&
          !nextCriterionIds.has(criterion.criterionId),
      )
      .map((criterion) => criterion.criterionId);

    const nextCriteria = criteria.map((criterion) => ({
      criterionId: criterion.criterionId ?? this.nextCriterionId++,
      postingId,
      tagId: criterion.tagId,
      weight: criterion.weight,
      passScore: criterion.passScore ?? null,
      sortOrder: criterion.sortOrder,
    }));

    this.evaluationCriteria = [
      ...this.evaluationCriteria.filter(
        (criterion) => criterion.postingId !== postingId,
      ),
      ...nextCriteria,
    ];

    this.questions = this.questions.map((question) =>
      question.postingId === postingId &&
      question.criterionId !== null &&
      removedCriterionIds.includes(question.criterionId)
        ? { ...question, criterionId: null, isActive: false }
        : question,
    );

    return this.listCriteria(postingId);
  }

  async createQuestion(input: CreateQuestionInput): Promise<QuestionRecord> {
    const question: QuestionRecord = {
      questionId: this.nextQuestionId++,
      companyId: input.companyId,
      postingId: input.postingId,
      criterionId: input.criterionId,
      questionType: input.questionType,
      content: input.content.trim(),
      origin: input.origin,
      isAiEdited: false,
      isActive: true,
    };

    this.questions = [...this.questions, question];
    return question;
  }

  async updateQuestion(
    questionId: number,
    input: UpdateQuestionInput,
  ): Promise<QuestionRecord> {
    const question = this.questions.find((item) => item.questionId === questionId);
    if (!question) {
      throw new Error('Question not found');
    }

    const updated: QuestionRecord = {
      ...question,
      criterionId: input.criterionId,
      questionType: input.questionType,
      content: input.content.trim(),
      isAiEdited: input.isAiEdited,
    };
    this.questions = this.questions.map((item) =>
      item.questionId === questionId ? updated : item,
    );
    return updated;
  }

  async deactivateQuestion(questionId: number): Promise<QuestionRecord> {
    const question = this.questions.find((item) => item.questionId === questionId);
    if (!question) {
      throw new Error('Question not found');
    }

    const updated = { ...question, isActive: false };
    this.questions = this.questions.map((item) =>
      item.questionId === questionId ? updated : item,
    );
    return updated;
  }

  async updateTimePolicy(
    postingId: number,
    input: UpdateTimePolicyInput,
  ): Promise<TimePolicyRecord> {
    const timePolicy: TimePolicyRecord = {
      postingId,
      preparationTimeSec: input.preparationTimeSec,
      answerTimeSec: input.answerTimeSec,
      retryAllowed: input.retryAllowed,
    };

    this.timePolicies = [
      ...this.timePolicies.filter((policy) => policy.postingId !== postingId),
      timePolicy,
    ];

    return timePolicy;
  }

  async confirmQuestionSet(input: ConfirmQuestionSetInput): Promise<QuestionSetRecord> {
    this.questionSets = this.questionSets.map((questionSet) =>
      questionSet.postingId === input.postingId && questionSet.status === 'ACTIVE'
        ? { ...questionSet, status: 'DRAFT' }
        : questionSet,
    );

    const questionSet: QuestionSetRecord = {
      questionSetId: this.nextQuestionSetId++,
      postingId: input.postingId,
      title: input.title.trim(),
      status: 'ACTIVE',
      createdByProcessLogId: input.sourceProcessLogId ?? null,
      items: input.items
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => ({
          questionSetItemId: this.nextQuestionSetItemId++,
          questionId: item.questionId,
          criterionId: item.criterionId ?? null,
          sortOrder: item.sortOrder,
        })),
    };

    this.questionSets = [...this.questionSets, questionSet];
    return questionSet;
  }

  async findActiveQuestionSet(
    postingId: number,
  ): Promise<QuestionSetRecord | undefined> {
    const questionSet = [...this.questionSets]
      .reverse()
      .find(
        (candidate) =>
          candidate.postingId === postingId && candidate.status === 'ACTIVE',
      );

    return questionSet
      ? {
          ...questionSet,
          items: [...questionSet.items]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((item) => ({
              ...item,
              question: this.questions.find((question) => question.questionId === item.questionId),
            })),
        }
      : undefined;
  }
}
