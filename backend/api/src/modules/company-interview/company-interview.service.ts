import { Inject, Injectable } from '@nestjs/common';
import type { CurrentUser } from '@init/common';
import {
  CreateCriterionTagDto,
  CreateCriterionTagResponseDto,
  CriterionTagResponseItemDto,
} from './dto/criterion-tag.dto';
import {
  EvaluationCriterionResponseDto,
  UpdateEvaluationCriterionDto,
} from './dto/evaluation-criterion.dto';
import {
  InterviewSettingsQueryDto,
  InterviewSettingsResponseDto,
} from './dto/interview-settings.dto';
import {
  CreateInterviewQuestionDto,
  CreateInterviewQuestionResponseDto,
  UpdateInterviewQuestionDto,
} from './dto/question-management.dto';
import {
  ActiveQuestionSetResponseDto,
  ConfirmQuestionSetDto,
  QuestionSetResponseDto,
} from './dto/question-set.dto';
import {
  UpdateInterviewTimePolicyDto,
  UpdateInterviewTimePolicyResponseDto,
} from './dto/time-policy.dto';
import {
  QuestionGenerationPolicyResponseDto,
  UpdateQuestionGenerationPolicyDto,
} from './dto/question-generation-policy.dto';
import {
  conflict,
  forbidden,
  notFound,
  validationFailed,
} from './company-interview.errors';
import {
  CriterionTagRecord,
  EvaluationCriterionRecord,
  EvaluationFramework,
  NcsProfileId,
  NcsQuestionMode,
  QuestionGenerationPolicyRecord,
  QuestionGenerationSource,
  QuestionRecord,
  QuestionSetRecord,
} from './company-interview.types';
import {
  COMPANY_INTERVIEW_REPOSITORY,
  CompanyInterviewRepository,
  type UpdateCriterionInput,
} from './repositories/company-interview.repository';

@Injectable()
export class CompanyInterviewService {
  constructor(
    @Inject(COMPANY_INTERVIEW_REPOSITORY)
    private readonly repository: CompanyInterviewRepository,
  ) {}

  async getSettings(
    currentUser: CurrentUser,
    query: InterviewSettingsQueryDto,
  ): Promise<InterviewSettingsResponseDto> {
    const posting = await this.getOwnedPosting(currentUser, query.postingId);
    const availableTags = await this.repository.listTags();
    const criteria = await this.repository.listCriteria(posting.postingId);
    const questions = await this.repository.listQuestions(posting.postingId);
    const storedPolicy = await this.repository.getQuestionGenerationPolicy(
      posting.postingId,
    );
    const policy = storedPolicy ?? defaultQuestionGenerationPolicy(posting.postingId);

    return {
      posting: {
        postingId: posting.postingId,
        title: posting.title,
        status: posting.status,
      },
      availableTags: availableTags.map((tag) => ({
        tagId: tag.tagId,
        jobRole: tag.jobRole,
        tagName: tag.name,
        category: tag.category,
        description: tag.description,
        sortOrder: tag.sortOrder,
        ncsProfileId: tag.ncsProfileId,
        defaultNcsQuestionMode: tag.defaultNcsQuestionMode,
        ncsProfileVersion: tag.ncsProfileVersion,
      })),
      criteria: await this.mapCriteria(criteria),
      questions: questions.map((question) => ({
        questionId: question.questionId,
        criterionId: question.criterionId,
        questionType: question.questionType,
        content: question.content,
        origin: question.origin,
        isAiEdited: question.isAiEdited,
        isActive: question.isActive,
        generationSource: null,
        ncsProfileId: null,
        ncsQuestionMode: null,
        ncsProfileVersion: null,
        alignmentStatus: null,
      })),
      timePolicy: await this.toTimePolicyDto(posting.postingId),
      evaluationFramework: policy.evaluationFramework,
      questionGenerationPolicy: {
        postingId: posting.postingId,
        jdCriteriaQuestionCount: policy.jdCriteriaQuestionCount,
        resumeQuestionCount: policy.resumeQuestionCount,
        policyVersion: policy.policyVersion,
        criteriaVersion: policy.criteriaVersion,
        allocations: buildQuestionAllocations(policy, criteria),
        resumeQuestionStatus:
          policy.resumeQuestionCount === 0 ? 'DISABLED' : 'WAITING_APPLICATION',
      },
    };
  }

