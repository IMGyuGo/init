import { Injectable } from "@nestjs/common";
import {
  ApplicationStatus as PrismaApplicationStatus,
  ConsentType as PrismaConsentType,
  DocumentStatus as PrismaDocumentStatus,
  DocumentType as PrismaDocumentType,
  InterviewStatus as PrismaInterviewStatus,
  InterviewType as PrismaInterviewType,
  ReportStatus as PrismaReportStatus,
  type Prisma,
} from "@prisma/client";
import { PrismaService } from "../../../shared/prisma.service";
import { CandidateDomainError } from "../candidate.errors";
import {
  type ApplicantContact,
  type Application,
  type ApplicationDocument,
  type ApplicationSubmissionResult,
  type CandidateFolder,
  type CandidateProfileView,
  type UpdateCandidateProfileInput,
  type CandidateJob,
  type CandidateRepository,
  type ConsentRecord,
  type FileAsset,
  type InterviewDeviceCheck,
  type InterviewSession,
  type PortfolioLink,
  type ReportStatus,
} from "../candidate.types";

interface CandidatePostingRow {
  postingId: bigint;
  companyId: bigint;
  title: string;
  jobRole: string;
  jobDescription: string | null;
  workLocation: string | null;
  employmentType: string | null;
  jobRoleCode: string | null;
  regionCode: string | null;
  careerMinYears: number | null;
  careerMaxYears: number | null;
  employmentTypeCode: string | null;
  recruitmentType: string | null;
  workplaceAddress: string | null;
  workplaceLat: number | null;
  workplaceLng: number | null;
  startsOn: Date | null;
  endsOn: Date | null;
  postingStatus: string;
  createdAt: Date;
  companyName: string;
  companyIndustry: string | null;
  companyProfile: string | null;
  companyLogoStorageKey: string | null;
}

interface CandidatePostingSchemaShape {
  postingColumns: Set<string>;
  companyColumns: Set<string>;
}

type ApplicationRecord = Prisma.ApplicationGetPayload<Record<string, never>>;
type ApplicationDocumentRecord = Prisma.ApplicationDocumentGetPayload<Record<string, never>>;
type CandidateFolderRecord = Prisma.CandidateFolderGetPayload<{
  include: { resumeFile: { select: { originalName: true } }, portfolioFile: { select: { originalName: true } } };
}>;
type ConsentRecordModel = Prisma.ConsentRecordGetPayload<Record<string, never>>;
type FileAssetRecord = Prisma.FileAssetGetPayload<Record<string, never>>;
type InterviewSessionRecord = Prisma.InterviewSessionGetPayload<{ include: { application: true } }>;

@Injectable()
export class PrismaCandidateRepository implements CandidateRepository {
  private candidatePostingSchemaShape?: Promise<CandidatePostingSchemaShape>;

  constructor(private readonly prisma: PrismaService) {}

  async listJobs(): Promise<CandidateJob[]> {
    const postings = await this.findCandidatePostingRows();
    return postings.map((posting) => this.toCandidateJob(posting));
  }

