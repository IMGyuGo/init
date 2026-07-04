import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const now = () => new Date();

const criterionTagSeeds = [
  {
    tagId: 1,
    jobRole: "Common",
    name: "직무/기술 역량",
    description: "JD와 연결되는 기술 지식, 구현 경험, 설계 판단을 답변 근거로 확인한다.",
    category: "서비스 기본 평가",
    sortOrder: 1,
  },
  {
    tagId: 2,
    jobRole: "Common",
    name: "문제 해결력",
    description: "문제 원인을 나누어 확인하고 제약, 대안, 해결 과정을 설명하는지 확인한다.",
    category: "서비스 기본 평가",
    sortOrder: 2,
  },
  {
    tagId: 3,
    jobRole: "Common",
    name: "실행력과 성과",
    description: "본인이 맡은 행동, 완성도, 결과나 개선 효과가 답변에 드러나는지 확인한다.",
    category: "서비스 기본 평가",
    sortOrder: 3,
  },
  {
    tagId: 4,
    jobRole: "Common",
    name: "협업/커뮤니케이션",
    description: "상황, 역할, 의사소통 방식, 협업 조정 과정을 구조적으로 전달하는지 확인한다.",
    category: "서비스 기본 평가",
    sortOrder: 4,
  },
  {
    tagId: 5,
    jobRole: "Common",
    name: "학습/성장성",
    description: "새로운 도구나 도메인을 학습하고 실제 문제에 적용한 흐름을 확인한다.",
    category: "서비스 기본 평가",
    sortOrder: 5,
  },
  {
    tagId: 6,
    jobRole: "Common",
    name: "책임감/신뢰성",
    description: "맡은 범위를 끝까지 확인하고 재발 방지, 검증, 공유까지 수행했는지 확인한다.",
    category: "서비스 기본 평가",
    sortOrder: 6,
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
      },
      create: {
        tagId: tag.tagId,
        jobRole: tag.jobRole,
        name: tag.name,
        description: tag.description,
        category: tag.category,
        isActive: true,
        sortOrder: tag.sortOrder,
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