  async createCriterionTag(
    currentUser: CurrentUser,
    dto: CreateCriterionTagDto,
  ): Promise<CreateCriterionTagResponseDto> {
    const posting = await this.getOwnedPosting(currentUser, dto.postingId);
    const tagName = dto.tagName.trim();
    const category = dto.category.trim();
    const description = dto.description?.trim() || null;

    if (!tagName) {
      validationFailed('평가 태그명을 입력해주세요.', [
        { field: 'tagName', reason: 'REQUIRED' },
      ]);
    }

    if (!category) {
      validationFailed('평가 태그 분류를 입력해주세요.', [
        { field: 'category', reason: 'REQUIRED' },
      ]);
    }

    const existingTag = (await this.repository.listTags()).find(
      (tag) =>
        normalizeCriterionTagText(tag.name) === normalizeCriterionTagText(tagName) &&
        normalizeCriterionTagText(tag.category) === normalizeCriterionTagText(category),
    );
    const tag =
      existingTag ??
      (await this.repository.createTag({
        jobRole: posting.jobRole || 'Common',
        name: tagName,
        description,
        category,
      }));

    return {
      postingId: posting.postingId,
      tag: this.mapCriterionTag(tag),
    };
  }

  async updateEvaluationCriteria(
    currentUser: CurrentUser,
    dto: UpdateEvaluationCriterionDto,
  ): Promise<EvaluationCriterionResponseDto> {
    const posting = await this.getOwnedPosting(currentUser, dto.postingId);
    const existingCriteria = await this.repository.listCriteria(posting.postingId);
    const currentPolicy = await this.repository.getQuestionGenerationPolicy(
      posting.postingId,
    );
    const evaluationFramework =
      dto.evaluationFramework ?? currentPolicy?.evaluationFramework ?? 'LEGACY';
    const seenSortOrders = new Set<number>();
    const seenTagIds = new Set<number>();
    const normalizedCriteria: UpdateCriterionInput[] = [];

    for (const criterion of dto.criteria) {
      if (seenSortOrders.has(criterion.sortOrder)) {
        validationFailed('평가 기준 순서를 확인해주세요.', [
          { field: 'criteria[].sortOrder', reason: 'DUPLICATED' },
        ]);
      }
      seenSortOrders.add(criterion.sortOrder);
      if (seenTagIds.has(criterion.tagId)) {
        validationFailed('평가 태그가 중복되었습니다.', [
          { field: 'criteria[].tagId', reason: 'DUPLICATED' },
        ]);
      }
      seenTagIds.add(criterion.tagId);

      const tag = await this.repository.findTag(criterion.tagId);
      if (!tag) {
        notFound('평가 태그를 찾을 수 없습니다.');
      }

      let existingCriterion: EvaluationCriterionRecord | undefined;
      if (criterion.criterionId !== undefined) {
        existingCriterion = existingCriteria.find(
          (item) => item.criterionId === criterion.criterionId,
        );
        if (!existingCriterion) {
          notFound('평가 기준을 찾을 수 없습니다.');
        }
      }

      normalizedCriteria.push({
        ...criterion,
        description:
          criterion.description === undefined
            ? existingCriterion?.description ?? tag.description
            : criterion.description?.trim() || null,
        ncsProfileId:
          evaluationFramework === 'NCS_3_PROFILE_V1' ? tag.ncsProfileId : null,
        ncsQuestionMode:
          evaluationFramework === 'NCS_3_PROFILE_V1'
            ? tag.defaultNcsQuestionMode
            : null,
        ncsProfileVersion:
          evaluationFramework === 'NCS_3_PROFILE_V1'
            ? tag.ncsProfileVersion
            : null,
      });
    }

    const totalWeight = dto.criteria.reduce(
      (sum, criterion) => sum + criterion.weight,
      0,
    );

    if (
      evaluationFramework === 'LEGACY' &&
      dto.criteria.length > 0 &&
      (totalWeight <= 0 || totalWeight > 100)
    ) {
      validationFailed('평가 기준 배점 합계를 확인해주세요.', [
        { field: 'criteria[].weight', reason: 'TOTAL_OUT_OF_RANGE' },
      ]);
    }

    if (evaluationFramework === 'NCS_3_PROFILE_V1') {
      assertNcsCriteria(normalizedCriteria);
      if (totalWeight !== 100) {
        validationFailed('NCS 평가 기준 배점 합계는 100이어야 합니다.', [
          { field: 'criteria[].weight', reason: 'TOTAL_MUST_EQUAL_100' },
        ]);
      }
    }

    const saved = await this.repository.replaceCriteria(
      posting.postingId,
      evaluationFramework,
      normalizedCriteria,
    );
    return {
      postingId: posting.postingId,
      criteria: await this.mapCriteria(saved.criteria),
      totalWeight,
      evaluationFramework: saved.policy.evaluationFramework,
      criteriaVersion: saved.policy.criteriaVersion,
    };
  }

