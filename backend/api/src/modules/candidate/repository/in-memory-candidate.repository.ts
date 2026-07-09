import { Injectable } from "@nestjs/common";
import { DEV_CANDIDATE_USER, FORBIDDEN_FILE_PAYLOAD_FIELDS } from "../candidate.constants";
import { CandidateDomainError } from "../candidate.errors";
import {
  type Application,
  type ApplicationDocument,
  type ApplicationSubmissionResult,
  type CandidateJob,
  type CandidateRepository,
  type ConsentRecord,
  type FileAsset,
  type InterviewSession,
  type PortfolioLink,
} from "../candidate.types";

@Injectable()
export class InMemoryCandidateRepository implements CandidateRepository {
  private readonly jobs: CandidateJob[] = [
    {
      jobId: 1,
      companyId: 1,
      isPublic: true,
      companyName: "Init Labs",
      companyLogoUrl: null,
      companyIndustry: "SaaS",
      companyProfile: "AI 기반 채용 워크플로우를 만드는 B2B SaaS 팀입니다.",
      title: "Backend Developer",
      jobGroup: "Engineering",
      jobRole: "Backend",
      jobDescription: "NestJS와 PostgreSQL 기반 API를 함께 만들 지원자를 찾습니다.",
      location: "Seoul",
      careerLevel: "Junior",
      employmentType: "Full-time",
      techStacks: ["Node.js", "NestJS", "PostgreSQL"],
      postingStatus: "OPEN",
      jobRoleCode: "서버·백엔드",
      regionCode: "서울",
      careerMinYears: 1,
      careerMaxYears: 3,
      employmentTypeCode: "정규직",
      recruitmentType: "마감형",
      startsOn: "2026-06-01",
      endsOn: "2026-07-31",
      createdAt: "2026-06-01T00:00:00.000Z",
    },
    {
      jobId: 2,
      companyId: 2,
      isPublic: true,
      companyName: "Jungle Works",
      companyLogoUrl: null,
      companyIndustry: "Mobile Platform",
      companyProfile: "지원자 경험을 모바일 중심으로 개선하는 프로덕트 팀입니다.",
      title: "Android Developer",
      jobGroup: "Engineering",
      jobRole: "Android",
      jobDescription: "지원자 경험을 깊게 이해하는 Android 개발자를 찾습니다.",
      location: "Pangyo",
      careerLevel: "Entry",
      employmentType: "Intern",
      techStacks: ["Kotlin", "Android", "REST"],
      postingStatus: "CLOSING_SOON",
      jobRoleCode: "안드로이드",
      regionCode: "경기",
      careerMinYears: 0,
      careerMaxYears: 0,
      employmentTypeCode: "인턴",
      recruitmentType: "마감형",
      startsOn: "2026-06-15",
      endsOn: "2026-06-30",
      createdAt: "2026-06-15T00:00:00.000Z",
    },
    {
      jobId: 3,
      companyId: 3,
      isPublic: true,
      companyName: "Closed Company",
      companyLogoUrl: null,
      companyIndustry: "Web Platform",
      companyProfile: "마감된 공고를 보유한 예시 회사입니다.",
      title: "Closed Frontend Developer",
      jobGroup: "Engineering",
      jobRole: "Frontend",
      jobDescription: "마감된 공고입니다.",
      location: "Seoul",
      careerLevel: "Junior",
      employmentType: "Full-time",
      techStacks: ["React", "TypeScript"],
      postingStatus: "CLOSED",
      jobRoleCode: "프론트엔드",
      regionCode: "서울",
      careerMinYears: 1,
      careerMaxYears: 3,
      employmentTypeCode: "정규직",
      recruitmentType: "마감형",
      startsOn: "2026-05-01",
      endsOn: "2026-05-31",
      createdAt: "2026-05-01T00:00:00.000Z",
    },
    {
      jobId: 4,
      companyId: 4,
      isPublic: false,
      companyName: "Private Company",
      companyLogoUrl: null,
      companyIndustry: "Internal Platform",
      companyProfile: "초대 전용 공고를 보유한 예시 회사입니다.",
      title: "Private Backend Developer",
      jobGroup: "Engineering",
      jobRole: "Backend",
      jobDescription: "공개 목록에 노출되지 않는 초대 전용 공고입니다.",
      location: "Remote",
      careerLevel: "Senior",
      employmentType: "Full-time",
      techStacks: ["Node.js", "PostgreSQL"],
      postingStatus: "OPEN",
      jobRoleCode: "서버·백엔드",
      regionCode: "해외",
      careerMinYears: 8,
      careerMaxYears: 10,
      employmentTypeCode: "정규직",
      recruitmentType: "상시",
      startsOn: "2026-06-01",
      endsOn: "2026-07-31",
      createdAt: "2026-06-20T00:00:00.000Z",
    },
  ];

