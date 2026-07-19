import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  activeNcsProfileIds,
  validateNcsProfileWeights,
  validateStandardQuestionCounts,
  type CurrentUser,
} from '@init/common';
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
  configurationLocked,
  aiProcessFailed,
  forbidden,
  ncsBindingInvalid,
  ncsActiveProfileInvalid,
  ncsQuestionCoverageInvalid,
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
  InterviewPublicationReadiness,
  InterviewPublicationReadinessReason,
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
  NcsActiveProfileCoverageRecord,
  NcsQuestionImpactRecord,
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
import { toAiJobDescriptionText } from './job-description-text';

type CommonQuestionGenerationRequest = {
  postingId: number;
  jdCriteriaQuestionCount?: number;
  expectedPolicyVersion?: number;
  questionCount?: number;
};

const COMPANY_QUESTION_REVIEW_EVALUATOR_VERSION = 'company-question-review-v1';
const COMPANY_QUESTION_CREATE_REVIEW_REASON =
  '기업 면접관이 질문을 작성하고 NCS 평가 기준 연결을 확인했습니다.';
const COMPANY_QUESTION_EDIT_REVIEW_REASON =
  '기업 면접관이 질문을 수정하고 NCS 평가 기준 연결을 다시 확인했습니다.';

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
      const result = await this.candidateService.prepareRecruitingInterviewSessionSnapshot(
        dto.applicationId,
        dto.mode ?? 'STANDARD',
      );
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
        sessionMode: result.sessionMode ?? dto.mode ?? 'STANDARD',
        questions: result.questions ?? [],
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

  async getResumeQuestions(currentUser: CurrentUser, applicationId: number, usageScope: 'STANDARD' | 'DEMO_PRESET' = 'STANDARD') {
    const state = await this.getOwnedResumeQuestionState(currentUser, applicationId, usageScope);
    const status = this.resumeQuestionStatus(state);
    const batch = state.currentBatch;
    const items = status === 'READY' || status === 'REVIEW_REQUIRED'
      ? batch?.questions ?? []
      : [];

    return {
      applicationId: state.applicationId,
      usageScope,
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
    const usageScope = dto.usageScope ?? 'STANDARD';
    const state = await this.getOwnedResumeQuestionState(currentUser, applicationId, usageScope);
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
    const configurationLocked = await this.repository.isConfigurationLocked(
      posting.postingId,
    );
    const questionImpactByProfile = buildQuestionImpactByProfile(questions);
    const activeQuestionSet = await this.repository.findActiveQuestionSet(
      posting.postingId,
    );
    const activeProfileCoverage = buildActiveProfileCoverage(
      policy.evaluationFramework,
      criteria,
      activeQuestionSet,
    );
    const questionSetRequiresReconfirmation = requiresQuestionSetReconfirmation(
      policy,
      activeQuestionSet,
      activeProfileCoverage,
    );

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
        activeProfileCoverage,
        questionSetRequiresReconfirmation,
      },
      configurationLocked,
      configurationLockedReason: configurationLocked
        ? 'SUBMITTED_APPLICATION_EXISTS'
        : null,
      questionImpactByProfile,
      questionSetRequiresReconfirmation,
    };
  }

  async getPublicationReadiness(
    currentUser: CurrentUser,
    postingId: number,
  ): Promise<InterviewPublicationReadiness> {
    const posting = await this.getOwnedPosting(currentUser, postingId);
    const [criteria, storedPolicy, activeQuestionSet, hasTimePolicy] =
      await Promise.all([
        this.repository.listCriteria(posting.postingId),
        this.repository.getQuestionGenerationPolicy(posting.postingId),
        this.repository.findActiveQuestionSet(posting.postingId),
        this.repository.hasTimePolicy(posting.postingId),
      ]);

    const reasons: InterviewPublicationReadinessReason[] = [];
    if (!storedPolicy) {
      reasons.push('QUESTION_GENERATION_POLICY_MISSING');
    }

    const policy = storedPolicy ?? defaultQuestionGenerationPolicy(posting.postingId);
    const activeProfileCoverage = buildActiveProfileCoverage(
      policy.evaluationFramework,
      criteria,
      activeQuestionSet,
    );
    if (!isPublishableCriteria(policy.evaluationFramework, criteria)) {
      reasons.push('CRITERIA_NOT_READY');
    }
    if (!activeQuestionSet) {
      reasons.push('ACTIVE_QUESTION_SET_MISSING');
    } else if (
      requiresQuestionSetReconfirmation(
        policy,
        activeQuestionSet,
        activeProfileCoverage,
      )
    ) {
      reasons.push('QUESTION_SET_RECONFIRMATION_REQUIRED');
    }
    if (!hasTimePolicy) {
      reasons.push('TIME_POLICY_MISSING');
    }

    return {
      canPublish: reasons.length === 0,
      reasons,
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
    await this.assertConfigurationMutable(posting.postingId);
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
          isNcsFramework(evaluationFramework) ? tag.ncsProfileId : null,
        ncsQuestionMode:
          isNcsFramework(evaluationFramework)
            ? tag.defaultNcsQuestionMode
            : null,
        ncsProfileVersion:
          isNcsFramework(evaluationFramework)
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

    if (evaluationFramework === 'NCS_ACTIVE_PROFILE_V2') {
      assertNcsActiveCriteria(normalizedCriteria);
    }

    const nextActiveProfileIds =
      evaluationFramework === 'NCS_ACTIVE_PROFILE_V2'
        ? activeNcsProfileIds('NCS_ACTIVE_PROFILE_V2', toProfileWeights(normalizedCriteria))
        : NCS_PROFILE_IDS;
    const currentActiveProfileIds =
      currentPolicy?.evaluationFramework === 'NCS_ACTIVE_PROFILE_V2'
        ? activeNcsProfileIds(
            'NCS_ACTIVE_PROFILE_V2',
            toProfileWeights(existingCriteria),
          )
        : NCS_PROFILE_IDS;
    const deactivatedProfileIds = currentActiveProfileIds.filter(
      (profileId) => !nextActiveProfileIds.includes(profileId),
    );
    const currentQuestions = await this.repository.listQuestions(posting.postingId);
    const questionImpactByProfile = buildQuestionImpactByProfile(currentQuestions);
    const impactedDeactivations = questionImpactByProfile.filter(
      (impact) =>
        deactivatedProfileIds.includes(impact.ncsProfileId) &&
        impact.exclusivelyBoundActiveQuestionCount + impact.multiBoundActiveQuestionCount > 0,
    );
    if (impactedDeactivations.length > 0 && dto.confirmQuestionImpact !== true) {
      conflict(
        '비활성화할 평가 기준에 연결된 질문이 있습니다. 질문 영향을 확인한 뒤 다시 저장해주세요.',
        impactedDeactivations.map((impact) => ({
          field: 'confirmQuestionImpact',
          reason: `QUESTION_IMPACT_CONFIRMATION_REQUIRED:${impact.ncsProfileId}:${impact.exclusivelyBoundActiveQuestionCount}:${impact.multiBoundActiveQuestionCount}`,
        })),
      );
    }

    const saved = await this.repository.replaceCriteria(
      posting.postingId,
      evaluationFramework,
      normalizedCriteria,
      { deactivatedProfileIds },
    );
    await this.queuePersonalizedQuestionRegenerations(
      posting.postingId,
      '평가 기준 변경 반영',
    );
    const savedQuestions = await this.repository.listQuestions(posting.postingId);
    const activeQuestionSet = await this.repository.findActiveQuestionSet(
      posting.postingId,
    );
    const activeProfileCoverage = buildActiveProfileCoverage(
      saved.policy.evaluationFramework,
      saved.criteria,
      activeQuestionSet,
    );
    const questionSetRequiresReconfirmation = requiresQuestionSetReconfirmation(
      saved.policy,
      activeQuestionSet,
      activeProfileCoverage,
    );
    await this.returnOpenPostingToDraftWhenQuestionSetIsStale(
      posting,
      questionSetRequiresReconfirmation,
    );
    return {
      postingId: posting.postingId,
      criteria: await this.mapCriteria(saved.criteria),
      totalWeight,
      evaluationFramework: saved.policy.evaluationFramework,
      criteriaVersion: saved.policy.criteriaVersion,
      configurationLocked: false,
      configurationLockedReason: null,
      questionImpactByProfile: buildQuestionImpactByProfile(savedQuestions),
      questionSetRequiresReconfirmation,
    };
  }

  async updateQuestionGenerationPolicy(
    currentUser: CurrentUser,
    dto: UpdateQuestionGenerationPolicyDto,
  ): Promise<QuestionGenerationPolicyResponseDto> {
    const posting = await this.getOwnedPosting(currentUser, dto.postingId);
    await this.assertConfigurationMutable(posting.postingId);
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
    if (current.evaluationFramework === 'NCS_ACTIVE_PROFILE_V2') {
      assertNcsActiveCriteria(criteria);
      const countIssues = validateStandardQuestionCounts(
        current.evaluationFramework,
        dto.jdCriteriaQuestionCount,
        dto.resumeQuestionCount,
      );
      if (countIssues.length > 0) {
        questionCountInvalid(
          '동적 NCS 면접은 공통 질문 3개 이상, 개인화 질문 1개 이상이어야 합니다.',
          countIssues.map((issue) => ({
            field: issue.path,
            reason: issue.code,
          })),
        );
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

    const policyChanged = saved.policyVersion !== current.policyVersion;
    const warnings = policyChanged
      ? await this.queuePersonalizedQuestionRegenerations(
          posting.postingId,
          '질문 생성 정책 변경 반영',
        )
      : [];

    const activeQuestionSet = await this.repository.findActiveQuestionSet(
      posting.postingId,
    );
    const activeProfileCoverage = buildActiveProfileCoverage(
      saved.evaluationFramework,
      criteria,
      activeQuestionSet,
    );
    const questionSetRequiresReconfirmation = requiresQuestionSetReconfirmation(
      saved,
      activeQuestionSet,
      activeProfileCoverage,
    );
    await this.returnOpenPostingToDraftWhenQuestionSetIsStale(
      posting,
      questionSetRequiresReconfirmation,
    );
    return {
      ...saved,
      allocations: buildQuestionAllocations(saved, criteria),
      activeProfileCoverage,
      questionSetRequiresReconfirmation,
      warnings,
    };
  }

  async prepareCommonQuestionGeneration(
    currentUser: CurrentUser,
    dto: CommonQuestionGenerationRequest,
  ) {
    const posting = await this.getOwnedPosting(currentUser, dto.postingId);
    await this.assertConfigurationMutable(posting.postingId);
    const criteria = await this.repository.listCriteria(posting.postingId);
    const policy =
      (await this.repository.getQuestionGenerationPolicy(posting.postingId)) ??
      defaultQuestionGenerationPolicy(posting.postingId);
    const requestedCount = dto.jdCriteriaQuestionCount ?? dto.questionCount;

    const jobDescription = toAiJobDescriptionText(posting.jobDescription);
    if (!jobDescription) {
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
      isNcsFramework(policy.evaluationFramework)
        ? this.buildNcsGenerationCriteria(policy, criteria)
        : buildLegacyGenerationCriteria(questionCount, criteria);

    return {
      postingId: posting.postingId,
      jobDescription,
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

  async createQuestion(
    currentUser: CurrentUser,
    dto: CreateInterviewQuestionDto,
  ): Promise<CreateInterviewQuestionResponseDto> {
    const posting = await this.getOwnedPosting(currentUser, dto.postingId);
    await this.assertConfigurationMutable(posting.postingId);
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
      isNcsFramework(policy.evaluationFramework)
        ? await this.resolveQuestionBindingCriteria(
            posting.postingId,
            dto.criterionId,
            dto.criterionIds,
            policy.evaluationFramework === 'NCS_ACTIVE_PROFILE_V2',
          )
        : [criterion];
    const ncsSnapshot =
      isNcsFramework(policy.evaluationFramework)
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
    const isCompanyReviewedNcsQuestion =
      isNcsFramework(policy.evaluationFramework) && origin === 'MANUAL';
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
      generationSource:
        aiCandidate || isCompanyReviewedNcsQuestion ? 'JD_CRITERIA' : null,
      ncsProfileId: aiCandidate?.ncsProfileId ?? ncsSnapshot.ncsProfileId,
      ncsQuestionMode:
        aiCandidate?.ncsQuestionMode ?? ncsSnapshot.ncsQuestionMode,
      ncsProfileVersion:
        aiCandidate?.ncsProfileVersion ?? ncsSnapshot.ncsProfileVersion,
      alignmentStatus: aiCandidate?.alignmentStatus ??
        (isCompanyReviewedNcsQuestion ? 'ALIGNED' : 'NOT_EVALUATED'),
      alignmentScore: aiCandidate?.alignmentScore ?? null,
      alignmentReason: aiCandidate?.alignmentReason ??
        (isCompanyReviewedNcsQuestion ? COMPANY_QUESTION_CREATE_REVIEW_REASON : null),
      evaluatorVersion: aiCandidate?.evaluatorVersion ??
        (isCompanyReviewedNcsQuestion ? COMPANY_QUESTION_REVIEW_EVALUATOR_VERSION : null),
      sourceProcessLogId: dto.sourceProcessLogId ?? null,
      ncsBindings: isNcsFramework(policy.evaluationFramework)
        ? isCompanyReviewedNcsQuestion
          ? buildCompanyReviewedNcsBindings(bindingCriteria, COMPANY_QUESTION_CREATE_REVIEW_REASON)
          : buildQuestionNcsBindings(bindingCriteria, aiCandidate)
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
    await this.assertConfigurationMutable(question.postingId);
    const criterion = await this.findPostingCriterion(
      question.postingId,
      dto.criterionId,
    );
    const policy =
      (await this.repository.getQuestionGenerationPolicy(question.postingId)) ??
      defaultQuestionGenerationPolicy(question.postingId);
    const bindingCriteria =
      isNcsFramework(policy.evaluationFramework)
        ? await this.resolveQuestionBindingCriteria(
            question.postingId,
            dto.criterionId,
            dto.criterionIds,
            policy.evaluationFramework === 'NCS_ACTIVE_PROFILE_V2',
          )
        : [criterion];
    const duplicate = await this.repository.findDuplicateQuestion(
      question.postingId,
      dto.content,
    );
    if (duplicate && duplicate.questionId !== questionId) {
      conflict('이미 등록된 질문입니다.');
    }

    const isCompanyReviewedNcsQuestion =
      isNcsFramework(policy.evaluationFramework);

    const saved = await this.repository.updateQuestion(questionId, {
      criterionId: criterion.criterionId,
      questionType: dto.questionType,
      content: dto.content,
      isAiEdited:
        question.origin === 'AI_GENERATED' ? true : question.isAiEdited,
      generationSource:
        isCompanyReviewedNcsQuestion ? 'JD_CRITERIA' : question.generationSource,
      ncsProfileId: criterion.ncsProfileId,
      ncsQuestionMode: criterion.ncsQuestionMode,
      ncsProfileVersion: criterion.ncsProfileVersion,
      alignmentStatus: isCompanyReviewedNcsQuestion ? 'ALIGNED' : 'NOT_EVALUATED',
      alignmentScore: null,
      alignmentReason: isCompanyReviewedNcsQuestion
        ? COMPANY_QUESTION_EDIT_REVIEW_REASON
        : '질문 내용 또는 평가 기준이 수정되어 정렬 재검증이 필요합니다.',
      evaluatorVersion: isCompanyReviewedNcsQuestion
        ? COMPANY_QUESTION_REVIEW_EVALUATOR_VERSION
        : null,
      ncsBindings:
        isNcsFramework(policy.evaluationFramework)
          ? buildCompanyReviewedNcsBindings(bindingCriteria, COMPANY_QUESTION_EDIT_REVIEW_REASON)
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
    await this.assertConfigurationMutable(question.postingId);
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
    await this.assertConfigurationMutable(posting.postingId);
    const policy =
      (await this.repository.getQuestionGenerationPolicy(posting.postingId)) ??
      defaultQuestionGenerationPolicy(posting.postingId);
    if (
      isNcsFramework(policy.evaluationFramework) &&
      dto.items.length !== policy.jdCriteriaQuestionCount
    ) {
      questionCountInvalid('NCS 질문 세트는 저장된 JD 공통 질문 개수와 일치해야 합니다.', [
        { field: 'items', reason: 'POLICY_COUNT_MISMATCH' },
      ]);
    }
    const ncsCriteria =
      isNcsFramework(policy.evaluationFramework)
        ? await this.repository.listCriteria(posting.postingId)
        : [];
    if (policy.evaluationFramework === 'NCS_3_PROFILE_V1') {
      assertNcsCriteria(ncsCriteria);
    } else if (policy.evaluationFramework === 'NCS_ACTIVE_PROFILE_V2') {
      assertNcsActiveCriteria(ncsCriteria);
    }
    const requiredProfileIds = isNcsFramework(policy.evaluationFramework)
      ? activeNcsProfileIds(
          policy.evaluationFramework,
          toProfileWeights(ncsCriteria),
        )
      : [];
    const ncsCriteriaById = new Map(
      ncsCriteria.map((criterion) => [criterion.criterionId, criterion]),
    );
    const ncsProfileCoverage = new Map<NcsProfileId, number>(
      NCS_PROFILE_IDS.map((profileId) => [profileId, 0]),
    );
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
      if (isNcsFramework(policy.evaluationFramework)) {
        for (const profileId of validateConfirmableNcsQuestion(
          question,
          ncsCriteriaById,
          requiredProfileIds,
        )) {
          ncsProfileCoverage.set(
            profileId,
            (ncsProfileCoverage.get(profileId) ?? 0) + 1,
          );
        }
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

    if (isNcsFramework(policy.evaluationFramework)) {
      const requiredCount =
        policy.evaluationFramework === 'NCS_3_PROFILE_V1' ? 2 : 1;
      const uncoveredProfiles = requiredProfileIds.filter(
        (profileId) =>
          (ncsProfileCoverage.get(profileId) ?? 0) < requiredCount,
      );
      if (uncoveredProfiles.length > 0) {
        ncsQuestionCoverageInvalid(
          `NCS 질문 세트는 활성 profile별로 최소 ${requiredCount}문항을 포함해야 합니다.`,
          uncoveredProfiles.map((profileId) => ({
            field: 'items',
            reason: `PROFILE_MIN_${requiredCount}:${profileId}`,
          })),
        );
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
    if (policy.evaluationFramework === 'NCS_ACTIVE_PROFILE_V2') {
      assertNcsActiveCriteria(criteria);
    } else {
      assertNcsCriteria(criteria);
    }
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

    if (isNcsFramework(evaluationFramework)) {
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

  private async returnOpenPostingToDraftWhenQuestionSetIsStale(
    posting: { postingId: number; status: string },
    questionSetRequiresReconfirmation: boolean,
  ): Promise<void> {
    if (posting.status === 'OPEN' && questionSetRequiresReconfirmation) {
      await this.repository.updatePostingStatus(posting.postingId, 'DRAFT');
    }
  }

  private async assertConfigurationMutable(postingId: number): Promise<void> {
    if (await this.repository.isConfigurationLocked(postingId)) {
      configurationLocked();
    }
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
    usageScope: 'STANDARD' | 'DEMO_PRESET' = 'STANDARD',
  ): Promise<ResumeQuestionApplicationRecord> {
    this.assertCompanyUser(currentUser);
    if (!Number.isInteger(applicationId) || applicationId <= 0) {
      validationFailed('applicationId를 확인해주세요.', [
        { field: 'applicationId', reason: 'POSITIVE_INTEGER_REQUIRED' },
      ]);
    }
    const state = await this.repository.findResumeQuestionGeneration(applicationId, usageScope);
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
    if ((state.usageScope ?? 'STANDARD') === 'STANDARD' && state.policy.resumeQuestionCount <= 0) return 'DISABLED';
    if (state.usageScope === 'DEMO_PRESET' && state.policy.evaluationFramework !== 'NCS_ACTIVE_PROFILE_V2') return 'DISABLED';
    if (state.applicationStatus === 'DRAFT') return 'WAITING_APPLICATION';
    if (state.documentStatus !== 'EXTRACTED') return 'WAITING_DOCUMENT';
    if (!state.currentBatch) return state.hasStaleBatch ? 'STALE' : 'WAITING_DOCUMENT';
    return state.currentBatch.status;
  }

  private async queuePersonalizedQuestionRegenerations(
    postingId: number,
    reason: string,
  ): Promise<string[]> {
    const states = await this.repository.listResumeQuestionGenerations(postingId);
    const eligible = states.filter((state) => {
      if (
        state.policy.resumeQuestionCount <= 0 ||
        state.applicationStatus !== 'SUBMITTED' ||
        state.documentStatus !== 'EXTRACTED' ||
        !state.currentInputVersion
      ) {
        return false;
      }
      const status = this.resumeQuestionStatus(state);
      return (
        ['FAILED', 'REVIEW_REQUIRED', 'STALE'].includes(status) ||
        (status === 'WAITING_DOCUMENT' && state.currentBatch === null)
      );
    });
    if (eligible.length === 0) return [];
    if (!this.queuePublisher) {
      return [`개인화 질문 자동 재생성 ${eligible.length}건을 queue에 등록하지 못했습니다.`];
    }

    let failedCount = 0;
    for (const state of eligible) {
      const job = await this.repository.createResumeQuestionRetry({ state, reason });
      try {
        await this.queuePublisher.publish({
          processLogId: job.processLogId,
          processType: 'RESUME_QUESTION_GENERATE',
          inputRef: JSON.stringify(job),
          attempt: job.attempt,
        });
      } catch (error) {
        failedCount += 1;
        const failureReason =
          error instanceof Error ? error.message : 'unknown queue publish failure';
        await this.repository.markResumeQuestionRetryQueueFailed(
          job.processLogId,
          failureReason,
        );
      }
    }

    return failedCount > 0
      ? [`개인화 질문 자동 재생성 ${failedCount}건을 queue에 등록하지 못했습니다.`]
      : [];
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
    requireActive = false,
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
    if (requireActive && criteria.some((criterion) => criterion.weight <= 0)) {
      ncsBindingInvalid('동적 NCS 질문에는 활성 평가 기준만 연결할 수 있습니다.', [
        { field: 'criterionIds', reason: 'INACTIVE_PROFILE_BOUND' },
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
          isActive: criterion.weight > 0,
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
      usageScope: question.usageScope,
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

function isNcsFramework(framework: EvaluationFramework): boolean {
  return (
    framework === 'NCS_3_PROFILE_V1' ||
    framework === 'NCS_ACTIVE_PROFILE_V2'
  );
}

function toProfileWeights(
  criteria: Array<{
    ncsProfileId: NcsProfileId | null;
    weight: number;
  }>,
) {
  return criteria
    .filter(
      (criterion): criterion is { ncsProfileId: NcsProfileId; weight: number } =>
        criterion.ncsProfileId !== null,
    )
    .map((criterion) => ({
      ncsProfileId: criterion.ncsProfileId,
      weight: criterion.weight,
    }));
}

function assertNcsActiveCriteria(
  criteria: Array<{
    ncsProfileId: NcsProfileId | null;
    ncsQuestionMode: NcsQuestionMode | null;
    ncsProfileVersion: string | null;
    weight: number;
  }>,
) {
  const profileWeights = toProfileWeights(criteria);
  const issues = validateNcsProfileWeights(
    'NCS_ACTIVE_PROFILE_V2',
    profileWeights,
  );
  const hasBindingGap = criteria.some(
    (criterion) =>
      criterion.ncsProfileId === null ||
      criterion.ncsQuestionMode === null ||
      criterion.ncsProfileVersion === null,
  );
  if (
    hasBindingGap ||
    issues.some(
      (issue) =>
        issue.code === 'CANONICAL_PROFILE_CONFIGURATION_INVALID' ||
        issue.code === 'ACTIVE_PROFILE_COUNT_INVALID',
    )
  ) {
    ncsActiveProfileInvalid(
      '동적 NCS 평가 기준은 canonical profile 세 개를 유지하고 최소 한 개를 활성화해야 합니다.',
      [{ field: 'criteria', reason: 'CANONICAL_ACTIVE_PROFILE_INVALID' }],
    );
  }
  const weightIssues = issues.filter(
    (issue) =>
      issue.code === 'WEIGHT_INVALID' || issue.code === 'WEIGHT_SUM_INVALID',
  );
  if (weightIssues.length > 0) {
    ncsWeightInvalid(
      '동적 NCS 배점은 0~100 정수이며 합계가 정확히 100이어야 합니다.',
      weightIssues.map((issue) => ({
        field: issue.path,
        reason: issue.code,
      })),
    );
  }
}

function isPublishableCriteria(
  framework: EvaluationFramework,
  criteria: EvaluationCriterionRecord[],
): boolean {
  if (criteria.length === 0) {
    return false;
  }
  if (framework === 'LEGACY') {
    return true;
  }
  if (framework === 'NCS_3_PROFILE_V1') {
    const profiles = criteria.map((criterion) => criterion.ncsProfileId);
    return (
      criteria.length === NCS_PROFILE_IDS.length &&
      NCS_PROFILE_IDS.every(
        (profileId) => profiles.filter((candidate) => candidate === profileId).length === 1,
      ) &&
      criteria.every(
        (criterion) =>
          criterion.ncsQuestionMode !== null &&
          criterion.ncsProfileVersion !== null,
      )
    );
  }

  const profileWeights = toProfileWeights(criteria);
  const issues = validateNcsProfileWeights('NCS_ACTIVE_PROFILE_V2', profileWeights);
  const hasBindingGap = criteria.some(
    (criterion) =>
      criterion.ncsProfileId === null ||
      criterion.ncsQuestionMode === null ||
      criterion.ncsProfileVersion === null,
  );
  return (
    !hasBindingGap &&
    !issues.some(
      (issue) =>
        issue.code === 'CANONICAL_PROFILE_CONFIGURATION_INVALID' ||
        issue.code === 'ACTIVE_PROFILE_COUNT_INVALID' ||
        issue.code === 'WEIGHT_INVALID' ||
        issue.code === 'WEIGHT_SUM_INVALID',
    )
  );
}

function buildQuestionImpactByProfile(
  questions: QuestionRecord[],
): NcsQuestionImpactRecord[] {
  return NCS_PROFILE_IDS.map((ncsProfileId) => {
    const boundQuestions = questions.filter((question) =>
      question.ncsBindings.some(
        (binding) => binding.ncsProfileId === ncsProfileId,
      ),
    );
    return {
      ncsProfileId,
      exclusivelyBoundActiveQuestionCount: boundQuestions.filter(
        (question) => question.ncsBindings.length === 1,
      ).length,
      multiBoundActiveQuestionCount: boundQuestions.filter(
        (question) => question.ncsBindings.length > 1,
      ).length,
    };
  });
}

function buildActiveProfileCoverage(
  framework: EvaluationFramework,
  criteria: EvaluationCriterionRecord[],
  questionSet: QuestionSetRecord | undefined,
): NcsActiveProfileCoverageRecord[] {
  if (!isNcsFramework(framework)) return [];
  const activeProfileIds = activeNcsProfileIds(
    framework,
    toProfileWeights(criteria),
  );
  const requiredBaseQuestionCount =
    framework === 'NCS_3_PROFILE_V1' ? 2 : 1;
  return activeProfileIds.map((ncsProfileId) => {
    const actualBaseQuestionCount =
      questionSet?.items.filter((item) => {
        const question = item.question;
        return (
          question?.isActive === true &&
          question.usageScope === 'STANDARD' &&
          question.questionType !== 'FOLLOW_UP' &&
          question.alignmentStatus === 'ALIGNED' &&
          question.ncsBindings.some(
            (binding) => binding.ncsProfileId === ncsProfileId,
          )
        );
      }).length ?? 0;
    return {
      ncsProfileId,
      requiredBaseQuestionCount,
      actualBaseQuestionCount,
      covered: actualBaseQuestionCount >= requiredBaseQuestionCount,
    };
  });
}

function requiresQuestionSetReconfirmation(
  policy: QuestionGenerationPolicyRecord,
  questionSet: QuestionSetRecord | undefined,
  coverage: NcsActiveProfileCoverageRecord[],
): boolean {
  if (!isNcsFramework(policy.evaluationFramework) || policy.policyVersion === 0) {
    return false;
  }
  return (
    questionSet === undefined ||
    questionSet.items.length !== policy.jdCriteriaQuestionCount ||
    coverage.some((item) => !item.covered)
  );
}

function validateConfirmableNcsQuestion(
  question: QuestionRecord,
  criteriaById: Map<number, EvaluationCriterionRecord>,
  activeProfileIds: NcsProfileId[],
): NcsProfileId[] {
  const hasQuestionMetadata =
    question.generationSource === 'JD_CRITERIA' &&
    question.alignmentStatus === 'ALIGNED' &&
    question.ncsProfileId !== null &&
    question.ncsQuestionMode !== null &&
    Boolean(question.ncsProfileVersion?.trim()) &&
    Boolean(question.evaluatorVersion?.trim());
  if (!hasQuestionMetadata) {
    ncsBindingInvalid(
      '정렬 검증과 version 저장을 완료한 JD 공통 질문만 NCS 질문 세트에 포함할 수 있습니다.',
      [{ field: 'items[].questionId', reason: 'QUESTION_METADATA_INVALID' }],
    );
  }

  const bindings = question.ncsBindings;
  if (bindings.length < 1 || bindings.length > 2) {
    ncsBindingInvalid('NCS 질문에는 1~2개의 profile binding이 필요합니다.', [
      { field: 'items[].questionId', reason: 'BINDING_CARDINALITY_INVALID' },
    ]);
  }

  const profileIds = bindings.map((binding) => binding.ncsProfileId);
  const criterionIds = bindings.map((binding) => binding.criterionId);
  const hasValidBindings =
    new Set(profileIds).size === bindings.length &&
    new Set(criterionIds).size === bindings.length &&
    bindings.every((binding, index) => {
      const criterion = criteriaById.get(binding.criterionId);
      return (
        binding.bindingOrder === index + 1 &&
        NCS_PROFILE_IDS.includes(binding.ncsProfileId) &&
        activeProfileIds.includes(binding.ncsProfileId) &&
        binding.alignmentStatus === 'ALIGNED' &&
        Boolean(binding.ncsProfileVersion.trim()) &&
        Boolean(binding.evaluatorVersion?.trim()) &&
        criterion?.ncsProfileId === binding.ncsProfileId &&
        criterion.ncsProfileVersion === binding.ncsProfileVersion
      );
    });
  const primaryBinding = bindings[0];
  const primaryCriterion = primaryBinding
    ? criteriaById.get(primaryBinding.criterionId)
    : undefined;
  const hasConsistentPrimaryBinding =
    primaryBinding !== undefined &&
    primaryCriterion !== undefined &&
    question.criterionId === primaryBinding.criterionId &&
    question.ncsProfileId === primaryBinding.ncsProfileId &&
    question.ncsProfileVersion === primaryBinding.ncsProfileVersion &&
    question.evaluatorVersion === primaryBinding.evaluatorVersion &&
    question.ncsQuestionMode === primaryCriterion.ncsQuestionMode;

  if (!hasValidBindings || !hasConsistentPrimaryBinding) {
    ncsBindingInvalid(
      'NCS 질문 binding은 현재 평가 기준의 canonical profile과 ALIGNED version을 사용해야 합니다.',
      [{ field: 'items[].questionId', reason: 'BINDING_METADATA_INVALID' }],
    );
  }

  return profileIds;
}

function buildCompanyReviewedNcsBindings(
  criteria: EvaluationCriterionRecord[],
  reason: string,
): QuestionNcsBindingRecord[] {
  return criteria.map((criterion, index) => ({
    criterionId: criterion.criterionId,
    ncsProfileId: criterion.ncsProfileId as NcsProfileId,
    ncsProfileVersion: criterion.ncsProfileVersion as string,
    alignmentStatus: 'ALIGNED',
    alignmentScore: null,
    alignmentReason: reason,
    evaluatorVersion: COMPANY_QUESTION_REVIEW_EVALUATOR_VERSION,
    bindingOrder: index + 1,
  }));
}

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
  if (!isNcsFramework(policy.evaluationFramework)) {
    return [];
  }

  const ordered = [...criteria]
    .filter(
      (criterion) =>
        policy.evaluationFramework !== 'NCS_ACTIVE_PROFILE_V2' ||
        criterion.weight > 0,
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (
    ordered.length === 0 ||
    (policy.evaluationFramework === 'NCS_3_PROFILE_V1' &&
      ordered.length !== NCS_PROFILE_IDS.length) ||
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
    usageScope: 'STANDARD';
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
      usageScope: 'STANDARD' as const,
    });
  }

  return [...counts.values()];
}