  async updateQuestionGenerationPolicy(
    currentUser: CurrentUser,
    dto: UpdateQuestionGenerationPolicyDto,
  ): Promise<QuestionGenerationPolicyResponseDto> {
    const posting = await this.getOwnedPosting(currentUser, dto.postingId);
    const criteria = await this.repository.listCriteria(posting.postingId);
    const current =
      (await this.repository.getQuestionGenerationPolicy(posting.postingId)) ??
      defaultQuestionGenerationPolicy(posting.postingId);
    const total = dto.jdCriteriaQuestionCount + dto.resumeQuestionCount;

    if (total < 1 || total > 20) {
      validationFailed('전체 면접 질문 수는 1개 이상 20개 이하여야 합니다.', [
        { field: 'jdCriteriaQuestionCount', reason: 'TOTAL_OUT_OF_RANGE' },
        { field: 'resumeQuestionCount', reason: 'TOTAL_OUT_OF_RANGE' },
      ]);
    }
    if (current.evaluationFramework === 'NCS_3_PROFILE_V1') {
      assertNcsCriteria(criteria);
      if (total < 3) {
        validationFailed('NCS 면접 질문은 세 평가 기준을 포함하도록 3개 이상이어야 합니다.', [
          { field: 'jdCriteriaQuestionCount', reason: 'NCS_TOTAL_MIN_3' },
          { field: 'resumeQuestionCount', reason: 'NCS_TOTAL_MIN_3' },
        ]);
      }
    }

    const saved = await this.repository.updateQuestionGenerationPolicy(
      posting.postingId,
      {
        evaluationFramework: current.evaluationFramework,
        jdCriteriaQuestionCount: dto.jdCriteriaQuestionCount,
        resumeQuestionCount: dto.resumeQuestionCount,
        expectedPolicyVersion: dto.expectedPolicyVersion,
      },
    );
    if (!saved) {
      conflict('다른 사용자가 질문 생성 정책을 먼저 수정했습니다. 새로고침 후 다시 시도해주세요.');
    }

    return {
      ...saved,
      allocations: buildQuestionAllocations(saved, criteria),
      warnings: [],
    };
  }

  async createQuestion(
    currentUser: CurrentUser,
    dto: CreateInterviewQuestionDto,
  ): Promise<CreateInterviewQuestionResponseDto> {
    const posting = await this.getOwnedPosting(currentUser, dto.postingId);
    const criterion = await this.findPostingCriterion(
      posting.postingId,
      dto.criterionId,
    );

    if (await this.repository.findDuplicateQuestion(posting.postingId, dto.content)) {
      conflict('이미 등록된 질문입니다.');
    }

    const question = await this.repository.createQuestion({
      companyId: posting.companyId,
      postingId: posting.postingId,
      criterionId: criterion.criterionId,
      questionType: dto.questionType,
      content: dto.content,
      origin: dto.origin ?? 'MANUAL',
    });

    return {
      postingId: posting.postingId,
      question: this.mapQuestion(question),
    };
  }

