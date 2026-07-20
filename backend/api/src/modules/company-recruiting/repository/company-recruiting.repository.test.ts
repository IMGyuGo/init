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
    let capturedInclude: Record<string, unknown> | null = null;
    const prisma = {
      posting: {
        async findFirst(args: { where: Record<string, unknown> }) {
          capturedWhere = args.where;
          return { postingId: 101n };
        },
        async update(args: { data: Record<string, unknown>; include: Record<string, unknown> }) {
          capturedData = args.data;
          capturedInclude = args.include;
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
    assert.deepEqual(capturedInclude, {
      _count: {
        select: {
          applications: {
            where: { applicationStatus: { not: "CANCELED" } },
          },
        },
      },
    });
    assert.equal(result?.status, "ARCHIVED");
    assert.equal(result?.applicantCount, 3);
  });

  it("applies active-only filters and stable ordering to applicant pages", async () => {
    const capturedWheres: Record<string, unknown>[] = [];
    let capturedOrderBy: unknown;
    let capturedInclude: unknown;
    const prisma = {
      application: {
        async findMany(args: { where: Record<string, unknown>; orderBy: unknown; include: unknown }) {
          capturedWheres.push(args.where);
          capturedOrderBy = args.orderBy;
          capturedInclude = args.include;
          return [];
        },
        async count(args: { where: Record<string, unknown> }) {
          capturedWheres.push(args.where);
          return 0;
        },
      },
    };
    const repository = new PrismaCompanyRecruitingRepository(prisma as never);
    const query = {
      skip: 0,
      take: 20,
      sort: "interviewStatus",
      order: "asc",
      q: "kim",
      documentStatus: "EXTRACTED",
      screeningDecision: "UNDECIDED",
    } as never;

    assert.deepEqual(await repository.listApplicationsForPosting(101, 7, query), []);
    assert.equal(await repository.countApplicationsForPosting(101, 7, query), 0);
    assert.deepEqual(capturedWheres, [
      {
        postingId: 101n,
        posting: { companyId: 7n },
        applicationStatus: { not: "CANCELED" },
        documentStatus: "EXTRACTED",
        AND: [{ OR: [{ screeningDecision: "UNDECIDED" }, { screeningDecision: null }] }],
        OR: [
          { candidate: { user: { name: { contains: "kim", mode: "insensitive" } } } },
          { candidate: { user: { email: { contains: "kim", mode: "insensitive" } } } },
        ],
      },
      {
        postingId: 101n,
        posting: { companyId: 7n },
        applicationStatus: { not: "CANCELED" },
        documentStatus: "EXTRACTED",
        AND: [{ OR: [{ screeningDecision: "UNDECIDED" }, { screeningDecision: null }] }],
        OR: [
          { candidate: { user: { name: { contains: "kim", mode: "insensitive" } } } },
          { candidate: { user: { email: { contains: "kim", mode: "insensitive" } } } },
        ],
      },
    ]);
    assert.deepEqual(capturedOrderBy, [{ interviewStatus: "asc" }, { applicationId: "asc" }]);
    assert.equal((capturedInclude as { evaluationReports: { select: Record<string, boolean> } }).evaluationReports.select.scores, undefined);
  });

  it("summarizes all active applicants without loading detail relations", async () => {
    const countWheres: Array<Record<string, unknown>> = [];
    const groupBys: string[] = [];
    const prisma = {
      application: {
        async count(args: { where: Record<string, unknown> }) {
          countWheres.push(args.where);
          if (args.where.applicationStatus === "CANCELED") return 2;
          if (args.where.OR) return 3;
          return 10;
        },
        async groupBy(args: { by: string[] }) {
          const field = args.by[0];
          groupBys.push(field);
          if (field === "screeningDecision") {
            return [
              { screeningDecision: "UNDECIDED", _count: { _all: 7 } },
              { screeningDecision: null, _count: { _all: 3 } },
            ];
          }
          const values: Record<string, string> = {
            applicationStatus: "SUBMITTED",
            documentStatus: "EXTRACTED",
            interviewStatus: "COMPLETED",
            reportStatus: "COMPLETED",
            screeningDecision: "UNDECIDED",
          };
          return [{ [field]: values[field], _count: { _all: 10 } }];
        },
      },
    };
    const repository = new PrismaCompanyRecruitingRepository(prisma as never);

    const result = await repository.summarizeApplicationsForPosting(101, 7);

    assert.equal(result.activeTotal, 10);
    assert.equal(result.canceledHistoryTotal, 2);
    assert.equal(result.attentionRequiredTotal, 3);
    assert.equal(result.applicationStatusCounts.SUBMITTED, 10);
    assert.equal(result.interviewStatusCounts.COMPLETED, 10);
    assert.equal(result.screeningDecisionCounts.UNDECIDED, 10);
    assert.deepEqual(groupBys, [
      "applicationStatus",
      "documentStatus",
      "interviewStatus",
      "reportStatus",
      "screeningDecision",
    ]);
    assert.equal(countWheres.length, 3);
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

  it("does not attach duplicate follow-up answer text to the wrong parent answer", async () => {
    const duplicateFollowUp = "구체적인 실행 과정을 설명해 주세요.";
    const prisma = {
      application: {
        async findFirst() {
          return {
            applicationId: 77n,
            postingId: 101n,
            candidateId: 44n,
            applicationStatus: "SUBMITTED",
            documentStatus: "SUBMITTED",
            interviewStatus: "COMPLETED",
            reportStatus: "COMPLETED",
            screeningDecision: "UNDECIDED",
            screeningMemo: null,
            submittedAt: new Date("2026-07-01T00:00:00.000Z"),
            updatedAt: new Date("2026-07-01T00:20:00.000Z"),
            candidate: {
              candidateId: 44n,
              user: {
                userId: 88n,
                email: "kim@example.com",
                name: "Kim Applicant",
                phone: null,
              },
            },
            posting: {
              postingId: 101n,
              title: "Backend Developer",
              jobRole: "Backend",
            },
            evaluationReports: [],
            interviewSessions: [
              {
                sessionId: 901n,
                status: "COMPLETED",
                interviewType: "RECRUITING",
                startedAt: new Date("2026-07-01T00:01:00.000Z"),
                completedAt: new Date("2026-07-01T00:10:00.000Z"),
                answers: [
                  {
                    answerId: 1001n,
                    questionId: 501n,
                    question: {
                      questionId: 501n,
                      questionType: "TECHNICAL",
                      content: "첫 번째 기본 질문",
                    },
                    transcript: "첫 번째 기본 답변",
                    durationSeconds: 30,
                    submittedAt: new Date("2026-07-01T00:02:00.000Z"),
                    followUpQuestions: [
                      {
                        followUpId: 7001n,
                        answerId: 1001n,
                        insertedSessionQuestionId: 6001n,
                        content: duplicateFollowUp,
                        generationStatus: "GENERATED",
                        policy: "RECRUITING",
                        createdAt: new Date("2026-07-01T00:02:10.000Z"),
                      },
                    ],
                  },
                  {
                    answerId: 1002n,
                    questionId: 502n,
                    question: {
                      questionId: 502n,
                      questionType: "TECHNICAL",
                      content: "두 번째 기본 질문",
                    },
                    transcript: "두 번째 기본 답변",
                    durationSeconds: 32,
                    submittedAt: new Date("2026-07-01T00:04:00.000Z"),
                    followUpQuestions: [
                      {
                        followUpId: 7002n,
                        answerId: 1002n,
                        insertedSessionQuestionId: 6002n,
                        content: duplicateFollowUp,
                        generationStatus: "GENERATED",
                        policy: "RECRUITING",
                        createdAt: new Date("2026-07-01T00:04:10.000Z"),
                      },
                    ],
                  },
                  {
                    answerId: 1003n,
                    questionId: null,
                    sessionQuestionId: 6002n,
                    question: null,
                    sessionQuestion: {
                      sessionQuestionId: 6002n,
                      runtimeQuestionId: 9003n,
                      questionType: "FOLLOW_UP",
                      content: duplicateFollowUp,
                    },
                    transcript: "두 번째 꼬리질문 답변",
                    durationSeconds: 18,
                    submittedAt: new Date("2026-07-01T00:05:00.000Z"),
                    followUpQuestions: [],
                  },
                ],
              },
            ],
          };
        },
      },
    };
    const repository = new PrismaCompanyRecruitingRepository(prisma as never);

    const result = await repository.findApplicationForCompany(77, 7);

    const answers = result?.interviewSessions[0]?.answers ?? [];
    assert.equal(answers[0]?.followUpQuestions[0]?.answer, null);
    assert.equal(answers[1]?.followUpQuestions[0]?.answer?.answerId, 1003);
    assert.equal(answers[1]?.followUpQuestions[0]?.answer?.transcript, "두 번째 꼬리질문 답변");
    assert.equal(answers[2]?.questionId, 9003);
    assert.equal(answers[2]?.questionType, "FOLLOW_UP");
  });
});
