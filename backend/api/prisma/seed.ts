import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const now = () => new Date();
const dayMs = 24 * 60 * 60 * 1000;

const companyFailedPaymentOrderSeeds = [
  {
    orderId: "sample_company_failed_001",
    productCode: "COMPANY_AI_INTERVIEW_CREDIT_10",
    orderName: "기업 후원 AI 면접 크레딧 10회",
    amount: 39000,
    failureCode: "PAY_PROCESS_CANCELED",
    failureMessage: "사용자가 결제창에서 결제를 취소했습니다.",
    daysAgo: 0,
  },
  {
    orderId: "sample_company_failed_002",
    productCode: "COMPANY_AI_INTERVIEW_CREDIT_30",
    orderName: "기업 후원 AI 면접 크레딧 30회",
    amount: 99000,
    failureCode: "REJECT_CARD_COMPANY",
    failureMessage: "카드사 승인 거절로 결제가 실패했습니다.",
    daysAgo: 1,
  },
  {
    orderId: "sample_company_failed_003",
    productCode: "COMPANY_AI_INTERVIEW_CREDIT_100",
    orderName: "기업 후원 AI 면접 크레딧 100회",
    amount: 290000,
    failureCode: "NOT_ENOUGH_BALANCE",
    failureMessage: "카드 한도 또는 잔액 부족으로 결제가 실패했습니다.",
    daysAgo: 2,
  },
  {
    orderId: "sample_company_failed_004",
    productCode: "COMPANY_AI_INTERVIEW_CREDIT_30",
    orderName: "기업 후원 AI 면접 크레딧 30회",
    amount: 99000,
    failureCode: "INVALID_CARD",
    failureMessage: "사용할 수 없는 카드 정보로 결제가 실패했습니다.",
    daysAgo: 3,
  },
  {
    orderId: "sample_company_failed_005",
    productCode: "COMPANY_AI_INTERVIEW_CREDIT_10",
    orderName: "기업 후원 AI 면접 크레딧 10회",
    amount: 39000,
    failureCode: "EXCEED_MAX_DAILY_PAYMENT_COUNT",
    failureMessage: "일일 결제 가능 횟수를 초과해 결제가 실패했습니다.",
    daysAgo: 4,
  },
] as const;

const criterionTagSeeds = [
  {
    tagId: 1,
    jobRole: "Common",
    name: "직무/기술 역량",
    description: "JD와 연결되는 기술 지식, 구현 경험, 설계 판단을 답변 근거로 확인한다.",
    category: "서비스 기본 평가",
    sortOrder: 1,
    ncsProfileId: "JOB_TECHNICAL",
    defaultNcsQuestionMode: "TECHNICAL_KNOWLEDGE",
    ncsProfileVersion: "2025.12-v1",
  },
  {
    tagId: 2,
    jobRole: "Common",
    name: "문제 해결력",
    description: "문제 원인을 나누어 확인하고 제약, 대안, 해결 과정을 설명하는지 확인한다.",
    category: "서비스 기본 평가",
    sortOrder: 2,
    ncsProfileId: "PROBLEM_SOLVING",
    defaultNcsQuestionMode: "EXPERIENCE_BEHAVIOR",
    ncsProfileVersion: "2025.12-v1",
  },
  {
    tagId: 3,
    jobRole: "Common",
    name: "실행력과 성과",
    description: "본인이 맡은 행동, 완성도, 결과나 개선 효과가 답변에 드러나는지 확인한다.",
    category: "서비스 기본 평가",
    sortOrder: 3,
    ncsProfileId: null,
    defaultNcsQuestionMode: null,
    ncsProfileVersion: null,
  },
  {
    tagId: 4,
    jobRole: "Common",
    name: "협업/커뮤니케이션",
    description: "상황, 역할, 의사소통 방식, 협업 조정 과정을 구조적으로 전달하는지 확인한다.",
    category: "서비스 기본 평가",
    sortOrder: 4,
    ncsProfileId: "COLLABORATION_COMMUNICATION",
    defaultNcsQuestionMode: "EXPERIENCE_BEHAVIOR",
    ncsProfileVersion: "2025.12-v1",
  },
  {
    tagId: 5,
    jobRole: "Common",
    name: "학습/성장성",
    description: "새로운 도구나 도메인을 학습하고 실제 문제에 적용한 흐름을 확인한다.",
    category: "서비스 기본 평가",
    sortOrder: 5,
    ncsProfileId: null,
    defaultNcsQuestionMode: null,
    ncsProfileVersion: null,
  },
  {
    tagId: 6,
    jobRole: "Common",
    name: "책임감/신뢰성",
    description: "맡은 범위를 끝까지 확인하고 재발 방지, 검증, 공유까지 수행했는지 확인한다.",
    category: "서비스 기본 평가",
    sortOrder: 6,
    ncsProfileId: null,
    defaultNcsQuestionMode: null,
    ncsProfileVersion: null,
  },
];