  private readonly applications: Application[] = [];
  private readonly documents: ApplicationDocument[] = [];
  private readonly consentRecords: ConsentRecord[] = [];
  private readonly interviewSessions: InterviewSession[] = [];
  private readonly fileAssets: FileAsset[] = [];
  private readonly portfolioLinks: PortfolioLink[] = [];

  constructor(options: { seedDemoApplication?: boolean } = {}) {
    if (options.seedDemoApplication) {
      this.seedDemoApplication();
    }
  }

  async listJobs(): Promise<CandidateJob[]> {
    return [...this.jobs];
  }

  async findJob(jobId: number): Promise<CandidateJob | undefined> {
    return this.jobs.find((job) => job.jobId === jobId);
  }

  async getInterviewTimePolicy() {
    return {
      preparationTimeSec: 0,
      answerTimeSec: 90,
      retryAllowed: false,
    };
  }

  async findFileAsset(fileId: number): Promise<FileAsset | undefined> {
    return this.fileAssets.find((fileAsset) => fileAsset.fileId === fileId);
  }

  async listApplications(candidateId: number): Promise<Application[]> {
    return this.applications.filter((application) => application.candidateId === candidateId);
  }

  async findApplication(applicationId: number): Promise<Application | undefined> {
    return this.applications.find((application) => application.applicationId === applicationId);
  }

  async findCandidateUserId(candidateId: number): Promise<number | undefined> {
    if (candidateId === DEV_CANDIDATE_USER.candidateId) {
      return DEV_CANDIDATE_USER.userId;
    }
    return candidateId;
  }

  async listDocuments(applicationId: number): Promise<ApplicationDocument[]> {
    return this.documents.filter((document) => document.applicationId === applicationId);
  }

  async listConsentRecords(applicationId: number): Promise<ConsentRecord[]> {
    return this.consentRecords.filter((consent) => consent.applicationId === applicationId);
  }

  async saveConsentRecords(applicationId: number, consentTypes: ConsentRecord["consentType"][]): Promise<ConsentRecord[]> {
    const now = new Date().toISOString();
    for (const consentType of consentTypes) {
      const existing = this.consentRecords.find(
        (consent) => consent.applicationId === applicationId && consent.consentType === consentType,
      );
      if (existing) {
        existing.agreedAt = now;
        continue;
      }

      this.consentRecords.push({
        consentId: this.consentRecords.length + 1,
        applicationId,
        consentType,
        agreed: true,
        agreedAt: now,
      });
    }

    return this.listConsentRecords(applicationId);
  }

  async findInterviewSession(sessionId: number): Promise<InterviewSession | undefined> {
    return this.interviewSessions.find((session) => session.sessionId === sessionId);
  }

  async findInterviewSessionByApplication(applicationId: number): Promise<InterviewSession | undefined> {
    return this.interviewSessions.find((session) => session.applicationId === applicationId);
  }

  async ensureInterviewSessionByApplication(applicationId: number): Promise<InterviewSession | undefined> {
    const existing = await this.findInterviewSessionByApplication(applicationId);
    if (existing) return existing;

    const application = await this.findApplication(applicationId);
    if (!application) return undefined;

    const session = this.createRecruitingInterviewSession(application, new Date().toISOString());
    this.interviewSessions.push(session);
    return session;
  }

  async saveDeviceCheck(
    sessionId: number,
    deviceCheck: { cameraGranted: boolean; microphoneGranted: boolean; networkStable: boolean },
  ): Promise<InterviewSession> {
    const session = await this.requiredInterviewSession(sessionId);
    const checkedAt = new Date().toISOString();
    session.deviceCheck = {
      ...deviceCheck,
      status: "PASSED",
      checkedAt,
    };
    session.updatedAt = checkedAt;
    return session;
  }

