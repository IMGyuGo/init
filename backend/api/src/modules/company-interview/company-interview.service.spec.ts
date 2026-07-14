import { strict as assert } from 'node:assert';
import type { CurrentUser } from '@init/common';
import { ApiException } from '../../shared/api-exception';
import { CompanyInterviewService } from './company-interview.service';
import type { ResumeQuestionApplicationRecord } from './company-interview.types';
import { InMemoryCompanyInterviewRepository } from './repositories/in-memory-company-interview.repository';
import { InMemoryAiJobQueuePublisher } from '../report/service/ai-job-queue.publisher';
import { CandidateDomainError, type CandidateService } from '../candidate';

const companyUser: CurrentUser = {
  userId: 1,
  userType: 'COMPANY',
  companyId: 1,
  candidateId: null,
};

function createService() {
  return new CompanyInterviewService(new InMemoryCompanyInterviewRepository());
}

function createFixture() {
  const repository = new InMemoryCompanyInterviewRepository();
  return {
    repository,
    service: new CompanyInterviewService(repository),
  };
}

function resumeQuestionFixture(
  overrides: Partial<ResumeQuestionApplicationRecord> = {},
): ResumeQuestionApplicationRecord {
  return {
    applicationId: 101,
    postingId: 1,
    companyId: 1,
    applicationStatus: 'SUBMITTED',
    documentStatus: 'EXTRACTED',
    documentId: 501,
    policy: {
      postingId: 1,
      evaluationFramework: 'NCS_3_PROFILE_V1',
      jdCriteriaQuestionCount: 3,
      resumeQuestionCount: 1,
      policyVersion: 3,
      criteriaVersion: 2,
    },
    currentInputVersion: 'input-version-101',
    currentResumeDocumentHash: 'resume-hash-101',
    currentJdSnapshotHash: 'jd-hash-1',
    currentBatch: {
      batchId: 701,
      latestProcessLogId: 801,
      processStatus: 'COMPLETED',
      status: 'READY',
      policyVersion: 3,
      criteriaVersion: 2,
      inputVersion: 'input-version-101',
      resumeDocumentHash: 'resume-hash-101',
      jdSnapshotHash: 'jd-hash-1',
      attemptCount: 1,
      questions: [{
        personalizedQuestionId: 901,
        criterionId: 1,
        source: 'RESUME_PERSONALIZED',
        questionType: 'EXPERIENCE',
        content: '프로젝트에서 문제 원인을 분석하고 결과를 검증한 경험을 설명해주세요.',
        ncsProfileId: 'PROBLEM_SOLVING',
        ncsQuestionMode: 'EXPERIENCE_BEHAVIOR',
        ncsProfileVersion: '2025.12-v1',
        alignmentStatus: 'ALIGNED',
        alignmentScore: 0.92,
        alignmentReason: '필수 행동 근거를 포함합니다.',
        evaluatorVersion: 'ncs-align-v1',
        sortOrder: 1,
      }],
    },
    hasStaleBatch: false,
    ...overrides,
  };
}

async function assertBadRequest(action: () => Promise<unknown>) {
  await assert.rejects(action, ApiException);
}

async function assertConflict(action: () => Promise<unknown>) {
  await assert.rejects(action, ApiException);
}