  async updateQuestion(
    currentUser: CurrentUser,
    questionId: number,
    dto: UpdateInterviewQuestionDto,
  ): Promise<CreateInterviewQuestionResponseDto> {
    this.assertCompanyUser(currentUser);
    const question = await this.findOwnedQuestion(currentUser, questionId);
    if (question.postingId === null) {
      validationFailed('공고에 연결된 질문만 수정할 수 있습니다.', [
        { field: 'questionId', reason: 'POSTING_REQUIRED' },
      ]);
    }
    const criterion = await this.findPostingCriterion(
      question.postingId,
      dto.criterionId,
    );
    const duplicate = await this.repository.findDuplicateQuestion(
      question.postingId,
      dto.content,
    );
    if (duplicate && duplicate.questionId !== questionId) {
      conflict('이미 등록된 질문입니다.');
    }

    const saved = await this.repository.updateQuestion(questionId, {
      criterionId: criterion.criterionId,
      questionType: dto.questionType,
      content: dto.content,
      isAiEdited:
        question.origin === 'AI_GENERATED' ? true : question.isAiEdited,
    });

    return {
      postingId: question.postingId,
      question: this.mapQuestion(saved),
    };
  }

  async deleteQuestion(
    currentUser: CurrentUser,
    questionId: number,
  ): Promise<CreateInterviewQuestionResponseDto> {
    this.assertCompanyUser(currentUser);
    const question = await this.findOwnedQuestion(currentUser, questionId);
    if (question.postingId === null) {
      validationFailed('공고에 연결된 질문만 삭제할 수 있습니다.', [
        { field: 'questionId', reason: 'POSTING_REQUIRED' },
      ]);
    }
    const saved = await this.repository.deactivateQuestion(questionId);

    return {
      postingId: question.postingId,
      question: this.mapQuestion(saved),
    };
  }

  async updateTimePolicy(
    currentUser: CurrentUser,
    dto: UpdateInterviewTimePolicyDto,
  ): Promise<UpdateInterviewTimePolicyResponseDto> {
    const posting = await this.getOwnedPosting(currentUser, dto.postingId);

    if (dto.answerTimeSec <= dto.preparationTimeSec) {
      validationFailed('답변 시간은 준비 시간보다 길어야 합니다.', [
        { field: 'answerTimeSec', reason: 'MUST_BE_GREATER_THAN_PREPARATION' },
      ]);
    }

    const timePolicy = await this.repository.updateTimePolicy(posting.postingId, {
      preparationTimeSec: dto.preparationTimeSec,
      answerTimeSec: dto.answerTimeSec,
      retryAllowed: dto.retryAllowed,
    });

    return {
      postingId: posting.postingId,
      timePolicy: {
        preparationTimeSec: timePolicy.preparationTimeSec,
        answerTimeSec: timePolicy.answerTimeSec,
        retryAllowed: timePolicy.retryAllowed,
      },
    };
  }

  async confirmQuestionSet(
    currentUser: CurrentUser,
    dto: ConfirmQuestionSetDto,
  ): Promise<QuestionSetResponseDto> {
    this.assertCompanyUser(currentUser);
    const posting = await this.getOwnedPosting(currentUser, dto.postingId);
    const seenSortOrders = new Set<number>();
    const seenQuestionIds = new Set<number>();

    for (const item of dto.items) {
      if (seenSortOrders.has(item.sortOrder)) {
        validationFailed('질문 세트 순서를 확인해주세요.', [
          { field: 'items[].sortOrder', reason: 'DUPLICATED' },
        ]);
      }
      seenSortOrders.add(item.sortOrder);

      if (seenQuestionIds.has(item.questionId)) {
        validationFailed('질문 세트에 중복 질문이 있습니다.', [
          { field: 'items[].questionId', reason: 'DUPLICATED' },
        ]);
      }
      seenQuestionIds.add(item.questionId);

      const question = await this.findOwnedQuestion(currentUser, item.questionId);
      if (question.postingId !== posting.postingId) {
        validationFailed('공고에 연결된 질문만 질문 세트에 포함할 수 있습니다.', [
          { field: 'items[].questionId', reason: 'POSTING_MISMATCH' },
        ]);
      }

      if (item.criterionId !== undefined && item.criterionId !== null) {
        await this.findPostingCriterion(posting.postingId, item.criterionId);
      }
    }

    const saved = await this.repository.confirmQuestionSet({
      postingId: posting.postingId,
      title: dto.title.trim() || '면접 질문 세트',
      sourceProcessLogId: dto.sourceProcessLogId,
      items: dto.items,
    });

    return this.mapQuestionSet(saved);
  }

