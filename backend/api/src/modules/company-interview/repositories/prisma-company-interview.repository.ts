import { Injectable } from '@nestjs/common';
import type { QuestionType } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma.service';
import {
  CriterionTagRecord,
  EvaluationCriterionRecord,
  EvaluationFramework,
  PostingRecord,
  QuestionOrigin,
  QuestionRecord,
  QuestionGenerationPolicyRecord,
  QuestionSetRecord,
  TimePolicyRecord,
} from '../company-interview.types';
import {
  CompanyInterviewRepository,
  ConfirmQuestionSetInput,
  CreateCriterionTagInput,
  UpdateTimePolicyInput,
  UpdateCriterionInput,
  UpdateQuestionInput,
  UpdateQuestionGenerationPolicyInput,
} from './company-interview.repository';

@Injectable()
export class PrismaCompanyInterviewRepository
  implements CompanyInterviewRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async findPosting(postingId: number): Promise<PostingRecord | undefined> {
    const posting = await this.prisma.posting.findUnique({
      where: { postingId: BigInt(postingId) },
    });
    return posting ? mapPosting(posting) : undefined;
  }

  async findDefaultPosting(companyId: number): Promise<PostingRecord | undefined> {
    const posting = await this.prisma.posting.findFirst({
      where: { companyId: BigInt(companyId) },
      orderBy: { postingId: 'desc' },
    });
    return posting ? mapPosting(posting) : undefined;
  }

  async listCriteria(postingId: number): Promise<EvaluationCriterionRecord[]> {
    const criteria = await this.prisma.evaluationCriterion.findMany({
      where: { postingId: BigInt(postingId) },
      orderBy: { sortOrder: 'asc' },
    });
    return criteria.map(mapCriterion);
  }

  async findCriterion(
    criterionId: number,
  ): Promise<EvaluationCriterionRecord | undefined> {
    const criterion = await this.prisma.evaluationCriterion.findUnique({
      where: { criterionId: BigInt(criterionId) },
    });
    return criterion ? mapCriterion(criterion) : undefined;
  }

  async listQuestions(postingId: number): Promise<QuestionRecord[]> {
    const questions = await this.prisma.question.findMany({
      where: {
        postingId: BigInt(postingId),
        isActive: true,
        questionType: { not: 'FOLLOW_UP' },
      },
      orderBy: { questionId: 'asc' },
    });
    return questions.map(mapQuestion);
  }

  async findQuestion(questionId: number): Promise<QuestionRecord | undefined> {
    const question = await this.prisma.question.findUnique({
      where: { questionId: BigInt(questionId) },
    });
    return question ? mapQuestion(question) : undefined;
  }

  async findDuplicateQuestion(
    postingId: number,
    content: string,
  ): Promise<QuestionRecord | undefined> {
    const normalized = normalizeQuestionContent(content);
    const questions = await this.prisma.question.findMany({
      where: { postingId: BigInt(postingId), isActive: true },
    });
    const duplicate = questions.find(
      (question) => normalizeQuestionContent(question.content) === normalized,
    );
    return duplicate ? mapQuestion(duplicate) : undefined;
  }

  async listTags(): Promise<CriterionTagRecord[]> {
    const tags = await this.prisma.criterionTag.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { tagId: 'asc' }],
    });
    return tags.map(mapTag);
  }

  async findTag(tagId: number): Promise<CriterionTagRecord | undefined> {
    const tag = await this.prisma.criterionTag.findFirst({
      where: { tagId: BigInt(tagId), isActive: true },
    });
    return tag ? mapTag(tag) : undefined;
  }

  async createTag(input: CreateCriterionTagInput): Promise<CriterionTagRecord> {
    const lastTag = await this.prisma.criterionTag.findFirst({
      orderBy: [{ sortOrder: 'desc' }, { tagId: 'desc' }],
      select: { sortOrder: true },
    });
    const tag = await this.prisma.criterionTag.create({
      data: {
        jobRole: input.jobRole,
        name: input.name.trim(),
        description: input.description,
        category: input.category.trim(),
        isActive: true,
        sortOrder: (lastTag?.sortOrder ?? 0) + 1,
      },
    });
    return mapTag(tag);
  }

  async getTimePolicy(postingId: number): Promise<TimePolicyRecord> {
    const timePolicy = await this.prisma.interviewTimePolicy.findUnique({
      where: { postingId: BigInt(postingId) },
    });
    if (timePolicy) {
      return mapTimePolicy(timePolicy);
    }

    return {
      postingId,
      preparationTimeSec: 0,
      answerTimeSec: 90,
      retryAllowed: false,
    };
  }

  async getQuestionGenerationPolicy(
    postingId: number,
  ): Promise<QuestionGenerationPolicyRecord | undefined> {
    const policy = await this.prisma.interviewQuestionGenerationPolicy.findUnique({
      where: { postingId: BigInt(postingId) },
    });
    return policy ? mapQuestionGenerationPolicy(policy) : undefined;
  }

  async replaceCriteria(
    postingId: number,
    evaluationFramework: EvaluationFramework,
    criteria: UpdateCriterionInput[],
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const nextIds: bigint[] = [];

      for (const criterion of criteria) {
        if (criterion.criterionId !== undefined) {
          const updated = await tx.evaluationCriterion.update({
            where: { criterionId: BigInt(criterion.criterionId) },
            data: {
              tagId: BigInt(criterion.tagId),
              description: criterion.description,
              weight: criterion.weight,
              passScore: criterion.passScore ?? null,
              sortOrder: criterion.sortOrder,
              ncsProfileId: criterion.ncsProfileId,
              ncsQuestionMode: criterion.ncsQuestionMode,
              ncsProfileVersion: criterion.ncsProfileVersion,
            },
          });
          nextIds.push(updated.criterionId);
          continue;
        }

        const created = await tx.evaluationCriterion.create({
          data: {
            postingId: BigInt(postingId),
            tagId: BigInt(criterion.tagId),
            description: criterion.description,
            weight: criterion.weight,
            passScore: criterion.passScore ?? null,
            sortOrder: criterion.sortOrder,
            ncsProfileId: criterion.ncsProfileId,
            ncsQuestionMode: criterion.ncsQuestionMode,
            ncsProfileVersion: criterion.ncsProfileVersion,
          },
        });
        nextIds.push(created.criterionId);
      }

      const removed = await tx.evaluationCriterion.findMany({
        where: {
          postingId: BigInt(postingId),
          criterionId: { notIn: nextIds },
        },
        select: { criterionId: true },
      });
      const removedIds = removed.map((criterion) => criterion.criterionId);
      if (removedIds.length > 0) {
        await tx.question.updateMany({
          where: {
            postingId: BigInt(postingId),
            criterionId: { in: removedIds },
          },
          data: {
            isActive: false,
            criterionId: null,
          },
        });
      }

      await tx.evaluationCriterion.deleteMany({
        where: {
          postingId: BigInt(postingId),
          criterionId: { notIn: nextIds },
        },
      });

      const policy = await tx.interviewQuestionGenerationPolicy.upsert({
        where: { postingId: BigInt(postingId) },
        create: {
          postingId: BigInt(postingId),
          evaluationFramework,
          criteriaVersion: 1,
        },
        update: {
          evaluationFramework,
          criteriaVersion: { increment: 1 },
        },
      });

      return { nextIds, policy };
    });

    const saved = await this.prisma.evaluationCriterion.findMany({
      where: { criterionId: { in: result.nextIds } },
      orderBy: { sortOrder: 'asc' },
    });
    return {
      criteria: saved.map(mapCriterion),
      policy: mapQuestionGenerationPolicy(result.policy),
    };
  }

  async updateQuestionGenerationPolicy(
    postingId: number,
    input: UpdateQuestionGenerationPolicyInput,
  ): Promise<QuestionGenerationPolicyRecord | undefined> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.interviewQuestionGenerationPolicy.findUnique({
        where: { postingId: BigInt(postingId) },
      });
      const currentVersion = current?.policyVersion ?? 0;
      if (
        input.expectedPolicyVersion !== undefined &&
        input.expectedPolicyVersion !== currentVersion
      ) {
        return undefined;
      }

      const saved = await tx.interviewQuestionGenerationPolicy.upsert({
        where: { postingId: BigInt(postingId) },
        create: {
          postingId: BigInt(postingId),
          evaluationFramework: input.evaluationFramework,
          jdCriteriaQuestionCount: input.jdCriteriaQuestionCount,
          resumeQuestionCount: input.resumeQuestionCount,
          policyVersion: 1,
        },
        update: {
          evaluationFramework: input.evaluationFramework,
          jdCriteriaQuestionCount: input.jdCriteriaQuestionCount,
          resumeQuestionCount: input.resumeQuestionCount,
          policyVersion: { increment: 1 },
        },
      });
      return mapQuestionGenerationPolicy(saved);
    });
  }

  async createQuestion(input: {
    companyId: number;
    postingId: number;
    criterionId: number;
    questionType: QuestionType;
    content: string;
    origin: QuestionOrigin;
  }): Promise<QuestionRecord> {
    const question = await this.prisma.question.create({
      data: {
        companyId: BigInt(input.companyId),
        postingId: BigInt(input.postingId),
        criterionId: BigInt(input.criterionId),
        questionType: input.questionType,
        content: input.content.trim(),
        origin: input.origin,
        isAiEdited: false,
        isActive: true,
      },
    });
    return mapQuestion(question);
  }

  async updateQuestion(
    questionId: number,
    input: UpdateQuestionInput,
  ): Promise<QuestionRecord> {
    const question = await this.prisma.question.update({
      where: { questionId: BigInt(questionId) },
      data: {
        criterionId: BigInt(input.criterionId),
        questionType: input.questionType,
        content: input.content.trim(),
        isAiEdited: input.isAiEdited,
      },
    });
    return mapQuestion(question);
  }

  async deactivateQuestion(questionId: number): Promise<QuestionRecord> {
    const question = await this.prisma.question.update({
      where: { questionId: BigInt(questionId) },
      data: { isActive: false },
    });
    return mapQuestion(question);
  }

  async updateTimePolicy(
    postingId: number,
    input: UpdateTimePolicyInput,
  ): Promise<TimePolicyRecord> {
    const timePolicy = await this.prisma.interviewTimePolicy.upsert({
      where: { postingId: BigInt(postingId) },
      create: {
        postingId: BigInt(postingId),
        preparationTimeSec: input.preparationTimeSec,
        answerTimeSec: input.answerTimeSec,
        retryAllowed: input.retryAllowed,
      },
      update: {
        preparationTimeSec: input.preparationTimeSec,
        answerTimeSec: input.answerTimeSec,
        retryAllowed: input.retryAllowed,
      },
    });
    return mapTimePolicy(timePolicy);
  }

  async confirmQuestionSet(input: ConfirmQuestionSetInput): Promise<QuestionSetRecord> {
    const questionSet = await this.prisma.$transaction(async (tx) => {
      await (tx as any).interviewQuestionSet.updateMany({
        where: { postingId: BigInt(input.postingId), status: 'ACTIVE' },
        data: { status: 'DRAFT' },
      });

      return (tx as any).interviewQuestionSet.create({
        data: {
          postingId: BigInt(input.postingId),
          title: input.title.trim(),
          status: 'ACTIVE',
          createdByProcessLogId:
            input.sourceProcessLogId === undefined
              ? undefined
              : BigInt(input.sourceProcessLogId),
          items: {
            create: input.items
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((item) => ({
                questionId: BigInt(item.questionId),
                criterionId:
                  item.criterionId === undefined || item.criterionId === null
                    ? null
                    : BigInt(item.criterionId),
                sortOrder: item.sortOrder,
              })),
          },
        },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });
    });

    return mapQuestionSet(questionSet);
  }

  async findActiveQuestionSet(
    postingId: number,
  ): Promise<QuestionSetRecord | undefined> {
    const questionSet = await (this.prisma as any).interviewQuestionSet.findFirst({
      where: { postingId: BigInt(postingId), status: 'ACTIVE' },
      orderBy: { questionSetId: 'desc' },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: { question: true },
        },
      },
    });

    return questionSet ? mapQuestionSet(questionSet) : undefined;
  }
}

