import assert from "node:assert/strict";

import { CompanyRecruitingService } from "./company-recruiting.service";
import type { ApplicantRecord } from "../company-recruiting.types";

const companyUser = {
  userId: 1,
  userType: "COMPANY" as const,
  companyId: 7,
  candidateId: null,
};

function createRepository(overrides: Record<string, unknown> = {}) {
  const calls: Record<string, unknown[]> = {};
  const applicant = createApplicantRecord();
  const repository = {
    calls,
    async createPosting(input: unknown) {
      calls.createPosting = [input];
      return {
        postingId: 101,
        companyId: 7,
        title: "Backend Developer",
        jobRole: "Backend",
        jobDescription: "Build APIs",
        careerRequirement: (input as { careerRequirement?: string | null }).careerRequirement ?? null,
        educationRequirement: (input as { educationRequirement?: string | null }).educationRequirement ?? null,
        salaryInfo: (input as { salaryInfo?: string | null }).salaryInfo ?? null,
        workLocation: (input as { workLocation?: string | null }).workLocation ?? null,
        employmentType: (input as { employmentType?: string | null }).employmentType ?? null,
        jobRoleCode: (input as { jobRoleCode?: string | null }).jobRoleCode ?? null,
        regionCode: (input as { regionCode?: string | null }).regionCode ?? null,
        careerMinYears: (input as { careerMinYears?: number | null }).careerMinYears ?? null,
        careerMaxYears: (input as { careerMaxYears?: number | null }).careerMaxYears ?? null,
        employmentTypeCode: (input as { employmentTypeCode?: string | null }).employmentTypeCode ?? null,
        recruitmentType: (input as { recruitmentType?: string | null }).recruitmentType ?? null,
        startsOn: new Date("2026-06-29T00:00:00.000Z"),
        endsOn: new Date("2026-07-15T00:00:00.000Z"),
        status: "OPEN",
        createdAt: new Date("2026-06-29T00:00:00.000Z"),
        updatedAt: new Date("2026-06-29T00:00:00.000Z"),
        applicantCount: 0,
      };
    },
    async updatePosting(postingId: number, companyId: number, input: unknown) {
      calls.updatePosting = [postingId, companyId, input];
      return {
        postingId,
        companyId,
        title: (input as { title: string }).title,
        jobRole: (input as { jobRole: string }).jobRole,
        jobDescription: (input as { jobDescription: string | null }).jobDescription,
        careerRequirement: (input as { careerRequirement?: string | null }).careerRequirement ?? null,
        educationRequirement: (input as { educationRequirement?: string | null }).educationRequirement ?? null,
        salaryInfo: (input as { salaryInfo?: string | null }).salaryInfo ?? null,
        workLocation: (input as { workLocation?: string | null }).workLocation ?? null,
        employmentType: (input as { employmentType?: string | null }).employmentType ?? null,
        jobRoleCode: (input as { jobRoleCode?: string | null }).jobRoleCode ?? null,
        regionCode: (input as { regionCode?: string | null }).regionCode ?? null,
        careerMinYears: (input as { careerMinYears?: number | null }).careerMinYears ?? null,
        careerMaxYears: (input as { careerMaxYears?: number | null }).careerMaxYears ?? null,
        employmentTypeCode: (input as { employmentTypeCode?: string | null }).employmentTypeCode ?? null,
        recruitmentType: (input as { recruitmentType?: string | null }).recruitmentType ?? null,
        startsOn: (input as { startsOn: Date | null }).startsOn,
        endsOn: (input as { endsOn: Date | null }).endsOn,
        status: (input as { status: string }).status,
        createdAt: new Date("2026-06-29T00:00:00.000Z"),
        updatedAt: new Date("2026-06-30T00:00:00.000Z"),
        applicantCount: 2,
      };
    },
    async archivePosting(postingId: number, companyId: number) {
      calls.archivePosting = [postingId, companyId];
      return {
        postingId,
        companyId,
        title: "Backend Developer",
        jobRole: "Backend",
        jobDescription: "Build APIs",
        careerRequirement: null,
        educationRequirement: null,
        salaryInfo: null,
        workLocation: null,
        employmentType: null,
        jobRoleCode: null,
        regionCode: null,
        careerMinYears: null,
        careerMaxYears: null,
        employmentTypeCode: null,
        recruitmentType: null,
        startsOn: null,
        endsOn: null,
        status: "ARCHIVED",
        createdAt: new Date("2026-06-29T00:00:00.000Z"),
        updatedAt: new Date("2026-06-30T00:00:00.000Z"),
        applicantCount: 2,
      };
    },
    async listPostings(companyId: number, query: unknown) {
      calls.listPostings = [companyId, query];
      return [];
    },
    async countPostings(companyId: number, query: unknown) {
      calls.countPostings = [companyId, query];
      return 0;
    },
    async findPostingForCompany(postingId: number, companyId: number) {
      calls.findPostingForCompany = [postingId, companyId];
      return {
        postingId,
        companyId,
        title: "Backend Developer",
        jobRole: "Backend",
        jobDescription: "Build APIs",
        careerRequirement: null,
        educationRequirement: null,
        salaryInfo: null,
        workLocation: null,
        employmentType: null,
        jobRoleCode: null,
        regionCode: null,
        careerMinYears: null,
        careerMaxYears: null,
        employmentTypeCode: null,
        recruitmentType: null,
        startsOn: null,
        endsOn: null,
        status: "OPEN",
        createdAt: new Date("2026-06-29T00:00:00.000Z"),
        updatedAt: new Date("2026-06-29T00:00:00.000Z"),
        applicantCount: 0,
      };
    },
    async findOpenPostingForPublic(postingId: number) {
      calls.findOpenPostingForPublic = [postingId];
      return {
        postingId,
        companyName: "INIT Corp",
        title: "Backend Developer",
        jobRole: "Backend",
        jobDescription: "Build APIs",
        careerRequirement: "경력무관",
        educationRequirement: "학력무관",
        salaryInfo: "회사 내규에 따름",
        workLocation: "서울",
        employmentType: "정규직",
        jobRoleCode: "서버·백엔드",
        regionCode: "서울",
        careerMinYears: null,
        careerMaxYears: null,
        employmentTypeCode: "정규직",
        recruitmentType: "마감형",
        startsOn: new Date("2026-06-29T00:00:00.000Z"),
        endsOn: new Date("2026-07-15T00:00:00.000Z"),
        status: "OPEN",
      };
    },
    async findApplicationByPostingAndEmail(postingId: number, email: string) {
      calls.findApplicationByPostingAndEmail = [postingId, email];
      return null;
    },
    async findUserAccountByEmail(email: string) {
      calls.findUserAccountByEmail = [email];
      return null;
    },
    async findPublicApplicationStatusById(applicationId: number) {
      calls.findPublicApplicationStatusById = [applicationId];
      return applicationId === applicant.applicationId ? applicant : null;
    },
    async findOrCreateCandidate(input: unknown) {
      calls.findOrCreateCandidate = [input];
      return { candidateId: 44 };
    },
    async findOrCreatePublicCandidate(input: unknown) {
      calls.findOrCreatePublicCandidate = [input];
      return { candidateId: 44, userId: 88 };
    },
    async createApplication(input: unknown) {
      calls.createApplication = [input];
      return {
        ...applicant,
        screeningMemo: (input as { screeningMemo?: string | null }).screeningMemo ?? null,
      };
    },
    async listApplicationsForPosting(postingId: number, companyId: number, query: unknown) {
      calls.listApplicationsForPosting = [postingId, companyId, query];
      return [];
    },
    async countApplicationsForPosting(postingId: number, companyId: number, query: unknown) {
      calls.countApplicationsForPosting = [postingId, companyId, query];
      return 0;
    },
    async findApplicationForCompany(applicationId: number, companyId: number) {
      calls.findApplicationForCompany = [applicationId, companyId];
      return applicationId === applicant.applicationId && companyId === 7 ? applicant : null;
    },
    async updateApplicationScreening(applicationId: number, companyId: number, input: unknown) {
      calls.updateApplicationScreening = [applicationId, companyId, input];
      return {
        ...applicant,
        screeningDecision: (input as { screeningDecision: string }).screeningDecision,
        screeningMemo: (input as { screeningMemo?: string | null }).screeningMemo ?? null,
      };
    },
    async createFileAsset(input: unknown) {
      calls.createFileAsset = [input];
      return {
        fileId: 501,
        ownerUserId: (input as { ownerUserId: number }).ownerUserId,
        storageKey: (input as { storageKey: string }).storageKey,
        originalName: (input as { originalName: string }).originalName,
        mimeType: (input as { mimeType: string }).mimeType,
        sizeBytes: (input as { sizeBytes: number }).sizeBytes,
        status: "ACTIVE",
        createdAt: new Date("2026-07-02T00:00:00.000Z"),
      };
    },
    async createApplicationDocument(input: unknown) {
      calls.createApplicationDocument = [input];
      return { documentId: 9001 };
    },
    ...overrides,
  };
  return repository;
}

