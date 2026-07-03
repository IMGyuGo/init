import { Injectable } from "@nestjs/common";
import {
  ApplicationStatus as PrismaApplicationStatus,
  ConsentType as PrismaConsentType,
  DocumentStatus as PrismaDocumentStatus,
  DocumentType as PrismaDocumentType,
  InterviewStatus as PrismaInterviewStatus,
  InterviewType as PrismaInterviewType,
  PostingStatus as PrismaPostingStatus,
  ReportStatus as PrismaReportStatus,
  type Prisma,
} from "@prisma/client";
import { PrismaService } from "../../../shared/prisma.service";
import { CandidateDomainError } from "../candidate.errors";
import {
  type Application,
  type ApplicationDocument,
  type ApplicationSubmissionResult,
  type CandidateJob,
  type CandidateRepository,
  type ConsentRecord,
  type FileAsset,
  type InterviewDeviceCheck,
  type InterviewSession,
  type PortfolioLink,
  type ReportStatus,
} from "../candidate.types";

type PostingWithCompany = Prisma.PostingGetPayload<{ include: { company: { include: { logoFile: true } } } }>;
type ApplicationRecord = Prisma.ApplicationGetPayload<Record<string, never>>;
type ApplicationDocumentRecord = Prisma.ApplicationDocumentGetPayload<Record<string, never>>;
type ConsentRecordModel = Prisma.ConsentRecordGetPayload<Record<string, never>>;
type FileAssetRecord = Prisma.FileAssetGetPayload<Record<string, never>>;
type InterviewSessionRecord = Prisma.InterviewSessionGetPayload<{ include: { application: true } }>;

