import assert from "node:assert/strict";

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