function createApplicantRecord(overrides: Partial<ApplicantRecord> = {}): ApplicantRecord {
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
        phone: "010-0000-0000",
      },
    },
    posting: {
      postingId: 101,
      title: "Backend Developer",
      jobRole: "Backend",
    },
    evaluationReports: [],
    interviewSessions: [],
    ...overrides,
  };
}

function createPublicApplicationAuthAdapter(
  tokenPayload: { applicationId: number; recruitmentId: number; email: string; purpose: "PUBLIC_APPLICATION_STATUS"; createdAt: string } | null = {
    applicationId: 77,
    recruitmentId: 101,
    email: "kim@example.com",
    purpose: "PUBLIC_APPLICATION_STATUS",
    createdAt: "2026-06-29T00:00:00.000Z",
  },
) {
  const calls: Record<string, unknown[]> = {};
  return {
    calls,
    async requestEmailVerification(input: unknown) {
      calls.requestEmailVerification = [input];
      return {
        emailVerificationStatus: "PENDING" as const,
        nextAction: "CHECK_EMAIL" as const,
        temporary: false as const,
        temporaryBoundary: null,
        magicLinkDeliveryStatus: "SENT" as const,
        magicLinkExpiresInSeconds: 604800,
      };
    },
    async verifyApplicationStatusToken(token: string) {
      calls.verifyApplicationStatusToken = [token];
      return tokenPayload;
    },
  };
}

function createStorageAdapter() {
  const calls: Record<string, unknown[]> = {};
  return {
    calls,
    async putObject(input: unknown) {
      calls.putObject = [...(calls.putObject ?? []), input];
    },
  };
}

function createUploadFile(originalName: string, mimeType = "application/pdf") {
  return {
    originalName,
    mimeType,
    sizeBytes: 2048,
    buffer: Buffer.from(`${originalName}-bytes`),
  };
}