function normalizeQuestionContent(content: string): string {
  return content.trim().replace(/\s+/g, ' ').toLowerCase();
}

function mapPosting(posting: {
  postingId: bigint;
  companyId: bigint;
  title: string;
  status: string;
  jobRole: string;
  jobDescription: string | null;
}): PostingRecord {
  return {
    postingId: Number(posting.postingId),
    companyId: Number(posting.companyId),
    title: posting.title,
    status: posting.status as PostingRecord['status'],
    jobRole: posting.jobRole,
    jobDescription: posting.jobDescription,
  };
}

function mapTag(tag: {
  tagId: bigint;
  jobRole: string;
  name: string;
  description: string | null;
  category: string;
  isActive: boolean;
  sortOrder: number;
  ncsProfileId: string | null;
  defaultNcsQuestionMode: string | null;
  ncsProfileVersion: string | null;
}): CriterionTagRecord {
  return {
    tagId: Number(tag.tagId),
    jobRole: tag.jobRole,
    name: tag.name,
    description: tag.description,
    category: tag.category,
    isActive: tag.isActive,
    sortOrder: tag.sortOrder,
    ncsProfileId: tag.ncsProfileId as CriterionTagRecord['ncsProfileId'],
    defaultNcsQuestionMode:
      tag.defaultNcsQuestionMode as CriterionTagRecord['defaultNcsQuestionMode'],
    ncsProfileVersion: tag.ncsProfileVersion,
  };
}

