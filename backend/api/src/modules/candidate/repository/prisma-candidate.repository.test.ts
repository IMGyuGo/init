import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { CandidateDomainError } from "../candidate.errors";
import { PrismaCandidateRepository } from "./prisma-candidate.repository";

const postingCoreColumns = [
  "posting_id",
  "company_id",
  "title",
  "job_role",
  "job_description",
  "starts_on",
  "ends_on",
  "status",
  "created_at",
];
const companyCoreColumns = ["company_id", "name", "industry", "profile"];

function schemaRows(input: { postingColumns?: string[]; companyColumns?: string[] } = {}) {
  return [
    ...(input.postingColumns ?? postingCoreColumns).map((columnName) => ({
      tableName: "postings",
      columnName,
    })),
    ...(input.companyColumns ?? companyCoreColumns).map((columnName) => ({
      tableName: "companies",
      columnName,
    })),
  ];
}

function postingRow(input: Partial<Record<string, unknown>> = {}) {
  return {
    postingId: 101n,
    companyId: 7n,
    postingStatus: "OPEN",
    startsOn: new Date("2026-07-01T00:00:00.000Z"),
    endsOn: new Date("2026-07-31T00:00:00.000Z"),
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    title: "Backend Developer",
    jobRole: "Backend",
    jobDescription: "NestJS API",
    workLocation: "Seoul",
    employmentType: "Full-time",
    jobRoleCode: "Backend",
    regionCode: "Seoul",
    careerMinYears: 1,
    careerMaxYears: 3,
    employmentTypeCode: "Full-time",
    recruitmentType: "Deadline",
    companyName: "Init Labs",
    companyIndustry: "SaaS",
    companyProfile: "AI recruiting workflow",
    companyLogoStorageKey: null,
    ...input,
  };
}

