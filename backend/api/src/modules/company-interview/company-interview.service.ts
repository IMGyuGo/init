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
  conflict,
  forbidden,
  notFound,
  validationFailed,
} from './company-interview.errors';
import {
  CriterionTagRecord,
  EvaluationCriterionRecord,
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
      })),
      timePolicy: await this.toTimePolicyDto(posting.postingId),
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
      });
    }

    const totalWeight = dto.criteria.reduce(
      (sum, criterion) => sum + criterion.weight,
      0,
    );

    // Contract keeps the exact total-weight policy pending. For now the C
    // module accepts 1..100 and reports the total without changing DB rules.
    if (dto.criteria.length > 0 && (totalWeight <= 0 || totalWeight > 100)) {
      validationFailed('평가 기준 배점 합계를 확인해주세요.', [
        { field: 'criteria[].weight', reason: 'TOTAL_OUT_OF_RANGE' },
      ]);
    }

    const saved = await this.repository.replaceCriteria(
      posting.postingId,
      normalizedCriteria,
    );
    return {
      postingId: posting.postingId,
      criteria: await this.mapCriteria(saved),
      totalWeight,
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
