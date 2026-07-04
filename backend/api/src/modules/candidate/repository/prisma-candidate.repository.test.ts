import assert from "node:assert/strict";

import { CandidateDomainError } from "../candidate.errors";
import { PrismaCandidateRepository } from "./prisma-candidate.repository";

describe("PrismaCandidateRepository", () => {
  it("queries only candidate-visible postings from the shared postings table", async () => {
    let capturedArgs: unknown;
    const prisma = {
      posting: {
        async findMany(args: unknown) {
          capturedArgs = args;
          return [];
        },
      },
    };
    const repository = new PrismaCandidateRepository(prisma as never);

    await repository.listJobs();

    assert.deepEqual(capturedArgs, {
      where: {
        status: {
          in: ["OPEN", "CLOSING_SOON"],
        },
      },
      include: { company: { include: { logoFile: true } } },
      orderBy: { createdAt: "desc" },
    });
  });

  it("maps company logo file storage key to a public candidate job logo URL", async () => {
    const originalPublicBaseUrl = process.env.S3_PUBLIC_BASE_URL;
    process.env.S3_PUBLIC_BASE_URL = "https://cdn.example.com/assets";
    const createdAt = new Date("2026-07-01T00:00:00.000Z");
    const prisma = {
      posting: {
        async findMany() {
          return [
            {
              postingId: 101n,
              companyId: 7n,
              status: "OPEN",
              startsOn: new Date("2026-07-01T00:00:00.000Z"),
              endsOn: new Date("2026-07-31T00:00:00.000Z"),
              createdAt,
              title: "Backend Developer",
              jobRole: "Backend",
              jobDescription: "NestJS API",
              company: {
                name: "Init Labs",
                industry: "SaaS",
                profile: "AI recruiting workflow",
                logoFile: {
                  storageKey: "company/7/profile-logo/init logo.png",
                },
              },
            },
          ];
        },
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
    assert.deepEqual(candidateProfileData, { githubUrl: "https://github.com/init/project" });
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