  async updateApplicationInterviewStatus(applicationId: number, status: InterviewSession["status"]): Promise<Application> {
    const application = await this.requiredApplication(applicationId);
    application.interviewStatus = status;
    application.updatedAt = new Date().toISOString();
    return application;
  }

  async updateApplicationReportStatus(applicationId: number, status: Application["reportStatus"]): Promise<Application> {
    const application = await this.requiredApplication(applicationId);
    application.reportStatus = status;
    application.updatedAt = new Date().toISOString();
    return application;
  }

  async updateInterviewSessionStatus(
    sessionId: number,
    status: InterviewSession["status"],
    transitionedAt?: string,
  ): Promise<InterviewSession> {
    const session = await this.requiredInterviewSession(sessionId);
    session.status = status;
    session.updatedAt = new Date().toISOString();
    if (transitionedAt && status === "IN_PROGRESS") {
      session.startedAt = transitionedAt;
    }
    if (transitionedAt && status === "COMPLETED") {
      session.completedAt = transitionedAt;
    }
    return session;
  }

  async hasApplication(candidateId: number, postingId: number): Promise<boolean> {
    return this.applications.some(
      (application) => application.candidateId === candidateId && application.postingId === postingId,
    );
  }

  async createApplication(input: {
    postingId: number;
    candidateId: number;
    resumeFileId: number;
    portfolioFileId?: number;
    portfolioUrl?: string;
    consentTypes: ConsentRecord["consentType"][];
  }): Promise<ApplicationSubmissionResult> {
    if (await this.hasApplication(input.candidateId, input.postingId)) {
      throw new CandidateDomainError("APPLICATION_ALREADY_SUBMITTED", "이미 지원한 채용공고입니다.", 409);
    }

    const now = new Date().toISOString();
    const application: Application = {
      applicationId: this.applications.length + 1,
      postingId: input.postingId,
      candidateId: input.candidateId,
      applicationStatus: "SUBMITTED",
      documentStatus: "SUBMITTED",
      interviewStatus: "NOT_READY",
      reportStatus: "PENDING",
      submittedAt: now,
      updatedAt: now,
    };
    this.applications.push(application);
    this.interviewSessions.push(this.createRecruitingInterviewSession(application, now));

    const documents = [this.createApplicationDocument(1, application.applicationId, input.resumeFileId, "RESUME", now)];
    if (input.portfolioFileId) {
      documents.push(
        this.createApplicationDocument(2, application.applicationId, input.portfolioFileId, "PORTFOLIO", now),
      );
    }
    this.documents.push(...documents);

    const consents = input.consentTypes.map((consentType, index) => ({
      consentId: this.consentRecords.length + index + 1,
      applicationId: application.applicationId,
      consentType,
      agreed: true as const,
      agreedAt: now,
    }));
    this.consentRecords.push(...consents);

    const portfolioLink = input.portfolioUrl
      ? await this.createPortfolioLink({
          candidateId: input.candidateId,
          applicationId: application.applicationId,
          linkType: input.portfolioUrl.includes("github.com") ? "GITHUB" : "PORTFOLIO",
          url: input.portfolioUrl,
          description: "Application portfolio link",
        })
      : undefined;

    return { application, documents, consents, portfolioLink };
  }