  async getActiveQuestionSet(
    currentUser: CurrentUser,
    postingId?: number,
  ): Promise<ActiveQuestionSetResponseDto> {
    const posting = await this.getOwnedPosting(currentUser, postingId);
    const questionSet = await this.repository.findActiveQuestionSet(
      posting.postingId,
    );

    return {
      postingId: posting.postingId,
      questionSet: questionSet ? this.mapQuestionSet(questionSet) : null,
      fallbackPolicy: 'USE_ACTIVE_POSTING_QUESTIONS',
    };
  }

  private async getOwnedPosting(currentUser: CurrentUser, postingId?: number) {
    this.assertCompanyUser(currentUser);

    const posting =
      postingId === undefined
        ? await this.repository.findDefaultPosting(currentUser.companyId)
        : await this.repository.findPosting(postingId);

    if (!posting) {
      notFound('공고를 찾을 수 없습니다.');
    }

    if (posting.companyId !== currentUser.companyId) {
      forbidden('공고 접근 권한이 없습니다.');
    }

    return posting;
  }

  private assertCompanyUser(
    currentUser: CurrentUser,
  ): asserts currentUser is CurrentUser & { companyId: number } {
    if (currentUser.userType !== 'COMPANY' || currentUser.companyId === null) {
      forbidden('기업 사용자만 접근할 수 있습니다.');
    }
  }

  private async findCriterion(criterionId: number): Promise<EvaluationCriterionRecord> {
    const criterion = await this.repository.findCriterion(criterionId);

    if (!criterion) {
      notFound('평가 기준을 찾을 수 없습니다.');
    }

    return criterion;
  }

  private async findPostingCriterion(
    postingId: number,
    criterionId: number,
  ): Promise<EvaluationCriterionRecord> {
    const criterion = await this.findCriterion(criterionId);

    if (criterion.postingId !== postingId) {
      validationFailed('공고에 연결된 평가 기준을 선택해주세요.', [
        { field: 'criterionId', reason: 'POSTING_MISMATCH' },
      ]);
    }

    return criterion;
  }

  private async findOwnedQuestion(
    currentUser: CurrentUser & { companyId: number },
    questionId: number,
  ): Promise<QuestionRecord> {
    const question = await this.repository.findQuestion(questionId);

    if (!question || !question.isActive) {
      notFound('질문을 찾을 수 없습니다.');
    }

    if (question.companyId !== currentUser.companyId) {
      forbidden('질문 접근 권한이 없습니다.');
    }

    return question;
  }

  private async mapCriteria(criteria: EvaluationCriterionRecord[]) {
    return Promise.all(
      criteria.map(async (criterion) => {
        const tag = await this.repository.findTag(criterion.tagId);
        if (!tag) {
          notFound('평가 태그를 찾을 수 없습니다.');
        }

        return {
          criterionId: criterion.criterionId,
          tagId: criterion.tagId,
          tagName: tag.name,
          category: tag.category,
          description: criterion.description,
          weight: criterion.weight,
          passScore: criterion.passScore,
          sortOrder: criterion.sortOrder,
          ncsProfileId: criterion.ncsProfileId,
          ncsQuestionMode: criterion.ncsQuestionMode,
          ncsProfileVersion: criterion.ncsProfileVersion,
        };
      }),
    );
  }

  private async toTimePolicyDto(postingId: number) {
    const timePolicy = await this.repository.getTimePolicy(postingId);
    return {
      preparationTimeSec: timePolicy.preparationTimeSec,
      answerTimeSec: timePolicy.answerTimeSec,
      retryAllowed: timePolicy.retryAllowed,
    };
  }

  private mapQuestion(question: QuestionRecord) {
    return {
      questionId: question.questionId,
      postingId: question.postingId,
      criterionId: question.criterionId,
      questionType: question.questionType,
      content: question.content,
      origin: question.origin,
      isAiEdited: question.isAiEdited,
      isActive: question.isActive,
      generationSource: null,
      ncsProfileId: null,
      ncsQuestionMode: null,
      ncsProfileVersion: null,
      alignmentStatus: null,
    };
  }