  async findJob(jobId: number): Promise<CandidateJob | undefined> {
    const postings = await this.findCandidatePostingRows({ postingId: jobId, visibleOnly: false });
    return postings[0] ? this.toCandidateJob(postings[0]) : undefined;
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

  async findApplicantContact(userId: number): Promise<ApplicantContact | undefined> {
    const user = await this.prisma.user.findUnique({
      where: { userId: BigInt(userId) },
      select: {
        name: true,
        email: true,
        phone: true,
        candidateProfile: { select: { githubUrl: true, blogUrl: true, portfolioUrl: true } },
      },
    });
    if (!user) {
      return undefined;
    }
    return {
      name: user.name,
      email: user.email,
      phone: user.phone ?? null,
      githubUrl: user.candidateProfile?.githubUrl ?? null,
      blogUrl: user.candidateProfile?.blogUrl ?? null,
      portfolioUrl: user.candidateProfile?.portfolioUrl ?? null,
    };
  }

  async getCandidateProfile(candidateId: number): Promise<CandidateProfileView | undefined> {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { candidateId: BigInt(candidateId) },
      include: { user: { select: { name: true, email: true, phone: true } } },
    });
    if (!profile) {
      return undefined;
    }
    return {
      name: profile.user.name,
      email: profile.user.email,
      phone: profile.user.phone ?? null,
      githubUrl: profile.githubUrl ?? null,
      blogUrl: profile.blogUrl ?? null,
      portfolioUrl: profile.portfolioUrl ?? null,
      summary: profile.summary ?? null,
    };
  }

  async updateCandidateProfile(
    candidateId: number,
    input: UpdateCandidateProfileInput,
  ): Promise<CandidateProfileView> {
    const existing = await this.prisma.candidateProfile.findUnique({
      where: { candidateId: BigInt(candidateId) },
      select: { userId: true },
    });
    if (!existing) {
      throw new CandidateDomainError("COMMON_NOT_FOUND", "지원자 프로필을 찾을 수 없습니다.", 404);
    }

    const userData = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
    };
    const profileData = {
      ...(input.githubUrl !== undefined ? { githubUrl: input.githubUrl } : {}),
      ...(input.blogUrl !== undefined ? { blogUrl: input.blogUrl } : {}),
      ...(input.portfolioUrl !== undefined ? { portfolioUrl: input.portfolioUrl } : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
    };

    await this.prisma.$transaction([
      ...(Object.keys(userData).length > 0
        ? [this.prisma.user.update({ where: { userId: existing.userId }, data: userData })]
        : []),
      this.prisma.candidateProfile.update({ where: { candidateId: BigInt(candidateId) }, data: profileData }),
    ]);

    const updated = await this.getCandidateProfile(candidateId);
    if (!updated) {
      throw new CandidateDomainError("COMMON_NOT_FOUND", "지원자 프로필을 찾을 수 없습니다.", 404);
    }
    return updated;
  }

  async listDocuments(applicationId: number): Promise<ApplicationDocument[]> {
    const documents = await this.prisma.applicationDocument.findMany({
      where: { applicationId: BigInt(applicationId) },
      orderBy: { uploadedAt: "asc" },
    });
    return documents.map((document) => this.toApplicationDocument(document));
  }

  async findLatestExtractedTextByFileId(fileId: number): Promise<string | null> {
    const document = await this.prisma.applicationDocument.findFirst({
      where: {
        fileId: BigInt(fileId),
        parseStatus: "EXTRACTED",
        extractedText: { not: null },
      },
      orderBy: { uploadedAt: "desc" },
      select: { extractedText: true },
    });
    return document?.extractedText ?? null;
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
        showQuestionText: true,
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
    candidateName?: string;
    email?: string;
    phone?: string;
    githubUrl?: string;
    blogUrl?: string;
    resumeFileId: number;
    portfolioFileId?: number;
    portfolioUrl?: string;
    motivation?: string;
    additionalInfo?: string;
    consentTypes: ConsentRecord["consentType"][];
    // 있으면 지원서 생성과 같은 트랜잭션에서 회원 연락처를 저장한다(다음 지원 자동 입력용). (#272 P2)
    contactUserId?: number;
  }): Promise<ApplicationSubmissionResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const application = await tx.application.create({
        data: {
          postingId: BigInt(input.postingId),
          candidateId: BigInt(input.candidateId),
          applicantName: input.candidateName,
          applicantEmail: input.email,
          applicantPhone: input.phone,
          githubUrl: input.githubUrl,
          blogUrl: input.blogUrl,
          portfolioUrl: input.portfolioUrl,
          motivation: input.motivation,
          additionalInfo: input.additionalInfo,
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
          showQuestionText: true,
        },
      });

      // 공고별 입력값은 지원서 스냅샷에만 저장한다. 회원 프로필(정본)은 갱신하지 않는다.
      // (프로필은 마이페이지에서만 수정, 연락처만 재사용 목적으로 저장. #272 P1)
      let portfolioLink: PortfolioLink | undefined;
      if (input.portfolioUrl) {
        const linkType = input.portfolioUrl.includes("github.com") ? "GITHUB" : "PORTFOLIO";
        portfolioLink = {
          portfolioLinkId: Number(application.applicationId),
          candidateId: input.candidateId,
          applicationId: Number(application.applicationId),
          linkType,
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

      if (input.contactUserId && input.phone) {
        await tx.user.update({ where: { userId: BigInt(input.contactUserId) }, data: { phone: input.phone } });
      }

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

  countFolders(candidateId: number): Promise<number> {
    return this.prisma.candidateFolder.count({
      where: { candidateId: BigInt(candidateId) },
    });
  }

  async listFolders(candidateId: number): Promise<CandidateFolder[]> {
    const folders = await this.prisma.candidateFolder.findMany({
      where: { candidateId: BigInt(candidateId) },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      include: { resumeFile: { select: { originalName: true } }, portfolioFile: { select: { originalName: true } } },
    });
    return folders.map((folder) => this.toCandidateFolder(folder));
  }

  async findFolder(folderId: number): Promise<CandidateFolder | undefined> {
    const folder = await this.prisma.candidateFolder.findUnique({
      where: { id: BigInt(folderId) },
      include: { resumeFile: { select: { originalName: true } }, portfolioFile: { select: { originalName: true } } },
    });
    return folder ? this.toCandidateFolder(folder) : undefined;
  }

  async createFolder(
    input: Omit<CandidateFolder, "id" | "resumeFileName" | "portfolioFileName" | "createdAt" | "updatedAt">,
  ): Promise<CandidateFolder> {
    const folder = await this.prisma.candidateFolder.create({
      data: {
        candidateId: BigInt(input.candidateId),
        name: input.name,
        githubUrl: input.githubUrl,
        blogUrl: input.blogUrl,
        portfolioUrl: input.portfolioUrl,
        resumeFileId: input.resumeFileId ? BigInt(input.resumeFileId) : null,
        portfolioFileId: input.portfolioFileId ? BigInt(input.portfolioFileId) : null,
        motivation: input.motivation,
        extraNote: input.extraNote,
      },
      include: { resumeFile: { select: { originalName: true } }, portfolioFile: { select: { originalName: true } } },
    });
    return this.toCandidateFolder(folder);
  }

  async updateFolder(
    folderId: number,
    input: Partial<Omit<CandidateFolder, "id" | "candidateId" | "resumeFileName" | "portfolioFileName" | "createdAt" | "updatedAt">>,
  ): Promise<CandidateFolder> {
    const folder = await this.prisma.candidateFolder.update({
      where: { id: BigInt(folderId) },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.githubUrl !== undefined ? { githubUrl: input.githubUrl } : {}),
        ...(input.blogUrl !== undefined ? { blogUrl: input.blogUrl } : {}),
        ...(input.portfolioUrl !== undefined ? { portfolioUrl: input.portfolioUrl } : {}),
        ...(input.resumeFileId !== undefined ? { resumeFileId: input.resumeFileId ? BigInt(input.resumeFileId) : null } : {}),
        ...(input.portfolioFileId !== undefined ? { portfolioFileId: input.portfolioFileId ? BigInt(input.portfolioFileId) : null } : {}),
        ...(input.motivation !== undefined ? { motivation: input.motivation } : {}),
        ...(input.extraNote !== undefined ? { extraNote: input.extraNote } : {}),
      },
      include: { resumeFile: { select: { originalName: true } }, portfolioFile: { select: { originalName: true } } },
    });
    return this.toCandidateFolder(folder);
  }

  async deleteFolder(folderId: number): Promise<void> {
    await this.prisma.candidateFolder.delete({ where: { id: BigInt(folderId) } });
  }

  private async findCandidatePostingRows(
    filter: { postingId?: number; visibleOnly?: boolean } = {},
  ): Promise<CandidatePostingRow[]> {
    const shape = await this.getCandidatePostingSchemaShape();
    const logoJoin = shape.companyColumns.has("logo_file_id")
      ? 'LEFT JOIN "file_assets" fa ON fa."file_id" = c."logo_file_id"'
      : "";
    const logoSelect = shape.companyColumns.has("logo_file_id")
      ? 'fa."storage_key" AS "companyLogoStorageKey"'
      : 'NULL::text AS "companyLogoStorageKey"';
    const params: unknown[] = [];
    const whereParts: string[] = [];
    if (filter.visibleOnly ?? true) {
      whereParts.push('p."status" IN (\'OPEN\', \'CLOSING_SOON\')');
    }
    if (filter.postingId) {
      params.push(BigInt(filter.postingId));
      whereParts.push(`p."posting_id" = $${params.length}`);
    }
    const where = whereParts.length > 0 ? whereParts.join(" AND ") : "TRUE";

    return this.prisma.$queryRawUnsafe<CandidatePostingRow[]>(
      `
      SELECT
        p."posting_id" AS "postingId",
        p."company_id" AS "companyId",
        p."title" AS "title",
        p."job_role" AS "jobRole",
        p."job_description" AS "jobDescription",
        ${this.selectPostingColumn(shape.postingColumns, "work_location", "workLocation")},
        ${this.selectPostingColumn(shape.postingColumns, "employment_type", "employmentType")},
        ${this.selectPostingColumn(shape.postingColumns, "job_role_code", "jobRoleCode")},
        ${this.selectPostingColumn(shape.postingColumns, "region_code", "regionCode")},
        ${this.selectPostingColumn(shape.postingColumns, "career_min_years", "careerMinYears", "integer")},
        ${this.selectPostingColumn(shape.postingColumns, "career_max_years", "careerMaxYears", "integer")},
        ${this.selectPostingColumn(shape.postingColumns, "employment_type_code", "employmentTypeCode")},
        ${this.selectPostingColumn(shape.postingColumns, "recruitment_type", "recruitmentType")},
        ${this.selectPostingColumn(shape.postingColumns, "workplace_address", "workplaceAddress")},
        ${this.selectPostingColumn(shape.postingColumns, "workplace_lat", "workplaceLat", "double precision")},
        ${this.selectPostingColumn(shape.postingColumns, "workplace_lng", "workplaceLng", "double precision")},
        p."starts_on" AS "startsOn",
        p."ends_on" AS "endsOn",
        p."status"::text AS "postingStatus",
        p."created_at" AS "createdAt",
        c."name" AS "companyName",
        c."industry" AS "companyIndustry",
        c."profile" AS "companyProfile",
        ${logoSelect}
      FROM "postings" p
      INNER JOIN "companies" c ON c."company_id" = p."company_id"
      ${logoJoin}
      WHERE ${where}
      ORDER BY p."created_at" DESC
      `,
      ...params,
    );
  }

  private async getCandidatePostingSchemaShape(): Promise<CandidatePostingSchemaShape> {
    this.candidatePostingSchemaShape ??= this.prisma
      .$queryRawUnsafe<Array<{ tableName: string; columnName: string }>>(
        `
        SELECT table_name AS "tableName", column_name AS "columnName"
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name IN ('postings', 'companies')
        `,
      )
      .then((rows) => ({
        postingColumns: new Set(
          rows.filter((row) => row.tableName === "postings").map((row) => row.columnName),
        ),
        companyColumns: new Set(
          rows.filter((row) => row.tableName === "companies").map((row) => row.columnName),
        ),
      }));

    return this.candidatePostingSchemaShape;
  }

  private selectPostingColumn(
    columns: Set<string>,
    columnName: string,
    alias: keyof CandidatePostingRow,
    fallbackType = "text",
  ): string {
    return columns.has(columnName)
      ? `p."${columnName}" AS "${alias}"`
      : `NULL::${fallbackType} AS "${alias}"`;
  }

  private toCandidateJob(posting: CandidatePostingRow): CandidateJob {
    const startsOn = posting.startsOn ?? posting.createdAt;
    const endsOn = posting.endsOn ?? new Date(startsOn.getTime() + 30 * 24 * 60 * 60 * 1000);
    return {
      jobId: Number(posting.postingId),
      companyId: Number(posting.companyId),
      isPublic: posting.postingStatus !== "DRAFT" && posting.postingStatus !== "ARCHIVED",
      companyName: posting.companyName,
      companyLogoUrl: posting.companyLogoStorageKey ? buildPublicFileUrl(posting.companyLogoStorageKey) : null,
      companyIndustry: posting.companyIndustry ?? "미입력",
      companyProfile: posting.companyProfile ?? "",
      title: posting.title,
      jobGroup: posting.jobRole,
      jobRole: posting.jobRole,
      jobDescription: posting.jobDescription ?? "",
      location: posting.regionCode ?? posting.workLocation ?? "협의",
      careerLevel: formatCareerLevel(posting.careerMinYears, posting.careerMaxYears),
      employmentType: posting.employmentTypeCode ?? posting.employmentType ?? "정규직",
      techStacks: parseStructuredTags(posting.jobDescription),
      postingStatus: posting.postingStatus as CandidateJob["postingStatus"],
      jobRoleCode: posting.jobRoleCode,
      regionCode: posting.regionCode,
      careerMinYears: posting.careerMinYears,
      careerMaxYears: posting.careerMaxYears,
      employmentTypeCode: posting.employmentTypeCode,
      recruitmentType: posting.recruitmentType,
      workplaceAddress: posting.workplaceAddress,
      workplaceLat: posting.workplaceLat,
      workplaceLng: posting.workplaceLng,
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
      applicantName: application.applicantName,
      applicantEmail: application.applicantEmail,
      applicantPhone: application.applicantPhone,
      githubUrl: application.githubUrl,
      blogUrl: application.blogUrl,
      portfolioUrl: application.portfolioUrl,
      motivation: application.motivation,
      additionalInfo: application.additionalInfo,
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
      extractedText: document.extractedText,
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

  private toCandidateFolder(folder: CandidateFolderRecord): CandidateFolder {
    return {
      id: Number(folder.id),
      candidateId: Number(folder.candidateId),
      name: folder.name,
      githubUrl: folder.githubUrl,
      blogUrl: folder.blogUrl,
      portfolioUrl: folder.portfolioUrl,
      resumeFileId: folder.resumeFileId ? Number(folder.resumeFileId) : null,
      resumeFileName: folder.resumeFile?.originalName ?? null,
      portfolioFileId: folder.portfolioFileId ? Number(folder.portfolioFileId) : null,
      portfolioFileName: folder.portfolioFile?.originalName ?? null,
      motivation: folder.motivation,
      extraNote: folder.extraNote,
      createdAt: folder.createdAt.toISOString(),
      updatedAt: folder.updatedAt.toISOString(),
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

// 경력 range(년)를 지원자 표시용 한글 라벨로 변환한다.
function formatCareerLevel(minYears: number | null, maxYears: number | null): string {
  if (minYears == null && maxYears == null) return "경력무관";
  const min = minYears ?? 0;
  const max = maxYears ?? 10;
  if (min <= 0 && max >= 10) return "경력무관";
  if (min <= 0 && max === 0) return "신입";
  const maxText = max >= 10 ? "10년 이상" : `${max}년`;
  if (min <= 0) return `신입~${maxText}`;
  if (min === max) return `${min}년`;
  return `${min}~${maxText}`;
}

// 공고 JD(구조화 HTML)에 저장된 태그를 추출한다. 프론트 composeStructuredJobDescription 인코딩과 대응.
function parseStructuredTags(jobDescription: string | null): string[] {
  if (!jobDescription) return [];
  const matches = jobDescription.matchAll(/data-init-structured-tag="([^"]*)"/gi);
  const tags: string[] = [];
  for (const match of matches) {
    const value = decodeHtmlAttribute(match[1]).trim();
    if (value && !tags.includes(value)) tags.push(value);
  }
  return tags;
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
