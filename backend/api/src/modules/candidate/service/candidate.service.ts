import { Inject, Injectable, Optional } from "@nestjs/common";
import { CandidateJobListQueryDto } from "../dto/candidate-job-list-query.dto";
import { CreateCandidateFolderDto, UpdateCandidateFolderDto } from "../dto/candidate-folder.dto";
import { CreatePortfolioLinkDto } from "../dto/create-portfolio-link.dto";
import { SaveInterviewConsentDto } from "../dto/save-interview-consent.dto";
import { SubmitApplicationDto } from "../dto/submit-application.dto";
import { UploadResumeDto } from "../dto/upload-resume.dto";
import { FORBIDDEN_FILE_PAYLOAD_FIELDS } from "../candidate.constants";
import { CandidateDomainError } from "../candidate.errors";
import {
  CANDIDATE_DOCUMENT_STORAGE,
  CandidateDocumentStoragePort,
  InMemoryCandidateDocumentStorageAdapter,
} from "./candidate-document-storage.adapter";
import {
  ApiListResponse,
  ApiResponse,
  Application,
  ApplicationDocument,
  ApplicationSubmissionResult,
  CandidateApplicationSummary,
  CandidateApplyView,
  CandidateFolder,
  CandidateFolderContext,
  CandidateInterviewGuide,
  CandidateInterviewRuntimeView,
  CandidateJob,
  CandidateJobDetail,
  CandidateJobSummary,
  CandidateRepository,
  ConsentRecord,
  CurrentCandidateUser,
  FileAsset,
  InterviewDeviceCheckResult,
  InterviewSession,
  PageMeta,
  PortfolioLink,
  PortfolioLinkType,
  SaveInterviewConsentResult,
  StartInterviewResult,
} from "../candidate.types";

export const MAX_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024;
export const MAX_CANDIDATE_FOLDER_COUNT = 20;
const MAX_INTERVIEW_MEDIA_SIZE_BYTES = 500 * 1024 * 1024;
const REQUIRED_APPLICATION_CONSENTS = ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS"] as const;
const REQUIRED_INTERVIEW_CONSENTS = [
  "PRIVACY_COLLECTION",
  "AI_DOCUMENT_ANALYSIS",
  "AI_INTERVIEW_RECORDING",
] as const;
const APPLICATION_CONSENT_TYPES = ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS", "AI_INTERVIEW_RECORDING"] as const;
const CANDIDATE_LIST_POSTING_STATUSES = ["OPEN", "CLOSING_SOON"] as const;
const CANDIDATE_LIST_SORT_FIELDS = ["createdAt", "endsOn", "title"] as const;
const SORT_ORDERS = ["asc", "desc"] as const;

type CandidateListPostingStatus = (typeof CANDIDATE_LIST_POSTING_STATUSES)[number];
type CandidateListSortField = (typeof CANDIDATE_LIST_SORT_FIELDS)[number];
type CandidateListSortOrder = (typeof SORT_ORDERS)[number];
type CandidateFolderMutableField = "name" | "githubUrl" | "blogUrl" | "portfolioUrl" | "resumeFileId" | "motivation" | "extraNote";
type CandidateFolderMutableInput = Pick<CandidateFolder, CandidateFolderMutableField>;
const MAX_MOCK_FOLDER_CONTEXT_CHARS = 12_000;

interface ValidatedSubmitApplication {
  candidateName: string;
  email: string;
  phone: string;
  githubUrl: string;
  blogUrl: string;
  resumeFileId: number;
  portfolioFileId?: number;
  portfolioUrl?: string;
  motivation: string;
  additionalInfo: string;
  consentTypes: ConsentRecord["consentType"][];
}

interface NormalizedCandidateJobListQuery {
  page: number;
  limit: number;
  q?: string;
  jobRole?: string;
  jobRoles?: string[];
  jobGroup?: string;
  location?: string;
  careerLevel?: string;
  careerMinYears?: number;
  careerMaxYears?: number;
  recruitmentType?: string;
  postingStatus?: CandidateListPostingStatus;
  sort: CandidateListSortField;
  order: CandidateListSortOrder;
}

interface UploadedCandidateDocumentFile {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
}

export const CANDIDATE_REPOSITORY = Symbol("CANDIDATE_REPOSITORY");

export { CandidateDomainError } from "../candidate.errors";
export { DEV_CANDIDATE_USER } from "../candidate.constants";

@Injectable()
export class CandidateService {
  constructor(
    @Inject(CANDIDATE_REPOSITORY) private readonly repository: CandidateRepository,
    @Optional()
    @Inject(CANDIDATE_DOCUMENT_STORAGE)
    private readonly documentStorage: CandidateDocumentStoragePort = new InMemoryCandidateDocumentStorageAdapter(),
  ) {}

  async listJobs(
    query: CandidateJobListQueryDto,
    currentUser?: CurrentCandidateUser,
  ): Promise<ApiListResponse<CandidateJobSummary>> {
    const normalizedQuery = this.normalizeListQuery(query);
    const { page, limit } = normalizedQuery;
    const jobs = await this.repository.listJobs();
    const filtered = jobs
      .filter((job) => this.isApplyAvailable(job))
      .filter((job) => this.matchesListQuery(job, normalizedQuery))
      .sort((left, right) => this.compareJobs(left, right, normalizedQuery.sort, normalizedQuery.order));

    const pageMeta = this.createPageMeta(page, limit, filtered.length);
    const start = (page - 1) * limit;
    const items = await Promise.all(
      filtered.slice(start, start + limit).map((job) => this.toJobSummary(job, currentUser)),
    );

    return this.listEnvelope(items, pageMeta);
  }

  async getJobDetail(jobId: number, currentUser: CurrentCandidateUser): Promise<ApiResponse<CandidateJobDetail>> {
    const job = await this.getApplyAvailableJob(jobId);
    const alreadyApplied = await this.repository.hasApplication(currentUser.candidateId, job.jobId);

    return this.envelope({
      ...job,
      canApply: !alreadyApplied,
      alreadyApplied,
    });
  }

  async getApplyView(jobId: number, currentUser: CurrentCandidateUser): Promise<ApiResponse<CandidateApplyView>> {
    const jobDetail = await this.getJobDetail(jobId, currentUser);
    return this.envelope({
      job: jobDetail.data,
      documentPolicy: {
        storageProvider: "S3",
        allowedMimeTypes: this.allowedDocumentMimeTypes(),
        maxSizeBytes: MAX_DOCUMENT_SIZE_BYTES,
        storageKeyPrefix: `candidate/${currentUser.candidateId}/`,
        metadataOnly: false,
      },
      requiredConsentTypes: [...REQUIRED_APPLICATION_CONSENTS],
      portfolioRequired: true,
    });
  }

  async submitApplication(
    jobId: number,
    dto: SubmitApplicationDto,
    currentUser: CurrentCandidateUser,
  ): Promise<ApiResponse<ApplicationSubmissionResult>> {
    await this.getApplyAvailableJob(jobId);
    const applicationFields = this.assertRequiredApplicationFields(dto);
    const resumeFileAsset = await this.assertFileAssetForCurrentUser(
      applicationFields.resumeFileId,
      currentUser.userId,
      "resumeFileId",
    );
    this.assertApplicationPdf(resumeFileAsset.mimeType, resumeFileAsset.sizeBytes, "resumeFileId");
    this.assertObjectStorageKey(resumeFileAsset.storageKey, currentUser.candidateId);
    if (applicationFields.portfolioFileId) {
      const portfolioFileAsset = await this.assertFileAssetForCurrentUser(
        applicationFields.portfolioFileId,
        currentUser.userId,
        "portfolioFileId",
      );
      this.assertApplicationPdf(portfolioFileAsset.mimeType, portfolioFileAsset.sizeBytes, "portfolioFileId");
      this.assertObjectStorageKey(portfolioFileAsset.storageKey, currentUser.candidateId);
    }
    if (applicationFields.portfolioUrl) {
      this.assertUrl(applicationFields.portfolioUrl, "portfolioUrl");
    }

    if (await this.repository.hasApplication(currentUser.candidateId, jobId)) {
      throw new CandidateDomainError("APPLICATION_ALREADY_SUBMITTED", "이미 지원한 채용공고입니다.", 409);
    }

    const result = await this.repository.createApplication({
      postingId: jobId,
      candidateId: currentUser.candidateId,
      candidateName: applicationFields.candidateName,
      email: applicationFields.email,
      phone: applicationFields.phone,
      githubUrl: applicationFields.githubUrl,
      blogUrl: applicationFields.blogUrl,
      resumeFileId: applicationFields.resumeFileId,
      portfolioFileId: applicationFields.portfolioFileId,
      portfolioUrl: applicationFields.portfolioUrl,
      motivation: applicationFields.motivation,
      additionalInfo: applicationFields.additionalInfo,
      consentTypes: applicationFields.consentTypes,
    });

    return this.envelope(result);
  }