async function main() {
  const createdAt = now();

  await prisma.user.upsert({
    where: { userId: 1 },
    update: {
      email: "dev.company@example.com",
      userType: "COMPANY",
      name: "Dev Company User",
      status: "ACTIVE",
      authProvider: "LOCAL",
      updatedAt: createdAt,
    },
    create: {
      userId: 1,
      email: "dev.company@example.com",
      passwordHash: null,
      userType: "COMPANY",
      name: "Dev Company User",
      phone: null,
      status: "ACTIVE",
      authProvider: "LOCAL",
      providerUserId: null,
      createdAt,
      updatedAt: createdAt,
    },
  });

  await prisma.company.upsert({
    where: { companyId: 1 },
    update: {
      ownerUserId: 1,
      name: "Dev Company",
      verificationStatus: "VERIFIED",
      updatedAt: createdAt,
    },
    create: {
      companyId: 1,
      ownerUserId: 1,
      name: "Dev Company",
      businessRegistrationNumber: "0000000001",
      verificationStatus: "VERIFIED",
      industry: "IT",
      profile: "Local development company profile.",
      talentProfile: "Local development talent profile.",
      evaluationPolicy: "Local development evaluation policy.",
      createdAt,
      updatedAt: createdAt,
    },
  });

  await prisma.user.upsert({
    where: { userId: 2 },
    update: {
      email: "dev.candidate@example.com",
      userType: "CANDIDATE",
      name: "Dev Candidate User",
      status: "ACTIVE",
      authProvider: "LOCAL",
      updatedAt: createdAt,
    },
    create: {
      userId: 2,
      email: "dev.candidate@example.com",
      passwordHash: null,
      userType: "CANDIDATE",
      name: "Dev Candidate User",
      phone: null,
      status: "ACTIVE",
      authProvider: "LOCAL",
      providerUserId: null,
      createdAt,
      updatedAt: createdAt,
    },
  });

  await prisma.candidateProfile.upsert({
    where: { candidateId: 1 },
    update: {
      userId: 2,
      updatedAt: createdAt,
    },
    create: {
      candidateId: 1,
      userId: 2,
      defaultResumeFileId: null,
      portfolioUrl: null,
      githubUrl: null,
      summary: "Local development candidate profile.",
      createdAt,
      updatedAt: createdAt,
    },
  });

  const companyPaymentCustomer = await prisma.paymentCustomer.upsert({
    where: {
      provider_companyId: {
        provider: "TOSS",
        companyId: 1,
      },
    },
    update: {
      userId: 1,
      candidateId: null,
      customerKey: "company_1",
      updatedAt: createdAt,
    },
    create: {
      userId: 1,
      companyId: 1,
      candidateId: null,
      provider: "TOSS",
      customerKey: "company_1",
      createdAt,
      updatedAt: createdAt,
    },
  });

  for (const seed of companyFailedPaymentOrderSeeds) {
    const failedAt = new Date(createdAt.getTime() - seed.daysAgo * dayMs);
    const requestedAt = new Date(failedAt.getTime() - 3 * 60 * 1000);

    await prisma.paymentOrder.upsert({
      where: {
        provider_orderId: {
          provider: "TOSS",
          orderId: seed.orderId,
        },
      },
      update: {
        paymentCustomerId: companyPaymentCustomer.paymentCustomerId,
        companyId: 1,
        candidateId: null,
        productCode: seed.productCode,
        orderName: seed.orderName,
        type: "ONE_TIME",
        status: "FAILED",
        amount: seed.amount,
        currency: "KRW",
        method: "CARD",
        receiptUrl: null,
        failureCode: seed.failureCode,
        failureMessage: seed.failureMessage,
        providerPayload: {
          seed: true,
          provider: "TOSS",
          failureCode: seed.failureCode,
        },
        requestedAt,
        approvedAt: null,
        failedAt,
        createdAt: requestedAt,
        updatedAt: failedAt,
      },
      create: {
        paymentCustomerId: companyPaymentCustomer.paymentCustomerId,
        companyId: 1,
        candidateId: null,
        provider: "TOSS",
        orderId: seed.orderId,
        paymentKey: null,
        productCode: seed.productCode,
        orderName: seed.orderName,
        type: "ONE_TIME",
        status: "FAILED",
        amount: seed.amount,
        currency: "KRW",
        method: "CARD",
        receiptUrl: null,
        failureCode: seed.failureCode,
        failureMessage: seed.failureMessage,
        providerPayload: {
          seed: true,
          provider: "TOSS",
          failureCode: seed.failureCode,
        },
        requestedAt,
        approvedAt: null,
        failedAt,
        createdAt: requestedAt,
        updatedAt: failedAt,
      },
    });
  }

  for (const tag of criterionTagSeeds) {
    await prisma.criterionTag.upsert({
      where: { tagId: tag.tagId },
      update: {
        jobRole: tag.jobRole,
        name: tag.name,
        description: tag.description,
        category: tag.category,
        isActive: true,
        sortOrder: tag.sortOrder,
        ncsProfileId: tag.ncsProfileId,
        defaultNcsQuestionMode: tag.defaultNcsQuestionMode,
        ncsProfileVersion: tag.ncsProfileVersion,
      },
      create: {
        tagId: tag.tagId,
        jobRole: tag.jobRole,
        name: tag.name,
        description: tag.description,
        category: tag.category,
        isActive: true,
        sortOrder: tag.sortOrder,
        ncsProfileId: tag.ncsProfileId,
        defaultNcsQuestionMode: tag.defaultNcsQuestionMode,
        ncsProfileVersion: tag.ncsProfileVersion,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