  private mapCriterionTag(tag: CriterionTagRecord): CriterionTagResponseItemDto {
    return {
      tagId: tag.tagId,
      jobRole: tag.jobRole,
      tagName: tag.name,
      category: tag.category,
      description: tag.description,
      sortOrder: tag.sortOrder,
      ncsProfileId: tag.ncsProfileId,
      defaultNcsQuestionMode: tag.defaultNcsQuestionMode,
      ncsProfileVersion: tag.ncsProfileVersion,
    };
  }

  private mapQuestionSet(questionSet: QuestionSetRecord): QuestionSetResponseDto {
    return {
      questionSetId: questionSet.questionSetId,
      postingId: questionSet.postingId,
      title: questionSet.title,
      status: questionSet.status,
      createdByProcessLogId: questionSet.createdByProcessLogId,
      items: questionSet.items.map((item) => ({
        questionSetItemId: item.questionSetItemId,
        questionId: item.questionId,
        criterionId: item.criterionId,
        sortOrder: item.sortOrder,
        questionType: item.question?.questionType,
        content: item.question?.content,
        isActive: item.question?.isActive,
      })),
    };
  }
}

function normalizeCriterionTagText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

const NCS_PROFILE_IDS: NcsProfileId[] = [
  'PROBLEM_SOLVING',
  'COMMUNICATION',
  'DIGITAL',
];

function defaultQuestionGenerationPolicy(
  postingId: number,
): QuestionGenerationPolicyRecord {
  return {
    postingId,
    evaluationFramework: 'LEGACY',
    jdCriteriaQuestionCount: 0,
    resumeQuestionCount: 0,
    policyVersion: 0,
    criteriaVersion: 0,
  };
}

function assertNcsCriteria(
  criteria: Array<{
    ncsProfileId: NcsProfileId | null;
    ncsQuestionMode: NcsQuestionMode | null;
    ncsProfileVersion: string | null;
  }>,
) {
  const profiles = criteria.map((criterion) => criterion.ncsProfileId);
  const isValid =
    criteria.length === NCS_PROFILE_IDS.length &&
    NCS_PROFILE_IDS.every(
      (profileId) => profiles.filter((candidate) => candidate === profileId).length === 1,
    ) &&
    criteria.every(
      (criterion) =>
        criterion.ncsQuestionMode !== null && criterion.ncsProfileVersion !== null,
    );
  if (!isValid) {
    validationFailed('NCS 평가 기준은 문제해결, 의사소통, 디지털 profile을 각각 하나씩 포함해야 합니다.', [
      { field: 'criteria', reason: 'NCS_BINDING_INVALID' },
    ]);
  }
}

function buildQuestionAllocations(
  policy: QuestionGenerationPolicyRecord,
  criteria: EvaluationCriterionRecord[],
) {
  if (policy.evaluationFramework !== 'NCS_3_PROFILE_V1') {
    return [];
  }

  const ordered = [...criteria].sort((a, b) => a.sortOrder - b.sortOrder);
  if (
    ordered.length !== NCS_PROFILE_IDS.length ||
    ordered.some(
      (criterion) =>
        criterion.ncsProfileId === null || criterion.ncsQuestionMode === null,
    )
  ) {
    return [];
  }

  const counts = new Map<string, {
    source: QuestionGenerationSource;
    ncsProfileId: NcsProfileId;
    ncsQuestionMode: NcsQuestionMode;
    count: number;
  }>();
  const total = policy.jdCriteriaQuestionCount + policy.resumeQuestionCount;

  for (let index = 0; index < total; index += 1) {
    const criterion = ordered[index % ordered.length];
    const source: QuestionGenerationSource =
      index < policy.jdCriteriaQuestionCount ? 'JD_CRITERIA' : 'RESUME_PERSONALIZED';
    const ncsProfileId = criterion.ncsProfileId as NcsProfileId;
    const ncsQuestionMode = criterion.ncsQuestionMode as NcsQuestionMode;
    const key = `${source}:${ncsProfileId}:${ncsQuestionMode}`;
    const current = counts.get(key);
    counts.set(key, {
      source,
      ncsProfileId,
      ncsQuestionMode,
      count: (current?.count ?? 0) + 1,
    });
  }

  return [...counts.values()];
}
