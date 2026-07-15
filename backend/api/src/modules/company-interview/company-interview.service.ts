import { Inject, Injectable, Optional } from '@nestjs/common';
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
  aiProcessFailed,
  forbidden,
  ncsBindingInvalid,
  ncsWeightInvalid,
  notFound,
  personalizedQuestionsNotReady,
  questionCountInvalid,
  validationFailed,
} from './company-interview.errors';
import {
  CriterionTagRecord,
  EvaluationCriterionRecord,
  EvaluationFramework,
  NcsProfileId,
  NcsQuestionMode,
  QuestionAlignmentStatus,
  QuestionGenerationPolicyRecord,
  QuestionGenerationSource,
  QuestionNcsBindingRecord,
  QuestionRecord,
  QuestionSetRecord,
  ResumeQuestionApplicationRecord,
  ResumeQuestionGenerationStatus,
} from './company-interview.types';
import {
  COMPANY_INTERVIEW_REPOSITORY,
  CompanyInterviewRepository,
  type UpdateCriterionInput,
} from './repositories/company-interview.repository';
import { RetryResumeQuestionsDto } from './dto/resume-question.dto';
import {
  AI_JOB_QUEUE_PUBLISHER,
  AiJobQueuePublisher,
} from '../report/service/ai-job-queue.publisher';
import { CandidateDomainError, CandidateService } from '../candidate';
import {
  CompanyInterviewSessionResponseDto,
  CreateCompanyInterviewSessionDto,
} from './dto/company-interview-session.dto';

type CommonQuestionGenerationRequest = {
  postingId: number;
  jdCriteriaQuestionCount?: number;
  expectedPolicyVersion?: number;
  questionCount?: number;
};

type QuestionSetGenerationRequest = {
  postingId: number;
  questionCount: number;
  criteria: Array<{ criterionId: number; name: string; weight?: number }>;
  questionTypes: string[];
};

@Injectable()
export class CompanyInterviewService {
  constructor(
    @Inject(COMPANY_INTERVIEW_REPOSITORY)
    private readonly repository: CompanyInterviewRepository,
    @Optional()
    @Inject(AI_JOB_QUEUE_PUBLISHER)
    private readonly queuePublisher?: AiJobQueuePublisher,
    @Optional()
    private readonly candidateService?: CandidateService,
  ) {}

  async createInterviewSession(
    currentUser: CurrentUser,
    dto: CreateCompanyInterviewSessionDto,
  ): Promise<CompanyInterviewSessionResponseDto> {
    await this.getOwnedResumeQuestionState(currentUser, dto.applicationId);
    if (!this.candidateService) {
      conflict('면접 세션 준비 서비스를 사용할 수 없습니다.');
    }
    try {
      const result = await this.candidateService.prepareRecruitingInterviewSessionSnapshot(dto.applicationId);
      if (result.sessionId === null) {
        conflict('면접 세션을 생성하지 못했습니다.');
      }
      return {
        applicationId: result.applicationId,
        sessionId: result.sessionId,
        snapshotCreated: result.snapshotCreated,
        commonQuestionCount: result.commonQuestionCount,
        personalizedQuestionCount: result.personalizedQuestionCount,
        totalQuestionCount: result.totalQuestionCount,
        policyVersion: result.policyVersion,
        criteriaVersion: result.criteriaVersion,
      };
    } catch (error) {
      if (error instanceof CandidateDomainError) {
        if (error.code === 'INTERVIEW_PERSONALIZED_QUESTIONS_NOT_READY') {
          personalizedQuestionsNotReady();
        }
        if (error.code === 'INTERVIEW_QUESTION_COUNT_INVALID') {
          questionCountInvalid('확정된 공통 질문 수가 질문 생성 정책과 다릅니다.');
        }
      }
      throw error;
    }
  }