function mapCriterion(criterion: {
  criterionId: bigint;
  postingId: bigint;
  tagId: bigint;
  description: string | null;
  weight: number;
  passScore: number | null;
  sortOrder: number;
  ncsProfileId: string | null;
  ncsQuestionMode: string | null;
  ncsProfileVersion: string | null;
}): EvaluationCriterionRecord {
  return {
    criterionId: Number(criterion.criterionId),
    postingId: Number(criterion.postingId),
    tagId: Number(criterion.tagId),
    description: criterion.description,
    weight: criterion.weight,
    passScore: criterion.passScore,
    sortOrder: criterion.sortOrder,
    ncsProfileId:
      criterion.ncsProfileId as EvaluationCriterionRecord['ncsProfileId'],
    ncsQuestionMode:
      criterion.ncsQuestionMode as EvaluationCriterionRecord['ncsQuestionMode'],
    ncsProfileVersion: criterion.ncsProfileVersion,
  };
}

function mapQuestionGenerationPolicy(policy: {
  postingId: bigint;
  evaluationFramework: string;
  jdCriteriaQuestionCount: number;
  resumeQuestionCount: number;
  policyVersion: number;
  criteriaVersion: number;
}): QuestionGenerationPolicyRecord {
  return {
    postingId: Number(policy.postingId),
    evaluationFramework:
      policy.evaluationFramework as QuestionGenerationPolicyRecord['evaluationFramework'],
    jdCriteriaQuestionCount: policy.jdCriteriaQuestionCount,
    resumeQuestionCount: policy.resumeQuestionCount,
    policyVersion: policy.policyVersion,
    criteriaVersion: policy.criteriaVersion,
  };
}