@Injectable()
export class PrismaCandidateRepository implements CandidateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listJobs(): Promise<CandidateJob[]> {
    const postings = await this.prisma.posting.findMany({
      where: {
        status: {
          in: [PrismaPostingStatus.OPEN, PrismaPostingStatus.CLOSING_SOON],
        },
      },
      include: { company: { include: { logoFile: true } } },
      orderBy: { createdAt: "desc" },
    });
    return postings.map((posting) => this.toCandidateJob(posting));
  }

  async findJob(jobId: number): Promise<CandidateJob | undefined> {
    const posting = await this.prisma.posting.findUnique({
      where: { postingId: BigInt(jobId) },
      include: { company: { include: { logoFile: true } } },
    });
    return posting ? this.toCandidateJob(posting) : undefined;
  }

  async getInterviewTimePolicy(postingId: number) {
    const timePolicy = await this.prisma.interviewTimePolicy.findUnique({
      where: { postingId: BigInt(postingId) },
    });
    return {
      preparationTimeSec: timePolicy?.preparationTimeSec ?? 0,
      answerTimeSec: timePolicy?.answerTimeSec ?? 90,
      retryAllowed: timePolicy?.retryAllowed ?? false,
    };
  }

  async findFileAsset(fileId: number): Promise<FileAsset | undefined> {
    const fileAsset = await this.prisma.fileAsset.findUnique({ where: { fileId: BigInt(fileId) } });
    return fileAsset ? this.toFileAsset(fileAsset) : undefined;
  }

  async listApplications(candidateId: number): Promise<Application[]> {
    const applications = await this.prisma.application.findMany({
      where: { candidateId: BigInt(candidateId) },
      orderBy: { updatedAt: "desc" },
    });
    return applications.map((application) => this.toApplication(application));
  }

  async findApplication(applicationId: number): Promise<Application | undefined> {
    const application = await this.prisma.application.findUnique({
      where: { applicationId: BigInt(applicationId) },
    });
    return application ? this.toApplication(application) : undefined;
  }

  async findCandidateUserId(candidateId: number): Promise<number | undefined> {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { candidateId: BigInt(candidateId) },
      select: { userId: true },
    });
    return profile ? Number(profile.userId) : undefined;
  }

  async listDocuments(applicationId: number): Promise<ApplicationDocument[]> {
    const documents = await this.prisma.applicationDocument.findMany({
      where: { applicationId: BigInt(applicationId) },
      orderBy: { uploadedAt: "asc" },
    });
    return documents.map((document) => this.toApplicationDocument(document));
  }

  async listConsentRecords(applicationId: number): Promise<ConsentRecord[]> {
    const consents = await this.prisma.consentRecord.findMany({
      where: { applicationId: BigInt(applicationId), agreed: true },
      orderBy: { consentId: "asc" },
    });
    return consents.map((consent) => this.toConsentRecord(consent));
  }

  async saveConsentRecords(applicationId: number, consentTypes: ConsentRecord["consentType"][]): Promise<ConsentRecord[]> {
    await this.prisma.$transaction(async (tx) => {
      await tx.consentRecord.deleteMany({
        where: {
          applicationId: BigInt(applicationId),
          consentType: { in: consentTypes as PrismaConsentType[] },
        },
      });
      await tx.consentRecord.createMany({
        data: consentTypes.map((consentType) => ({
          applicationId: BigInt(applicationId),
          consentType: consentType as PrismaConsentType,
          agreed: true,
          agreedAt: new Date(),
        })),
      });
    });
    return this.listConsentRecords(applicationId);
  }

  async findInterviewSession(sessionId: number): Promise<InterviewSession | undefined> {
    const session = await this.prisma.interviewSession.findUnique({
      where: { sessionId: BigInt(sessionId) },
      include: { application: true },
    });
    return session ? this.toInterviewSession(session) : undefined;
  }

  async findInterviewSessionByApplication(applicationId: number): Promise<InterviewSession | undefined> {
    const existing = await this.prisma.interviewSession.findFirst({
      where: { applicationId: BigInt(applicationId), interviewType: PrismaInterviewType.RECRUITING },
      orderBy: { sessionId: "desc" },
      include: { application: true },
    });
    return existing ? this.toInterviewSession(existing) : undefined;
  }

  async ensureInterviewSessionByApplication(applicationId: number): Promise<InterviewSession | undefined> {
    const existing = await this.findInterviewSessionByApplication(applicationId);
    if (existing) return existing;

    const application = await this.prisma.application.findUnique({ where: { applicationId: BigInt(applicationId) } });
    if (!application) return undefined;

    const created = await this.prisma.interviewSession.create({
      data: {
        applicationId: application.applicationId,
        candidateId: application.candidateId,
        interviewType: PrismaInterviewType.RECRUITING,
        status: PrismaInterviewStatus.NOT_READY,
        showQuestionText: false,
      },
      include: { application: true },
    });
    return this.toInterviewSession(created);
  }

  async saveDeviceCheck(
    sessionId: number,
    deviceCheck: Omit<InterviewDeviceCheck, "status" | "checkedAt">,
  ): Promise<InterviewSession> {
    const nextStatus =
      deviceCheck.cameraGranted && deviceCheck.microphoneGranted && deviceCheck.networkStable
        ? PrismaInterviewStatus.READY
        : PrismaInterviewStatus.NOT_READY;
    const session = await this.prisma.interviewSession.update({
      where: { sessionId: BigInt(sessionId) },
      data: { status: nextStatus },
      include: { application: true },
    });
    return this.toInterviewSession(session);
  }

  async updateApplicationInterviewStatus(applicationId: number, status: InterviewSession["status"]): Promise<Application> {
    const application = await this.prisma.application.update({
      where: { applicationId: BigInt(applicationId) },
      data: { interviewStatus: status as PrismaInterviewStatus },
    });
    return this.toApplication(application);
  }

  async updateApplicationReportStatus(applicationId: number, status: ReportStatus): Promise<Application> {
    const application = await this.prisma.application.update({
      where: { applicationId: BigInt(applicationId) },
      data: { reportStatus: status as PrismaReportStatus },
    });
    return this.toApplication(application);
  }

  async updateInterviewSessionStatus(
    sessionId: number,
    status: InterviewSession["status"],
    statusAt?: string,
  ): Promise<InterviewSession> {
    const at = statusAt ? new Date(statusAt) : new Date();
    const session = await this.prisma.interviewSession.update({
      where: { sessionId: BigInt(sessionId) },
      data: {
        status: status as PrismaInterviewStatus,
        ...(status === "IN_PROGRESS" ? { startedAt: at } : {}),
        ...(status === "COMPLETED" ? { completedAt: at } : {}),
      },
      include: { application: true },
    });
    return this.toInterviewSession(session);
  }

  async hasApplication(candidateId: number, postingId: number): Promise<boolean> {
    const count = await this.prisma.application.count({
      where: { candidateId: BigInt(candidateId), postingId: BigInt(postingId) },
    });
    return count > 0;
  }

  async createApplication(input: {
    postingId: number;
    candidateId: number;
    resumeFileId: number;
    portfolioFileId?: number;
    portfolioUrl?: string;
    consentTypes: ConsentRecord["consentType"][];
  }): Promise<ApplicationSubmissionResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const application = await tx.application.create({
        data: {
          postingId: BigInt(input.postingId),
          candidateId: BigInt(input.candidateId),
          applicationStatus: PrismaApplicationStatus.SUBMITTED,
          documentStatus: PrismaDocumentStatus.SUBMITTED,
          interviewStatus: PrismaInterviewStatus.NOT_READY,
          reportStatus: PrismaReportStatus.PENDING,
          screeningDecision: "UNDECIDED",
          submittedAt: now,
        },
      });

      const documentInputs: Prisma.ApplicationDocumentCreateManyInput[] = [
        {
          applicationId: application.applicationId,
          fileId: BigInt(input.resumeFileId),
          documentType: PrismaDocumentType.RESUME,
          parseStatus: PrismaDocumentStatus.SUBMITTED,
          uploadedAt: now,
        },
      ];
      if (input.portfolioFileId) {
        documentInputs.push({
          applicationId: application.applicationId,
          fileId: BigInt(input.portfolioFileId),
          documentType: PrismaDocumentType.PORTFOLIO,
          parseStatus: PrismaDocumentStatus.SUBMITTED,
          uploadedAt: now,
        });
      }
      await tx.applicationDocument.createMany({ data: documentInputs });

      await tx.consentRecord.createMany({
        data: input.consentTypes.map((consentType) => ({
          applicationId: application.applicationId,
          consentType: consentType as PrismaConsentType,
          agreed: true,
          agreedAt: now,
        })),
      });

      await tx.interviewSession.create({
        data: {
          applicationId: application.applicationId,
          candidateId: BigInt(input.candidateId),
          interviewType: PrismaInterviewType.RECRUITING,
          status: PrismaInterviewStatus.NOT_READY,
          showQuestionText: false,
        },
      });

      let portfolioLink: PortfolioLink | undefined;
      if (input.portfolioUrl) {
        const portfolioField = input.portfolioUrl.includes("github.com") ? "githubUrl" : "portfolioUrl";
        await tx.candidateProfile.update({
          where: { candidateId: BigInt(input.candidateId) },
          data: { [portfolioField]: input.portfolioUrl },
        });
        portfolioLink = {
          portfolioLinkId: Number(application.applicationId),
          candidateId: input.candidateId,
          applicationId: Number(application.applicationId),
          linkType: portfolioField === "githubUrl" ? "GITHUB" : "PORTFOLIO",
          url: input.portfolioUrl,
          description: "Application portfolio link",
          fileId: input.portfolioFileId,
          createdAt: now.toISOString(),
        };
      }

      const documents = await tx.applicationDocument.findMany({
        where: { applicationId: application.applicationId },
        orderBy: { documentId: "asc" },
      });
      const consents = await tx.consentRecord.findMany({
        where: { applicationId: application.applicationId },
        orderBy: { consentId: "asc" },
      });

      return {
        application: this.toApplication(application),
        documents: documents.map((document) => this.toApplicationDocument(document)),
        consents: consents.map((consent) => this.toConsentRecord(consent)),
        portfolioLink,
      };
      });
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        throw new CandidateDomainError("APPLICATION_ALREADY_SUBMITTED", "이미 지원한 채용공고입니다.", 409);
      }
      throw error;
    }
  }

  async createFileAsset(input: Omit<FileAsset, "fileId" | "createdAt" | "status">): Promise<FileAsset> {
    const fileAsset = await this.prisma.fileAsset.create({
      data: {
        ownerUserId: BigInt(input.ownerUserId),
        storageKey: input.storageKey,
        originalName: input.originalName,
        mimeType: input.mimeType,
        sizeBytes: BigInt(input.sizeBytes),
        status: "ACTIVE",
      },
    });
    return this.toFileAsset(fileAsset);
  }

  async createPortfolioLink(input: Omit<PortfolioLink, "portfolioLinkId" | "createdAt">): Promise<PortfolioLink> {
    const portfolioField = input.linkType === "GITHUB" ? "githubUrl" : "portfolioUrl";
    await this.prisma.candidateProfile.update({
      where: { candidateId: BigInt(input.candidateId) },
      data: { [portfolioField]: input.url },
    });
    return {
      ...input,
      portfolioLinkId: input.fileId ?? input.candidateId,
      createdAt: new Date().toISOString(),
    };
  }

  private toCandidateJob(posting: PostingWithCompany): CandidateJob {
    const startsOn = posting.startsOn ?? posting.createdAt;
    const endsOn = posting.endsOn ?? new Date(startsOn.getTime() + 30 * 24 * 60 * 60 * 1000);
    return {
      jobId: Number(posting.postingId),
      companyId: Number(posting.companyId),
      isPublic: posting.status !== PrismaPostingStatus.DRAFT && posting.status !== PrismaPostingStatus.ARCHIVED,
      companyName: posting.company.name,
      companyLogoUrl: posting.company.logoFile ? buildPublicFileUrl(posting.company.logoFile.storageKey) : null,
      companyIndustry: posting.company.industry ?? "미입력",
      companyProfile: posting.company.profile ?? "",
      title: posting.title,
      jobGroup: posting.jobRole,
      jobRole: posting.jobRole,
      jobDescription: posting.jobDescription ?? "",
      location: "협의",
      careerLevel: "경력무관",
      employmentType: "정규직",
      techStacks: [],
      postingStatus: posting.status,
      startsOn: this.toDateOnly(startsOn),
      endsOn: this.toDateOnly(endsOn),
      createdAt: posting.createdAt.toISOString(),
    };
  }

  private toApplication(application: ApplicationRecord): Application {
    const submittedAt = application.submittedAt ?? application.updatedAt;
    return {
      applicationId: Number(application.applicationId),
      postingId: Number(application.postingId),
      candidateId: Number(application.candidateId),
      applicationStatus: application.applicationStatus,
      documentStatus: application.documentStatus,
      interviewStatus: application.interviewStatus,
      reportStatus: application.reportStatus,
      submittedAt: submittedAt.toISOString(),
      updatedAt: application.updatedAt.toISOString(),
    };
  }

  private toApplicationDocument(document: ApplicationDocumentRecord): ApplicationDocument {
    return {
      documentId: Number(document.documentId),
      applicationId: Number(document.applicationId),
      fileId: Number(document.fileId ?? 0),
      documentType: document.documentType,
      parseStatus: document.parseStatus,
      uploadedAt: document.uploadedAt.toISOString(),
    };
  }

  private toConsentRecord(consent: ConsentRecordModel): ConsentRecord {
    return {
      consentId: Number(consent.consentId),
      applicationId: Number(consent.applicationId),
      consentType: consent.consentType,
      agreed: true,
      agreedAt: (consent.agreedAt ?? new Date()).toISOString(),
    };
  }

  private toFileAsset(fileAsset: FileAssetRecord): FileAsset {
    return {
      fileId: Number(fileAsset.fileId),
      ownerUserId: Number(fileAsset.ownerUserId),
      storageKey: fileAsset.storageKey,
      originalName: fileAsset.originalName,
      mimeType: fileAsset.mimeType,
      sizeBytes: Number(fileAsset.sizeBytes),
      status: "ACTIVE",
      createdAt: fileAsset.createdAt.toISOString(),
    };
  }

  private toInterviewSession(session: InterviewSessionRecord): InterviewSession {
    const started = session.startedAt ?? session.application?.submittedAt ?? new Date();
    const windowStartsAt = started.toISOString();
    const windowEndsAt = new Date(started.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const devicePassed = session.status !== PrismaInterviewStatus.NOT_READY;
    return {
      sessionId: Number(session.sessionId),
      applicationId: Number(session.applicationId ?? 0),
      candidateId: Number(session.candidateId),
      interviewType: session.interviewType,
      status: session.status,
      showQuestionText: session.showQuestionText,
      windowStartsAt,
      windowEndsAt,
      deviceCheck: {
        cameraGranted: devicePassed,
        microphoneGranted: devicePassed,
        networkStable: devicePassed,
        status: devicePassed ? "PASSED" : "PENDING",
        checkedAt: devicePassed ? (session.startedAt ?? new Date()).toISOString() : undefined,
      },
      startedAt: session.startedAt?.toISOString(),
      completedAt: session.completedAt?.toISOString(),
      updatedAt: (session.completedAt ?? session.startedAt ?? session.application?.updatedAt ?? new Date()).toISOString(),
    };
  }

  private toDateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function buildPublicFileUrl(storageKey: string) {
  const baseUrl = process.env.S3_PUBLIC_BASE_URL ?? buildDefaultS3PublicBaseUrl();
  return `${baseUrl.replace(/\/+$/, "")}/${encodeStorageKeyPath(storageKey)}`;
}

function buildDefaultS3PublicBaseUrl() {
  const bucket = process.env.S3_BUCKET_NAME ?? process.env.S3_BUCKET ?? "";
  const region = process.env.AWS_REGION ?? "ap-northeast-2";
  if (process.env.AWS_ENDPOINT_URL && bucket) {
    return `${process.env.AWS_ENDPOINT_URL.replace(/\/+$/, "")}/${bucket}`;
  }
  return bucket ? `https://${bucket}.s3.${region}.amazonaws.com` : "";
}

function encodeStorageKeyPath(storageKey: string) {
  return storageKey.split("/").map(encodeURIComponent).join("/");
}