  async getResumeQuestions(currentUser: CurrentUser, applicationId: number) {
    const state = await this.getOwnedResumeQuestionState(currentUser, applicationId);
    const status = this.resumeQuestionStatus(state);
    const batch = state.currentBatch;
    const items = status === 'READY' || status === 'REVIEW_REQUIRED'
      ? batch?.questions ?? []
      : [];

    return {
      applicationId: state.applicationId,
      postingId: state.postingId,
      status,
      processLogId: batch?.latestProcessLogId ?? null,
      policyVersion: state.policy.policyVersion,
      criteriaVersion: state.policy.criteriaVersion,
      inputVersion: state.currentInputVersion,
      items,
    };
  }

  async retryResumeQuestions(
    currentUser: CurrentUser,
    applicationId: number,
    dto: RetryResumeQuestionsDto,
  ) {
    const state = await this.getOwnedResumeQuestionState(currentUser, applicationId);
    const status = this.resumeQuestionStatus(state);
    const canRecoverMissingBatch =
      status === 'WAITING_DOCUMENT' &&
      state.documentStatus === 'EXTRACTED' &&
      state.currentBatch === null &&
      Boolean(state.currentInputVersion);
    if (!['FAILED', 'REVIEW_REQUIRED', 'STALE'].includes(status) && !canRecoverMissingBatch) {
      personalizedQuestionsNotReady('현재 상태에서는 개인화 질문을 재생성할 수 없습니다.', [
        { field: 'status', reason: `current status is ${status}` },
      ]);
    }
    if (dto.expectedPolicyVersion !== undefined && dto.expectedPolicyVersion !== state.policy.policyVersion) {
      conflict('질문 생성 정책이 변경되었습니다. 최신 설정을 다시 확인해주세요.');
    }
    if (state.documentStatus !== 'EXTRACTED' || !state.currentInputVersion) {
      personalizedQuestionsNotReady('이력서 추출 완료 후 개인화 질문을 재생성할 수 있습니다.');
    }
    if (!this.queuePublisher) {
      aiProcessFailed('AI queue publisher가 구성되지 않았습니다.');
    }

    const job = await this.repository.createResumeQuestionRetry({
      state,
      reason: dto.reason?.trim() || null,
    });
    try {
      await this.queuePublisher.publish({
        processLogId: job.processLogId,
        processType: 'RESUME_QUESTION_GENERATE',
        inputRef: JSON.stringify(job),
        attempt: job.attempt,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown queue publish failure';
      await this.repository.markResumeQuestionRetryQueueFailed(job.processLogId, reason);
      aiProcessFailed('개인화 질문 재생성 작업을 queue에 등록하지 못했습니다.');
    }

    return {
      processLogId: job.processLogId,
      status: 'PENDING' as const,
      resumeQuestionStatus: 'GENERATING' as const,
      queued: true,
    };
  }

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
      questions: questions.map((question) => this.mapQuestion(question)),
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
      if (
        dto.criteria.some(
          (criterion) =>
            !Number.isInteger(criterion.weight) || criterion.weight < 0,
        )
      ) {
        ncsWeightInvalid('NCS 평가 기준 배점은 0 이상의 정수여야 합니다.', [
          { field: 'criteria[].weight', reason: 'NON_NEGATIVE_INTEGER_REQUIRED' },
        ]);
      }
      if (totalWeight !== 100) {
        ncsWeightInvalid('NCS 평가 기준 배점 합계는 100이어야 합니다.', [
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

  async prepareCommonQuestionGeneration(
    currentUser: CurrentUser,
    dto: CommonQuestionGenerationRequest,
  ) {
    const posting = await this.getOwnedPosting(currentUser, dto.postingId);
    const criteria = await this.repository.listCriteria(posting.postingId);
    const policy =
      (await this.repository.getQuestionGenerationPolicy(posting.postingId)) ??
      defaultQuestionGenerationPolicy(posting.postingId);
    const requestedCount = dto.jdCriteriaQuestionCount ?? dto.questionCount;

    if (!posting.jobDescription?.trim()) {
      validationFailed('공고의 직무명세서를 먼저 저장해주세요.', [
        { field: 'postingId', reason: 'JOB_DESCRIPTION_REQUIRED' },
      ]);
    }
    if (!Number.isInteger(requestedCount) || (requestedCount ?? 0) < 1) {
      questionCountInvalid('JD 공통 질문 개수는 1개 이상이어야 합니다.', [
        { field: 'jdCriteriaQuestionCount', reason: 'MIN_1' },
      ]);
    }
    if (
      dto.jdCriteriaQuestionCount !== undefined &&
      dto.questionCount !== undefined &&
      dto.jdCriteriaQuestionCount !== dto.questionCount
    ) {
      questionCountInvalid('신규 질문 개수와 legacy 질문 개수가 일치하지 않습니다.', [
        { field: 'questionCount', reason: 'LEGACY_COUNT_MISMATCH' },
      ]);
    }
    if (
      policy.policyVersion > 0 &&
      requestedCount !== policy.jdCriteriaQuestionCount
    ) {
      questionCountInvalid('저장된 JD 공통 질문 개수와 요청값이 일치하지 않습니다.', [
        { field: 'jdCriteriaQuestionCount', reason: 'POLICY_COUNT_MISMATCH' },
      ]);
    }
    if (
      dto.expectedPolicyVersion !== undefined &&
      dto.expectedPolicyVersion !== policy.policyVersion
    ) {
      conflict('질문 생성 정책이 변경되었습니다. 새로고침 후 다시 요청해주세요.');
    }
    if (criteria.length === 0) {
      validationFailed('저장된 평가 기준이 필요합니다.', [
        { field: 'postingId', reason: 'CRITERIA_REQUIRED' },
      ]);
    }

    const questionCount = policy.policyVersion > 0
      ? policy.jdCriteriaQuestionCount
      : requestedCount as number;
    const criteriaPayload =
      policy.evaluationFramework === 'NCS_3_PROFILE_V1'
        ? this.buildNcsGenerationCriteria(policy, criteria)
        : buildLegacyGenerationCriteria(questionCount, criteria);

    return {
      postingId: posting.postingId,
      jobDescription: posting.jobDescription.trim(),
      questionCount,
      jdCriteriaQuestionCount: questionCount,
      source: 'JD_CRITERIA' as const,
      evaluationFramework: policy.evaluationFramework,
      policyVersion: policy.policyVersion,
      criteriaVersion: policy.criteriaVersion,
      criteria: await Promise.all(
        criteriaPayload.map(async ({ criterion, questionCount: allocationCount }) => {
          const tag = await this.repository.findTag(criterion.tagId);
          if (!tag) notFound('평가 태그를 찾을 수 없습니다.');
          return {
            criterionId: criterion.criterionId,
            name: tag.name,
            category: tag.category,
            description: criterion.description ?? undefined,
            weight: criterion.weight,
            questionCount: allocationCount,
            ncsProfileId: criterion.ncsProfileId ?? undefined,
            ncsQuestionMode: criterion.ncsQuestionMode ?? undefined,
            ncsProfileVersion: criterion.ncsProfileVersion ?? undefined,
          };
        }),
      ),
    };
  }

  async prepareQuestionSetGeneration(
    currentUser: CurrentUser,
    dto: QuestionSetGenerationRequest,
  ) {
    const posting = await this.getOwnedPosting(currentUser, dto.postingId);
    const criteria = await this.repository.listCriteria(posting.postingId);
    const policy =
      (await this.repository.getQuestionGenerationPolicy(posting.postingId)) ??
      defaultQuestionGenerationPolicy(posting.postingId);
    const questionCount =
      policy.evaluationFramework === 'NCS_3_PROFILE_V1'
        ? policy.jdCriteriaQuestionCount
        : dto.questionCount;

    if (
      policy.evaluationFramework === 'NCS_3_PROFILE_V1' &&
      dto.questionCount !== questionCount
    ) {
      questionCountInvalid('NCS 질문 세트 개수는 저장된 JD 공통 질문 개수와 일치해야 합니다.', [
        { field: 'questionCount', reason: 'POLICY_COUNT_MISMATCH' },
      ]);
    }
    if (questionCount < 1 || criteria.length === 0) {
      validationFailed('질문 세트 생성을 위한 질문 개수와 평가 기준을 확인해주세요.');
    }

    return {
      postingId: posting.postingId,
      questionCount,
      criteria:
        policy.evaluationFramework === 'NCS_3_PROFILE_V1'
          ? await this.mapCriteria(criteria).then((items) =>
              items.map((criterion) => ({
                criterionId: criterion.criterionId,
                name: criterion.tagName,
                weight: criterion.weight,
              })),
            )
          : dto.criteria,
      questionTypes: dto.questionTypes,
      policyVersion: policy.policyVersion,
      criteriaVersion: policy.criteriaVersion,
      source: 'JD_CRITERIA' as const,
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

    const origin = dto.origin ?? 'MANUAL';
    const policy =
      (await this.repository.getQuestionGenerationPolicy(posting.postingId)) ??
      defaultQuestionGenerationPolicy(posting.postingId);
    const bindingCriteria =
      policy.evaluationFramework === 'NCS_3_PROFILE_V1'
        ? await this.resolveQuestionBindingCriteria(
            posting.postingId,
            dto.criterionId,
            dto.criterionIds,
          )
        : [criterion];
    const ncsSnapshot =
      policy.evaluationFramework === 'NCS_3_PROFILE_V1'
        ? {
            ncsProfileId: criterion.ncsProfileId,
            ncsQuestionMode: criterion.ncsQuestionMode,
            ncsProfileVersion: criterion.ncsProfileVersion,
          }
        : {
            ncsProfileId: null,
            ncsQuestionMode: null,
            ncsProfileVersion: null,
          };
    const aiCandidate =
      origin === 'AI_GENERATED'
        ? await this.getApplicableAiQuestionCandidate(
            currentUser,
            posting.postingId,
            criterion,
            dto,
            policy.evaluationFramework,
          )
        : null;
    if (origin === 'MANUAL' && dto.sourceProcessLogId !== undefined) {
      validationFailed('수동 질문에는 AI 작업 ID를 지정할 수 없습니다.', [
        { field: 'sourceProcessLogId', reason: 'MANUAL_QUESTION' },
      ]);
    }

    const question = await this.repository.createQuestion({
      companyId: posting.companyId,
      postingId: posting.postingId,
      criterionId: criterion.criterionId,
      questionType: dto.questionType,
      content: dto.content,
      origin,
      generationSource: aiCandidate ? 'JD_CRITERIA' : null,
      ncsProfileId: aiCandidate?.ncsProfileId ?? ncsSnapshot.ncsProfileId,
      ncsQuestionMode:
        aiCandidate?.ncsQuestionMode ?? ncsSnapshot.ncsQuestionMode,
      ncsProfileVersion:
        aiCandidate?.ncsProfileVersion ?? ncsSnapshot.ncsProfileVersion,
      alignmentStatus:
        aiCandidate?.alignmentStatus ?? 'NOT_EVALUATED',
      alignmentScore: aiCandidate?.alignmentScore ?? null,
      alignmentReason: aiCandidate?.alignmentReason ?? null,
      evaluatorVersion: aiCandidate?.evaluatorVersion ?? null,
      sourceProcessLogId: dto.sourceProcessLogId ?? null,
      ncsBindings:
        policy.evaluationFramework === 'NCS_3_PROFILE_V1'
          ? buildQuestionNcsBindings(bindingCriteria, aiCandidate)
          : [],
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
    const policy =
      (await this.repository.getQuestionGenerationPolicy(question.postingId)) ??
      defaultQuestionGenerationPolicy(question.postingId);
    const bindingCriteria =
      policy.evaluationFramework === 'NCS_3_PROFILE_V1'
        ? await this.resolveQuestionBindingCriteria(
            question.postingId,
            dto.criterionId,
            dto.criterionIds,
          )
        : [criterion];
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
      ncsProfileId: criterion.ncsProfileId,
      ncsQuestionMode: criterion.ncsQuestionMode,
      ncsProfileVersion: criterion.ncsProfileVersion,
      alignmentStatus: 'NOT_EVALUATED',
      alignmentScore: null,
      alignmentReason: '질문 내용 또는 평가 기준이 수정되어 정렬 재검증이 필요합니다.',
      evaluatorVersion: null,
      ncsBindings:
        policy.evaluationFramework === 'NCS_3_PROFILE_V1'
          ? buildQuestionNcsBindings(bindingCriteria, null)
          : [],
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
    const policy =
      (await this.repository.getQuestionGenerationPolicy(posting.postingId)) ??
      defaultQuestionGenerationPolicy(posting.postingId);
    if (
      policy.evaluationFramework === 'NCS_3_PROFILE_V1' &&
      dto.items.length !== policy.jdCriteriaQuestionCount
    ) {
      questionCountInvalid('NCS 질문 세트는 저장된 JD 공통 질문 개수와 일치해야 합니다.', [
        { field: 'items', reason: 'POLICY_COUNT_MISMATCH' },
      ]);
    }
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
      if (
        policy.evaluationFramework === 'NCS_3_PROFILE_V1' &&
        (question.generationSource !== 'JD_CRITERIA' ||
          question.alignmentStatus !== 'ALIGNED')
      ) {
        ncsBindingInvalid('정렬 검증을 통과한 JD 공통 질문만 NCS 질문 세트에 포함할 수 있습니다.', [
          { field: 'items[].questionId', reason: 'QUESTION_NOT_ALIGNED' },
        ]);
      }
      if (
        item.criterionId !== undefined &&
        item.criterionId !== null &&
        item.criterionId !== question.criterionId
      ) {
        validationFailed('질문의 평가 기준과 질문 세트 항목이 일치하지 않습니다.', [
          { field: 'items[].criterionId', reason: 'QUESTION_CRITERION_MISMATCH' },
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

  private buildNcsGenerationCriteria(
    policy: QuestionGenerationPolicyRecord,
    criteria: EvaluationCriterionRecord[],
  ) {
    assertNcsCriteria(criteria);
    const allocations = buildQuestionAllocations(policy, criteria).filter(
      (allocation) => allocation.source === 'JD_CRITERIA',
    );
    const result = allocations.map((allocation) => {
      const criterion = criteria.find(
        (item) =>
          item.ncsProfileId === allocation.ncsProfileId &&
          item.ncsQuestionMode === allocation.ncsQuestionMode,
      );
      if (!criterion) {
        ncsBindingInvalid('질문 배분에 연결된 NCS 평가 기준을 찾을 수 없습니다.', [
          { field: 'criteria', reason: 'ALLOCATION_BINDING_MISSING' },
        ]);
      }
      return { criterion, questionCount: allocation.count };
    });
    if (
      result.reduce((sum, item) => sum + item.questionCount, 0) !==
      policy.jdCriteriaQuestionCount
    ) {
      questionCountInvalid('JD 공통 질문 배분 합계가 저장된 정책과 일치하지 않습니다.', [
        { field: 'jdCriteriaQuestionCount', reason: 'ALLOCATION_TOTAL_MISMATCH' },
      ]);
    }
    return result;
  }

  private async getApplicableAiQuestionCandidate(
    currentUser: CurrentUser,
    postingId: number,
    criterion: EvaluationCriterionRecord,
    dto: CreateInterviewQuestionDto,
    evaluationFramework: EvaluationFramework,
  ): Promise<ApplicableAiQuestionCandidate> {
    if (dto.sourceProcessLogId === undefined) {
      validationFailed('AI 추천 질문은 생성 작업 ID가 필요합니다.', [
        { field: 'sourceProcessLogId', reason: 'REQUIRED_FOR_AI_ORIGIN' },
      ]);
    }
    const process = await this.repository.findQuestionGenerationProcess(
      dto.sourceProcessLogId,
    );
    if (
      !process ||
      process.processType !== 'QUESTION_GENERATE' ||
      process.status !== 'COMPLETED' ||
      !process.inputRef ||
      !process.outputRef
    ) {
      validationFailed('완료된 질문 생성 작업을 확인할 수 없습니다.', [
        { field: 'sourceProcessLogId', reason: 'COMPLETED_PROCESS_REQUIRED' },
      ]);
    }

    const input = parseJsonRecord(process.inputRef);
    const output = parseJsonRecord(process.outputRef);
    const requestedBy = parseRecord(input?.requestedBy);
    const inputPayload = parseRecord(input?.payload);
    if (
      Number(requestedBy?.companyId) !== currentUser.companyId ||
      Number(inputPayload?.postingId) !== postingId ||
      Number(output?.postingId) !== postingId ||
      Number(output?.sourceProcessLogId) !== dto.sourceProcessLogId
    ) {
      forbidden('다른 기업 또는 공고의 AI 질문 생성 결과는 적용할 수 없습니다.');
    }

    const candidates = Array.isArray(output?.questionCandidates)
      ? output.questionCandidates
      : [];
    const candidate = candidates
      .map(parseQuestionCandidate)
      .find(
        (item): item is ApplicableAiQuestionCandidate =>
          item !== null &&
          item.criterionId === criterion.criterionId &&
          normalizeQuestionContent(item.content) ===
            normalizeQuestionContent(dto.content),
      );
    if (!candidate) {
      validationFailed('AI 생성 결과에서 일치하는 질문 후보를 찾을 수 없습니다.', [
        { field: 'content', reason: 'PROCESS_OUTPUT_MISMATCH' },
      ]);
    }

    if (evaluationFramework === 'NCS_3_PROFILE_V1') {
      if (
        candidate.source !== 'JD_CRITERIA' ||
        candidate.alignmentStatus !== 'ALIGNED' ||
        candidate.ncsProfileId !== criterion.ncsProfileId ||
        candidate.ncsQuestionMode !== criterion.ncsQuestionMode ||
        candidate.ncsProfileVersion !== criterion.ncsProfileVersion
      ) {
        ncsBindingInvalid('NCS 정렬 검증을 통과한 동일 평가 기준 질문만 저장할 수 있습니다.', [
          { field: 'sourceProcessLogId', reason: 'ALIGNED_CANDIDATE_REQUIRED' },
        ]);
      }
      return candidate;
    }

    return {
      ...candidate,
      source: 'JD_CRITERIA',
      ncsProfileId: null,
      ncsQuestionMode: null,
      ncsProfileVersion: null,
      alignmentStatus: 'NOT_EVALUATED',
      alignmentScore: null,
      alignmentReason: null,
      evaluatorVersion: null,
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

  private async getOwnedResumeQuestionState(
    currentUser: CurrentUser,
    applicationId: number,
  ): Promise<ResumeQuestionApplicationRecord> {
    this.assertCompanyUser(currentUser);
    if (!Number.isInteger(applicationId) || applicationId <= 0) {
      validationFailed('applicationId를 확인해주세요.', [
        { field: 'applicationId', reason: 'POSITIVE_INTEGER_REQUIRED' },
      ]);
    }
    const state = await this.repository.findResumeQuestionGeneration(applicationId);
    if (!state) {
      notFound('지원서를 찾을 수 없습니다.');
    }
    if (state.companyId !== currentUser.companyId) {
      forbidden('지원서 접근 권한이 없습니다.');
    }
    return state;
  }

  private resumeQuestionStatus(
    state: ResumeQuestionApplicationRecord,
  ): ResumeQuestionGenerationStatus {
    if (state.policy.resumeQuestionCount <= 0) return 'DISABLED';
    if (state.applicationStatus === 'DRAFT') return 'WAITING_APPLICATION';
    if (state.documentStatus !== 'EXTRACTED') return 'WAITING_DOCUMENT';
    if (!state.currentBatch) return state.hasStaleBatch ? 'STALE' : 'WAITING_DOCUMENT';
    return state.currentBatch.status;
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

  private async resolveQuestionBindingCriteria(
    postingId: number,
    primaryCriterionId: number,
    requestedCriterionIds?: number[],
  ): Promise<EvaluationCriterionRecord[]> {
    const criterionIds = requestedCriterionIds ?? [primaryCriterionId];
    if (
      criterionIds.length < 1 ||
      criterionIds.length > 2 ||
      criterionIds[0] !== primaryCriterionId ||
      new Set(criterionIds).size !== criterionIds.length
    ) {
      ncsBindingInvalid('질문에는 중복 없이 1~2개의 NCS 평가 기준을 연결해야 합니다.', [
        { field: 'criterionIds', reason: 'CARDINALITY_OR_ORDER_INVALID' },
      ]);
    }

    const criteria = await Promise.all(
      criterionIds.map((criterionId) =>
        this.findPostingCriterion(postingId, criterionId),
      ),
    );
    const profiles = criteria.map((criterion) => criterion.ncsProfileId);
    if (
      criteria.some(
        (criterion) =>
          criterion.ncsProfileId === null ||
          criterion.ncsProfileVersion === null ||
          !NCS_PROFILE_IDS.includes(criterion.ncsProfileId),
      ) ||
      new Set(profiles).size !== profiles.length
    ) {
      ncsBindingInvalid('질문 NCS binding에는 서로 다른 canonical profile이 필요합니다.', [
        { field: 'criterionIds', reason: 'NCS_PROFILE_INVALID' },
      ]);
    }
    return criteria;
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
      generationSource: question.generationSource,
      ncsProfileId: question.ncsProfileId,
      ncsQuestionMode: question.ncsQuestionMode,
      ncsProfileVersion: question.ncsProfileVersion,
      alignmentStatus: question.alignmentStatus,
      alignmentScore: question.alignmentScore,
      alignmentReason: question.alignmentReason,
      evaluatorVersion: question.evaluatorVersion,
      sourceProcessLogId: question.sourceProcessLogId,
      ncsBindings: question.ncsBindings,
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

type ApplicableAiQuestionCandidate = {
  criterionId: number;
  content: string;
  source: QuestionGenerationSource | null;
  ncsProfileId: NcsProfileId | null;
  ncsQuestionMode: NcsQuestionMode | null;
  ncsProfileVersion: string | null;
  alignmentStatus: QuestionAlignmentStatus;
  alignmentScore: number | null;
  alignmentReason: string | null;
  evaluatorVersion: string | null;
};

function buildQuestionNcsBindings(
  criteria: EvaluationCriterionRecord[],
  aiCandidate: ApplicableAiQuestionCandidate | null,
): QuestionNcsBindingRecord[] {
  return criteria.map((criterion, index) => ({
    criterionId: criterion.criterionId,
    ncsProfileId: criterion.ncsProfileId as NcsProfileId,
    ncsProfileVersion: criterion.ncsProfileVersion as string,
    alignmentStatus:
      aiCandidate?.ncsProfileId === criterion.ncsProfileId
        ? aiCandidate.alignmentStatus
        : 'NOT_EVALUATED',
    alignmentScore:
      aiCandidate?.ncsProfileId === criterion.ncsProfileId
        ? aiCandidate.alignmentScore
        : null,
    alignmentReason:
      aiCandidate?.ncsProfileId === criterion.ncsProfileId
        ? aiCandidate.alignmentReason
        : null,
    evaluatorVersion:
      aiCandidate?.ncsProfileId === criterion.ncsProfileId
        ? aiCandidate.evaluatorVersion
        : null,
    bindingOrder: index + 1,
  }));
}

function buildLegacyGenerationCriteria(
  questionCount: number,
  criteria: EvaluationCriterionRecord[],
) {
  const counts = new Map<number, number>();
  const ordered = [...criteria].sort((a, b) => a.sortOrder - b.sortOrder);
  for (let index = 0; index < questionCount; index += 1) {
    const criterion = ordered[index % ordered.length];
    counts.set(criterion.criterionId, (counts.get(criterion.criterionId) ?? 0) + 1);
  }
  return ordered
    .filter((criterion) => counts.has(criterion.criterionId))
    .map((criterion) => ({
      criterion,
      questionCount: counts.get(criterion.criterionId) ?? 0,
    }));
}

function parseQuestionCandidate(value: unknown): ApplicableAiQuestionCandidate | null {
  const candidate = parseRecord(value);
  if (!candidate) return null;
  const criterionId = Number(candidate.criterionId);
  const content = typeof candidate.content === 'string' ? candidate.content.trim() : '';
  if (!Number.isInteger(criterionId) || criterionId < 1 || !content) return null;

  const alignmentStatus = candidate.alignmentStatus;
  if (
    alignmentStatus !== 'NOT_EVALUATED' &&
    alignmentStatus !== 'ALIGNED' &&
    alignmentStatus !== 'LOW_ALIGNMENT' &&
    alignmentStatus !== 'REVIEW_REQUIRED'
  ) {
    return null;
  }
  const alignmentScore =
    candidate.alignmentScore === null || candidate.alignmentScore === undefined
      ? null
      : Number(candidate.alignmentScore);
  if (alignmentScore !== null && !Number.isFinite(alignmentScore)) return null;

  return {
    criterionId,
    content,
    source:
      candidate.source === 'JD_CRITERIA' || candidate.source === 'RESUME_PERSONALIZED'
        ? candidate.source
        : null,
    ncsProfileId:
      candidate.ncsProfileId === 'JOB_TECHNICAL' ||
      candidate.ncsProfileId === 'COLLABORATION_COMMUNICATION' ||
      candidate.ncsProfileId === 'PROBLEM_SOLVING'
        ? candidate.ncsProfileId
        : null,
    ncsQuestionMode:
      candidate.ncsQuestionMode === 'EXPERIENCE_BEHAVIOR' ||
      candidate.ncsQuestionMode === 'TECHNICAL_KNOWLEDGE' ||
      candidate.ncsQuestionMode === 'SITUATIONAL_DESIGN'
        ? candidate.ncsQuestionMode
        : null,
    ncsProfileVersion:
      typeof candidate.ncsProfileVersion === 'string'
        ? candidate.ncsProfileVersion
        : null,
    alignmentStatus,
    alignmentScore,
    alignmentReason:
      typeof candidate.alignmentReason === 'string'
        ? candidate.alignmentReason
        : null,
    evaluatorVersion:
      typeof candidate.evaluatorVersion === 'string'
        ? candidate.evaluatorVersion
        : null,
  };
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  try {
    return parseRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

function parseRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeQuestionContent(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeCriterionTagText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

const NCS_PROFILE_IDS: NcsProfileId[] = [
  'JOB_TECHNICAL',
  'COLLABORATION_COMMUNICATION',
  'PROBLEM_SOLVING',
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
    ncsBindingInvalid('NCS 평가 기준은 기술·직무, 협업·의사소통, 문제 해결력 profile을 각각 하나씩 포함해야 합니다.', [
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
