import { PrismaCompanyInterviewRepository } from './prisma-company-interview.repository';

describe('PrismaCompanyInterviewRepository automatic screening transaction', () => {
  it('locks the posting and rechecks submitted applications before any criteria write', async () => {
    const calls: string[] = [];
    const tx = {
      $queryRaw: jest.fn(async () => {
        calls.push('posting-lock');
        return [{ posting_id: 1n }];
      }),
      application: {
        findFirst: jest.fn(async () => {
          calls.push('application-check');
          return { applicationId: 10n };
        }),
      },
      evaluationCriterion: {
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const repository = new PrismaCompanyInterviewRepository(prisma as never);

    const result = await repository.replaceCriteria(1, 'LEGACY', [], {
      deactivatedProfileIds: [],
      criteriaPassScoresChanged: false,
    });

    expect(result).toEqual({ locked: true });
    expect(calls).toEqual(['posting-lock', 'application-check']);
    expect(tx.evaluationCriterion.update).not.toHaveBeenCalled();
    expect(tx.evaluationCriterion.create).not.toHaveBeenCalled();
  });

  it('rejects a stale configuration snapshot after acquiring the posting lock', async () => {
    const calls: string[] = [];
    const tx = {
      $queryRaw: jest.fn(async () => {
        calls.push('posting-lock');
        return [{ posting_id: 1n }];
      }),
      application: {
        findFirst: jest.fn(async () => {
          calls.push('application-check');
          return null;
        }),
      },
      interviewQuestionGenerationPolicy: {
        findUnique: jest.fn(async () => {
          calls.push('version-check');
          return { policyVersion: 4, criteriaVersion: 8 };
        }),
      },
      autoScreeningPolicy: {
        findUnique: jest.fn(),
      },
      evaluationCriterion: {
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const repository = new PrismaCompanyInterviewRepository(prisma as never);

    const result = await repository.replaceCriteria(1, 'LEGACY', [], {
      deactivatedProfileIds: [],
      criteriaPassScoresChanged: false,
      expectedQuestionPolicyVersion: 4,
      expectedCriteriaVersion: 7,
    });

    expect(result).toEqual({ conflicted: true });
    expect(calls).toEqual(['posting-lock', 'application-check', 'version-check']);
    expect(tx.autoScreeningPolicy.findUnique).not.toHaveBeenCalled();
    expect(tx.evaluationCriterion.update).not.toHaveBeenCalled();
    expect(tx.evaluationCriterion.create).not.toHaveBeenCalled();
  });

  it('does not let question policy updates overwrite a newer criteria framework snapshot', async () => {
    const tx = {
      $queryRaw: jest.fn(async () => [{ posting_id: 1n }]),
      application: { findFirst: jest.fn(async () => null) },
      interviewQuestionGenerationPolicy: {
        findUnique: jest.fn(async () => ({
          policyVersion: 4,
          criteriaVersion: 8,
        })),
        upsert: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const repository = new PrismaCompanyInterviewRepository(prisma as never);

    const result = await repository.updateQuestionGenerationPolicy(1, {
      evaluationFramework: 'LEGACY',
      jdCriteriaQuestionCount: 3,
      resumeQuestionCount: 2,
      expectedPolicyVersion: 4,
      expectedCriteriaVersion: 7,
    });

    expect(result).toBeUndefined();
    expect(tx.interviewQuestionGenerationPolicy.upsert).not.toHaveBeenCalled();
  });
});