  async uploadResume(dto: UploadResumeDto, currentUser: CurrentCandidateUser): Promise<ApiResponse<FileAsset>> {
    this.assertUploadResumeRequest(dto);
    this.assertFileAssetMetadataOnly(dto);
    this.assertDocumentFile(dto.mimeType, dto.sizeBytes);
    this.assertObjectStorageKey(dto.storageKey, currentUser.candidateId);
    this.assertMetadataOnlyUploadAllowed();
    const originalName = normalizeUploadedFileName(dto.originalName);
    const fileAsset = await this.repository.createFileAsset({
      ownerUserId: currentUser.userId,
      storageKey: dto.storageKey,
      originalName,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
    });

    return this.envelope(fileAsset);
  }

  async uploadResumeFile(
    file: UploadedCandidateDocumentFile | undefined,
    currentUser: CurrentCandidateUser,
  ): Promise<ApiResponse<FileAsset>> {
    if (!file) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "Resume file is required.", 400, [
        { field: "file", reason: "multipart file is required" },
      ]);
    }

    this.assertDocumentFile(file.mimeType, file.sizeBytes);
    const originalName = normalizeUploadedFileName(file.originalName);
    const storageKey = this.buildCandidateDocumentStorageKey(currentUser.candidateId, originalName);

    await this.documentStorage.putObject({
      key: storageKey,
      body: file.buffer,
      contentLength: file.sizeBytes,
      contentType: file.mimeType,
    });

    const fileAsset = await this.repository.createFileAsset({
      ownerUserId: currentUser.userId,
      storageKey,
      originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    });

    return this.envelope(fileAsset);
  }

  async createPortfolioLink(
    dto: CreatePortfolioLinkDto,
    currentUser: CurrentCandidateUser,
  ): Promise<ApiResponse<PortfolioLink>> {
    this.assertPortfolioLinkRequest(dto);
    const linkType = dto.linkType ?? this.inferPortfolioLinkType(dto.url);
    this.assertUrl(dto.url, "url");
    this.assertPortfolioLinkType(dto.url, linkType);
    if (dto.fileId !== undefined) {
      const fileAsset = await this.assertFileAssetForCurrentUser(dto.fileId, currentUser.userId, "fileId");
      this.assertDocumentFile(fileAsset.mimeType, fileAsset.sizeBytes);
      this.assertObjectStorageKey(fileAsset.storageKey, currentUser.candidateId);
    }

    const portfolioLink = await this.repository.createPortfolioLink({
      candidateId: currentUser.candidateId,
      linkType,
      url: dto.url,
      description: dto.description,
      fileId: dto.fileId,
    });

    return this.envelope(portfolioLink);
  }

  async listFolders(currentUser: CurrentCandidateUser): Promise<ApiListResponse<CandidateFolder>> {
    const items = await this.repository.listFolders(currentUser.candidateId);
    return this.listEnvelope(items, this.createPageMeta(1, Math.max(items.length, 1), items.length));
  }

  async createFolder(
    dto: CreateCandidateFolderDto,
    currentUser: CurrentCandidateUser,
  ): Promise<ApiResponse<CandidateFolder>> {
    const count = await this.repository.countFolders(currentUser.candidateId);
    if (count >= MAX_CANDIDATE_FOLDER_COUNT) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "지원서 세트는 최대 20개까지 만들 수 있습니다.", 400, [
        { field: "folders", reason: "candidate folder count must be 20 or fewer" },
      ]);
    }

    const input = await this.normalizeCandidateFolderMutation(dto, currentUser, true);
    const folder = await this.repository.createFolder({
      candidateId: currentUser.candidateId,
      name: input.name ?? "",
      githubUrl: input.githubUrl ?? null,
      blogUrl: input.blogUrl ?? null,
      portfolioUrl: input.portfolioUrl ?? null,
      resumeFileId: input.resumeFileId ?? null,
      motivation: input.motivation ?? null,
      extraNote: input.extraNote ?? null,
    });
    return this.envelope(folder);
  }

  async getFolder(folderId: number, currentUser: CurrentCandidateUser): Promise<ApiResponse<CandidateFolder>> {
    return this.envelope(await this.getOwnedFolder(folderId, currentUser));
  }

  async updateFolder(
    folderId: number,
    dto: UpdateCandidateFolderDto,
    currentUser: CurrentCandidateUser,
  ): Promise<ApiResponse<CandidateFolder>> {
    const current = await this.getOwnedFolder(folderId, currentUser);
    const input = await this.normalizeCandidateFolderMutation(dto, currentUser, false);
    if (Object.keys(input).length === 0) {
      return this.envelope(current);
    }
    const folder = await this.repository.updateFolder(folderId, input);
    return this.envelope(folder);
  }

  async deleteFolder(folderId: number, currentUser: CurrentCandidateUser): Promise<void> {
    await this.getOwnedFolder(folderId, currentUser);
    await this.repository.deleteFolder(folderId);
  }

  async getMockInterviewFolderContext(
    folderId: number,
    currentUser: CurrentCandidateUser,
  ): Promise<CandidateFolderContext> {
    const folder = await this.getOwnedFolder(folderId, currentUser);
    const resumeFile = folder.resumeFileId ? await this.repository.findFileAsset(folder.resumeFileId) : undefined;
    const resumeExtractedText = folder.resumeFileId
      ? await this.repository.findLatestExtractedTextByFileId(folder.resumeFileId)
      : null;
    return this.limitMockFolderContext({
      ...folder,
      resumeFile: resumeFile ?? null,
      resumeExtractedText: resumeExtractedText ? resumeExtractedText.slice(0, 2_000) : null,
    });
  }

  async listApplications(currentUser: CurrentCandidateUser): Promise<ApiListResponse<CandidateApplicationSummary>> {
    const applications = await this.repository.listApplications(currentUser.candidateId);
    const items = await Promise.all(applications.map((application) => this.toApplicationSummary(application)));
    return this.listEnvelope(items, this.createPageMeta(1, Math.max(items.length, 1), items.length));
  }

  async getInterviewGuide(
    applicationId: number,
    currentUser: CurrentCandidateUser,
  ): Promise<ApiResponse<CandidateInterviewGuide>> {
    const { application, session } = await this.getOwnedApplicationWithSession(applicationId, currentUser);
    const job = await this.repository.findJob(application.postingId);
    this.assertSessionNotExpired(session);
    return this.envelope(await this.toInterviewGuide(application, session));
  }

  async saveInterviewConsent(
    applicationId: number,
    dto: SaveInterviewConsentDto,
    currentUser: CurrentCandidateUser,
  ): Promise<ApiResponse<SaveInterviewConsentResult>> {
    const { application, session } = await this.getOwnedApplicationWithSession(applicationId, currentUser);
    this.assertSessionNotExpired(session);
    const consentTypes = this.assertInterviewConsentRequest(dto);
    const consents = await this.repository.saveConsentRecords(application.applicationId, consentTypes);
    const refreshedSession = await this.refreshReadyState(application.applicationId, session.sessionId);
    const consentCompleted = this.hasRequiredInterviewConsents(consents);
    const deviceCheckCompleted = this.isDeviceCheckPassed(refreshedSession);

    return this.envelope({
      applicationId: application.applicationId,
      sessionId: refreshedSession.sessionId,
      consentCompleted,
      deviceCheckCompleted,
      canStart: consentCompleted && deviceCheckCompleted && refreshedSession.status === "READY",
      consents,
    });
  }

  async saveDeviceCheck(
    sessionId: number,
    dto: { cameraGranted: boolean; microphoneGranted: boolean; networkStable: boolean },
    currentUser: CurrentCandidateUser,
  ): Promise<ApiResponse<InterviewDeviceCheckResult>> {
    this.assertPositiveIntegerId(sessionId, "sessionId");
    const session = await this.repository.findInterviewSession(sessionId);
    if (!session) {
      throw new CandidateDomainError("COMMON_NOT_FOUND", "Interview session was not found.", 404, [
        { field: "sessionId", reason: "interview session not found" },
      ]);
    }

    const application = await this.getOwnedApplication(session.applicationId, currentUser);
    this.assertSessionNotExpired(session);
    this.assertInterviewNotCompleted(application, session);
    this.assertDeviceCheckRequest(dto);

    const checkedSession = await this.repository.saveDeviceCheck(session.sessionId, dto);
    const refreshedSession = await this.refreshReadyState(application.applicationId, checkedSession.sessionId);
    const consents = await this.repository.listConsentRecords(application.applicationId);
    const consentCompleted = this.hasRequiredInterviewConsents(consents);
    const deviceCheckCompleted = this.isDeviceCheckPassed(refreshedSession);

    return this.envelope({
      applicationId: application.applicationId,
      sessionId: refreshedSession.sessionId,
      consentCompleted,
      deviceCheckCompleted,
      canStart: consentCompleted && deviceCheckCompleted && refreshedSession.status === "READY",
      deviceCheck: refreshedSession.deviceCheck,
    });
  }

  async startInterview(
    applicationId: number,
    currentUser: CurrentCandidateUser,
  ): Promise<ApiResponse<StartInterviewResult>> {
    const { application, session } = await this.getOwnedApplicationWithSession(applicationId, currentUser);
    this.assertSessionNotExpired(session);
    this.assertInterviewNotCompleted(application, session);

    const refreshedSession = await this.refreshReadyState(application.applicationId, session.sessionId);
    const consents = await this.repository.listConsentRecords(application.applicationId);
    if (!this.hasRequiredInterviewConsents(consents)) {
      throw new CandidateDomainError("COMMON_CONFLICT", "Required interview consent is missing.", 409, [
        { field: "consentTypes", reason: "required interview consent is missing" },
      ]);
    }
    if (!this.isDeviceCheckPassed(refreshedSession)) {
      throw new CandidateDomainError("COMMON_CONFLICT", "Device check must be completed before interview start.", 409, [
        { field: "deviceCheck", reason: "camera, microphone, and network checks are required" },
      ]);
    }
    if (refreshedSession.status === "IN_PROGRESS") {
      if (application.interviewStatus !== "IN_PROGRESS") {
        await this.repository.updateApplicationInterviewStatus(application.applicationId, "IN_PROGRESS");
      }
      return this.envelope({
        applicationId: application.applicationId,
        sessionId: refreshedSession.sessionId,
        interviewStatus: "IN_PROGRESS",
        sessionStatus: "IN_PROGRESS",
        interviewUrl: `/candidate/applications/${application.applicationId}/interview`,
        startedAt: refreshedSession.startedAt ?? new Date().toISOString(),
      });
    }
    if (refreshedSession.status !== "READY") {
      throw new CandidateDomainError("COMMON_CONFLICT", "Interview cannot be started from the current state.", 409, [
        { field: "interviewStatus", reason: `current status is ${refreshedSession.status}` },
      ]);
    }

    const now = new Date().toISOString();
    const startedSession = await this.repository.updateInterviewSessionStatus(refreshedSession.sessionId, "IN_PROGRESS", now);
    await this.repository.updateApplicationInterviewStatus(application.applicationId, "IN_PROGRESS");

    return this.envelope({
      applicationId: application.applicationId,
      sessionId: startedSession.sessionId,
      interviewStatus: "IN_PROGRESS",
      sessionStatus: "IN_PROGRESS",
      interviewUrl: `/candidate/applications/${application.applicationId}/interview`,
      startedAt: now,
    });
  }

  async getInterviewRuntime(
    applicationId: number,
    currentUser: CurrentCandidateUser,
  ): Promise<ApiResponse<CandidateInterviewRuntimeView>> {
    const { application, session } = await this.getOwnedApplicationWithSession(applicationId, currentUser);
    const job = await this.repository.findJob(application.postingId);
    const timePolicy = await this.repository.getInterviewTimePolicy(application.postingId);
    this.assertSessionNotExpired(session);
    if (!["NOT_READY", "READY", "IN_PROGRESS", "COMPLETED"].includes(session.status)) {
      throw new CandidateDomainError("COMMON_CONFLICT", "Interview has not been started.", 409, [
        { field: "interviewStatus", reason: "interview status must be NOT_READY, READY, IN_PROGRESS or COMPLETED" },
      ]);
    }

    return this.envelope({
      applicationId: application.applicationId,
      sessionId: session.sessionId,
      interviewType: "RECRUITING",
      status: session.status,
      showQuestionText: true,
      canRecord: session.status === "IN_PROGRESS",
      ...(job?.jobDescription ? { jobDescription: job.jobDescription } : {}),
      timePolicy,
      nextQuestionEndpoint: `/api/v1/candidate/interviews/${session.sessionId}/next-question`,
      answerUploadEndpoint: `/api/v1/candidate/interviews/${session.sessionId}/answers`,
    });
  }

  async getPublicRecruitingInterviewContext(
    applicationId: number,
  ): Promise<{ application: Application; session: InterviewSession; currentUser: CurrentCandidateUser }> {
    this.assertPositiveIntegerId(applicationId, "applicationId");
    const application = await this.repository.findApplication(applicationId);
    if (!application) {
      throw new CandidateDomainError("COMMON_NOT_FOUND", "Application was not found.", 404, [
        { field: "applicationId", reason: "application not found" },
      ]);
    }

    const session = await this.repository.ensureInterviewSessionByApplication(application.applicationId);
    if (!session) {
      throw new CandidateDomainError("COMMON_NOT_FOUND", "Interview session was not found.", 404, [
        { field: "applicationId", reason: "interview session not found" },
      ]);
    }
    if (session.interviewType !== "RECRUITING") {
      throw new CandidateDomainError("COMMON_CONFLICT", "Interview type does not match recruiting runtime.", 409, [
        { field: "interviewType", reason: `current type is ${session.interviewType}` },
      ]);
    }

    this.assertSessionNotExpired(session);
    return {
      application,
      session,
      currentUser: await this.toCurrentCandidateUser(application),
    };
  }

  async getOwnedRecruitingInterviewSession(
    sessionId: number,
    currentUser: CurrentCandidateUser,
  ): Promise<{ application: Application; session: InterviewSession }> {
    this.assertPositiveIntegerId(sessionId, "sessionId");
    const session = await this.repository.findInterviewSession(sessionId);
    if (!session) {
      throw new CandidateDomainError("COMMON_NOT_FOUND", "Interview session was not found.", 404, [
        { field: "sessionId", reason: "interview session not found" },
      ]);
    }
    if (session.interviewType !== "RECRUITING") {
      throw new CandidateDomainError("COMMON_CONFLICT", "Interview type does not match recruiting runtime.", 409, [
        { field: "interviewType", reason: `current type is ${session.interviewType}` },
      ]);
    }

    const application = await this.getOwnedApplication(session.applicationId, currentUser);
    this.assertSessionNotExpired(session);
    return { application, session };
  }

  async completeRecruitingInterviewSession(
    sessionId: number,
    currentUser: CurrentCandidateUser,
  ): Promise<InterviewSession> {
    const { application, session } = await this.getOwnedRecruitingInterviewSession(sessionId, currentUser);
    if (session.status !== "IN_PROGRESS" && session.status !== "COMPLETED") {
      throw new CandidateDomainError("COMMON_CONFLICT", "Interview cannot be completed from the current state.", 409, [
        { field: "interviewStatus", reason: `current status is ${session.status}` },
      ]);
    }

    const now = new Date().toISOString();
    const completedSession =
      session.status === "COMPLETED"
        ? session
        : await this.repository.updateInterviewSessionStatus(session.sessionId, "COMPLETED", now);
    await this.repository.updateApplicationInterviewStatus(application.applicationId, "COMPLETED");
    return completedSession;
  }

  async getOwnedApplicationReportContext(
    applicationId: number,
    currentUser: CurrentCandidateUser,
  ): Promise<{ application: Application; session: InterviewSession; job: CandidateJob }> {
    const { application, session } = await this.getOwnedApplicationWithSession(applicationId, currentUser);
    const job = await this.repository.findJob(application.postingId);
    if (!job) {
      throw new CandidateDomainError("COMMON_NOT_FOUND", "Application posting was not found.", 404, [
        { field: "postingId", reason: "posting not found" },
      ]);
    }

    return { application, session, job };
  }

  async buildDocumentExtractAiPayload(
    input: { applicationId: number; documentId: number; fileId: number },
    currentUser: CurrentCandidateUser,
  ): Promise<Record<string, unknown>> {
    this.assertPositiveIntegerId(input.applicationId, "applicationId");
    this.assertPositiveIntegerId(input.documentId, "documentId");
    this.assertPositiveIntegerId(input.fileId, "fileId");

    const application = await this.getOwnedApplication(input.applicationId, currentUser);
    const document = (await this.repository.listDocuments(application.applicationId)).find(
      (candidateDocument) => candidateDocument.documentId === input.documentId,
    );
    if (!document) {
      throw new CandidateDomainError("COMMON_NOT_FOUND", "Application document was not found.", 404, [
        { field: "documentId", reason: "document not found for application" },
      ]);
    }
    if (document.fileId !== input.fileId) {
      throw new CandidateDomainError("COMMON_CONFLICT", "File asset does not belong to the selected document.", 409, [
        { field: "fileId", reason: "fileId must match the application document" },
      ]);
    }

    const fileAsset = await this.assertFileAssetForCurrentUser(input.fileId, currentUser.userId, "fileId");
    this.assertDocumentFile(fileAsset.mimeType, fileAsset.sizeBytes);
    this.assertObjectStorageKey(fileAsset.storageKey, currentUser.candidateId);

    return {
      applicationId: application.applicationId,
      documentId: document.documentId,
      fileId: fileAsset.fileId,
      s3Key: fileAsset.storageKey,
    };
  }

  async createInterviewFileAsset(
    dto: { storageKey: string; originalName: string; mimeType: string; sizeBytes: number },
    currentUser: CurrentCandidateUser,
  ): Promise<FileAsset> {
    this.assertRuntimeFileAssetRequest(dto);
    this.assertRuntimeFileAssetMetadataOnly(dto);
    this.assertInterviewMediaFile(dto.mimeType, dto.sizeBytes);
    this.assertObjectStorageKey(dto.storageKey, currentUser.candidateId);

    return this.repository.createFileAsset({
      ownerUserId: currentUser.userId,
      storageKey: dto.storageKey,
      originalName: dto.originalName,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
    });
  }

  async getInterviewFileAsset(
    fileId: number,
    currentUser: CurrentCandidateUser,
    field: string,
  ): Promise<FileAsset> {
    this.assertPositiveIntegerId(fileId, field);
    const fileAsset = await this.assertFileAssetForCurrentUser(fileId, currentUser.userId, field);
    this.assertInterviewMediaFile(fileAsset.mimeType, fileAsset.sizeBytes);
    this.assertObjectStorageKey(fileAsset.storageKey, currentUser.candidateId);
    return fileAsset;
  }

  private async getOwnedApplicationWithSession(
    applicationId: number,
    currentUser: CurrentCandidateUser,
  ): Promise<{ application: Application; session: InterviewSession }> {
    const application = await this.getOwnedApplication(applicationId, currentUser);
    const session = await this.repository.findInterviewSessionByApplication(application.applicationId);
    if (!session) {
      throw new CandidateDomainError("COMMON_NOT_FOUND", "Interview session was not found.", 404, [
        { field: "applicationId", reason: "interview session not found" },
      ]);
    }

    return { application, session };
  }

  private async getOwnedApplication(
    applicationId: number,
    currentUser: CurrentCandidateUser,
  ): Promise<Application> {
    this.assertPositiveIntegerId(applicationId, "applicationId");
    const application = await this.repository.findApplication(applicationId);
    if (!application) {
      throw new CandidateDomainError("COMMON_NOT_FOUND", "Application was not found.", 404, [
        { field: "applicationId", reason: "application not found" },
      ]);
    }

    if (application.candidateId !== currentUser.candidateId) {
      throw new CandidateDomainError("COMMON_FORBIDDEN", "Application does not belong to current candidate.", 403, [
        { field: "applicationId", reason: "candidate owner mismatch" },
      ]);
    }

    return application;
  }

  private async toCurrentCandidateUser(application: Application): Promise<CurrentCandidateUser> {
    const userId = await this.repository.findCandidateUserId(application.candidateId);
    if (!userId) {
      throw new CandidateDomainError("COMMON_NOT_FOUND", "Candidate profile was not found.", 404, [
        { field: "candidateId", reason: "candidate profile not found" },
      ]);
    }

    return {
      userId,
      candidateId: application.candidateId,
      userType: "CANDIDATE",
    };
  }

  private assertSessionNotExpired(session: InterviewSession): void {
    if (Date.parse(session.windowEndsAt) <= Date.now()) {
      throw new CandidateDomainError("INTERVIEW_SESSION_EXPIRED", "Interview session has expired.", 409, [
        { field: "sessionId", reason: "interview session expired" },
      ]);
    }
  }

  private assertInterviewNotCompleted(application: Application, session: InterviewSession): void {
    if (application.interviewStatus === "COMPLETED" || session.status === "COMPLETED") {
      throw new CandidateDomainError("COMMON_CONFLICT", "Interview has already been completed.", 409, [
        { field: "interviewStatus", reason: "interview already completed" },
      ]);
    }
  }

  private assertInterviewConsentRequest(dto: SaveInterviewConsentDto): ConsentRecord["consentType"][] {
    const requestBody = this.toRequestBody(dto, "consent");
    if (!Array.isArray(requestBody.consentTypes)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "Consent request is invalid.", 400, [
        { field: "consentTypes", reason: "consentTypes must be an array" },
      ]);
    }
    if (!requestBody.consentTypes.every((consentType) => this.isApplicationConsentType(consentType))) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "Consent request is invalid.", 400, [
        { field: "consentTypes", reason: "unsupported consent type" },
      ]);
    }
    for (const consentType of REQUIRED_INTERVIEW_CONSENTS) {
      if (!requestBody.consentTypes.includes(consentType)) {
        throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "Required interview consent is missing.", 400, [
          { field: "consentTypes", reason: `${consentType} is required` },
        ]);
      }
    }

    return requestBody.consentTypes as ConsentRecord["consentType"][];
  }

  private assertDeviceCheckRequest(dto: {
    cameraGranted: boolean;
    microphoneGranted: boolean;
    networkStable: boolean;
  }): void {
    const requestBody = this.toRequestBody(dto, "deviceCheck");
    for (const field of ["cameraGranted", "microphoneGranted", "networkStable"] as const) {
      if (typeof requestBody[field] !== "boolean") {
        throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "Device check request is invalid.", 400, [
          { field, reason: `${field} must be a boolean` },
        ]);
      }
      if (requestBody[field] !== true) {
        throw new CandidateDomainError("DEVICE_PERMISSION_DENIED", "Camera, microphone, and network checks are required.", 400, [
          { field, reason: `${field} must pass before interview start` },
        ]);
      }
    }
  }

  private async refreshReadyState(applicationId: number, sessionId: number): Promise<InterviewSession> {
    const application = await this.repository.findApplication(applicationId);
    const session = await this.repository.findInterviewSession(sessionId);
    if (!application || !session) {
      throw new CandidateDomainError("COMMON_NOT_FOUND", "Application or interview session was not found.", 404);
    }
    if (
      this.isStartedOrFinalInterviewStatus(application.interviewStatus) ||
      this.isStartedOrFinalInterviewStatus(session.status)
    ) {
      return session;
    }

    const consents = await this.repository.listConsentRecords(applicationId);
    if (!this.hasRequiredInterviewConsents(consents) || !this.isDeviceCheckPassed(session)) {
      return session;
    }

    if (application.interviewStatus !== "READY") {
      await this.repository.updateApplicationInterviewStatus(applicationId, "READY");
    }
    if (session.status !== "READY") {
      return this.repository.updateInterviewSessionStatus(sessionId, "READY");
    }
    return session;
  }

  private isStartedOrFinalInterviewStatus(status: Application["interviewStatus"] | InterviewSession["status"]): boolean {
    return status === "IN_PROGRESS" || status === "COMPLETED" || status === "FAILED";
  }

  private async toApplicationSummary(application: Application): Promise<CandidateApplicationSummary> {
    const job = await this.repository.findJob(application.postingId);
    const session = await this.repository.findInterviewSessionByApplication(application.applicationId);
    const consents = await this.repository.listConsentRecords(application.applicationId);
    if (!job || !session) {
      throw new CandidateDomainError("COMMON_NOT_FOUND", "Application summary dependency was not found.", 404);
    }

    const consentCompleted = this.hasRequiredInterviewConsents(consents);
    const deviceCheckCompleted = this.isDeviceCheckPassed(session);
    return {
      applicationId: application.applicationId,
      postingId: application.postingId,
      candidateId: application.candidateId,
      companyName: job.companyName,
      jobTitle: job.title,
      jobRole: job.jobRole,
      location: job.location,
      applicationStatus: application.applicationStatus,
      documentStatus: application.documentStatus,
      interviewStatus: application.interviewStatus,
      reportStatus: application.reportStatus,
      submittedAt: application.submittedAt,
      updatedAt: application.updatedAt,
      sessionId: session.sessionId,
      interviewType: session.interviewType,
      interviewSessionStatus: session.status,
      interviewWindowStartsAt: session.windowStartsAt,
      interviewWindowEndsAt: session.windowEndsAt,
      consentCompleted,
      deviceCheckCompleted,
      canStartInterview: consentCompleted && deviceCheckCompleted && session.status === "READY",
    };
  }

  private async toInterviewGuide(
    application: Application,
    session: InterviewSession,
  ): Promise<CandidateInterviewGuide> {
    const consents = await this.repository.listConsentRecords(application.applicationId);
    const consentCompleted = this.hasRequiredInterviewConsents(consents);
    const deviceCheckCompleted = this.isDeviceCheckPassed(session);
    return {
      applicationId: application.applicationId,
      sessionId: session.sessionId,
      interviewType: "RECRUITING",
      applicationInterviewStatus: application.interviewStatus,
      interviewSessionStatus: session.status,
      interviewWindowStartsAt: session.windowStartsAt,
      interviewWindowEndsAt: session.windowEndsAt,
      method: [
        "조용한 환경에서 카메라와 마이크를 켜고 응시합니다.",
        "채용 AI 면접 질문을 순서대로 확인하고 답변합니다.",
        "제출한 영상/음성 파일 메타데이터는 면접 세션에 연결됩니다.",
      ],
      requiredPreparations: [
        "개인정보, AI 분석, 녹화/녹음 안내 동의를 완료합니다.",
        "카메라, 마이크, 네트워크 점검을 모두 통과합니다.",
        "면접 제출이 끝날 때까지 브라우저를 닫지 않습니다.",
      ],
      requiredConsentTypes: [...REQUIRED_INTERVIEW_CONSENTS],
      consentCompleted,
      deviceCheckCompleted,
      canStart: consentCompleted && deviceCheckCompleted && ["READY", "IN_PROGRESS"].includes(session.status),
    };
  }

  private hasRequiredInterviewConsents(consents: ConsentRecord[]): boolean {
    return REQUIRED_INTERVIEW_CONSENTS.every((consentType) =>
      consents.some((consent) => consent.consentType === consentType && consent.agreed),
    );
  }

  private isDeviceCheckPassed(session: InterviewSession): boolean {
    return (
      session.deviceCheck.status === "PASSED" &&
      session.deviceCheck.cameraGranted &&
      session.deviceCheck.microphoneGranted &&
      session.deviceCheck.networkStable
    );
  }

  private async getApplyAvailableJob(jobId: number): Promise<CandidateJob> {
    this.assertPositiveIntegerId(jobId, "jobId");
    const job = await this.repository.findJob(jobId);
    if (!job || !this.isApplyAvailable(job)) {
      throw new CandidateDomainError("COMMON_NOT_FOUND", "지원 가능한 채용공고가 아닙니다.", 404);
    }
    return job;
  }

  private assertPositiveIntegerId(value: number, field: string): void {
    if (!Number.isInteger(value) || value < 1) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "경로 파라미터를 확인해주세요.", 400, [
        { field, reason: `${field} must be a positive integer` },
      ]);
    }
  }

  private isApplyAvailable(job: CandidateJob): boolean {
    return job.isPublic && (job.postingStatus === "OPEN" || job.postingStatus === "CLOSING_SOON");
  }

  private normalizeListQuery(query: CandidateJobListQueryDto): NormalizedCandidateJobListQuery {
    const requestBody = this.toRequestBody(query, "query");
    const page = this.toIntegerQueryValue(requestBody.page, 1);
    const limit = this.toIntegerQueryValue(requestBody.limit, 20);
    const sort = requestBody.sort ?? "createdAt";
    const order = requestBody.order ?? "desc";

    if (!this.isPositiveInteger(page)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "페이지 번호를 확인해주세요.", 400, [
        { field: "page", reason: "page must be a positive integer" },
      ]);
    }

    if (!this.isPositiveInteger(limit) || limit > 100) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "페이지 크기를 확인해주세요.", 400, [
        { field: "limit", reason: "limit must be a positive integer up to 100" },
      ]);
    }

    if (!this.isOptionalString(requestBody.q)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "검색어를 확인해주세요.", 400, [
        { field: "q", reason: "q must be a string" },
      ]);
    }

    if (!this.isOptionalString(requestBody.jobRole)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "직무 필터를 확인해주세요.", 400, [
        { field: "jobRole", reason: "jobRole must be a string" },
      ]);
    }

    if (!this.isOptionalString(requestBody.jobGroup)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "직군 필터를 확인해주세요.", 400, [
        { field: "jobGroup", reason: "jobGroup must be a string" },
      ]);
    }

    if (!this.isOptionalString(requestBody.location)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "지역 필터를 확인해주세요.", 400, [
        { field: "location", reason: "location must be a string" },
      ]);
    }

    if (!this.isOptionalString(requestBody.careerLevel)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "경력 필터를 확인해주세요.", 400, [
        { field: "careerLevel", reason: "careerLevel must be a string" },
      ]);
    }

    if (!this.isOptionalListPostingStatus(requestBody.postingStatus)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "채용 상태 필터를 확인해주세요.", 400, [
        { field: "postingStatus", reason: "postingStatus must be OPEN or CLOSING_SOON" },
      ]);
    }

    if (!this.isListSortField(sort)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "정렬 기준을 확인해주세요.", 400, [
        { field: "sort", reason: "sort must be createdAt, endsOn, or title" },
      ]);
    }

    if (!this.isSortOrder(order)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "정렬 방향을 확인해주세요.", 400, [
        { field: "order", reason: "order must be asc or desc" },
      ]);
    }

    const careerMinYears = this.toOptionalIntQueryValue(requestBody.careerMinYears);
    const careerMaxYears = this.toOptionalIntQueryValue(requestBody.careerMaxYears);
    if (careerMinYears !== undefined && careerMaxYears !== undefined && careerMinYears > careerMaxYears) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "경력 범위를 확인해주세요.", 400, [
        { field: "careerMinYears", reason: "careerMinYears must be less than or equal to careerMaxYears" },
      ]);
    }

    return {
      page,
      limit,
      q: this.toOptionalQueryString(requestBody.q),
      jobRole: this.toOptionalQueryString(requestBody.jobRole),
      jobRoles: this.toOptionalStringArray(requestBody.jobRoles),
      jobGroup: this.toOptionalQueryString(requestBody.jobGroup),
      location: this.toOptionalQueryString(requestBody.location),
      careerLevel: this.toOptionalQueryString(requestBody.careerLevel),
      careerMinYears,
      careerMaxYears,
      recruitmentType: this.toOptionalQueryString(requestBody.recruitmentType as string | null | undefined),
      postingStatus: requestBody.postingStatus ?? undefined,
      sort,
      order,
    };
  }

  private toOptionalStringArray(value: unknown): string[] | undefined {
    if (value === undefined) return undefined;
    const list = (Array.isArray(value) ? value : [value]).filter(
      (item): item is string => typeof item === "string" && item.trim() !== "",
    );
    return list.length ? list : undefined;
  }

  private toOptionalIntQueryValue(value: unknown): number | undefined {
    if (value === undefined || value === "" || value === null) return undefined;
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isInteger(parsed) ? parsed : undefined;
  }

  private matchesListQuery(job: CandidateJob, query: NormalizedCandidateJobListQuery): boolean {
    const q = query.q?.trim().toLowerCase();
    if (q) {
      const searchable = [
        job.title,
        job.companyName,
        job.companyIndustry,
        job.companyProfile,
        job.jobGroup,
        job.jobRole,
        job.jobDescription,
        ...job.techStacks,
      ]
        .join(" ")
        .toLowerCase();
      if (!searchable.includes(q)) {
        return false;
      }
    }

    return (
      this.matchesJobRoles(job, query) &&
      this.matchesOptional(job.jobRole, query.jobRole) &&
      this.matchesOptional(job.jobGroup, query.jobGroup) &&
      this.matchesRegion(job, query) &&
      this.matchesCareerRange(job, query) &&
      this.matchesOptional(job.recruitmentType ?? "", query.recruitmentType) &&
      (!query.postingStatus || job.postingStatus === query.postingStatus)
    );
  }

  // 직무 다중(any-of): 선택된 코드 중 하나라도 일치하면 통과. 공고에 코드가 없으면 제외.
  private matchesJobRoles(job: CandidateJob, query: NormalizedCandidateJobListQuery): boolean {
    if (!query.jobRoles || query.jobRoles.length === 0) return true;
    if (!job.jobRoleCode) return false;
    return query.jobRoles.includes(job.jobRoleCode);
  }

  private matchesRegion(job: CandidateJob, query: NormalizedCandidateJobListQuery): boolean {
    if (!query.location) return true;
    if (!job.regionCode) return false;
    return job.regionCode === query.location;
  }

  // 경력 range 겹침: [공고 min,max] 과 [필터 min,max] 이 겹치면 통과. 공고에 경력 정보가 없으면 제외.
  private matchesCareerRange(job: CandidateJob, query: NormalizedCandidateJobListQuery): boolean {
    if (query.careerMinYears === undefined && query.careerMaxYears === undefined) return true;
    if (job.careerMinYears === null && job.careerMaxYears === null) return false;
    const filterMin = query.careerMinYears ?? 0;
    const filterMax = query.careerMaxYears ?? Number.MAX_SAFE_INTEGER;
    const jobMin = job.careerMinYears ?? 0;
    const jobMax = job.careerMaxYears ?? Number.MAX_SAFE_INTEGER;
    return jobMin <= filterMax && jobMax >= filterMin;
  }

  private matchesOptional(value: string, queryValue?: string): boolean {
    return !queryValue || value.toLowerCase() === queryValue.toLowerCase();
  }

  private compareJobs(
    left: CandidateJob,
    right: CandidateJob,
    sort: CandidateListSortField,
    order: CandidateListSortOrder,
  ): number {
    const direction = order === "asc" ? 1 : -1;
    const leftValue = left[sort];
    const rightValue = right[sort];
    return leftValue.localeCompare(rightValue) * direction;
  }

  private assertRequiredApplicationFields(dto: SubmitApplicationDto): ValidatedSubmitApplication {
    const requestBody = this.toRequestBody(dto, "application");
    const candidateName = requestBody.candidateName;
    const email = requestBody.email;
    const phone = requestBody.phone;
    const githubUrl = requestBody.githubUrl;
    const blogUrl = requestBody.blogUrl;
    const resumeFileId = requestBody.resumeFileId;
    const portfolioFileId = requestBody.portfolioFileId;
    const portfolioUrl = requestBody.portfolioUrl;
    const motivation = requestBody.motivation;
    const additionalInfo = requestBody.additionalInfo;
    const consentTypes = requestBody.consentTypes;

    if (
      !this.isNonEmptyString(candidateName) ||
      !this.isNonEmptyString(email) ||
      !this.isNonEmptyString(phone)
    ) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "기본 정보를 확인해주세요.", 400, [
        { field: "basicInfo", reason: "candidateName, email, and phone are required" },
      ]);
    }

    const normalizedEmail = email.trim();
    if (!this.isEmail(normalizedEmail)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "기본 정보를 확인해주세요.", 400, [
        { field: "email", reason: "email must be a valid email address" },
      ]);
    }

    if (!this.isNonEmptyString(githubUrl) || !this.isNonEmptyString(blogUrl)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "GitHub와 블로그 URL을 확인해주세요.", 400, [
        { field: "links", reason: "githubUrl and blogUrl are required" },
      ]);
    }
    const normalizedGithubUrl = githubUrl.trim();
    const normalizedBlogUrl = blogUrl.trim();
    this.assertUrl(normalizedGithubUrl, "githubUrl");
    this.assertUrl(normalizedBlogUrl, "blogUrl");

    if (!this.isNonEmptyString(motivation) || !this.isNonEmptyString(additionalInfo)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "지원동기와 추가 설명을 입력해주세요.", 400, [
        { field: "applicationDetails", reason: "motivation and additionalInfo are required" },
      ]);
    }

    if (!this.isPositiveInteger(resumeFileId)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "이력서 파일을 확인해주세요.", 400, [
        { field: "resumeFileId", reason: "resumeFileId must be a positive integer" },
      ]);
    }

    if (
      portfolioFileId !== undefined &&
      portfolioFileId !== null &&
      !this.isPositiveInteger(portfolioFileId)
    ) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "포트폴리오 파일을 확인해주세요.", 400, [
        { field: "portfolioFileId", reason: "portfolioFileId must be a positive integer" },
      ]);
    }

    const normalizedPortfolioFileId = this.isPositiveInteger(portfolioFileId) ? portfolioFileId : undefined;

    if (
      portfolioUrl !== undefined &&
      portfolioUrl !== null &&
      typeof portfolioUrl !== "string"
    ) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "포트폴리오 URL을 확인해주세요.", 400, [
        { field: "portfolioUrl", reason: "portfolioUrl must be a string" },
      ]);
    }

    const normalizedPortfolioUrl = typeof portfolioUrl === "string" ? this.toOptionalQueryString(portfolioUrl) : undefined;

    if (!normalizedPortfolioFileId && !normalizedPortfolioUrl) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "포트폴리오를 확인해주세요.", 400, [
        { field: "portfolio", reason: "portfolioFileId or portfolioUrl is required" },
      ]);
    }

    if (!Array.isArray(consentTypes)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "필수 동의 항목을 확인해주세요.", 400, [
        { field: "consentTypes", reason: "consentTypes must be an array" },
      ]);
    }

    if (!consentTypes.every((consentType) => this.isApplicationConsentType(consentType))) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "필수 동의 항목을 확인해주세요.", 400, [
        { field: "consentTypes", reason: "consentTypes contains an unsupported consent type" },
      ]);
    }

    for (const consentType of REQUIRED_APPLICATION_CONSENTS) {
      if (!consentTypes.includes(consentType)) {
        throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "필수 동의 항목을 확인해주세요.", 400, [
          { field: "consentTypes", reason: `${consentType} is required` },
        ]);
      }
    }
    const validatedConsentTypes = consentTypes as ConsentRecord["consentType"][];
    return {
      candidateName: candidateName.trim(),
      email: normalizedEmail,
      phone: phone.trim(),
      githubUrl: normalizedGithubUrl,
      blogUrl: normalizedBlogUrl,
      resumeFileId,
      portfolioFileId: normalizedPortfolioFileId,
      portfolioUrl: normalizedPortfolioUrl,
      motivation: motivation.trim(),
      additionalInfo: additionalInfo.trim(),
      consentTypes: validatedConsentTypes,
    };
  }

  private isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
  }

  private isPositiveInteger(value: unknown): value is number {
    return Number.isInteger(value) && typeof value === "number" && value > 0;
  }

  private toIntegerQueryValue(value: unknown, defaultValue: number): unknown {
    if (value === undefined || value === null || value === "") {
      return defaultValue;
    }
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
      return Number(value);
    }
    return value;
  }

  private isOptionalString(value: unknown): value is string | undefined | null {
    return value === undefined || value === null || typeof value === "string";
  }

  private toOptionalQueryString(value: string | undefined | null): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  }

  private isOptionalListPostingStatus(value: unknown): value is CandidateListPostingStatus | undefined | null {
    return value === undefined || value === null || CANDIDATE_LIST_POSTING_STATUSES.includes(value as CandidateListPostingStatus);
  }

  private isApplicationConsentType(value: unknown): value is ConsentRecord["consentType"] {
    return APPLICATION_CONSENT_TYPES.includes(value as ConsentRecord["consentType"]);
  }

  private isEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private isListSortField(value: unknown): value is CandidateListSortField {
    return CANDIDATE_LIST_SORT_FIELDS.includes(value as CandidateListSortField);
  }

  private isSortOrder(value: unknown): value is CandidateListSortOrder {
    return SORT_ORDERS.includes(value as CandidateListSortOrder);
  }

  private toRequestBody(value: unknown, field: string): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "요청 본문을 확인해주세요.", 400, [
        { field, reason: `${field} must be an object` },
      ]);
    }

    return value as Record<string, unknown>;
  }

  private async getOwnedFolder(folderId: number, currentUser: CurrentCandidateUser): Promise<CandidateFolder> {
    this.assertPositiveIntegerId(folderId, "folderId");
    const folder = await this.repository.findFolder(folderId);
    if (!folder) {
      throw new CandidateDomainError("COMMON_NOT_FOUND", "지원서 세트를 찾을 수 없습니다.", 404, [
        { field: "folderId", reason: "candidate folder not found" },
      ]);
    }
    if (folder.candidateId !== currentUser.candidateId) {
      throw new CandidateDomainError("COMMON_FORBIDDEN", "지원서 세트 접근 권한이 없습니다.", 403, [
        { field: "folderId", reason: "candidate owner mismatch" },
      ]);
    }
    return folder;
  }

  private async normalizeCandidateFolderMutation(
    dto: CreateCandidateFolderDto | UpdateCandidateFolderDto,
    currentUser: CurrentCandidateUser,
    requireName: boolean,
  ): Promise<Partial<CandidateFolderMutableInput>> {
    const requestBody = this.toRequestBody(dto, "folder");
    const input: Partial<CandidateFolderMutableInput> = {};

    if (requireName || Object.hasOwn(requestBody, "name")) {
      input.name = this.normalizeFolderName(requestBody.name);
    }

    for (const field of ["githubUrl", "blogUrl", "portfolioUrl"] as const) {
      if (!Object.hasOwn(requestBody, field)) continue;
      const value = this.normalizeNullableString(requestBody[field], field, 500);
      if (value) {
        this.assertUrl(value, field);
      }
      input[field] = value;
    }

    if (Object.hasOwn(requestBody, "motivation")) {
      input.motivation = this.normalizeNullableString(requestBody.motivation, "motivation", 3_000);
    }
    if (Object.hasOwn(requestBody, "extraNote")) {
      input.extraNote = this.normalizeNullableString(requestBody.extraNote, "extraNote", 5_000);
    }

    if (Object.hasOwn(requestBody, "resumeFileId")) {
      input.resumeFileId = await this.normalizeFolderResumeFileId(requestBody.resumeFileId, currentUser);
    }

    return input;
  }

  private normalizeFolderName(value: unknown): string {
    if (!this.isNonEmptyString(value)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "지원서 세트 이름을 확인해주세요.", 400, [
        { field: "name", reason: "name is required" },
      ]);
    }
    const name = value.trim();
    if (name.length > 100) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "지원서 세트 이름을 확인해주세요.", 400, [
        { field: "name", reason: "name must be 100 characters or fewer" },
      ]);
    }
    return name;
  }

  private limitMockFolderContext(context: CandidateFolderContext): CandidateFolderContext {
    const limited = { ...context };
    let overflow = this.mockFolderContextChars(limited) - MAX_MOCK_FOLDER_CONTEXT_CHARS;
    for (const field of ["resumeExtractedText", "extraNote", "motivation"] as const) {
      if (overflow <= 0) break;
      const value = limited[field];
      if (!value) continue;
      const keepLength = Math.max(0, value.length - overflow);
      limited[field] = keepLength > 0 ? value.slice(0, keepLength) : null;
      overflow = this.mockFolderContextChars(limited) - MAX_MOCK_FOLDER_CONTEXT_CHARS;
    }
    return limited;
  }

  private mockFolderContextChars(context: CandidateFolderContext): number {
    return [
      context.name,
      context.githubUrl,
      context.blogUrl,
      context.portfolioUrl,
      context.motivation,
      context.extraNote,
      context.resumeExtractedText,
      context.resumeFile?.originalName,
      context.resumeFile?.mimeType,
    ].reduce((total, value) => total + (value?.length ?? 0), 0);
  }

  private normalizeNullableString(value: unknown, field: string, maxLength?: number): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value !== "string") {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "입력값을 확인해주세요.", 400, [
        { field, reason: `${field} must be a string or null` },
      ]);
    }
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }
    if (maxLength !== undefined && normalized.length > maxLength) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "입력값을 확인해주세요.", 400, [
        { field, reason: `${field} must be ${maxLength} characters or fewer` },
      ]);
    }
    return normalized;
  }

  private async normalizeFolderResumeFileId(
    value: unknown,
    currentUser: CurrentCandidateUser,
  ): Promise<number | null> {
    if (value === undefined || value === null) {
      return null;
    }
    if (!this.isPositiveInteger(value)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "이력서 파일을 확인해주세요.", 400, [
        { field: "resumeFileId", reason: "resumeFileId must be a positive integer or null" },
      ]);
    }
    const fileAsset = await this.assertFileAssetForCurrentUser(value, currentUser.userId, "resumeFileId");
    this.assertDocumentFile(fileAsset.mimeType, fileAsset.sizeBytes);
    this.assertObjectStorageKey(fileAsset.storageKey, currentUser.candidateId);
    return value;
  }

  private assertUploadResumeRequest(dto: UploadResumeDto): void {
    const requestBody = this.toRequestBody(dto, "resume");

    if (!this.isNonEmptyString(requestBody.storageKey)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "Object storage key is invalid.", 400, [
        { field: "storageKey", reason: "storageKey is required" },
      ]);
    }

    if (!this.isNonEmptyString(requestBody.originalName)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "원본 파일명을 확인해주세요.", 400, [
        { field: "originalName", reason: "originalName is required" },
      ]);
    }

    if (!this.isPositiveInteger(requestBody.sizeBytes)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "파일 용량을 확인해주세요.", 400, [
        { field: "sizeBytes", reason: "sizeBytes must be a positive integer" },
      ]);
    }
  }

  private assertRuntimeFileAssetRequest(dto: {
    storageKey: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  }): void {
    const requestBody = this.toRequestBody(dto, "fileAsset");

    if (!this.isNonEmptyString(requestBody.storageKey)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "Object storage key is invalid.", 400, [
        { field: "storageKey", reason: "storageKey is required" },
      ]);
    }
    if (!this.isNonEmptyString(requestBody.originalName)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "Original file name is invalid.", 400, [
        { field: "originalName", reason: "originalName is required" },
      ]);
    }
    if (!this.isNonEmptyString(requestBody.mimeType)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "MIME type is invalid.", 400, [
        { field: "mimeType", reason: "mimeType is required" },
      ]);
    }
    if (!this.isPositiveInteger(requestBody.sizeBytes)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "File size is invalid.", 400, [
        { field: "sizeBytes", reason: "sizeBytes must be a positive integer" },
      ]);
    }
  }

  private assertRuntimeFileAssetMetadataOnly(dto: unknown): void {
    const requestBody = this.toRequestBody(dto, "fileAsset");
    const forbiddenField = FORBIDDEN_FILE_PAYLOAD_FIELDS.find((field) => Object.hasOwn(requestBody, field));

    if (forbiddenField) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "file_assets only stores metadata.", 400, [
        { field: forbiddenField, reason: "raw file payload must be uploaded to object storage first" },
      ]);
    }
  }

  private assertPortfolioLinkRequest(dto: CreatePortfolioLinkDto): void {
    const requestBody = this.toRequestBody(dto, "portfolioLink");

    if (!this.isNonEmptyString(requestBody.url)) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "포트폴리오 URL을 확인해주세요.", 400, [
        { field: "url", reason: "url is required" },
      ]);
    }

    if (
      requestBody.linkType !== undefined &&
      requestBody.linkType !== null &&
      requestBody.linkType !== "PORTFOLIO" &&
      requestBody.linkType !== "GITHUB"
    ) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "포트폴리오 링크 유형을 확인해주세요.", 400, [
        { field: "linkType", reason: "linkType must be PORTFOLIO or GITHUB" },
      ]);
    }

    if (
      requestBody.fileId !== undefined &&
      requestBody.fileId !== null &&
      !this.isPositiveInteger(requestBody.fileId)
    ) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "포트폴리오 파일을 확인해주세요.", 400, [
        { field: "fileId", reason: "fileId must be a positive integer" },
      ]);
    }

    if (
      requestBody.description !== undefined &&
      requestBody.description !== null &&
      typeof requestBody.description !== "string"
    ) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "포트폴리오 설명을 확인해주세요.", 400, [
        { field: "description", reason: "description must be a string" },
      ]);
    }
  }

  private assertDocumentFile(mimeType: string, sizeBytes: number): void {
    if (!this.allowedDocumentMimeTypes().includes(mimeType)) {
      throw new CandidateDomainError("FILE_INVALID_TYPE", "지원하지 않는 파일 형식입니다.", 400);
    }

    if (!Number.isInteger(sizeBytes) || sizeBytes < 1) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "File size is invalid.", 400, [
        { field: "sizeBytes", reason: "sizeBytes must be a positive integer" },
      ]);
    }

    if (sizeBytes > MAX_DOCUMENT_SIZE_BYTES) {
      throw new CandidateDomainError("FILE_SIZE_EXCEEDED", "파일 용량이 허용 범위를 초과했습니다.", 400);
    }
  }

  private assertApplicationPdf(mimeType: string, sizeBytes: number, field: string): void {
    this.assertDocumentFile(mimeType, sizeBytes);
    if (mimeType !== "application/pdf") {
      throw new CandidateDomainError("FILE_INVALID_TYPE", "지원서에는 PDF 파일만 제출할 수 있습니다.", 400, [
        { field, reason: "application/pdf is required" },
      ]);
    }
  }

  private assertInterviewMediaFile(mimeType: string, sizeBytes: number): void {
    if (!this.allowedInterviewMediaMimeTypes().includes(mimeType)) {
      throw new CandidateDomainError("FILE_INVALID_TYPE", "Unsupported interview media file type.", 400, [
        { field: "mimeType", reason: "mimeType must be an allowed audio or video type" },
      ]);
    }

    if (!Number.isInteger(sizeBytes) || sizeBytes < 1) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "File size is invalid.", 400, [
        { field: "sizeBytes", reason: "sizeBytes must be a positive integer" },
      ]);
    }

    if (sizeBytes > MAX_INTERVIEW_MEDIA_SIZE_BYTES) {
      throw new CandidateDomainError("FILE_SIZE_EXCEEDED", "Interview media file is too large.", 400, [
        { field: "sizeBytes", reason: "interview media file must be 500MB or smaller" },
      ]);
    }
  }

  private allowedDocumentMimeTypes(): string[] {
    return [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
  }

  private allowedInterviewMediaMimeTypes(): string[] {
    return ["video/webm", "video/mp4", "audio/webm", "audio/mp4", "audio/mpeg", "audio/wav"];
  }

  private assertFileAssetMetadataOnly(dto: UploadResumeDto): void {
    const requestBody = this.toRequestBody(dto, "resume");
    const forbiddenField = FORBIDDEN_FILE_PAYLOAD_FIELDS.find((field) => Object.hasOwn(requestBody, field));

    if (forbiddenField) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "file_assets only stores metadata.", 400, [
        { field: forbiddenField, reason: "raw file payload must be uploaded to object storage first" },
      ]);
    }
  }

  private assertMetadataOnlyUploadAllowed(): void {
    if (process.env.NODE_ENV !== "production") {
      return;
    }

    throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "Production resume upload must use multipart file upload.", 400, [
      { field: "file", reason: "multipart file is required in production" },
    ]);
  }

  private buildCandidateDocumentStorageKey(candidateId: number, originalName: string): string {
    const safeName =
      originalName
        .replace(/\\/g, "/")
        .split("/")
        .pop()
        ?.replace(/[^a-zA-Z0-9._-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || "resume";
    return `candidate/${candidateId}/documents/${Date.now()}-${safeName}`;
  }

  private assertObjectStorageKey(storageKey: string, candidateId: number): void {
    const expectedPrefix = `candidate/${candidateId}/`;
    if (
      !storageKey.startsWith(expectedPrefix) ||
      storageKey.includes("..") ||
      storageKey.startsWith("/") ||
      storageKey.includes("://") ||
      storageKey.length <= expectedPrefix.length
    ) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "Object storage key is invalid.", 400, [
        { field: "storageKey", reason: `storageKey must be an object key under ${expectedPrefix}` },
      ]);
    }
  }

  private async assertFileAssetForCurrentUser(fileId: number, ownerUserId: number, field: string): Promise<FileAsset> {
    const fileAsset = await this.repository.findFileAsset(fileId);
    if (!fileAsset) {
      throw new CandidateDomainError("COMMON_NOT_FOUND", "업로드 파일 정보를 찾을 수 없습니다.", 404, [
        { field, reason: "file asset not found" },
      ]);
    }

    if (fileAsset.ownerUserId !== ownerUserId) {
      throw new CandidateDomainError("COMMON_FORBIDDEN", "파일 접근 권한이 없습니다.", 403, [
        { field, reason: "file owner mismatch" },
      ]);
    }

    return fileAsset;
  }

  private assertUrl(url: string, field: string): void {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("invalid protocol");
      }
    } catch {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "URL을 확인해주세요.", 400, [
        { field, reason: "url must be http or https" },
      ]);
    }
  }

  private inferPortfolioLinkType(url: string): PortfolioLinkType {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return hostname === "github.com" || hostname.endsWith(".github.com") ? "GITHUB" : "PORTFOLIO";
    } catch {
      return "PORTFOLIO";
    }
  }

  private assertPortfolioLinkType(url: string, linkType: PortfolioLinkType): void {
    if (linkType !== "GITHUB") {
      return;
    }

    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname !== "github.com" && !hostname.endsWith(".github.com")) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "GitHub link must use github.com.", 400, [
        { field: "url", reason: "github link must use github.com host" },
      ]);
    }
  }

  private async toJobSummary(job: CandidateJob, currentUser?: CurrentCandidateUser): Promise<CandidateJobSummary> {
    const alreadyApplied = currentUser
      ? await this.repository.hasApplication(currentUser.candidateId, job.jobId)
      : false;

    return {
      jobId: job.jobId,
      companyName: job.companyName,
      companyLogoUrl: job.companyLogoUrl,
      title: job.title,
      jobGroup: job.jobGroup,
      jobRole: job.jobRole,
      location: job.location,
      careerLevel: job.careerLevel,
      employmentType: job.employmentType,
      tags: job.techStacks,
      postingStatus: job.postingStatus,
      startsOn: job.startsOn,
      endsOn: job.endsOn,
      canApply: !alreadyApplied,
      alreadyApplied,
    };
  }

  private createPageMeta(page: number, limit: number, totalItems: number): PageMeta {
    const totalPages = Math.ceil(totalItems / limit);
    return {
      page,
      limit,
      totalItems,
      totalPages,
      hasNext: page < totalPages,
    };
  }

  private envelope<T>(data: T): ApiResponse<T> {
    return {
      data,
      meta: {
        traceId: "local-candidate-module",
        timestamp: new Date().toISOString(),
      },
    };
  }

  private listEnvelope<T>(items: T[], page: PageMeta): ApiListResponse<T> {
    return {
      data: { items },
      meta: {
        traceId: "local-candidate-module",
        timestamp: new Date().toISOString(),
        page,
      },
    };
  }
}

function normalizeUploadedFileName(originalName: string) {
  const trimmed = originalName.trim();
  if (!trimmed) return trimmed;

  const decoded = decodeLatin1MojibakeFileName(trimmed).trim();
  return (decoded || trimmed).normalize("NFC");
}

function decodeLatin1MojibakeFileName(fileName: string) {
  if (!/[\u0080-\u00ff]/.test(fileName)) {
    return fileName;
  }

  const decoded = Buffer.from(fileName, "latin1").toString("utf8");
  return decoded.includes("\uFFFD") ? fileName : decoded;
}
