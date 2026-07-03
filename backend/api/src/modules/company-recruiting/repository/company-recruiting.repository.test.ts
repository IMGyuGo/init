import assert from "node:assert/strict";

import { PrismaCompanyRecruitingRepository } from "./company-recruiting.repository";

describe("PrismaCompanyRecruitingRepository", () => {
  it("writes application defaults when creating public applications", async () => {
    let capturedData: Record<string, unknown> | null = null;
    const prisma = {
      application: {
        async create(args: { data: Record<string, unknown> }) {
          capturedData = args.data;
          return {
            applicationId: 77,
            postingId: 101,
            candidateId: 44,
            applicationStatus: "SUBMITTED",
            documentStatus: "NOT_SUBMITTED",
            interviewStatus: "NOT_READY",
            reportStatus: "PENDING",
            screeningDecision: "UNDECIDED",
            screeningMemo: null,
            submittedAt: null,
            updatedAt: new Date("2026-06-29T00:00:00.000Z"),
            candidate: {
              candidateId: 44,
              user: {
                userId: 88,
                email: "kim@example.com",
                name: "Kim Applicant",
                phone: null,
              },
            },
            posting: {
              postingId: 101,
              title: "Backend Developer",
              jobRole: "Backend",
            },
            evaluationReports: [],
            interviewSessions: [],
          };
        },
      },
    };
    const repository = new PrismaCompanyRecruitingRepository(prisma as never);

    await repository.createApplication({ postingId: 101, candidateId: 44, screeningMemo: null });

    assert.deepEqual(capturedData, {
      postingId: 101n,
      candidateId: 44n,
      applicationStatus: "SUBMITTED",
      documentStatus: "NOT_SUBMITTED",
      screeningDecision: "UNDECIDED",
      screeningMemo: null,
    });
  });

  it("archives postings instead of physically deleting recruitment data", async () => {
    let capturedWhere: Record<string, unknown> | null = null;
    let capturedData: Record<string, unknown> | null = null;
    const prisma = {
      posting: {
        async findFirst(args: { where: Record<string, unknown> }) {
          capturedWhere = args.where;
          return { postingId: 101n };
        },
        async update(args: { data: Record<string, unknown> }) {
          capturedData = args.data;
          return {
            postingId: 101n,
            companyId: 7n,
            title: "Backend Developer",
            jobRole: "Backend",
            jobDescription: "Build APIs",
            startsOn: null,
            endsOn: null,
            status: "ARCHIVED",
            createdAt: new Date("2026-06-29T00:00:00.000Z"),
            updatedAt: new Date("2026-06-30T00:00:00.000Z"),
            _count: { applications: 3 },
          };
        },
      },
    };
    const repository = new PrismaCompanyRecruitingRepository(prisma as never);

    const result = await repository.archivePosting(101, 7);

    assert.deepEqual(capturedWhere, {
      postingId: 101n,
      companyId: 7n,
    });
    assert.deepEqual(capturedData, { status: "ARCHIVED" });
    assert.equal(result?.status, "ARCHIVED");
    assert.equal(result?.applicantCount, 3);
  });

  it("updates only B-owned screening fields", async () => {
    let capturedData: Record<string, unknown> | null = null;
    const application = {
      applicationId: 77,
      postingId: 101,
      candidateId: 44,
      applicationStatus: "SUBMITTED",
      documentStatus: "NOT_SUBMITTED",
      interviewStatus: "NOT_READY",
      reportStatus: "PENDING",
      screeningDecision: "HOLD",
      screeningMemo: "추가 확인 필요",
      submittedAt: null,
      updatedAt: new Date("2026-06-29T00:00:00.000Z"),
      candidate: {
        candidateId: 44,
        user: {
          userId: 88,
          email: "kim@example.com",
          name: "Kim Applicant",
          phone: null,
        },
      },
      posting: {
        postingId: 101,
        title: "Backend Developer",
        jobRole: "Backend",
      },
      evaluationReports: [],
      interviewSessions: [],
    };
    const prisma = {
      application: {
        async findFirst() {
          return { applicationId: 77 };
        },
        async update(args: { data: Record<string, unknown> }) {
          capturedData = args.data;
          return application;
        },
      },
    };
    const repository = new PrismaCompanyRecruitingRepository(prisma as never);

    await repository.updateApplicationScreening(77, 7, {
      screeningDecision: "HOLD",
      screeningMemo: "추가 확인 필요",
    });

    assert.deepEqual(capturedData, {
      screeningDecision: "HOLD",
      screeningMemo: "추가 확인 필요",
    });
  });

  it("creates file_assets metadata for JD editor image uploads", async () => {
    let capturedData: Record<string, unknown> | null = null;
    const prisma = {
      fileAsset: {
        async create(args: { data: Record<string, unknown> }) {
          capturedData = args.data;
          return {
            fileId: 501n,
            ownerUserId: 1n,
            storageKey: "company/7/jd-images/image.webp",
            originalName: "image.webp",
            mimeType: "image/webp",
            sizeBytes: 245760n,
            status: "ACTIVE",
            createdAt: new Date("2026-07-02T00:00:00.000Z"),
          };
        },
      },
    };
    const repository = new PrismaCompanyRecruitingRepository(prisma as never);

    const result = await repository.createFileAsset({
      ownerUserId: 1,
      storageKey: "company/7/jd-images/image.webp",
      originalName: "image.webp",
      mimeType: "image/webp",
      sizeBytes: 245_760,
    });

    assert.deepEqual(capturedData, {
      ownerUserId: 1n,
      storageKey: "company/7/jd-images/image.webp",
      originalName: "image.webp",
      mimeType: "image/webp",
      sizeBytes: 245760n,
      status: "ACTIVE",
    });
    assert.equal(result.fileId, 501);
    assert.equal(result.storageKey, "company/7/jd-images/image.webp");
    assert.equal(result.status, "ACTIVE");
  });
});