  async createFileAsset(input: Omit<FileAsset, "fileId" | "createdAt" | "status">): Promise<FileAsset> {
    const requestBody = input as unknown as Record<string, unknown>;
    const forbiddenField = FORBIDDEN_FILE_PAYLOAD_FIELDS.find((field) => Object.hasOwn(requestBody, field));
    if (forbiddenField) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "file_assets only stores metadata.", 400, [
        { field: forbiddenField, reason: "raw file payload must be uploaded to object storage first" },
      ]);
    }

    const fileAsset: FileAsset = {
      ownerUserId: input.ownerUserId,
      storageKey: input.storageKey,
      originalName: input.originalName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      fileId: this.fileAssets.length + 1,
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
    };
    this.fileAssets.push(fileAsset);
    return fileAsset;
  }

  async createPortfolioLink(input: Omit<PortfolioLink, "portfolioLinkId" | "createdAt">): Promise<PortfolioLink> {
    const portfolioLink: PortfolioLink = {
      ...input,
      portfolioLinkId: this.portfolioLinks.length + 1,
      createdAt: new Date().toISOString(),
    };
    this.portfolioLinks.push(portfolioLink);
    return portfolioLink;
  }

  private createRecruitingInterviewSession(application: Application, createdAt: string): InterviewSession {
    const windowEndsAt = new Date(Date.parse(createdAt) + 7 * 24 * 60 * 60 * 1000).toISOString();
    return {
      sessionId: this.interviewSessions.length + 1,
      applicationId: application.applicationId,
      candidateId: application.candidateId,
      interviewType: "RECRUITING",
      status: "NOT_READY",
      showQuestionText: true,
      windowStartsAt: createdAt,
      windowEndsAt,
      deviceCheck: {
        cameraGranted: false,
        microphoneGranted: false,
        networkStable: false,
        status: "PENDING",
      },
      updatedAt: createdAt,
    };
  }

  private seedDemoApplication(): void {
    const now = new Date().toISOString();
    const resumeFile: FileAsset = {
      fileId: 1,
      ownerUserId: DEV_CANDIDATE_USER.userId,
      storageKey: `candidate/${DEV_CANDIDATE_USER.candidateId}/resume/jiwon-resume.pdf`,
      originalName: "jiwon-resume.pdf",
      mimeType: "application/pdf",
      sizeBytes: 512_000,
      status: "ACTIVE",
      createdAt: now,
    };
    const portfolioFile: FileAsset = {
      fileId: 2,
      ownerUserId: DEV_CANDIDATE_USER.userId,
      storageKey: `candidate/${DEV_CANDIDATE_USER.candidateId}/portfolio/jiwon-portfolio.pdf`,
      originalName: "jiwon-portfolio.pdf",
      mimeType: "application/pdf",
      sizeBytes: 768_000,
      status: "ACTIVE",
      createdAt: now,
    };
    const application: Application = {
      applicationId: 1,
      postingId: 1,
      candidateId: DEV_CANDIDATE_USER.candidateId,
      applicationStatus: "SUBMITTED",
      documentStatus: "SUBMITTED",
      interviewStatus: "NOT_READY",
      reportStatus: "PENDING",
      submittedAt: now,
      updatedAt: now,
    };

    this.fileAssets.push(resumeFile, portfolioFile);
    this.applications.push(application);
    this.documents.push(
      this.createApplicationDocument(1, application.applicationId, resumeFile.fileId, "RESUME", now),
      this.createApplicationDocument(2, application.applicationId, portfolioFile.fileId, "PORTFOLIO", now),
    );
    this.consentRecords.push(
      {
        consentId: 1,
        applicationId: application.applicationId,
        consentType: "PRIVACY_COLLECTION",
        agreed: true,
        agreedAt: now,
      },
      {
        consentId: 2,
        applicationId: application.applicationId,
        consentType: "AI_DOCUMENT_ANALYSIS",
        agreed: true,
        agreedAt: now,
      },
    );
    this.interviewSessions.push(this.createRecruitingInterviewSession(application, now));
    this.portfolioLinks.push({
      portfolioLinkId: 1,
      candidateId: DEV_CANDIDATE_USER.candidateId,
      applicationId: application.applicationId,
      linkType: "GITHUB",
      url: "https://github.com/jiwon/init-backend",
      description: "지원자 포트폴리오 링크",
      fileId: portfolioFile.fileId,
      createdAt: now,
    });
  }

  private async requiredApplication(applicationId: number): Promise<Application> {
    const application = await this.findApplication(applicationId);
    if (!application) {
      throw new CandidateDomainError("COMMON_NOT_FOUND", "Application was not found.", 404);
    }
    return application;
  }

  private async requiredInterviewSession(sessionId: number): Promise<InterviewSession> {
    const session = await this.findInterviewSession(sessionId);
    if (!session) {
      throw new CandidateDomainError("COMMON_NOT_FOUND", "Interview session was not found.", 404);
    }
    return session;
  }

  private createApplicationDocument(
    offset: number,
    applicationId: number,
    fileId: number,
    documentType: "RESUME" | "PORTFOLIO",
    uploadedAt: string,
  ): ApplicationDocument {
    return {
      documentId: this.documents.length + offset,
      applicationId,
      fileId,
      documentType,
      parseStatus: "SUBMITTED",
      uploadedAt,
    };
  }
}