describe("CompanyRecruitingService", () => {
  it("creates recruitments for the current company only", async () => {
    const repository = createRepository();
    const service = new CompanyRecruitingService(repository);

    const result = await service.createRecruitment(companyUser, {
      title: "Backend Developer",
      jobRole: "Backend",
      jobDescription: "Build APIs",
      careerRequirement: "경력 3년 이상",
      educationRequirement: "대졸 이상",
      salaryInfo: "연봉 4,000만원 이상",
      workLocation: "판교",
      employmentType: "정규직",
      startsOn: "2026-06-29",
      endsOn: "2026-07-15",
      status: "OPEN",
    });

    assert.equal(result.companyId, 7);
    assert.equal(result.status, "OPEN");
    assert.equal(result.careerRequirement, "경력 3년 이상");
    assert.equal(result.workLocation, "판교");
    assert.deepEqual(repository.calls.createPosting, [
      {
        companyId: 7,
        title: "Backend Developer",
        jobRole: "Backend",
        jobDescription: "Build APIs",
        careerRequirement: "경력 3년 이상",
        educationRequirement: "대졸 이상",
        salaryInfo: "연봉 4,000만원 이상",
        workLocation: "판교",
        employmentType: "정규직",
        jobRoleCode: undefined,
        regionCode: undefined,
        careerMinYears: undefined,
        careerMaxYears: undefined,
        employmentTypeCode: undefined,
        recruitmentType: undefined,
        startsOn: new Date("2026-06-29T00:00:00.000Z"),
        endsOn: new Date("2026-07-15T00:00:00.000Z"),
        status: "OPEN",
      },
    ]);
  });

  it("rejects recruitment creation when careerMinYears is greater than careerMaxYears", async () => {
    const repository = createRepository();
    const service = new CompanyRecruitingService(repository);

    await assert.rejects(
      service.createRecruitment(companyUser, {
        title: "Backend Developer",
        jobRole: "Backend",
        careerMinYears: 5,
        careerMaxYears: 2,
        status: "OPEN",
      }),
      (error: unknown) =>
        typeof error === "object" && error !== null && "code" in error && error.code === "COMMON_VALIDATION_FAILED",
    );
    assert.equal(repository.calls.createPosting, undefined);
  });

  it("rejects recruitment update when careerMinYears is greater than careerMaxYears", async () => {
    const repository = createRepository();
    const service = new CompanyRecruitingService(repository);

    await assert.rejects(
      service.updateRecruitment(companyUser, 101, {
        title: "Backend Developer",
        jobRole: "Backend",
        careerMinYears: 8,
        careerMaxYears: 3,
        status: "OPEN",
      }),
      (error: unknown) =>
        typeof error === "object" && error !== null && "code" in error && error.code === "COMMON_VALIDATION_FAILED",
    );
    assert.equal(repository.calls.updatePosting, undefined);
  });

  it("rejects update when only careerMinYears is sent and inverts existing careerMaxYears", async () => {
    const repository = createRepository({
      async findPostingForCompany(postingId: number, companyId: number) {
        return {
          postingId,
          companyId,
          title: "Backend Developer",
          jobRole: "Backend",
          jobDescription: "Build APIs",
          careerMinYears: null,
          careerMaxYears: 3,
          startsOn: null,
          endsOn: null,
          status: "OPEN",
          createdAt: new Date("2026-06-29T00:00:00.000Z"),
          updatedAt: new Date("2026-06-29T00:00:00.000Z"),
          applicantCount: 0,
        };
      },
    });
    const service = new CompanyRecruitingService(repository);

    await assert.rejects(
      service.updateRecruitment(companyUser, 101, {
        title: "Backend Developer",
        jobRole: "Backend",
        careerMinYears: 8,
        status: "OPEN",
      }),
      (error: unknown) =>
        typeof error === "object" && error !== null && "code" in error && error.code === "COMMON_VALIDATION_FAILED",
    );
    assert.equal(repository.calls.updatePosting, undefined);
  });

  it("rejects update when only careerMaxYears is sent and inverts existing careerMinYears", async () => {
    const repository = createRepository({
      async findPostingForCompany(postingId: number, companyId: number) {
        return {
          postingId,
          companyId,
          title: "Backend Developer",
          jobRole: "Backend",
          jobDescription: "Build APIs",
          careerMinYears: 5,
          careerMaxYears: null,
          startsOn: null,
          endsOn: null,
          status: "OPEN",
          createdAt: new Date("2026-06-29T00:00:00.000Z"),
          updatedAt: new Date("2026-06-29T00:00:00.000Z"),
          applicantCount: 0,
        };
      },
    });
    const service = new CompanyRecruitingService(repository);

    await assert.rejects(
      service.updateRecruitment(companyUser, 101, {
        title: "Backend Developer",
        jobRole: "Backend",
        careerMaxYears: 3,
        status: "OPEN",
      }),
      (error: unknown) =>
        typeof error === "object" && error !== null && "code" in error && error.code === "COMMON_VALIDATION_FAILED",
    );
    assert.equal(repository.calls.updatePosting, undefined);
  });

  it("uploads JD editor images to object storage and stores file_assets metadata", async () => {
    const storageAdapter = createStorageAdapter();
    const repository = createRepository({
      async createFileAsset(input: unknown) {
        repository.calls.createFileAsset = [input];
        return {
          fileId: 501,
          ownerUserId: (input as { ownerUserId: number }).ownerUserId,
          storageKey: (input as { storageKey: string }).storageKey,
          originalName: (input as { originalName: string }).originalName,
          mimeType: (input as { mimeType: string }).mimeType,
          sizeBytes: (input as { sizeBytes: number }).sizeBytes,
          status: "ACTIVE",
          createdAt: new Date("2026-07-02T00:00:00.000Z"),
        };
      },
    });
    const service = new CompanyRecruitingService(repository, storageAdapter, {
      jdImagePublicBaseUrl: "https://cdn.example.com/assets",
      jdImageMaxUploadBytes: 5 * 1024 * 1024,
    });

    const result = await service.uploadJobDescriptionImage(companyUser, {
      originalName: "culture.webp",
      mimeType: "image/webp",
      sizeBytes: 245_760,
      buffer: Buffer.from("image-bytes"),
    });

    assert.equal(result.fileId, 501);
    assert.equal(result.ownerUserId, companyUser.userId);
    assert.equal(result.originalName, "culture.webp");
    assert.equal(result.mimeType, "image/webp");
    assert.equal(result.sizeBytes, 245_760);
    assert.match(result.storageKey, /^company\/7\/jd-images\/[0-9a-f-]+-culture\.webp$/);
    assert.equal(result.url, `https://cdn.example.com/assets/${result.storageKey}`);
    assert.deepEqual(repository.calls.createFileAsset, [
      {
        ownerUserId: 1,
        storageKey: result.storageKey,
        originalName: "culture.webp",
        mimeType: "image/webp",
        sizeBytes: 245_760,
      },
    ]);
    assert.deepEqual(storageAdapter.calls.putObject, [
      {
        key: result.storageKey,
        body: Buffer.from("image-bytes"),
        contentType: "image/webp",
        contentLength: 245_760,
      },
    ]);
  });

  it("normalizes mojibake Korean JD image filenames before storing metadata", async () => {
    const storageAdapter = createStorageAdapter();
    const repository = createRepository({
      async createFileAsset(input: unknown) {
        repository.calls.createFileAsset = [input];
        return {
          fileId: 502,
          ownerUserId: (input as { ownerUserId: number }).ownerUserId,
          storageKey: (input as { storageKey: string }).storageKey,
          originalName: (input as { originalName: string }).originalName,
          mimeType: (input as { mimeType: string }).mimeType,
          sizeBytes: (input as { sizeBytes: number }).sizeBytes,
          status: "ACTIVE",
          createdAt: new Date("2026-07-02T00:00:00.000Z"),
        };
      },
    });
    const service = new CompanyRecruitingService(repository, storageAdapter, {
      jdImagePublicBaseUrl: "https://cdn.example.com/assets",
    });
    const normalizedName = "스크린샷 2026-07-04 오전 11.36.41.png";
    const mojibakeName = Buffer.from(normalizedName.normalize("NFD"), "utf8").toString("latin1");

    const result = await service.uploadJobDescriptionImage(companyUser, {
      originalName: mojibakeName,
      mimeType: "image/png",
      sizeBytes: 245_760,
      buffer: Buffer.from("image-bytes"),
    });

    assert.equal(result.originalName, normalizedName);
    assert.equal((repository.calls.createFileAsset as Array<{ originalName: string }>)[0]?.originalName, normalizedName);
    assert.doesNotMatch(result.storageKey, /á/);
  });

  it("rejects JD editor image uploads with unsupported MIME types", async () => {
    const storageAdapter = createStorageAdapter();
    const repository = createRepository();
    const service = new CompanyRecruitingService(repository, storageAdapter);

    await assert.rejects(
      service.uploadJobDescriptionImage(companyUser, {
        originalName: "animation.gif",
        mimeType: "image/gif",
        sizeBytes: 1024,
        buffer: Buffer.from("gif"),
      }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "FILE_INVALID_TYPE",
    );
    assert.equal(storageAdapter.calls.putObject, undefined);
    assert.equal(repository.calls.createFileAsset, undefined);
  });

  it("rejects JD editor image uploads over the configured size limit", async () => {
    const storageAdapter = createStorageAdapter();
    const repository = createRepository();
    const service = new CompanyRecruitingService(repository, storageAdapter, {
      jdImageMaxUploadBytes: 4,
    });

    await assert.rejects(
      service.uploadJobDescriptionImage(companyUser, {
        originalName: "large.png",
        mimeType: "image/png",
        sizeBytes: 5,
        buffer: Buffer.from("large"),
      }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "FILE_SIZE_EXCEEDED",
    );
    assert.equal(storageAdapter.calls.putObject, undefined);
    assert.equal(repository.calls.createFileAsset, undefined);
  });

  it("lists recruitments using CurrentUser.companyId", async () => {
    const repository = createRepository();
    const service = new CompanyRecruitingService(repository);

    await service.listRecruitments(companyUser, {
      page: 2,
      limit: 10,
      q: "backend",
      sort: "createdAt",
      order: "asc",
    });

    assert.deepEqual(repository.calls.listPostings, [
      7,
      {
        page: 2,
        limit: 10,
        q: "backend",
        sort: "createdAt",
        order: "asc",
        skip: 10,
        take: 10,
      },
    ]);
  });

  it("lists recruitments with keyword alias and posting status filter", async () => {
    const repository = createRepository();
    const service = new CompanyRecruitingService(repository);

    await service.listRecruitments(companyUser, {
      page: 1,
      limit: 20,
      keyword: "frontend",
      status: "CLOSED",
      sort: "status",
      order: "desc",
    });

    assert.deepEqual(repository.calls.listPostings, [
      7,
      {
        page: 1,
        limit: 20,
        q: "frontend",
        status: "CLOSED",
        sort: "status",
        order: "desc",
        skip: 0,
        take: 20,
      },
    ]);
  });

  it("exposes only public recruitment fields for OPEN postings", async () => {
    const repository = createRepository();
    const service = new CompanyRecruitingService(repository);

    const result = await service.getPublicRecruitment(101);

    assert.deepEqual(repository.calls.findOpenPostingForPublic, [101]);
    assert.equal(result.recruitmentId, 101);
    assert.equal(result.companyName, "INIT Corp");
    assert.equal(result.status, "OPEN");
    assert.equal("companyId" in result, false);
    assert.equal("applicantCount" in result, false);
  });

  it("stores public applications as pending candidate applications", async () => {
    const storageAdapter = createStorageAdapter();
    const repository = createRepository();
    const publicApplicationAuthAdapter = createPublicApplicationAuthAdapter();
    const service = new CompanyRecruitingService(repository, storageAdapter, {}, publicApplicationAuthAdapter);

    const result = await service.submitPublicApplication(
      101,
      {
        name: "김지원",
        email: " JIWON@EXAMPLE.COM ",
        phone: "010-0000-0000",
        portfolioUrl: "https://github.com/jiwon",
        resumeText: "백엔드 프로젝트 경험이 있습니다.",
        consentAgreed: true,
      },
      {
        resumeFile: createUploadFile("resume.pdf"),
      },
    );

    assert.deepEqual(repository.calls.findOpenPostingForPublic, [101]);
    assert.deepEqual(repository.calls.findApplicationByPostingAndEmail, [101, "jiwon@example.com"]);
    assert.deepEqual(repository.calls.findOrCreatePublicCandidate, [
      {
        name: "김지원",
        email: "jiwon@example.com",
        phone: "010-0000-0000",
        githubUrl: null,
        portfolioUrl: "https://github.com/jiwon",
        summary: "백엔드 프로젝트 경험이 있습니다.",
      },
    ]);
    assert.deepEqual(repository.calls.createApplication, [{ postingId: 101, candidateId: 44, screeningMemo: null, documentStatus: "SUBMITTED" }]);
    assert.deepEqual(publicApplicationAuthAdapter.calls.requestEmailVerification, [
      {
        applicationId: 77,
        recruitmentId: 101,
        email: "jiwon@example.com",
      },
    ]);
    assert.equal(result.email, "jiwon@example.com");
    assert.equal(result.applicationStatus, "SUBMITTED");
    assert.equal(result.emailVerificationStatus, "PENDING");
    assert.equal(result.nextAction, "CHECK_EMAIL");
    assert.equal(result.temporary, false);
    assert.equal(result.temporaryBoundary, null);
    assert.equal(result.magicLinkDeliveryStatus, "SENT");
    assert.equal(result.magicLinkExpiresInSeconds, 604800);
  });

  it("stores public application resume and portfolio files as application documents", async () => {
    const storageAdapter = createStorageAdapter();
    const repository = createRepository({
      async findOrCreatePublicCandidate(input: unknown) {
        repository.calls.findOrCreatePublicCandidate = [input];
        return { candidateId: 44, userId: 88 };
      },
      async createApplicationDocument(input: unknown) {
        repository.calls.createApplicationDocument = [...(repository.calls.createApplicationDocument ?? []), input];
        return { documentId: 9001 };
      },
    });
    const publicApplicationAuthAdapter = createPublicApplicationAuthAdapter();
    const service = new CompanyRecruitingService(repository, storageAdapter, {}, publicApplicationAuthAdapter);

    await service.submitPublicApplication(
      101,
      {
        name: "김지원",
        email: "jiwon@example.com",
        phone: "010-0000-0000",
        githubBlogUrl: "https://github.com/jiwon",
        portfolioMode: "FILE",
        motivation: "크래프톤 백엔드 직무에 지원합니다.",
        additionalInfo: "대규모 트래픽 프로젝트 경험이 있습니다.",
        consentAgreed: true,
      },
      {
        resumeFile: createUploadFile("resume.pdf"),
        portfolioFile: createUploadFile("portfolio.pdf"),
      },
    );

    assert.deepEqual(repository.calls.findOrCreatePublicCandidate, [
      {
        name: "김지원",
        email: "jiwon@example.com",
        phone: "010-0000-0000",
        githubUrl: "https://github.com/jiwon",
        portfolioUrl: null,
        summary: "지원동기:\n크래프톤 백엔드 직무에 지원합니다.\n\n추가 설명:\n대규모 트래픽 프로젝트 경험이 있습니다.",
      },
    ]);
    assert.equal((storageAdapter.calls.putObject as unknown[]).length, 2);
    assert.equal((repository.calls.createApplicationDocument as unknown[]).length, 2);
    assert.deepEqual(repository.calls.createApplicationDocument, [
      { applicationId: 77, fileId: 501, documentType: "RESUME" },
      { applicationId: 77, fileId: 501, documentType: "PORTFOLIO" },
    ]);
  });

  it("requires a PDF resume file for public application submission", async () => {
    const storageAdapter = createStorageAdapter();
    const repository = createRepository();
    const service = new CompanyRecruitingService(repository, storageAdapter);

    await assert.rejects(
      () =>
        service.submitPublicApplication(
          101,
          {
            name: "김지원",
            email: "jiwon@example.com",
            phone: "010-0000-0000",
            consentAgreed: true,
          },
          { resumeFile: createUploadFile("resume.txt", "text/plain") },
        ),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "FILE_INVALID_TYPE",
    );
    assert.equal(storageAdapter.calls.putObject, undefined);
    assert.equal(repository.calls.createApplication, undefined);
  });

  it("returns public application status only after magic link token verification", async () => {
    const repository = createRepository();
    const publicApplicationAuthAdapter = createPublicApplicationAuthAdapter();
    const service = new CompanyRecruitingService(repository, undefined, {}, publicApplicationAuthAdapter);

    const result = await (service as unknown as { getPublicApplicationStatusByMagicLink(token: string): Promise<unknown> })
      .getPublicApplicationStatusByMagicLink("valid-token");

    assert.deepEqual(publicApplicationAuthAdapter.calls.verifyApplicationStatusToken, ["valid-token"]);
    assert.deepEqual(repository.calls.findPublicApplicationStatusById, [77]);
    assert.deepEqual(result, {
      applicationId: 77,
      recruitmentId: 101,
      email: "kim@example.com",
      name: "Kim Applicant",
      jobRole: "Backend",
      applicationStatus: "SUBMITTED",
      documentStatus: "NOT_SUBMITTED",
      interviewStatus: "NOT_READY",
      reportStatus: "PENDING",
      interviewEntry: {
        href: "/public/applications/77/interview",
        label: "면접 시작",
        enabled: true,
        integrationStatus: "D_PUBLIC_CONTEXT_PENDING",
        temporary: true,
        temporaryBoundary: "B_MODULE_PUBLIC_INTERVIEW_ADAPTER",
        message: "면접 시작은 D public interview access context 연동 후 활성화됩니다.",
      },
      submittedAt: null,
      updatedAt: "2026-06-29T00:00:00.000Z",
    });
  });

  it("rejects public application status when magic link token is invalid", async () => {
    const repository = createRepository();
    const publicApplicationAuthAdapter = createPublicApplicationAuthAdapter(null);
    const service = new CompanyRecruitingService(repository, undefined, {}, publicApplicationAuthAdapter);

    await assert.rejects(
      () =>
        (service as unknown as { getPublicApplicationStatusByMagicLink(token: string): Promise<unknown> })
          .getPublicApplicationStatusByMagicLink("expired-token"),
      /매직링크/,
    );
    assert.equal(repository.calls.findPublicApplicationStatusById, undefined);
  });

  it("verifies public application magic token for D public interview start", async () => {
    const repository = createRepository();
    const publicApplicationAuthAdapter = createPublicApplicationAuthAdapter();
    const service = new CompanyRecruitingService(repository, undefined, {}, publicApplicationAuthAdapter);

    const result = await service.verifyPublicApplicationTokenForInterviewStart("valid-token");

    assert.deepEqual(publicApplicationAuthAdapter.calls.verifyApplicationStatusToken, ["valid-token"]);
    assert.deepEqual(repository.calls.findPublicApplicationStatusById, [77]);
    assert.deepEqual(result, { applicationId: 77 });
  });

  it("rejects duplicate public application emails", async () => {
    const repository = createRepository({
      async findApplicationByPostingAndEmail() {
        return { applicationId: 77 };
      },
    });
    const service = new CompanyRecruitingService(repository);

    await assert.rejects(
      () =>
        service.submitPublicApplication(101, {
          name: "김지원",
          email: "jiwon@example.com",
          phone: "010-0000-0000",
          consentAgreed: true,
        }),
      /이미 이 공고에 지원한 이메일입니다/,
    );
    assert.equal(repository.calls.findOrCreatePublicCandidate, undefined);
  });

  it("maps concurrent duplicate public application writes to COMMON_CONFLICT", async () => {
    const repository = createRepository({
      async createApplication() {
        const error = new Error("Unique constraint failed on the fields: (`posting_id`,`candidate_id`)");
        Object.assign(error, {
          code: "P2002",
          meta: { target: ["postingId", "candidateId"] },
        });
        throw error;
      },
    });
    const storageAdapter = createStorageAdapter();
    const service = new CompanyRecruitingService(repository, storageAdapter);

    await assert.rejects(
      () =>
        service.submitPublicApplication(
          101,
          {
            name: "김지원",
            email: "jiwon@example.com",
            phone: "010-0000-0000",
            consentAgreed: true,
          },
          { resumeFile: createUploadFile("resume.pdf") },
        ),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "COMMON_CONFLICT",
    );
  });

  it("allows existing candidate emails to submit to a different public recruitment", async () => {
    const storageAdapter = createStorageAdapter();
    const repository = createRepository({
      async findUserAccountByEmail(email: string) {
        repository.calls.findUserAccountByEmail = [email];
        return { userId: 88, userType: "CANDIDATE", hasCandidateProfile: true };
      },
      async findOrCreatePublicCandidate(input: unknown) {
        repository.calls.findOrCreatePublicCandidate = [input];
        return { candidateId: 44, userId: 88 };
      },
    });
    const publicApplicationAuthAdapter = createPublicApplicationAuthAdapter();
    const service = new CompanyRecruitingService(repository, storageAdapter, {}, publicApplicationAuthAdapter);

    const result = await service.submitPublicApplication(
      202,
      {
        name: "김지원",
        email: "existing@example.com",
        phone: "010-0000-0000",
        consentAgreed: true,
      },
      { resumeFile: createUploadFile("resume.pdf") },
    );

    assert.deepEqual(repository.calls.findApplicationByPostingAndEmail, [202, "existing@example.com"]);
    assert.deepEqual(repository.calls.findUserAccountByEmail, ["existing@example.com"]);
    assert.deepEqual(repository.calls.findOrCreatePublicCandidate, [
      {
        name: "김지원",
        email: "existing@example.com",
        phone: "010-0000-0000",
        githubUrl: null,
        portfolioUrl: null,
        summary: null,
      },
    ]);
    assert.deepEqual(repository.calls.createApplication, [{ postingId: 202, candidateId: 44, screeningMemo: null, documentStatus: "SUBMITTED" }]);
    assert.equal(result.applicationStatus, "SUBMITTED");
  });

  it("rejects public submissions with company account emails", async () => {
    const repository = createRepository({
      async findUserAccountByEmail(email: string) {
        repository.calls.findUserAccountByEmail = [email];
        return { userId: 99, userType: "COMPANY", hasCandidateProfile: false };
      },
    });
    const service = new CompanyRecruitingService(repository);

    await assert.rejects(
      () =>
        service.submitPublicApplication(101, {
          name: "김지원",
          email: "company@example.com",
          phone: "010-0000-0000",
          consentAgreed: true,
        }),
      /지원자 계정이 아닌 이메일/,
    );
    assert.equal(repository.calls.findOrCreatePublicCandidate, undefined);
    assert.equal(repository.calls.createApplication, undefined);
  });

  it("requires consent for public application submission", async () => {
    const repository = createRepository();
    const service = new CompanyRecruitingService(repository);

    await assert.rejects(
      () =>
        service.submitPublicApplication(101, {
          name: "김지원",
          email: "jiwon@example.com",
          phone: "010-0000-0000",
          consentAgreed: false,
        }),
      /동의가 필요합니다/,
    );
    assert.equal(repository.calls.findApplicationByPostingAndEmail, undefined);
  });

  it("updates recruitment settings for the current company only", async () => {
    const repository = createRepository();
    const service = new CompanyRecruitingService(repository);

    const result = await service.updateRecruitment(companyUser, 101, {
      title: "Updated Backend Hiring",
      jobRole: "Backend Engineer",
      jobDescription: "Updated JD text",
      careerRequirement: "경력무관",
      educationRequirement: "학력무관",
      salaryInfo: "회사 내규에 따름",
      workLocation: "서울",
      employmentType: "계약직",
      startsOn: "2026-07-01",
      endsOn: "2026-07-31",
      status: "OPEN",
    });

    assert.equal(result.recruitmentId, 101);
    assert.equal(result.title, "Updated Backend Hiring");
    assert.equal(result.jobDescription, "Updated JD text");
    assert.equal(result.careerRequirement, "경력무관");
    assert.equal(result.employmentType, "계약직");
    assert.deepEqual(repository.calls.updatePosting, [
      101,
      7,
      {
        title: "Updated Backend Hiring",
        jobRole: "Backend Engineer",
        jobDescription: "Updated JD text",
        careerRequirement: "경력무관",
        educationRequirement: "학력무관",
        salaryInfo: "회사 내규에 따름",
        workLocation: "서울",
        employmentType: "계약직",
        jobRoleCode: undefined,
        regionCode: undefined,
        careerMinYears: undefined,
        careerMaxYears: undefined,
        employmentTypeCode: undefined,
        recruitmentType: undefined,
        startsOn: new Date("2026-07-01T00:00:00.000Z"),
        endsOn: new Date("2026-07-31T00:00:00.000Z"),
        status: "OPEN",
      },
    ]);
  });

  it("archives recruitment deletion requests for the current company only", async () => {
    const repository = createRepository({
      async findPostingForCompany(postingId: number, companyId: number) {
        return {
          postingId,
          companyId,
          title: "Draft Backend Hiring",
          jobRole: "Backend",
          jobDescription: "Build APIs",
          startsOn: null,
          endsOn: null,
          status: "DRAFT",
          createdAt: new Date("2026-06-29T00:00:00.000Z"),
          updatedAt: new Date("2026-06-29T00:00:00.000Z"),
          applicantCount: 0,
        };
      },
    });
    const service = new CompanyRecruitingService(repository);

    const result = await service.deleteRecruitment(companyUser, 101);

    assert.equal(result.recruitmentId, 101);
    assert.equal(result.status, "ARCHIVED");
    assert.deepEqual(repository.calls.archivePosting, [101, 7]);
  });

  it("rejects deleting open recruitments to keep posting status transitions", async () => {
    const repository = createRepository();
    const service = new CompanyRecruitingService(repository);

    await assert.rejects(
      service.deleteRecruitment(companyUser, 101),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "COMMON_VALIDATION_FAILED",
    );
    assert.equal(repository.calls.archivePosting, undefined);
  });

  it("copies only the current company's closed recruitment as a draft", async () => {
    const copyCalls: Record<string, unknown[]> = {};
    const repository = createRepository({
      async findPostingForCompany(postingId: number, companyId: number) {
        copyCalls.findPostingForCompany = [postingId, companyId];
        return {
          postingId,
          companyId,
          title: "Closed Backend Hiring",
          jobRole: "Backend",
          jobDescription: "Closed JD",
          careerRequirement: "경력 5년 이상",
          educationRequirement: "대졸 이상",
          salaryInfo: "협의 가능",
          workLocation: "판교",
          employmentType: "정규직",
          jobRoleCode: "서버·백엔드",
          regionCode: "서울",
          careerMinYears: 5,
          careerMaxYears: 10,
          employmentTypeCode: "정규직",
          recruitmentType: "마감형",
          startsOn: new Date("2026-06-01T00:00:00.000Z"),
          endsOn: new Date("2026-06-15T00:00:00.000Z"),
          status: "CLOSED",
          createdAt: new Date("2026-06-01T00:00:00.000Z"),
          updatedAt: new Date("2026-06-15T00:00:00.000Z"),
          applicantCount: 3,
        };
      },
      async createPosting(input: unknown) {
        copyCalls.createPosting = [input];
        return {
          postingId: 202,
          companyId: 7,
          title: "Closed Backend Hiring (복사본)",
          jobRole: "Backend",
          jobDescription: "Closed JD",
          careerRequirement: (input as { careerRequirement?: string | null }).careerRequirement ?? null,
          educationRequirement: (input as { educationRequirement?: string | null }).educationRequirement ?? null,
          salaryInfo: (input as { salaryInfo?: string | null }).salaryInfo ?? null,
          workLocation: (input as { workLocation?: string | null }).workLocation ?? null,
          employmentType: (input as { employmentType?: string | null }).employmentType ?? null,
          startsOn: null,
          endsOn: null,
          status: "DRAFT",
          createdAt: new Date("2026-06-30T00:00:00.000Z"),
          updatedAt: new Date("2026-06-30T00:00:00.000Z"),
          applicantCount: 0,
        };
      },
    });
    const service = new CompanyRecruitingService(repository);

    const result = await service.copyRecruitment(companyUser, 101);

    assert.equal(result.recruitmentId, 202);
    assert.equal(result.status, "DRAFT");
    assert.deepEqual(copyCalls.createPosting, [
      {
        companyId: 7,
        title: "Closed Backend Hiring (복사본)",
        jobRole: "Backend",
        jobDescription: "Closed JD",
        careerRequirement: "경력 5년 이상",
        educationRequirement: "대졸 이상",
        salaryInfo: "협의 가능",
        workLocation: "판교",
        employmentType: "정규직",
        jobRoleCode: "서버·백엔드",
        regionCode: "서울",
        careerMinYears: 5,
        careerMaxYears: 10,
        employmentTypeCode: "정규직",
        recruitmentType: "마감형",
        startsOn: null,
        endsOn: null,
        status: "DRAFT",
      },
    ]);
  });

  it("rejects copying recruitments that are not closed", async () => {
    const repository = createRepository();
    const service = new CompanyRecruitingService(repository);

    await assert.rejects(
      service.copyRecruitment(companyUser, 101),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "COMMON_VALIDATION_FAILED",
    );
    assert.equal(repository.calls.createPosting, undefined);
  });

  it("returns evaluation detail with report absence as none or generating", async () => {
    const repository = createRepository();
    const service = new CompanyRecruitingService(repository);

    const result = await service.getApplicantEvaluation(companyUser, 77);

    assert.equal(result.applicant.applicantId, 77);
    assert.equal(result.reportAvailability, "NONE_OR_GENERATING");
    assert.equal(result.report, null);
    assert.equal(result.screening.decision, "UNDECIDED");
  });

  it("returns evaluation detail with report summary, score, and evidence when available", async () => {
    const repository = createRepository({
      async findApplicationForCompany(applicationId: number, companyId: number) {
        return createApplicantRecord({
          evaluationReports: [
            {
              reportId: 501,
              status: "COMPLETED",
              totalScore: 82,
              summary: "지원 직무와 경험이 잘 맞습니다.",
              generatedAt: new Date("2026-06-30T08:00:00.000Z"),
              scores: [
                {
                  scoreId: 9001,
                  score: 82,
                  rationale: "API 설계 경험이 구체적입니다.",
                  criterion: { criterionId: 10, tagName: "Backend" },
                  evidences: [{ evidenceId: 1, evidenceText: "NestJS 기반 API 구축 경험" }],
                },
              ],
            },
          ],
        });
      },
    });
    const service = new CompanyRecruitingService(repository);

    const result = await service.getApplicantEvaluation(companyUser, 77);

    assert.equal(result.reportAvailability, "AVAILABLE");
    assert.equal(result.report?.totalScore, 82);
    assert.equal(result.report?.scores[0]?.evidences[0]?.evidenceText, "NestJS 기반 API 구축 경험");
  });

  it("keeps recruiting telemetry as an unverified reference without changing scores", async () => {
    const repository = createRepository({
      async findApplicationForCompany(applicationId: number, companyId: number) {
        return createApplicantRecord({
          evaluationReports: [
            {
              reportId: 501,
              status: "COMPLETED",
              totalScore: 82,
              summary: "Recruiting report summary",
              generatedAt: new Date("2026-06-30T08:00:00.000Z"),
              scores: [],
            },
          ],
          interviewSessions: [
            {
              sessionId: 901,
              status: "COMPLETED",
              interviewType: "RECRUITING",
              startedAt: new Date("2026-07-01T00:00:00.000Z"),
              completedAt: new Date("2026-07-01T00:10:00.000Z"),
              answers: [
                {
                  answerId: 1001,
                  questionId: 501,
                  videoFileId: null,
                  audioFileId: null,
                  videoFile: null,
                  audioFile: null,
                  questionType: "TECHNICAL",
                  questionContent: "Explain a difficult technical problem.",
                  transcript: "I debugged upload state transitions.",
                  durationSeconds: 31,
                  submittedAt: new Date("2026-07-01T00:02:00.000Z"),
                  nonverbalMetadata: {
                    integritySummary: { screenAwayCount: 1, gazeAwayCount: 1 },
                    integrityEvents: [{ type: "TAB_HIDDEN" }, { type: "GAZE_AWAY" }],
                  },
                  followUpQuestions: [],
                },
                {
                  answerId: 1002,
                  questionId: 502,
                  videoFileId: null,
                  audioFileId: null,
                  videoFile: null,
                  audioFile: null,
                  questionType: "EXPERIENCE",
                  questionContent: "Explain backend project experience.",
                  transcript: "I connected API, DB, and worker flows.",
                  durationSeconds: 28,
                  submittedAt: new Date("2026-07-01T00:04:00.000Z"),
                  nonverbalMetadata: {
                    integritySummary: { gazeAwayCount: 2 },
                    integrityEvents: [{ type: "GAZE_AWAY" }, { type: "GAZE_AWAY" }],
                  },
                  followUpQuestions: [],
                },
                {
                  answerId: 1003,
                  questionId: 503,
                  videoFileId: null,
                  audioFileId: null,
                  videoFile: null,
                  audioFile: null,
                  questionType: "SITUATION",
                  questionContent: "Explain how you handle pressure.",
                  transcript: "I split problems into observable steps.",
                  durationSeconds: 24,
                  submittedAt: new Date("2026-07-01T00:06:00.000Z"),
                  nonverbalMetadata: {
                    integritySummary: { multipleFacesCount: 1 },
                    integrityEvents: [{ type: "MULTIPLE_FACES" }],
                  },
                  followUpQuestions: [],
                },
                {
                  answerId: 1004,
                  questionId: 504,
                  videoFileId: null,
                  audioFileId: null,
                  videoFile: null,
                  audioFile: null,
                  questionType: "EXPERIENCE",
                  questionContent: "Explain how you validate completed work.",
                  transcript: "I verify the same path with tests and logs.",
                  durationSeconds: 26,
                  submittedAt: new Date("2026-07-01T00:08:00.000Z"),
                  nonverbalMetadata: {
                    integritySummary: { staticVideoFrameCount: 1 },
                    integrityEvents: [{ type: "STATIC_VIDEO_FRAME" }],
                  },
                  followUpQuestions: [],
                },
              ],
            },
          ],
        });
      },
    });
    const service = new CompanyRecruitingService(repository);

    const result = await service.getApplicantEvaluation(companyUser, 77);
    const adjustment = result.report?.integrityAdjustment;

    assert.equal(result.report?.totalScore, 82);
    assert.equal(result.report?.adjustedTotalScore, 82);
    assert.ok(adjustment);
    assert.equal(adjustment.penalty, 0);
    assert.equal(adjustment.scoreApplied, false);
    assert.equal(adjustment.source, "CLIENT_RUNTIME_UNVERIFIED");
    assert.equal(adjustment.level, "HIGH");
    assert.equal(adjustment.rawTotalScore, 82);
    assert.equal(adjustment.adjustedTotalScore, 82);
    assert.ok(adjustment.reasons.includes("화면/탭 이탈 1회"));
    assert.ok(adjustment.reasons.includes("여러 사람 감지 1회"));
    assert.match(adjustment.reason, /평가 점수에는 반영하지 않았습니다/);
  });

  it("classifies recruiting integrity reference boundaries without changing scores", async () => {
    const evaluate = async (integritySummary: Record<string, number>) => {
      const repository = createRepository({
        async findApplicationForCompany() {
          return createApplicantRecord({
            evaluationReports: [
              {
                reportId: 501,
                status: "COMPLETED",
                totalScore: 80,
                summary: "Recruiting report summary",
                generatedAt: new Date("2026-06-30T08:00:00.000Z"),
                scores: [],
              },
            ],
            interviewSessions: [
              {
                sessionId: 901,
                status: "COMPLETED",
                interviewType: "RECRUITING",
                startedAt: new Date("2026-07-01T00:00:00.000Z"),
                completedAt: new Date("2026-07-01T00:10:00.000Z"),
                answers: [
                  {
                    answerId: 1001,
                    questionId: 501,
                    videoFileId: null,
                    audioFileId: null,
                    videoFile: null,
                    audioFile: null,
                    questionType: "TECHNICAL",
                    questionContent: "Explain a difficult technical problem.",
                    transcript: "I debugged upload state transitions.",
                    durationSeconds: 31,
                    submittedAt: new Date("2026-07-01T00:02:00.000Z"),
                    nonverbalMetadata: { integritySummary },
                    followUpQuestions: [],
                  },
                ],
              },
            ],
          });
        },
      });
      const service = new CompanyRecruitingService(repository);
      const result = await service.getApplicantEvaluation(companyUser, 77);
      return result.report?.integrityAdjustment;
    };

    const scenarios = [
      { name: "single gaze", summary: { gazeAwayCount: 1 }, level: "LOW" },
      { name: "repeated gaze", summary: { gazeAwayCount: 2 }, level: "MEDIUM" },
      { name: "single screen away", summary: { screenAwayCount: 1 }, level: "LOW" },
      { name: "repeated screen away", summary: { screenAwayCount: 2 }, level: "MEDIUM" },
      { name: "frequent screen away", summary: { screenAwayCount: 4 }, level: "HIGH" },
      { name: "single face missing", summary: { faceMissingCount: 1 }, level: "MEDIUM" },
      { name: "repeated face missing", summary: { faceMissingCount: 2 }, level: "HIGH" },
      { name: "multiple people", summary: { multipleFacesCount: 1 }, level: "HIGH" },
      { name: "face position shift", summary: { facePositionShiftCount: 1 }, level: "HIGH" },
      { name: "single voice mouth mismatch", summary: { voiceMouthMismatchCount: 1 }, level: "MEDIUM" },
      { name: "repeated voice mouth mismatch", summary: { voiceMouthMismatchCount: 2 }, level: "HIGH" },
      { name: "static video frame", summary: { staticVideoFrameCount: 1 }, level: "HIGH" },
    ] as const;

    for (const scenario of scenarios) {
      const adjustment = await evaluate(scenario.summary);
      assert.ok(adjustment, scenario.name);
      assert.equal(adjustment.level, scenario.level, scenario.name);
      assert.equal(adjustment.penalty, 0, scenario.name);
      assert.equal(adjustment.scoreApplied, false, scenario.name);
      assert.equal(adjustment.adjustedTotalScore, 80, scenario.name);
    }
  });

  it("returns evaluation detail with interview answers and linked follow-up answers", async () => {
    const repository = createRepository({
      async findApplicationForCompany(applicationId: number, companyId: number) {
        return createApplicantRecord({
          interviewSessions: [
            {
              sessionId: 901,
              status: "COMPLETED",
              interviewType: "RECRUITING",
              startedAt: new Date("2026-07-01T00:00:00.000Z"),
              completedAt: new Date("2026-07-01T00:10:00.000Z"),
              answers: [
                {
                  answerId: 1001,
                  questionId: 501,
                  videoFileId: 8001,
                  audioFileId: null,
                  videoFile: {
                    fileId: 8001,
                    ownerUserId: 88,
                    storageKey: "candidate/44/interviews/recruiting-answer-1001.webm",
                    originalName: "recruiting-answer-1001.webm",
                    mimeType: "video/webm",
                    sizeBytes: 123456,
                    status: "ACTIVE",
                    createdAt: new Date("2026-07-01T00:01:30.000Z"),
                  },
                  audioFile: null,
                  questionType: "TECHNICAL",
                  questionContent: "지원 직무와 관련된 프로젝트에서 맡은 역할을 설명해주세요.",
                  transcript: "API 업로드, DB 저장, worker 처리 흐름을 연결했습니다.",
                  durationSeconds: 42,
                  submittedAt: new Date("2026-07-01T00:02:00.000Z"),
                  followUpQuestions: [
                    {
                      followUpId: 7001,
                      content: "worker 처리 흐름에서 가장 중요하게 확인한 값은 무엇인가요?",
                      generationStatus: "GENERATED",
                      policy: "RECRUITING",
                      answer: {
                        answerId: 1002,
                        videoFileId: 8002,
                        audioFileId: null,
                        videoFile: {
                          fileId: 8002,
                          ownerUserId: 88,
                          storageKey: "candidate/44/interviews/recruiting-follow-up-answer-1002.webm",
                          originalName: "recruiting-follow-up-answer-1002.webm",
                          mimeType: "video/webm",
                          sizeBytes: 65432,
                          status: "ACTIVE",
                          createdAt: new Date("2026-07-01T00:03:30.000Z"),
                        },
                        audioFile: null,
                        transcript: "answerId와 audioFileId가 payload와 DB에서 일치하는지 확인했습니다.",
                        durationSeconds: 21,
                        submittedAt: new Date("2026-07-01T00:04:00.000Z"),
                      },
                    },
                  ],
                },
                {
                  answerId: 1002,
                  questionId: 502,
                  videoFileId: 8002,
                  audioFileId: null,
                  videoFile: {
                    fileId: 8002,
                    ownerUserId: 88,
                    storageKey: "candidate/44/interviews/recruiting-follow-up-answer-1002.webm",
                    originalName: "recruiting-follow-up-answer-1002.webm",
                    mimeType: "video/webm",
                    sizeBytes: 65432,
                    status: "ACTIVE",
                    createdAt: new Date("2026-07-01T00:03:30.000Z"),
                  },
                  audioFile: null,
                  questionType: "FOLLOW_UP",
                  questionContent: "worker 처리 흐름에서 가장 중요하게 확인한 값은 무엇인가요?",
                  transcript: "answerId와 audioFileId가 payload와 DB에서 일치하는지 확인했습니다.",
                  durationSeconds: 21,
                  submittedAt: new Date("2026-07-01T00:04:00.000Z"),
                  followUpQuestions: [],
                },
              ],
            },
          ],
        });
      },
    });
    const service = new CompanyRecruitingService(repository);

    const result = await service.getApplicantEvaluation(companyUser, 77);

    assert.equal(result.answers.length, 2);
    assert.deepEqual(result.answers[0], {
      answerId: 1001,
      questionId: 501,
      videoFileId: 8001,
      audioFileId: null,
      videoFile: {
        fileId: 8001,
        ownerUserId: 88,
        storageKey: "candidate/44/interviews/recruiting-answer-1001.webm",
        originalName: "recruiting-answer-1001.webm",
        mimeType: "video/webm",
        sizeBytes: 123456,
        status: "ACTIVE",
        createdAt: "2026-07-01T00:01:30.000Z",
      },
      audioFile: null,
      questionType: "TECHNICAL",
      questionContent: "지원 직무와 관련된 프로젝트에서 맡은 역할을 설명해주세요.",
      transcript: "API 업로드, DB 저장, worker 처리 흐름을 연결했습니다.",
      durationSeconds: 42,
      submittedAt: "2026-07-01T00:02:00.000Z",
      nonverbalMetadata: null,
      followUpQuestions: [
        {
          followUpId: 7001,
          content: "worker 처리 흐름에서 가장 중요하게 확인한 값은 무엇인가요?",
          generationStatus: "GENERATED",
          policy: "RECRUITING",
          answer: {
            answerId: 1002,
            videoFileId: 8002,
            audioFileId: null,
            videoFile: {
              fileId: 8002,
              ownerUserId: 88,
              storageKey: "candidate/44/interviews/recruiting-follow-up-answer-1002.webm",
              originalName: "recruiting-follow-up-answer-1002.webm",
              mimeType: "video/webm",
              sizeBytes: 65432,
              status: "ACTIVE",
              createdAt: "2026-07-01T00:03:30.000Z",
            },
            audioFile: null,
            transcript: "answerId와 audioFileId가 payload와 DB에서 일치하는지 확인했습니다.",
            durationSeconds: 21,
            submittedAt: "2026-07-01T00:04:00.000Z",
            nonverbalMetadata: null,
          },
        },
      ],
    });
  });

  it("streams applicant interview media only after company ownership and answer file checks", async () => {
    const repository = createRepository({
      async findApplicationForCompany(applicationId: number, companyId: number) {
        assert.equal(applicationId, 77);
        assert.equal(companyId, 7);
        return createApplicantRecord({
          interviewSessions: [
            {
              sessionId: 901,
              status: "COMPLETED",
              interviewType: "RECRUITING",
              startedAt: new Date("2026-07-01T00:00:00.000Z"),
              completedAt: new Date("2026-07-01T00:10:00.000Z"),
              answers: [
                {
                  answerId: 1001,
                  questionId: 501,
                  videoFileId: 8001,
                  audioFileId: null,
                  videoFile: {
                    fileId: 8001,
                    ownerUserId: 88,
                    storageKey: "candidate/44/interviews/recruiting-answer-1001.webm",
                    originalName: "recruiting-answer-1001.webm",
                    mimeType: "video/webm",
                    sizeBytes: 123456,
                    status: "ACTIVE",
                    createdAt: new Date("2026-07-01T00:01:30.000Z"),
                  },
                  audioFile: null,
                  questionType: "TECHNICAL",
                  questionContent: "지원 직무와 관련된 프로젝트에서 맡은 역할을 설명해주세요.",
                  transcript: "API 업로드, DB 저장, worker 처리 흐름을 연결했습니다.",
                  durationSeconds: 42,
                  submittedAt: new Date("2026-07-01T00:02:00.000Z"),
                  followUpQuestions: [],
                },
              ],
            },
          ],
        });
      },
    });
    const storage = {
      requestedKey: "",
      requestedRange: undefined as string | undefined,
      async putObject() {},
      async getObject(key: string, options?: { range?: string }) {
        this.requestedKey = key;
        this.requestedRange = options?.range;
        return {
          body: Buffer.from("video-bytes"),
          contentType: "video/webm",
          contentLength: 11,
        };
      },
    };
    const service = new CompanyRecruitingService(repository, storage);

    const media = await service.getApplicantInterviewMedia(companyUser, 77, 8001);

    assert.equal(storage.requestedKey, "candidate/44/interviews/recruiting-answer-1001.webm");
    assert.equal(storage.requestedRange, undefined);
    assert.equal(media.contentType, "video/webm");
    assert.equal(media.contentLength, 11);
    assert.equal(media.originalName, "recruiting-answer-1001.webm");
    assert.equal(media.statusCode, 200);
    assert.equal(media.body.toString(), "video-bytes");
  });

  it("passes valid Range requests to storage and returns partial media metadata", async () => {
    const repository = createRepository({
      async findApplicationForCompany() {
        return createApplicantRecord({
          interviewSessions: [
            {
              sessionId: 901,
              status: "COMPLETED",
              interviewType: "RECRUITING",
              startedAt: new Date("2026-07-01T00:00:00.000Z"),
              completedAt: new Date("2026-07-01T00:10:00.000Z"),
              answers: [
                {
                  answerId: 1001,
                  questionId: 501,
                  videoFileId: 8001,
                  audioFileId: null,
                  videoFile: {
                    fileId: 8001,
                    ownerUserId: 88,
                    storageKey: "candidate/44/interviews/recruiting-answer-1001.webm",
                    originalName: "recruiting-answer-1001.webm",
                    mimeType: "video/webm",
                    sizeBytes: 123456,
                    status: "ACTIVE",
                    createdAt: new Date("2026-07-01T00:01:30.000Z"),
                  },
                  audioFile: null,
                  questionType: "TECHNICAL",
                  questionContent: "지원 직무와 관련된 프로젝트에서 맡은 역할을 설명해주세요.",
                  transcript: "API 업로드, DB 저장, worker 처리 흐름을 연결했습니다.",
                  durationSeconds: 42,
                  submittedAt: new Date("2026-07-01T00:02:00.000Z"),
                  followUpQuestions: [],
                },
              ],
            },
          ],
        });
      },
    });
    const storage = {
      requestedRange: undefined as string | undefined,
      async putObject() {},
      async getObject(_key: string, options?: { range?: string }) {
        this.requestedRange = options?.range;
        return {
          body: Buffer.from("video"),
          contentType: "video/webm",
          contentLength: 5,
          contentRange: "bytes 0-4/123456",
        };
      },
    };
    const service = new CompanyRecruitingService(repository, storage);

    const media = await service.getApplicantInterviewMedia(companyUser, 77, 8001, { range: "bytes=0-4" });

    assert.equal(storage.requestedRange, "bytes=0-4");
    assert.equal(media.statusCode, 206);
    assert.equal(media.contentRange, "bytes 0-4/123456");
    assert.equal(media.contentLength, 5);
  });

  it("issues applicant interview media sessions scoped to the requested file", async () => {
    const repository = createRepository({
      async findApplicationForCompany() {
        return createApplicantRecord({
          interviewSessions: [
            {
              sessionId: 901,
              status: "COMPLETED",
              interviewType: "RECRUITING",
              startedAt: new Date("2026-07-01T00:00:00.000Z"),
              completedAt: new Date("2026-07-01T00:10:00.000Z"),
              answers: [
                {
                  answerId: 1001,
                  questionId: 501,
                  videoFileId: 8001,
                  audioFileId: null,
                  videoFile: {
                    fileId: 8001,
                    ownerUserId: 88,
                    storageKey: "candidate/44/interviews/recruiting-answer-1001.webm",
                    originalName: "recruiting-answer-1001.webm",
                    mimeType: "video/webm",
                    sizeBytes: 123456,
                    status: "ACTIVE",
                    createdAt: new Date("2026-07-01T00:01:30.000Z"),
                  },
                  audioFile: null,
                  questionType: "TECHNICAL",
                  questionContent: "지원 직무와 관련된 프로젝트에서 맡은 역할을 설명해주세요.",
                  transcript: "API 업로드, DB 저장, worker 처리 흐름을 연결했습니다.",
                  durationSeconds: 42,
                  submittedAt: new Date("2026-07-01T00:02:00.000Z"),
                  followUpQuestions: [],
                },
              ],
            },
          ],
        });
      },
    });
    const service = new CompanyRecruitingService(repository);

    const session = await service.createApplicantInterviewMediaSession(companyUser, 77, 8001);
    const currentUser = service.verifyApplicantInterviewMediaSession(session.token, 77, 8001);

    assert.equal(session.cookieName, "companyMediaAccess");
    assert.equal(session.maxAgeSeconds, 900);
    assert.equal(session.mediaPath, "/api/v1/company/applicants/77/media/8001");
    assert.equal(currentUser.userType, "COMPANY");
    assert.equal(currentUser.companyId, 7);
    await assert.rejects(
      async () => service.verifyApplicantInterviewMediaSession(session.token, 77, 9001),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "COMMON_FORBIDDEN",
    );
  });

  it("rejects inactive applicant interview media files before storage access", async () => {
    const repository = createRepository({
      async findApplicationForCompany() {
        return createApplicantRecord({
          interviewSessions: [
            {
              sessionId: 901,
              status: "COMPLETED",
              interviewType: "RECRUITING",
              startedAt: new Date("2026-07-01T00:00:00.000Z"),
              completedAt: new Date("2026-07-01T00:10:00.000Z"),
              answers: [
                {
                  answerId: 1001,
                  questionId: 501,
                  videoFileId: 8001,
                  audioFileId: null,
                  videoFile: {
                    fileId: 8001,
                    ownerUserId: 88,
                    storageKey: "candidate/44/interviews/recruiting-answer-1001.webm",
                    originalName: "recruiting-answer-1001.webm",
                    mimeType: "video/webm",
                    sizeBytes: 123456,
                    status: "DELETED",
                    createdAt: new Date("2026-07-01T00:01:30.000Z"),
                  },
                  audioFile: null,
                  questionType: "TECHNICAL",
                  questionContent: "지원 직무와 관련된 프로젝트에서 맡은 역할을 설명해주세요.",
                  transcript: "API 업로드, DB 저장, worker 처리 흐름을 연결했습니다.",
                  durationSeconds: 42,
                  submittedAt: new Date("2026-07-01T00:02:00.000Z"),
                  followUpQuestions: [],
                },
              ],
            },
          ],
        });
      },
    });
    let storageReadCount = 0;
    const service = new CompanyRecruitingService(repository, {
      async putObject() {},
      async getObject() {
        storageReadCount += 1;
        return {
          body: Buffer.from("video-bytes"),
        };
      },
    });

    await assert.rejects(
      service.getApplicantInterviewMedia(companyUser, 77, 8001),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "COMMON_NOT_FOUND" &&
        "getStatus" in error &&
        typeof error.getStatus === "function" &&
        error.getStatus() === 404,
    );
    assert.equal(storageReadCount, 0);
  });

  it("reports missing applicant interview media object as not found", async () => {
    const repository = createRepository({
      findApplicationForCompany: async () => {
        return createApplicantRecord({
          applicationId: 77,
          interviewSessions: [
            {
              sessionId: 100,
              status: "COMPLETED",
              interviewType: "RECRUITING",
              startedAt: new Date("2026-07-01T00:00:00.000Z"),
              completedAt: new Date("2026-07-01T00:10:00.000Z"),
              answers: [
                {
                  answerId: 1001,
                  questionId: 501,
                  questionType: "INTRO",
                  questionContent: "지원 동기를 설명해주세요.",
                  transcript: "지원 동기 답변입니다.",
                  durationSeconds: 30,
                  submittedAt: new Date("2026-07-01T00:01:00.000Z"),
                  videoFileId: 8001,
                  audioFileId: null,
                  videoFile: {
                    fileId: 8001,
                    ownerUserId: 44,
                    storageKey: "candidate/44/interviews/recruiting-answer-1001.webm",
                    originalName: "recruiting-answer-1001.webm",
                    mimeType: "video/webm",
                    sizeBytes: 1024,
                    status: "ACTIVE",
                    createdAt: new Date("2026-07-01T00:01:00.000Z"),
                  },
                  audioFile: null,
                  followUpQuestions: [],
                },
              ],
            },
          ],
        });
      },
    });
    const service = new CompanyRecruitingService(repository, {
      async putObject() {},
      async getObject() {
        const error = new Error("NoSuchKey");
        Object.assign(error, { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });
        throw error;
      },
    });

    await assert.rejects(
      service.getApplicantInterviewMedia(companyUser, 77, 8001),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "COMMON_NOT_FOUND" &&
        "getStatus" in error &&
        typeof error.getStatus === "function" &&
        error.getStatus() === 404,
    );
  });

  it("stores only allowed screening decisions and memo through the B-owned fields", async () => {
    const repository = createRepository();
    const service = new CompanyRecruitingService(repository);

    const result = await service.updateScreeningStatus(companyUser, 77, {
      screeningDecision: "HOLD",
      screeningMemo: "추가 확인 필요",
    });

    assert.equal(result.screeningDecision, "HOLD");
    assert.equal(result.screeningMemo, "추가 확인 필요");
    assert.deepEqual(repository.calls.updateApplicationScreening, [
      77,
      7,
      { screeningDecision: "HOLD", screeningMemo: "추가 확인 필요" },
    ]);
  });

  it("rejects screening decisions outside the agreed enum values", async () => {
    const repository = createRepository();
    const service = new CompanyRecruitingService(repository);

    await assert.rejects(
      service.updateScreeningStatus(companyUser, 77, {
        screeningDecision: "REJECTED" as never,
        screeningMemo: "잘못된 값",
      }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "COMMON_VALIDATION_FAILED",
    );
  });
});
