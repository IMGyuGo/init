import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
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
  ResumeQuestionApplicationRecord,
  ResumeQuestionBatchRecord,
  ResumeQuestionRetryJobRecord,
  TimePolicyRecord,
} from '../company-interview.types';
import {
  CompanyInterviewRepository,
  ConfirmQuestionSetInput,
  CreateCriterionTagInput,
  CreateQuestionInput,
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
      include: { ncsBindings: { orderBy: { bindingOrder: 'asc' } } },
    });
    return questions.map(mapQuestion);
  }

  async findQuestion(questionId: number): Promise<QuestionRecord | undefined> {
    const question = await this.prisma.question.findUnique({
      where: { questionId: BigInt(questionId) },
      include: { ncsBindings: { orderBy: { bindingOrder: 'asc' } } },
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

  async findQuestionGenerationProcess(processLogId: number) {
    const process = await this.prisma.aiProcessLog.findUnique({
      where: { processLogId: BigInt(processLogId) },
      select: {
        processLogId: true,
        processType: true,
        status: true,
        inputRef: true,
        outputRef: true,
      },
    });
    return process
      ? {
          processLogId: Number(process.processLogId),
          processType: process.processType,
          status: process.status,
          inputRef: process.inputRef,
          outputRef: process.outputRef,
        }
      : undefined;
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

  async createQuestion(input: CreateQuestionInput): Promise<QuestionRecord> {
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
        generationSource: input.generationSource,
        ncsProfileId: input.ncsProfileId,
        ncsQuestionMode: input.ncsQuestionMode,
        ncsProfileVersion: input.ncsProfileVersion,
        alignmentStatus: input.alignmentStatus,
        alignmentScore: input.alignmentScore,
        alignmentReason: input.alignmentReason,
        evaluatorVersion: input.evaluatorVersion,
        sourceProcessLogId:
          input.sourceProcessLogId === null
            ? null
            : BigInt(input.sourceProcessLogId),
        ncsBindings: {
          create: input.ncsBindings.map((binding) => ({
            criterionId: BigInt(binding.criterionId),
            ncsProfileId: binding.ncsProfileId,
            ncsProfileVersion: binding.ncsProfileVersion,
            alignmentStatus: binding.alignmentStatus,
            alignmentScore: binding.alignmentScore,
            alignmentReason: binding.alignmentReason,
            evaluatorVersion: binding.evaluatorVersion,
            bindingOrder: binding.bindingOrder,
          })),
        },
      },
      include: { ncsBindings: { orderBy: { bindingOrder: 'asc' } } },
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
        ncsProfileId: input.ncsProfileId,
        ncsQuestionMode: input.ncsQuestionMode,
        ncsProfileVersion: input.ncsProfileVersion,
        alignmentStatus: input.alignmentStatus,
        alignmentScore: input.alignmentScore,
        alignmentReason: input.alignmentReason,
        evaluatorVersion: input.evaluatorVersion,
        ncsBindings: {
          deleteMany: {},
          create: input.ncsBindings.map((binding) => ({
            criterionId: BigInt(binding.criterionId),
            ncsProfileId: binding.ncsProfileId,
            ncsProfileVersion: binding.ncsProfileVersion,
            alignmentStatus: binding.alignmentStatus,
            alignmentScore: binding.alignmentScore,
            alignmentReason: binding.alignmentReason,
            evaluatorVersion: binding.evaluatorVersion,
            bindingOrder: binding.bindingOrder,
          })),
        },
      },
      include: { ncsBindings: { orderBy: { bindingOrder: 'asc' } } },
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

  async findResumeQuestionGeneration(
    applicationId: number,
  ): Promise<ResumeQuestionApplicationRecord | undefined> {
    const application = await (this.prisma as any).application.findUnique({
      where: { applicationId: BigInt(applicationId) },
      include: {
        documents: {
          where: { documentType: 'RESUME' },
          orderBy: { uploadedAt: 'desc' },
          take: 1,
        },
        posting: {
          include: {
            questionGenerationPolicy: true,
          },
        },
        interviewQuestionBatches: {
          orderBy: { createdAt: 'desc' },
          include: {
            latestProcessLog: true,
            questions: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });
    if (!application) return undefined;

    const policy = application.posting.questionGenerationPolicy
      ? mapQuestionGenerationPolicy(application.posting.questionGenerationPolicy)
      : {
          postingId: Number(application.postingId),
          evaluationFramework: 'LEGACY' as const,
          jdCriteriaQuestionCount: 0,
          resumeQuestionCount: 0,
          policyVersion: 0,
          criteriaVersion: 0,
        };
    const document = application.documents[0] ?? null;
    const jobDescription = application.posting.jobDescription?.trim() ?? '';
    const extractedText = document?.parseStatus === 'EXTRACTED' ? document.extractedText?.trim() ?? '' : '';
    const resumeDocumentHash = extractedText ? hashSnapshot(extractedText) : null;
    const jdSnapshotHash = jobDescription ? hashSnapshot(jobDescription) : null;
    const inputVersion = resumeDocumentHash && jdSnapshotHash && policy.policyVersion > 0 && policy.criteriaVersion > 0
      ? hashSnapshot([
          applicationId,
          policy.policyVersion,
          policy.criteriaVersion,
          jdSnapshotHash,
          resumeDocumentHash,
        ].join(':'))
      : null;
    const matchingBatch = resumeDocumentHash && jdSnapshotHash
      ? application.interviewQuestionBatches.find((batch: any) =>
          batch.policyVersion === policy.policyVersion &&
          batch.criteriaVersion === policy.criteriaVersion &&
          batch.resumeDocumentHash === resumeDocumentHash &&
          batch.jdSnapshotHash === jdSnapshotHash,
        )
      : null;

    return {
      applicationId,
      postingId: Number(application.postingId),
      companyId: Number(application.posting.companyId),
      applicationStatus: application.applicationStatus,
      documentStatus: document?.parseStatus ?? null,
      documentId: document ? Number(document.documentId) : null,
      policy,
      currentInputVersion: inputVersion,
      currentResumeDocumentHash: resumeDocumentHash,
      currentJdSnapshotHash: jdSnapshotHash,
      currentBatch: matchingBatch ? mapResumeQuestionBatch(matchingBatch) : null,
      hasStaleBatch: application.interviewQuestionBatches.some((batch: any) =>
        !matchingBatch || batch.batchId !== matchingBatch.batchId,
      ),
    };
  }

  async createResumeQuestionRetry(input: {
    state: ResumeQuestionApplicationRecord;
    reason: string | null;
  }): Promise<ResumeQuestionRetryJobRecord> {
    const { state } = input;
    if (!state.documentId || !state.currentInputVersion || !state.currentResumeDocumentHash || !state.currentJdSnapshotHash) {
      throw new Error('resume question retry input snapshot is incomplete');
    }
    const documentId = state.documentId;
    const inputVersion = state.currentInputVersion;
    const resumeDocumentHash = state.currentResumeDocumentHash;
    const jdSnapshotHash = state.currentJdSnapshotHash;

    return this.prisma.$transaction(async (transaction) => {
      const process = await transaction.aiProcessLog.create({
        data: {
          applicationId: BigInt(state.applicationId),
          processType: 'RESUME_QUESTION_GENERATE',
          status: 'PENDING',
          inputRef: null,
        },
        select: { processLogId: true },
      });
      const attempt = (state.currentBatch?.attemptCount ?? 0) + 1;
      const job: ResumeQuestionRetryJobRecord = {
        processLogId: Number(process.processLogId),
        applicationId: state.applicationId,
        postingId: state.postingId,
        documentId,
        policyVersion: state.policy.policyVersion,
        criteriaVersion: state.policy.criteriaVersion,
        inputVersion,
        resumeDocumentHash,
        jdSnapshotHash,
        attempt,
      };
      await transaction.aiProcessLog.update({
        where: { processLogId: process.processLogId },
        data: { inputRef: JSON.stringify(job) },
      });

      const businessKey = {
        applicationId: BigInt(state.applicationId),
        policyVersion: state.policy.policyVersion,
        criteriaVersion: state.policy.criteriaVersion,
        jdSnapshotHash,
        resumeDocumentHash,
      };
      await transaction.applicationInterviewQuestionBatch.upsert({
        where: {
          applicationId_policyVersion_criteriaVersion_jdSnapshotHash_resumeDocumentHash: businessKey,
        },
        create: {
          ...businessKey,
          latestProcessLogId: process.processLogId,
          status: 'GENERATING',
          inputVersion,
          attemptCount: attempt,
          failureReason: input.reason,
        },
        update: {
          latestProcessLogId: process.processLogId,
          status: 'GENERATING',
          inputVersion,
          attemptCount: attempt,
          failureReason: input.reason,
        },
      });
      return job;
    });
  }

  async markResumeQuestionRetryQueueFailed(processLogId: number, reason: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.aiProcessLog.update({
        where: { processLogId: BigInt(processLogId) },
        data: {
          status: 'FAILED',
          failureCategory: 'RETRYABLE',
          failureReason: reason.slice(0, 500),
          completedAt: new Date(),
        },
      }),
      this.prisma.applicationInterviewQuestionBatch.updateMany({
        where: { latestProcessLogId: BigInt(processLogId) },
        data: { status: 'FAILED', failureReason: reason.slice(0, 500) },
      }),
    ]);
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

function hashSnapshot(value: string): string {
  return createHash('sha256').update(value.trim(), 'utf8').digest('hex');
}

function mapResumeQuestionBatch(batch: any): ResumeQuestionBatchRecord {
  return {
    batchId: Number(batch.batchId),
    latestProcessLogId: Number(batch.latestProcessLogId),
    processStatus: batch.latestProcessLog.status,
    status: batch.status,
    policyVersion: batch.policyVersion,
    criteriaVersion: batch.criteriaVersion,
    inputVersion: batch.inputVersion,
    resumeDocumentHash: batch.resumeDocumentHash,
    jdSnapshotHash: batch.jdSnapshotHash,
    attemptCount: batch.attemptCount,
    questions: batch.questions.map((question: any) => ({
      personalizedQuestionId: Number(question.personalizedQuestionId),
      criterionId: question.criterionId === null ? null : Number(question.criterionId),
      source: 'RESUME_PERSONALIZED' as const,
      questionType: question.questionType,
      content: question.content,
      ncsProfileId: question.ncsProfileId,
      ncsQuestionMode: question.ncsQuestionMode,
      ncsProfileVersion: question.ncsProfileVersion,
      alignmentStatus: question.alignmentStatus,
      alignmentScore: question.alignmentScore === null ? null : Number(question.alignmentScore.toString()),
      alignmentReason: question.alignmentReason,
      evaluatorVersion: question.evaluatorVersion,
      sortOrder: question.sortOrder,
    })),
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
  generationSource?: string | null;
  ncsProfileId?: string | null;
  ncsQuestionMode?: string | null;
  ncsProfileVersion?: string | null;
  alignmentStatus?: string | null;
  alignmentScore?: { toString(): string } | number | null;
  alignmentReason?: string | null;
  evaluatorVersion?: string | null;
  sourceProcessLogId?: bigint | null;
  ncsBindings?: Array<{
    criterionId: bigint;
    ncsProfileId: string;
    ncsProfileVersion: string;
    alignmentStatus: string;
    alignmentScore: { toString(): string } | number | null;
    alignmentReason: string | null;
    evaluatorVersion: string | null;
    bindingOrder: number;
  }>;
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
    generationSource:
      (question.generationSource ?? null) as QuestionRecord['generationSource'],
    ncsProfileId: (question.ncsProfileId ?? null) as QuestionRecord['ncsProfileId'],
    ncsQuestionMode:
      (question.ncsQuestionMode ?? null) as QuestionRecord['ncsQuestionMode'],
    ncsProfileVersion: question.ncsProfileVersion ?? null,
    alignmentStatus:
      (question.alignmentStatus ?? null) as QuestionRecord['alignmentStatus'],
    alignmentScore:
      question.alignmentScore === null || question.alignmentScore === undefined
        ? null
        : Number(question.alignmentScore.toString()),
    alignmentReason: question.alignmentReason ?? null,
    evaluatorVersion: question.evaluatorVersion ?? null,
    sourceProcessLogId:
      question.sourceProcessLogId === null || question.sourceProcessLogId === undefined
        ? null
        : Number(question.sourceProcessLogId),
    ncsBindings: (question.ncsBindings ?? []).map((binding) => ({
      criterionId: Number(binding.criterionId),
      ncsProfileId: binding.ncsProfileId as QuestionRecord['ncsBindings'][number]['ncsProfileId'],
      ncsProfileVersion: binding.ncsProfileVersion,
      alignmentStatus: binding.alignmentStatus as QuestionRecord['ncsBindings'][number]['alignmentStatus'],
      alignmentScore:
        binding.alignmentScore === null ? null : Number(binding.alignmentScore.toString()),
      alignmentReason: binding.alignmentReason,
      evaluatorVersion: binding.evaluatorVersion,
      bindingOrder: binding.bindingOrder,
    })),
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