describe("PrismaCandidateRepository", () => {
  function createSnapshotRepository(options: { batchStatus?: string; insufficientCoverage?: boolean } = {}) {
    const jd = "NestJS와 PostgreSQL 기반 백엔드 개발자";
    const resume = "결제 장애의 원인을 추적하고 재발 방지 테스트를 추가했습니다.";
    const hash = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
    let runtimeQuestionId = 1_000_000_000_000_000n;
    let snapshotRows: Array<Record<string, unknown>> = [];
    let snapshotBindingRows: Array<Record<string, unknown>> = [];
    let sessionPolicyRows: Array<Record<string, unknown>> = [];
    let createManyCalls = 0;
    const profileBindings = [
      ["JOB_TECHNICAL", "PROBLEM_SOLVING"],
      options.insufficientCoverage
        ? ["COLLABORATION_COMMUNICATION"]
        : ["COLLABORATION_COMMUNICATION", "JOB_TECHNICAL"],
      ["PROBLEM_SOLVING", "COLLABORATION_COMMUNICATION"],
      options.insufficientCoverage
        ? ["PROBLEM_SOLVING"]
        : ["JOB_TECHNICAL", "COLLABORATION_COMMUNICATION"],
    ];
    const binding = (profileId: string, bindingOrder: number) => ({
      criterionId: profileId === "JOB_TECHNICAL" ? 1n : profileId === "COLLABORATION_COMMUNICATION" ? 2n : 3n,
      ncsProfileId: profileId,
      ncsProfileVersion: "2025.12-v1",
      alignmentStatus: "ALIGNED",
      alignmentScore: { toString: () => "0.9" },
      alignmentReason: "정렬됨",
      evaluatorVersion: "ncs-align-v1",
      bindingOrder,
      criterion: { tag: { name: `${profileId} 기준` } },
    });
    const commonQuestions = [1, 2].map((sortOrder) => ({
      sortOrder,
      question: {
        questionId: BigInt(100 + sortOrder),
        isActive: true,
        generationSource: "JD_CRITERIA",
        alignmentStatus: "ALIGNED",
        criterionId: BigInt(sortOrder),
        questionType: "TECHNICAL",
        content: `공통 질문 ${sortOrder}`,
        ncsProfileId: profileBindings[sortOrder - 1]?.[0],
        ncsQuestionMode: "TECHNICAL_KNOWLEDGE",
        ncsProfileVersion: "2025.12-v1",
        alignmentScore: { toString: () => "0.9" },
        alignmentReason: "정렬됨",
        evaluatorVersion: "ncs-align-v1",
        ncsBindings: (profileBindings[sortOrder - 1] ?? []).map(binding),
      },
      criterion: { tag: { name: `평가 기준 ${sortOrder}` } },
    }));
    const personalizedQuestions = [1, 2].map((sortOrder) => ({
      personalizedQuestionId: BigInt(200 + sortOrder),
      criterionId: BigInt(sortOrder),
      criterionTitleSnapshot: `평가 기준 ${sortOrder}`,
      source: "RESUME_PERSONALIZED",
      questionType: "EXPERIENCE",
      content: `개인화 질문 ${sortOrder}`,
      ncsProfileId: profileBindings[sortOrder + 1]?.[0],
      ncsQuestionMode: "EXPERIENCE_BEHAVIOR",
      ncsProfileVersion: "2025.12-v1",
      alignmentStatus: "ALIGNED",
      alignmentScore: { toString: () => "0.91" },
      alignmentReason: "정렬됨",
      evaluatorVersion: "ncs-align-v1",
      ncsBindings: (profileBindings[sortOrder + 1] ?? []).map(binding),
      sortOrder,
    }));
    const transaction = {
      $executeRaw: async () => 0,
      $queryRaw: async () => [{ questionId: runtimeQuestionId++ }],
      application: {
        findUnique: async () => ({
          applicationId: 10n,
          postingId: 20n,
          candidateId: 30n,
          posting: {
            jobDescription: jd,
            timePolicy: { preparationTimeSec: 30, answerTimeSec: 90 },
            criteria: [
              { criterionId: 1n, ncsProfileId: "JOB_TECHNICAL", ncsProfileVersion: "2025.12-v1", weight: 30, tag: { name: "기술·직무" } },
              { criterionId: 2n, ncsProfileId: "COLLABORATION_COMMUNICATION", ncsProfileVersion: "2025.12-v1", weight: 30, tag: { name: "협업·의사소통" } },
              { criterionId: 3n, ncsProfileId: "PROBLEM_SOLVING", ncsProfileVersion: "2025.12-v1", weight: 40, tag: { name: "문제 해결력" } },
            ],
            questionGenerationPolicy: {
              evaluationFramework: "NCS_3_PROFILE_V1",
              jdCriteriaQuestionCount: 2,
              resumeQuestionCount: 2,
              policyVersion: 3,
              criteriaVersion: 4,
            },
            questionSets: [{ items: commonQuestions }],
          },
          documents: [{ parseStatus: "EXTRACTED", extractedText: resume }],
          interviewQuestionBatches: [{
            status: options.batchStatus ?? "READY",
            policyVersion: 3,
            criteriaVersion: 4,
            resumeDocumentHash: hash(resume),
            jdSnapshotHash: hash(jd),
            questions: personalizedQuestions,
          }],
          interviewSessions: [{ sessionId: 40n, sessionQuestions: snapshotRows }],
        }),
      },
      interviewSession: {
        create: async () => { throw new Error("existing session should be reused"); },
        update: async ({ data }: { data: Record<string, unknown> }) => ({ sessionId: 40n, ...data }),
      },
      interviewSessionQuestion: {
        createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
          createManyCalls += 1;
          snapshotRows = data;
          return { count: data.length };
        },
        findMany: async () => snapshotRows.map((_, index) => ({ sessionQuestionId: BigInt(400 + index) })),
      },
      sessionQuestionNcsBinding: {
        createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
          snapshotBindingRows = data;
          return { count: data.length };
        },
      },
      interviewSessionNcsPolicy: {
        createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
          sessionPolicyRows = data;
          return { count: data.length };
        },
      },
    };
    const prisma = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    };
    return {
      repository: new PrismaCandidateRepository(prisma as never),
      getSnapshotRows: () => snapshotRows,
      getSnapshotBindingRows: () => snapshotBindingRows,
      getSessionPolicyRows: () => sessionPolicyRows,
      getCreateManyCalls: () => createManyCalls,
    };
  }

  it("creates an immutable common-first NCS session snapshot", async () => {
    const fixture = createSnapshotRepository();

    const created = await fixture.repository.prepareInterviewSessionQuestionSnapshot(10);
    assert.equal(created?.readiness, "READY");
    assert.equal(created?.snapshotCreated, true);
    assert.equal(created?.commonQuestionCount, 2);
    assert.equal(created?.personalizedQuestionCount, 2);
    assert.deepEqual(fixture.getSnapshotRows().map((row) => row.generationSource), [
      "JD_CRITERIA",
      "JD_CRITERIA",
      "RESUME_PERSONALIZED",
      "RESUME_PERSONALIZED",
    ]);
    assert.deepEqual(fixture.getSnapshotRows().map((row) => row.sortOrder), [1, 2, 3, 4]);
    assert.equal(fixture.getSnapshotBindingRows().length, 8);
    assert.deepEqual(
      fixture.getSessionPolicyRows().map((row) => row.weight),
      [30, 30, 40],
    );

    const reused = await fixture.repository.prepareInterviewSessionQuestionSnapshot(10);
    assert.equal(reused?.snapshotCreated, false);
    assert.equal(reused?.totalQuestionCount, 4);
    assert.equal(fixture.getCreateManyCalls(), 1);
  });

  it("does not write a partial snapshot while personalized questions are not ready", async () => {
    const fixture = createSnapshotRepository({ batchStatus: "GENERATING" });

    const result = await fixture.repository.prepareInterviewSessionQuestionSnapshot(10);

    assert.equal(result?.readiness, "PERSONALIZED_QUESTIONS_NOT_READY");
    assert.equal(result?.commonQuestionCount, 2);
    assert.equal(result?.personalizedQuestionCount, 0);
    assert.equal(fixture.getCreateManyCalls(), 0);
  });

  it("blocks snapshot writes when any NCS profile has fewer than two base questions", async () => {
    const fixture = createSnapshotRepository({ insufficientCoverage: true });

    const result = await fixture.repository.prepareInterviewSessionQuestionSnapshot(10);

    assert.equal(result?.readiness, "NCS_QUESTION_COVERAGE_INVALID");
    assert.deepEqual(
      result?.ncsCoverage?.find((coverage) => coverage.ncsProfileId === "JOB_TECHNICAL"),
      {
        ncsProfileId: "JOB_TECHNICAL",
        requiredQuestionCount: 2,
        actualQuestionCount: 1,
      },
    );
    assert.equal(fixture.getCreateManyCalls(), 0);
    assert.equal(fixture.getSnapshotBindingRows().length, 0);
    assert.equal(fixture.getSessionPolicyRows().length, 0);
  });

  it("queries only candidate-visible postings from the shared postings table", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const prisma = {
      async $queryRawUnsafe(sql: string, ...params: unknown[]) {
        calls.push({ sql, params });
        return sql.includes("information_schema.columns") ? schemaRows() : [];
      },
    };
    const repository = new PrismaCandidateRepository(prisma as never);

    await repository.listJobs();

    const listQuery = calls[1];
    assert.ok(listQuery);
    assert.match(listQuery.sql, /FROM "postings" p/);
    assert.match(listQuery.sql, /p\."status" IN \('OPEN', 'CLOSING_SOON'\)/);
    assert.match(listQuery.sql, /NULL::text AS "workLocation"/);
    assert.match(listQuery.sql, /NULL::integer AS "careerMinYears"/);
    assert.doesNotMatch(listQuery.sql, /career_requirement/);
    assert.deepEqual(listQuery.params, []);
  });

  it("finds a posting by id without candidate-visible status filtering", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const prisma = {
      async $queryRawUnsafe(sql: string, ...params: unknown[]) {
        calls.push({ sql, params });
        if (sql.includes("information_schema.columns")) {
          return schemaRows();
        }
        return [
          postingRow({
            postingId: 303n,
            postingStatus: "CLOSED",
            title: "Closed Backend Developer",
          }),
        ];
      },
    };
    const repository = new PrismaCandidateRepository(prisma as never);

    const job = await repository.findJob(303);

    const detailQuery = calls[1];
    assert.ok(detailQuery);
    assert.match(detailQuery.sql, /p\."posting_id" = \$1/);
    assert.doesNotMatch(detailQuery.sql, /p\."status" IN \('OPEN', 'CLOSING_SOON'\)/);
    assert.deepEqual(detailQuery.params, [303n]);
    assert.equal(job?.postingStatus, "CLOSED");
    assert.equal(job?.title, "Closed Backend Developer");
  });

  it("maps company logo file storage key to a public candidate job logo URL", async () => {
    const originalPublicBaseUrl = process.env.S3_PUBLIC_BASE_URL;
    process.env.S3_PUBLIC_BASE_URL = "https://cdn.example.com/assets";
    const createdAt = new Date("2026-07-01T00:00:00.000Z");
    const prisma = {
      async $queryRawUnsafe(sql: string) {
        if (sql.includes("information_schema.columns")) {
          return schemaRows({
            postingColumns: [
              ...postingCoreColumns,
              "work_location",
              "employment_type",
              "job_role_code",
              "region_code",
              "career_min_years",
              "career_max_years",
              "employment_type_code",
              "recruitment_type",
            ],
            companyColumns: [...companyCoreColumns, "logo_file_id"],
          });
        }

        return [
          {
            postingId: 101n,
            companyId: 7n,
            postingStatus: "OPEN",
            startsOn: new Date("2026-07-01T00:00:00.000Z"),
            endsOn: new Date("2026-07-31T00:00:00.000Z"),
            createdAt,
            title: "Backend Developer",
            jobRole: "Backend",
            jobDescription: "NestJS API",
            workLocation: "Seoul",
            employmentType: "Full-time",
            jobRoleCode: "서버·백엔드",
            regionCode: "서울",
            careerMinYears: 1,
            careerMaxYears: 3,
            employmentTypeCode: "정규직",
            recruitmentType: "마감형",
            companyName: "Init Labs",
            companyIndustry: "SaaS",
            companyProfile: "AI recruiting workflow",
            companyLogoStorageKey: "company/7/profile-logo/init logo.png",
          },
        ];
      },
    };
    const repository = new PrismaCandidateRepository(prisma as never);

    try {
      const jobs = await repository.listJobs();

      assert.equal(jobs[0]?.companyLogoUrl, "https://cdn.example.com/assets/company/7/profile-logo/init%20logo.png");
    } finally {
      if (originalPublicBaseUrl === undefined) {
        delete process.env.S3_PUBLIC_BASE_URL;
      } else {
        process.env.S3_PUBLIC_BASE_URL = originalPublicBaseUrl;
      }
    }
  });

  it("lists applications only for the logged-in candidate id", async () => {
    let capturedArgs: unknown;
    const prisma = {
      application: {
        async findMany(args: unknown) {
          capturedArgs = args;
          return [];
        },
      },
    };
    const repository = new PrismaCandidateRepository(prisma as never);

    const applications = await repository.listApplications(44);

    assert.deepEqual(applications, []);
    assert.deepEqual(capturedArgs, {
      where: { candidateId: 44n },
      orderBy: { updatedAt: "desc" },
    });
  });

  it("includes the linked resume original name in candidate folder responses", async () => {
    let capturedArgs: unknown;
    const now = new Date("2026-07-10T00:00:00.000Z");
    const prisma = {
      candidateFolder: {
        async findMany(args: unknown) {
          capturedArgs = args;
          return [
            {
              id: 1n,
              candidateId: 44n,
              name: "백엔드 지원 세트",
              githubUrl: null,
              blogUrl: null,
              portfolioUrl: null,
              resumeFileId: 9n,
              motivation: null,
              extraNote: null,
              createdAt: now,
              updatedAt: now,
              resumeFile: { originalName: "김민철 이력서.pdf" },
            },
          ];
        },
      },
    };
    const repository = new PrismaCandidateRepository(prisma as never);

    const folders = await repository.listFolders(44);

    assert.deepEqual(capturedArgs, {
      where: { candidateId: 44n },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      include: { resumeFile: { select: { originalName: true } }, portfolioFile: { select: { originalName: true } } },
    });
    assert.equal(folders[0]?.resumeFileName, "김민철 이력서.pdf");
  });

  it("stores D-owned application documents, consent records, and recruiting interview session", async () => {
    const now = new Date("2026-07-01T00:00:00.000Z");
    let applicationData: Record<string, unknown> | undefined;
    let documentData: Array<Record<string, unknown>> | undefined;
    let consentData: Array<Record<string, unknown>> | undefined;
    let sessionData: Record<string, unknown> | undefined;
    let candidateProfileData: Record<string, unknown> | undefined;

    const application = {
      applicationId: 77n,
      postingId: 101n,
      candidateId: 44n,
      applicationStatus: "SUBMITTED",
      documentStatus: "SUBMITTED",
      interviewStatus: "NOT_READY",
      reportStatus: "PENDING",
      submittedAt: now,
      updatedAt: now,
    };
    const tx = {
      application: {
        async create(args: { data: Record<string, unknown> }) {
          applicationData = args.data;
          return application;
        },
      },
      applicationDocument: {
        async createMany(args: { data: Array<Record<string, unknown>> }) {
          documentData = args.data;
        },
        async findMany() {
          return [
            {
              documentId: 1n,
              applicationId: 77n,
              fileId: 9n,
              documentType: "RESUME",
              parseStatus: "SUBMITTED",
              uploadedAt: now,
            },
            {
              documentId: 2n,
              applicationId: 77n,
              fileId: 10n,
              documentType: "PORTFOLIO",
              parseStatus: "SUBMITTED",
              uploadedAt: now,
            },
          ];
        },
      },
      consentRecord: {
        async createMany(args: { data: Array<Record<string, unknown>> }) {
          consentData = args.data;
        },
        async findMany() {
          return [
            {
              consentId: 1n,
              applicationId: 77n,
              consentType: "PRIVACY_COLLECTION",
              agreed: true,
              agreedAt: now,
            },
            {
              consentId: 2n,
              applicationId: 77n,
              consentType: "AI_DOCUMENT_ANALYSIS",
              agreed: true,
              agreedAt: now,
            },
          ];
        },
      },
      interviewSession: {
        async create(args: { data: Record<string, unknown> }) {
          sessionData = args.data;
        },
      },
      candidateProfile: {
        async update(args: { data: Record<string, unknown> }) {
          candidateProfileData = args.data;
        },
      },
    };
    const prisma = {
      async $transaction<T>(callback: (transactionClient: typeof tx) => Promise<T>) {
        return callback(tx);
      },
    };
    const repository = new PrismaCandidateRepository(prisma as never);

    const result = await repository.createApplication({
      postingId: 101,
      candidateId: 44,
      resumeFileId: 9,
      portfolioFileId: 10,
      portfolioUrl: "https://github.com/init/project",
      consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS"],
    });

    assert.equal(applicationData?.postingId, 101n);
    assert.equal(applicationData?.candidateId, 44n);
    assert.equal(applicationData?.applicationStatus, "SUBMITTED");
    assert.equal(applicationData?.documentStatus, "SUBMITTED");
    assert.equal(applicationData?.interviewStatus, "NOT_READY");
    assert.equal(applicationData?.reportStatus, "PENDING");
    assert.equal(documentData?.[0]?.documentType, "RESUME");
    assert.equal(documentData?.[1]?.documentType, "PORTFOLIO");
    assert.equal(consentData?.length, 2);
    assert.deepEqual(sessionData, {
      applicationId: 77n,
      candidateId: 44n,
      interviewType: "RECRUITING",
      status: "NOT_READY",
      showQuestionText: true,
    });
    // #272 P1: 공고별 입력값은 지원서 스냅샷에만 저장하고 회원 프로필은 갱신하지 않는다.
    assert.equal(candidateProfileData, undefined);
    assert.equal(result.application.applicationId, 77);
    assert.equal(result.documents.length, 2);
    assert.equal(result.consents.length, 2);
    assert.equal(result.portfolioLink?.linkType, "GITHUB");
  });

  it("converts Prisma duplicate application errors to the candidate duplicate error", async () => {
    const prisma = {
      async $transaction<T>(callback: (transactionClient: unknown) => Promise<T>) {
        const uniqueError = new Error("Unique constraint failed") as Error & { code: string };
        uniqueError.code = "P2002";
        return callback({
          application: {
            async create() {
              throw uniqueError;
            },
          },
        });
      },
    };
    const repository = new PrismaCandidateRepository(prisma as never);

    await assert.rejects(
      () =>
        repository.createApplication({
          postingId: 101,
          candidateId: 44,
          resumeFileId: 9,
          consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS"],
        }),
      (error) => error instanceof CandidateDomainError && error.code === "APPLICATION_ALREADY_SUBMITTED",
    );
  });
});