function mapQuestion(question: {
  questionId: bigint;
  companyId: bigint;
  postingId: bigint | null;
  criterionId: bigint | null;
  questionType: QuestionType;
  content: string;
  origin: QuestionOrigin;
  isAiEdited: boolean;
  isActive: boolean;
}): QuestionRecord {
  return {
    questionId: Number(question.questionId),
    companyId: Number(question.companyId),
    postingId: question.postingId === null ? null : Number(question.postingId),
    criterionId:
      question.criterionId === null ? null : Number(question.criterionId),
    questionType: question.questionType,
    content: question.content,
    origin: question.origin,
    isAiEdited: question.isAiEdited,
    isActive: question.isActive,
  };
}

function mapTimePolicy(timePolicy: {
  postingId: bigint;
  preparationTimeSec: number;
  answerTimeSec: number;
  retryAllowed: boolean;
}): TimePolicyRecord {
  return {
    postingId: Number(timePolicy.postingId),
    preparationTimeSec: timePolicy.preparationTimeSec,
    answerTimeSec: timePolicy.answerTimeSec,
    retryAllowed: timePolicy.retryAllowed,
  };
}

function mapQuestionSet(questionSet: {
  questionSetId: bigint;
  postingId: bigint;
  title: string;
  status: string;
  createdByProcessLogId: bigint | null;
  items: Array<{
    questionSetItemId: bigint;
    questionId: bigint;
    criterionId: bigint | null;
    sortOrder: number;
    question?: {
      questionId: bigint;
      companyId: bigint;
      postingId: bigint | null;
      criterionId: bigint | null;
      questionType: QuestionType;
      content: string;
      origin: QuestionOrigin;
      isAiEdited: boolean;
      isActive: boolean;
    };
  }>;
}): QuestionSetRecord {
  return {
    questionSetId: Number(questionSet.questionSetId),
    postingId: Number(questionSet.postingId),
    title: questionSet.title,
    status: questionSet.status,
    createdByProcessLogId:
      questionSet.createdByProcessLogId === null
        ? null
        : Number(questionSet.createdByProcessLogId),
    items: questionSet.items.map((item) => ({
      questionSetItemId: Number(item.questionSetItemId),
      questionId: Number(item.questionId),
      criterionId: item.criterionId === null ? null : Number(item.criterionId),
      sortOrder: item.sortOrder,
      question: item.question ? mapQuestion(item.question) : undefined,
    })),
  };
}