describe('CompanyInterviewService', () => {
  it('creates a company interview session through the shared snapshot gate', async () => {
    const repository = new InMemoryCompanyInterviewRepository();
    repository.setResumeQuestionGeneration(resumeQuestionFixture());
    const candidateService = {
      prepareRecruitingInterviewSessionSnapshot: async () => ({
        readiness: 'READY' as const,
        applicationId: 101,
        postingId: 1,
        sessionId: 501,
        snapshotCreated: true,
        commonQuestionCount: 3,
        personalizedQuestionCount: 1,
        totalQuestionCount: 4,
        expectedCommonQuestionCount: 3,
        expectedPersonalizedQuestionCount: 1,
        policyVersion: 3,
        criteriaVersion: 2,
      }),
    } as unknown as CandidateService;
    const service = new CompanyInterviewService(repository, undefined, candidateService);

    const result = await service.createInterviewSession(companyUser, { applicationId: 101 });

    assert.equal(result.sessionId, 501);
    assert.equal(result.snapshotCreated, true);
    assert.equal(result.totalQuestionCount, 4);
  });

  it('maps a missing personalized batch to the API-017 readiness error', async () => {
    const repository = new InMemoryCompanyInterviewRepository();
    repository.setResumeQuestionGeneration(resumeQuestionFixture());
    const candidateService = {
      prepareRecruitingInterviewSessionSnapshot: async () => {
        throw new CandidateDomainError(
          'INTERVIEW_PERSONALIZED_QUESTIONS_NOT_READY',
          'not ready',
          409,
        );
      },
    } as unknown as CandidateService;
    const service = new CompanyInterviewService(repository, undefined, candidateService);

    await assert.rejects(
      () => service.createInterviewSession(companyUser, { applicationId: 101 }),
      (error) => error instanceof ApiException &&
        (error.getResponse() as { code?: string }).code === 'INTERVIEW_PERSONALIZED_QUESTIONS_NOT_READY',
    );
  });

  it('returns only ready personalized questions without resume snapshot metadata', async () => {
    const repository = new InMemoryCompanyInterviewRepository();
    repository.setResumeQuestionGeneration(resumeQuestionFixture());
    const service = new CompanyInterviewService(repository);

    const result = await service.getResumeQuestions(companyUser, 101);

    assert.equal(result.status, 'READY');
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].source, 'RESUME_PERSONALIZED');
    assert.equal(JSON.stringify(result).includes('resume-hash-101'), false);
    assert.equal(JSON.stringify(result).includes('PRIVATE_RESUME'), false);
  });

  it('retries stale personalized questions with IDs, versions and hashes only', async () => {
    const repository = new InMemoryCompanyInterviewRepository();
    const publisher = new InMemoryAiJobQueuePublisher();
    repository.setResumeQuestionGeneration(resumeQuestionFixture({
      currentBatch: {
        ...resumeQuestionFixture().currentBatch!,
        processStatus: 'COMPLETED',
        status: 'STALE',
      },
      hasStaleBatch: true,
    }));
    const service = new CompanyInterviewService(repository, publisher);

    const retried = await service.retryResumeQuestions(companyUser, 101, {
      expectedPolicyVersion: 3,
      reason: '평가기준 변경 반영',
    });

    assert.equal(retried.status, 'PENDING');
    assert.equal(retried.resumeQuestionStatus, 'GENERATING');
    assert.equal(publisher.messages.length, 1);
    assert.equal(publisher.messages[0].processType, 'RESUME_QUESTION_GENERATE');
    const input = JSON.parse(publisher.messages[0].inputRef) as Record<string, unknown>;
    assert.equal(input.applicationId, 101);
    assert.equal(input.documentId, 501);
    assert.equal(input.policyVersion, 3);
    assert.equal(input.resumeDocumentHash, 'resume-hash-101');
    assert.equal('resumeText' in input, false);
    assert.equal((await service.getResumeQuestions(companyUser, 101)).status, 'GENERATING');
  });

  it('returns interview settings for a company posting', async () => {
    const settings = await createService().getSettings(companyUser, { postingId: 1 });

    assert.equal(settings.posting.postingId, 1);
    assert.equal(settings.availableTags.length, 6);
    assert.equal(settings.availableTags[0].tagName, '직무/기술 역량');
    assert.equal(settings.criteria.length, 6);
    assert.equal(settings.questions.length, 3);
    assert.equal(settings.evaluationFramework, 'LEGACY');
    assert.deepEqual(settings.questionGenerationPolicy, {
      postingId: 1,
      jdCriteriaQuestionCount: 0,
      resumeQuestionCount: 0,
      policyVersion: 0,
      criteriaVersion: 0,
      allocations: [],
      resumeQuestionStatus: 'DISABLED',
    });
  });

  it('saves the fixed NCS criteria snapshot and deterministic question allocation', async () => {
    const service = createService();
    const criteria = await service.updateEvaluationCriteria(companyUser, {
      postingId: 1,
      evaluationFramework: 'NCS_3_PROFILE_V1',
      criteria: [
        { criterionId: 2, tagId: 2, weight: 40, sortOrder: 1 },
        { criterionId: 4, tagId: 4, weight: 30, sortOrder: 2 },
        { criterionId: 1, tagId: 1, weight: 30, sortOrder: 3 },
      ],
    });

    assert.equal(criteria.criteriaVersion, 1);
    assert.equal(criteria.evaluationFramework, 'NCS_3_PROFILE_V1');
    assert.deepEqual(
      criteria.criteria.map((criterion) => criterion.ncsProfileId),
      ['PROBLEM_SOLVING', 'COLLABORATION_COMMUNICATION', 'JOB_TECHNICAL'],
    );

    const policy = await service.updateQuestionGenerationPolicy(companyUser, {
      postingId: 1,
      jdCriteriaQuestionCount: 4,
      resumeQuestionCount: 2,
      expectedPolicyVersion: 0,
    });

    assert.equal(policy.policyVersion, 1);
    assert.equal(policy.criteriaVersion, 1);
    assert.deepEqual(policy.allocations, [
      {
        source: 'JD_CRITERIA',
        ncsProfileId: 'PROBLEM_SOLVING',
        ncsQuestionMode: 'EXPERIENCE_BEHAVIOR',
        count: 2,
      },
      {
        source: 'JD_CRITERIA',
        ncsProfileId: 'COLLABORATION_COMMUNICATION',
        ncsQuestionMode: 'EXPERIENCE_BEHAVIOR',
        count: 1,
      },
      {
        source: 'JD_CRITERIA',
        ncsProfileId: 'JOB_TECHNICAL',
        ncsQuestionMode: 'TECHNICAL_KNOWLEDGE',
        count: 1,
      },
      {
        source: 'RESUME_PERSONALIZED',
        ncsProfileId: 'COLLABORATION_COMMUNICATION',
        ncsQuestionMode: 'EXPERIENCE_BEHAVIOR',
        count: 1,
      },
      {
        source: 'RESUME_PERSONALIZED',
        ncsProfileId: 'JOB_TECHNICAL',
        ncsQuestionMode: 'TECHNICAL_KNOWLEDGE',
        count: 1,
      },
    ]);

    const settings = await service.getSettings(companyUser, { postingId: 1 });
    assert.equal(settings.questionGenerationPolicy.resumeQuestionStatus, 'WAITING_APPLICATION');
    assert.deepEqual(settings.questionGenerationPolicy.allocations, policy.allocations);
  });

  it('prepares NCS common question jobs from the stored JD, policy and balanced criteria snapshot', async () => {
    const service = createService();
    await service.updateEvaluationCriteria(companyUser, {
      postingId: 1,
      evaluationFramework: 'NCS_3_PROFILE_V1',
      criteria: [
        { criterionId: 2, tagId: 2, weight: 40, sortOrder: 1 },
        { criterionId: 4, tagId: 4, weight: 30, sortOrder: 2 },
        { criterionId: 1, tagId: 1, weight: 30, sortOrder: 3 },
      ],
    });
    await service.updateQuestionGenerationPolicy(companyUser, {
      postingId: 1,
      jdCriteriaQuestionCount: 4,
      resumeQuestionCount: 2,
      expectedPolicyVersion: 0,
    });

    const payload = await service.prepareCommonQuestionGeneration(companyUser, {
      postingId: 1,
      jdCriteriaQuestionCount: 4,
      expectedPolicyVersion: 1,
    });

    assert.equal(payload.jobDescription, 'NestJS와 PostgreSQL 기반 서비스 개발');
    assert.equal(payload.questionCount, 4);
    assert.equal(payload.source, 'JD_CRITERIA');
    assert.deepEqual(
      payload.criteria.map((criterion) => ({
        profile: criterion.ncsProfileId,
        count: criterion.questionCount,
        version: criterion.ncsProfileVersion,
      })),
      [
        { profile: 'PROBLEM_SOLVING', count: 2, version: '2025.12-v1' },
        { profile: 'COLLABORATION_COMMUNICATION', count: 1, version: '2025.12-v1' },
        { profile: 'JOB_TECHNICAL', count: 1, version: '2025.12-v1' },
      ],
    );

    await assertBadRequest(() =>
      service.prepareCommonQuestionGeneration(companyUser, {
        postingId: 1,
        jdCriteriaQuestionCount: 3,
      }),
    );
  });

  it('rejects invalid NCS criteria and stale question policy versions', async () => {
    const service = createService();
    await assertBadRequest(() =>
      service.updateEvaluationCriteria(companyUser, {
        postingId: 1,
        evaluationFramework: 'NCS_3_PROFILE_V1',
        criteria: [
          { criterionId: 2, tagId: 2, weight: 50, sortOrder: 1 },
          { criterionId: 4, tagId: 4, weight: 50, sortOrder: 2 },
        ],
      }),
    );

    await service.updateEvaluationCriteria(companyUser, {
      postingId: 1,
      evaluationFramework: 'NCS_3_PROFILE_V1',
      criteria: [
        { criterionId: 2, tagId: 2, weight: 40, sortOrder: 1 },
        { criterionId: 4, tagId: 4, weight: 30, sortOrder: 2 },
        { criterionId: 1, tagId: 1, weight: 30, sortOrder: 3 },
      ],
    });
    await service.updateQuestionGenerationPolicy(companyUser, {
      postingId: 1,
      jdCriteriaQuestionCount: 3,
      resumeQuestionCount: 0,
      expectedPolicyVersion: 0,
    });
    await assertConflict(() =>
      service.updateQuestionGenerationPolicy(companyUser, {
        postingId: 1,
        jdCriteriaQuestionCount: 2,
        resumeQuestionCount: 1,
        expectedPolicyVersion: 0,
      }),
    );
  });

  it('returns the dedicated NCS weight error for invalid totals and non-integer weights', async () => {
    const service = createService();
    const invalidCriteria = (weights: [number, number, number]) =>
      service.updateEvaluationCriteria(companyUser, {
        postingId: 1,
        evaluationFramework: 'NCS_3_PROFILE_V1',
        criteria: [
          { criterionId: 1, tagId: 1, weight: weights[0], sortOrder: 1 },
          { criterionId: 4, tagId: 4, weight: weights[1], sortOrder: 2 },
          { criterionId: 2, tagId: 2, weight: weights[2], sortOrder: 3 },
        ],
      });

    for (const weights of [
      [30, 30, 39],
      [30, 30, 41],
      [-1, 31, 70],
      [30.5, 29.5, 40],
    ] as Array<[number, number, number]>) {
      await assert.rejects(
        () => invalidCriteria(weights),
        (error) => error instanceof ApiException &&
          (error.getResponse() as { code?: string }).code === 'INTERVIEW_NCS_WEIGHT_INVALID',
      );
    }
  });

  it('persists one or two canonical NCS question bindings and rejects invalid cardinality', async () => {
    const service = createService();
    await service.updateEvaluationCriteria(companyUser, {
      postingId: 1,
      evaluationFramework: 'NCS_3_PROFILE_V1',
      criteria: [
        { criterionId: 1, tagId: 1, weight: 30, sortOrder: 1 },
        { criterionId: 4, tagId: 4, weight: 30, sortOrder: 2 },
        { criterionId: 2, tagId: 2, weight: 40, sortOrder: 3 },
      ],
    });

    const saved = await service.createQuestion(companyUser, {
      postingId: 1,
      criterionId: 1,
      criterionIds: [1, 4],
      questionType: 'EXPERIENCE',
      content: '기술 선택을 협업 구성원과 조율하고 결과를 검증한 경험을 설명해주세요.',
    });
    assert.deepEqual(
      saved.question.ncsBindings.map((binding) => binding.ncsProfileId),
      ['JOB_TECHNICAL', 'COLLABORATION_COMMUNICATION'],
    );
    assert.equal(saved.question.ncsProfileId, 'JOB_TECHNICAL');

    for (const criterionIds of [[1, 1], [1, 4, 2]]) {
      await assert.rejects(
        () => service.createQuestion(companyUser, {
          postingId: 1,
          criterionId: 1,
          criterionIds,
          questionType: 'TECHNICAL',
          content: `NCS binding ${criterionIds.join('-')} 검증용 질문 내용을 충분히 입력합니다.`,
        }),
        (error) => error instanceof ApiException &&
          (error.getResponse() as { code?: string }).code === 'INTERVIEW_NCS_BINDING_INVALID',
      );
    }
  });

  it('updates evaluation criteria and validates duplicate sort order', async () => {
    const criteriaResult = await createService().updateEvaluationCriteria(companyUser, {
      postingId: 1,
      criteria: [
        { criterionId: 1, tagId: 1, weight: 50, passScore: 70, sortOrder: 1 },
        { criterionId: 2, tagId: 2, weight: 50, passScore: null, sortOrder: 2 },
      ],
    });

    assert.equal(criteriaResult.totalWeight, 100);
    assert.equal(criteriaResult.criteria.length, 2);

    const addedCriteriaResult = await createService().updateEvaluationCriteria(companyUser, {
      postingId: 1,
      criteria: [
        { criterionId: 1, tagId: 1, weight: 50, passScore: 70, sortOrder: 1 },
        { tagId: 4, weight: 50, passScore: null, sortOrder: 2 },
      ],
    });

    assert.equal(addedCriteriaResult.criteria.length, 2);
    assert.equal(addedCriteriaResult.criteria[1].tagName, '협업/커뮤니케이션');

    await assertBadRequest(() =>
      createService().updateEvaluationCriteria(companyUser, {
        postingId: 1,
        criteria: [
          { criterionId: 1, tagId: 1, weight: 50, sortOrder: 1 },
          { criterionId: 2, tagId: 2, weight: 50, sortOrder: 1 },
        ],
      }),
    );

    await assertBadRequest(() =>
      createService().updateEvaluationCriteria(companyUser, {
        postingId: 1,
        criteria: [
          { criterionId: 1, tagId: 1, weight: 50, sortOrder: 1 },
          { criterionId: 2, tagId: 1, weight: 50, sortOrder: 2 },
        ],
      }),
    );
  });

  it('allows removing every evaluation criterion from a posting', async () => {
    const service = createService();
    const criteriaResult = await service.updateEvaluationCriteria(companyUser, {
      postingId: 1,
      criteria: [],
    });

    assert.equal(criteriaResult.totalWeight, 0);
    assert.equal(criteriaResult.criteria.length, 0);

    const settings = await service.getSettings(companyUser, { postingId: 1 });
    assert.equal(settings.criteria.length, 0);
    assert.equal(settings.questions.length, 0);
  });

  it('persists a posting-specific criterion description without changing the shared tag', async () => {
    const service = createService();
    const originalSettings = await service.getSettings(companyUser, { postingId: 1 });
    const originalTagDescription = originalSettings.availableTags.find(
      (tag) => tag.tagId === 1,
    )?.description;

    const result = await service.updateEvaluationCriteria(companyUser, {
      postingId: 1,
      criteria: [
        {
          criterionId: 1,
          tagId: 1,
          description: '이 공고에서만 사용하는 수정된 평가 설명',
          weight: 100,
          passScore: 70,
          sortOrder: 1,
        },
      ],
    });

    assert.equal(
      result.criteria[0].description,
      '이 공고에서만 사용하는 수정된 평가 설명',
    );

    const refreshedSettings = await service.getSettings(companyUser, { postingId: 1 });
    assert.equal(
      refreshedSettings.criteria[0].description,
      '이 공고에서만 사용하는 수정된 평가 설명',
    );
    assert.equal(
      refreshedSettings.availableTags.find((tag) => tag.tagId === 1)?.description,
      originalTagDescription,
    );
  });

  it('returns the default time policy', async () => {
    const timePolicy = (await createService().getSettings(companyUser, {})).timePolicy;
 
    assert.equal(timePolicy.preparationTimeSec, 0);
    assert.equal(timePolicy.answerTimeSec, 90);
  });

  it('creates an interview question and rejects duplicate content', async () => {
    const service = createService();
    const question = await service.createQuestion(companyUser, {
      postingId: 1,
      criterionId: 1,
      questionType: 'TECHNICAL',
      content: 'NestJS 모듈 경계를 어떤 기준으로 나누는지 설명해주세요.',
    });

    assert.equal(question.postingId, 1);
    assert.equal(question.question.questionType, 'TECHNICAL');
    assert.equal(question.question.criterionId, 1);
    assert.equal(question.question.origin, 'MANUAL');
    assert.equal(question.question.isAiEdited, false);

    await assertConflict(() =>
      service.createQuestion(companyUser, {
        postingId: 1,
        criterionId: 1,
        questionType: 'TECHNICAL',
        content: 'NestJS 모듈 경계를 어떤 기준으로 나누는지 설명해주세요.',
      }),
    );
  });

  it('persists AI question origin and marks it edited after user changes', async () => {
    const { repository, service } = createFixture();
    repository.setQuestionGenerationProcess({
      processLogId: 44,
      processType: 'QUESTION_GENERATE',
      status: 'COMPLETED',
      inputRef: JSON.stringify({
        requestedBy: { companyId: 1 },
        payload: { postingId: 1 },
      }),
      outputRef: JSON.stringify({
        sourceProcessLogId: 44,
        postingId: 1,
        questionCandidates: [
          {
            content: '비동기 AI 작업의 실패 복구 전략을 설명해주세요.',
            criterionId: 1,
            source: 'JD_CRITERIA',
            alignmentStatus: 'NOT_EVALUATED',
          },
        ],
      }),
    });
    const created = await service.createQuestion(companyUser, {
      postingId: 1,
      criterionId: 1,
      questionType: 'TECHNICAL',
      content: '비동기 AI 작업의 실패 복구 전략을 설명해주세요.',
      origin: 'AI_GENERATED',
      sourceProcessLogId: 44,
    });

    assert.equal(created.question.origin, 'AI_GENERATED');
    assert.equal(created.question.isAiEdited, false);
    assert.equal(created.question.sourceProcessLogId, 44);
    assert.equal(created.question.generationSource, 'JD_CRITERIA');

    const updated = await service.updateQuestion(
      companyUser,
      created.question.questionId,
      {
        criterionId: 1,
        questionType: 'TECHNICAL',
        content: '비동기 AI 작업의 실패 복구와 재시도 전략을 설명해주세요.',
      },
    );

    assert.equal(updated.question.origin, 'AI_GENERATED');
    assert.equal(updated.question.isAiEdited, true);
    assert.equal(updated.question.alignmentStatus, 'NOT_EVALUATED');

    const settings = await service.getSettings(companyUser, { postingId: 1 });
    const persisted = settings.questions.find(
      (question) => question.questionId === created.question.questionId,
    );
    assert.equal(persisted?.origin, 'AI_GENERATED');
    assert.equal(persisted?.isAiEdited, true);
  });

  it('stores only an ALIGNED NCS candidate from the matching completed process', async () => {
    const { repository, service } = createFixture();
    const criteria = await service.updateEvaluationCriteria(companyUser, {
      postingId: 1,
      evaluationFramework: 'NCS_3_PROFILE_V1',
      criteria: [
        { criterionId: 2, tagId: 2, weight: 40, sortOrder: 1 },
        { criterionId: 4, tagId: 4, weight: 30, sortOrder: 2 },
        { criterionId: 1, tagId: 1, weight: 30, sortOrder: 3 },
      ],
    });
    const criterion = criteria.criteria[0];
    const content = '운영 장애의 원인을 분석하고 대안을 비교한 뒤 결과를 어떻게 검증했나요?';
    repository.setQuestionGenerationProcess({
      processLogId: 45,
      processType: 'QUESTION_GENERATE',
      status: 'COMPLETED',
      inputRef: JSON.stringify({
        requestedBy: { companyId: 1 },
        payload: { postingId: 1 },
      }),
      outputRef: JSON.stringify({
        sourceProcessLogId: 45,
        postingId: 1,
        questionCandidates: [
          {
            content,
            criterionId: criterion.criterionId,
            source: 'JD_CRITERIA',
            ncsProfileId: criterion.ncsProfileId,
            ncsQuestionMode: criterion.ncsQuestionMode,
            ncsProfileVersion: criterion.ncsProfileVersion,
            alignmentStatus: 'ALIGNED',
            alignmentScore: 0.8,
            evaluatorVersion: 'ncs-question-alignment-v1',
          },
        ],
      }),
    });

    const saved = await service.createQuestion(companyUser, {
      postingId: 1,
      criterionId: criterion.criterionId,
      questionType: 'EXPERIENCE',
      content,
      origin: 'AI_GENERATED',
      sourceProcessLogId: 45,
    });
    assert.equal(saved.question.alignmentStatus, 'ALIGNED');
    assert.equal(saved.question.ncsProfileId, 'PROBLEM_SOLVING');
    assert.equal(saved.question.alignmentScore, 0.8);

    repository.setQuestionGenerationProcess({
      processLogId: 46,
      processType: 'QUESTION_GENERATE',
      status: 'COMPLETED',
      inputRef: JSON.stringify({
        requestedBy: { companyId: 1 },
        payload: { postingId: 1 },
      }),
      outputRef: JSON.stringify({
        sourceProcessLogId: 46,
        postingId: 1,
        questionCandidates: [
          {
            content: '자기소개를 해주세요.',
            criterionId: criterion.criterionId,
            source: 'JD_CRITERIA',
            ncsProfileId: criterion.ncsProfileId,
            ncsQuestionMode: criterion.ncsQuestionMode,
            ncsProfileVersion: criterion.ncsProfileVersion,
            alignmentStatus: 'REVIEW_REQUIRED',
            alignmentScore: 0.2,
          },
        ],
      }),
    });
    await assertBadRequest(() =>
      service.createQuestion(companyUser, {
        postingId: 1,
        criterionId: criterion.criterionId,
        questionType: 'INTRO',
        content: '자기소개를 해주세요.',
        origin: 'AI_GENERATED',
        sourceProcessLogId: 46,
      }),
    );
  });

  it('hides runtime follow-up questions from interview management settings', async () => {
    const service = createService();
    await service.createQuestion(companyUser, {
      postingId: 1,
      criterionId: 1,
      questionType: 'FOLLOW_UP',
      content: 'Which tradeoff did you consider after that answer?',
    });

    const settings = await service.getSettings(companyUser, { postingId: 1 });

    assert.equal(settings.questions.length, 3);
    assert.ok(settings.questions.every((question) => question.questionType !== 'FOLLOW_UP'));
    assert.equal(
      settings.questions.some((question) => question.content === 'Which tradeoff did you consider after that answer?'),
      false,
    );
  });

  it('updates and deactivates interview questions', async () => {
    const service = createService();
    const updated = await service.updateQuestion(companyUser, 1, {
      criterionId: 2,
      questionType: 'EXPERIENCE',
      content: '데이터 모델 변경을 리뷰어에게 설명했던 경험을 말해주세요.',
    });

    assert.equal(updated.question.questionType, 'EXPERIENCE');
    assert.equal(updated.question.criterionId, 2);

    await assertConflict(() =>
      service.updateQuestion(companyUser, 1, {
        criterionId: 2,
        questionType: 'EXPERIENCE',
        content: '평가 기준과 질문 뱅크의 관계를 어떻게 모델링하시겠습니까?',
      }),
    );

    const deleted = await service.deleteQuestion(companyUser, 1);
    assert.equal(deleted.question.isActive, false);
    assert.equal((await service.getSettings(companyUser, { postingId: 1 })).questions.length, 2);
  });

  it('hides questions linked to removed evaluation criteria', async () => {
    const service = createService();

    await service.updateEvaluationCriteria(companyUser, {
      postingId: 1,
      criteria: [
        { criterionId: 1, tagId: 1, weight: 100, passScore: 70, sortOrder: 1 },
      ],
    });

    const settings = await service.getSettings(companyUser, { postingId: 1 });
    assert.equal(settings.criteria.length, 1);
    assert.equal(settings.questions.length, 1);
    assert.equal(settings.questions[0].criterionId, 1);
  });

  it('confirms an active interview question set from existing question bank items', async () => {
    const service = createService();
    const result = await service.confirmQuestionSet(companyUser, {
      postingId: 1,
      title: 'AI 추천 질문 세트',
      sourceProcessLogId: 123,
      items: [
        { questionId: 2, criterionId: 2, sortOrder: 2 },
        { questionId: 1, criterionId: 1, sortOrder: 1 },
      ],
    });

    assert.equal(result.postingId, 1);
    assert.equal(result.status, 'ACTIVE');
    assert.equal(result.createdByProcessLogId, 123);
    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].questionId, 1);
    assert.deepEqual(
      result.items.map((item) => item.sortOrder),
      [1, 2],
    );

    const active = await service.getActiveQuestionSet(companyUser, 1);
    assert.equal(active.postingId, 1);
    assert.equal(active.fallbackPolicy, 'USE_ACTIVE_POSTING_QUESTIONS');
    assert.equal(active.questionSet?.questionSetId, result.questionSetId);
    assert.equal(active.questionSet?.items.length, 2);
    assert.deepEqual(
      active.questionSet?.items.map((item) => item.questionId),
      [1, 2],
    );
    assert.deepEqual(
      active.questionSet?.items.map((item) => item.sortOrder),
      [1, 2],
    );
    assert.equal(active.questionSet?.items[0].questionType, 'TECHNICAL');
    assert.equal(
      active.questionSet?.items[0].content,
      'REST API 계약을 먼저 문서화해야 하는 이유를 설명해주세요.',
    );
    assert.equal(active.questionSet?.items[0].isActive, true);

    await service.deleteQuestion(companyUser, 2);

    const activeAfterDelete = await service.getActiveQuestionSet(companyUser, 1);
    assert.equal(activeAfterDelete.questionSet?.items.length, 2);
    assert.deepEqual(
      activeAfterDelete.questionSet?.items.map((item) => item.questionId),
      [1, 2],
    );
    assert.equal(activeAfterDelete.questionSet?.items[1].questionType, 'TECHNICAL');
    assert.equal(
      activeAfterDelete.questionSet?.items[1].content,
      '평가 기준과 질문 뱅크의 관계를 어떻게 모델링하시겠습니까?',
    );
    assert.equal(activeAfterDelete.questionSet?.items[1].isActive, false);
  });

  it('rejects duplicate questions in a confirmed question set', async () => {
    await assertBadRequest(() =>
      createService().confirmQuestionSet(companyUser, {
        postingId: 1,
        title: '중복 질문 세트',
        items: [
          { questionId: 1, criterionId: 1, sortOrder: 1 },
          { questionId: 1, criterionId: 1, sortOrder: 2 },
        ],
      }),
    );
  });

  it('keeps only one active interview question set per posting', async () => {
    const service = createService();
    const first = await service.confirmQuestionSet(companyUser, {
      postingId: 1,
      title: '첫 질문 세트',
      items: [
        { questionId: 1, criterionId: 1, sortOrder: 1 },
        { questionId: 2, criterionId: 2, sortOrder: 2 },
      ],
    });
    const second = await service.confirmQuestionSet(companyUser, {
      postingId: 1,
      title: '최종 질문 세트',
      items: [{ questionId: 3, criterionId: 3, sortOrder: 1 }],
    });

    const active = await service.getActiveQuestionSet(companyUser, 1);
    assert.notEqual(first.questionSetId, second.questionSetId);
    assert.equal(active.questionSet?.questionSetId, second.questionSetId);
    assert.equal(active.questionSet?.items.length, 1);
    assert.equal(active.questionSet?.items[0].questionId, 3);
  });

  it('rejects inactive or other-posting questions when confirming a question set', async () => {
    const service = createService();
    await service.deleteQuestion(companyUser, 1);

    await assertBadRequest(() =>
      service.confirmQuestionSet(companyUser, {
        postingId: 1,
        title: '비활성 질문 포함',
        items: [{ questionId: 1, criterionId: 1, sortOrder: 1 }],
      }),
    );

    await assertBadRequest(() =>
      service.confirmQuestionSet(companyUser, {
        postingId: 1,
        title: '다른 공고 질문 포함',
        items: [{ questionId: 4, criterionId: 7, sortOrder: 1 }],
      }),
    );
  });

  it('updates the interview time policy and validates runtime bounds', async () => {
    const service = createService();
    const result = await service.updateTimePolicy(companyUser, {
      postingId: 1,
      preparationTimeSec: 90,
      answerTimeSec: 300,
      retryAllowed: true,
    });

    assert.equal(result.timePolicy.preparationTimeSec, 90);
    assert.equal(result.timePolicy.answerTimeSec, 300);
    assert.equal(result.timePolicy.retryAllowed, true);
    assert.equal(
      (await service.getSettings(companyUser, { postingId: 1 })).timePolicy.answerTimeSec,
      300,
    );
    assert.equal(
      (await service.getSettings(companyUser, { postingId: 2 })).timePolicy.answerTimeSec,
      90,
    );

    await assertBadRequest(() =>
      service.updateTimePolicy(companyUser, {
        postingId: 1,
        preparationTimeSec: 120,
        answerTimeSec: 120,
        retryAllowed: false,
      }),
    );
  });
});
