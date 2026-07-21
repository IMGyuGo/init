import { Injectable } from "@nestjs/common";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { Readable } from "stream";
import { ERROR_CODES, type CurrentUser, type ErrorCode } from "@init/common";
import { DocumentStatus, DocumentType, PostingStatus, ScreeningDecision, UserType } from "@prisma/client";

import { ApiException as SharedApiException } from "../../../shared/api-exception";
import {
  InMemoryPublicApplicationAuthAdapter,
  type PublicApplicationAuthAdapterPort,
} from "./public-application-auth.adapter";
import {
  DeferredPublicInterviewEntryAdapter,
  type PublicInterviewEntryAdapterPort,
} from "./public-interview-entry.adapter";
import type { CreateRecruitmentDto } from "../dto/create-recruitment.dto";
import type { ListApplicantsQueryDto, ListQueryDto } from "../dto/list-query.dto";
import type { RequestPublicApplicationAccessLinkDto } from "../dto/request-public-application-access-link.dto";
import type { SubmitPublicApplicationDto } from "../dto/submit-public-application.dto";
import type { SendRecruitmentPassMailsDto } from "../dto/send-recruitment-pass-mails.dto";
import type { UpdateRecruitmentDto } from "../dto/update-recruitment.dto";
import type { UpdateScreeningStatusDto } from "../dto/update-screening-status.dto";
import type { UpdateScreeningReviewDto } from "../dto/update-screening-review.dto";
import type { ConfirmScreeningResultsDto } from "../dto/confirm-screening-results.dto";
import type { CompanyRecruitingRepositoryPort } from "../repository/company-recruiting.repository";
import type { InterviewPublicationReadiness } from "../../company-interview/company-interview.types";
import type { MailMessage } from "../../mail/mail.types";
import type {
  ApplicantRecord,
  ApplicationStatusValue,
  CompanyFileAssetRecord,
  DocumentStatusValue,
  InterviewStatusValue,
  JobDescriptionImageUploadFile,
  JobDescriptionImageUploadResponse,
  NormalizedApplicantListQuery,
  NormalizedListQuery,
  PassMailResultRecord,
  PublicApplicationDocumentUploadFile,
  PublicRecruitmentRecord,
  RecruitmentRecord,
  ReportStatusValue,
  ScreeningDecisionValue,
} from "../company-recruiting.types";

class CompanyRecruitingException extends SharedApiException {
  constructor(status: number, code: ErrorCode, message: string, details: Array<Record<string, unknown>> = []) {
    super(code, message, status, details);
  }
}

export type CompanyRecruitingStoragePutObjectInput = {
  key: string;
  body: Buffer;
  contentType: string;
  contentLength: number;
};

export type CompanyRecruitingStorageObject = {
  body: Buffer | Readable;
  contentType?: string;
  contentLength?: number;
  contentRange?: string;
};

export type CompanyRecruitingStorageAdapterPort = {
  putObject(input: CompanyRecruitingStoragePutObjectInput): Promise<void>;
  getObject?(key: string, options?: { range?: string }): Promise<CompanyRecruitingStorageObject>;
};

export type CompanyRecruitingMailAdapterPort = {
  send(message: MailMessage): Promise<unknown>;
};

export type CompanyRecruitingUploadConfig = {
  jdImagePublicBaseUrl?: string;
  jdImageMaxUploadBytes?: number;
  publicApplicationDocumentMaxUploadBytes?: number;
};

const ALLOWED_JD_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const DEFAULT_JD_IMAGE_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_PUBLIC_APPLICATION_DOCUMENT_MIME_TYPES = new Set(["application/pdf"]);
const DEFAULT_PUBLIC_APPLICATION_DOCUMENT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const APPLICANT_MEDIA_COOKIE_NAME = "companyMediaAccess";
const APPLICANT_MEDIA_COOKIE_MAX_AGE_SECONDS = 15 * 60;

type PublicApplicationDocumentUploadFiles = {
  resumeFile?: PublicApplicationDocumentUploadFile;
  portfolioFile?: PublicApplicationDocumentUploadFile;
};

type ApplicantMediaTokenPayload = {
  applicantId: number;
  companyId: number;
  expiresAt: number;
  fileId: number;
  userId: number;
};

class MissingCompanyRecruitingStorageAdapter implements CompanyRecruitingStorageAdapterPort {
  async putObject(): Promise<void> {
    throw new CompanyRecruitingException(500, ERROR_CODES.COMMON_VALIDATION_FAILED, "파일 저장소 설정이 필요합니다.");
  }

  async getObject(): Promise<CompanyRecruitingStorageObject> {
    throw new CompanyRecruitingException(500, ERROR_CODES.COMMON_VALIDATION_FAILED, "파일 저장소 설정이 필요합니다.");
  }
}

@Injectable()
export class CompanyRecruitingService {
  constructor(
    private readonly repository: CompanyRecruitingRepositoryPort,
    private readonly storageAdapter: CompanyRecruitingStorageAdapterPort = new MissingCompanyRecruitingStorageAdapter(),
    private readonly uploadConfig: CompanyRecruitingUploadConfig = {},
    private readonly publicApplicationAuthAdapter: PublicApplicationAuthAdapterPort = new InMemoryPublicApplicationAuthAdapter(),
    private readonly publicInterviewEntryAdapter: PublicInterviewEntryAdapterPort = new DeferredPublicInterviewEntryAdapter(),
    private readonly interviewPublicationReadiness?: {
      getPublicationReadiness(
        currentUser: CurrentUser,
        postingId: number,
      ): Promise<InterviewPublicationReadiness>;
    },
    private readonly mailAdapter?: CompanyRecruitingMailAdapterPort,
  ) {}

  async createRecruitment(user: CurrentUser, dto: CreateRecruitmentDto) {
    const companyId = requireCompanyId(user);
    if (dto.status === "OPEN") {
      throw new CompanyRecruitingException(400, ERROR_CODES.COMMON_VALIDATION_FAILED, "새 공고는 면접 설정 완료 후 공개할 수 있습니다.", [
        { field: "status", reason: "INITIAL_OPEN_NOT_ALLOWED" },
      ]);
    }
    const startsOn = parseOptionalDate(dto.startsOn, "startsOn");
    const endsOn = parseOptionalDate(dto.endsOn, "endsOn");
    if (startsOn && endsOn && startsOn > endsOn) {
      throw new CompanyRecruitingException(400, ERROR_CODES.COMMON_VALIDATION_FAILED, "채용 시작일은 마감일보다 늦을 수 없습니다.", [
        { field: "startsOn", reason: "AFTER_ENDS_ON" },
      ]);
    }
    this.assertCareerRange(dto.careerMinYears, dto.careerMaxYears);
    this.assertWorkplaceLocation(dto.workplaceAddress, dto.workplaceLat, dto.workplaceLng);

    const posting = await this.repository.createPosting({
      companyId,
      title: dto.title.trim(),
      jobRole: dto.jobRole.trim(),
      jobDescription: dto.jobDescription?.trim() || null,
      ...buildPostingExtraInfoInput(dto),
      startsOn,
      endsOn,
      status: PostingStatus.DRAFT,
    });
    return toRecruitmentResponse(posting);
  }

  // 경력 최소/최대가 둘 다 있을 때 최소 <= 최대를 보장한다.
  private assertCareerRange(minYears?: number | null, maxYears?: number | null) {
    if (minYears != null && maxYears != null && minYears > maxYears) {
      throw new CompanyRecruitingException(400, ERROR_CODES.COMMON_VALIDATION_FAILED, "경력 최소 연차는 최대 연차보다 클 수 없습니다.", [
        { field: "careerMinYears", reason: "GREATER_THAN_MAX" },
      ]);
    }
  }

  // 회사 위치 검증: 위도/경도는 함께여야 하고, 좌표가 있으면 주소가 필요하다.
  // (주소만 있는 것은 허용 — 지도 키 미설정 시 좌표 없이 주소만 저장하는 정상 흐름)
  private assertWorkplaceLocation(address?: string, lat?: number | null, lng?: number | null) {
    const hasLat = lat != null;
    const hasLng = lng != null;
    if (hasLat !== hasLng) {
      throw new CompanyRecruitingException(400, ERROR_CODES.COMMON_VALIDATION_FAILED, "위도와 경도는 함께 입력해야 합니다.", [
        { field: "workplaceLat", reason: "COORDINATE_PAIR_REQUIRED" },
      ]);
    }
    if ((hasLat || hasLng) && !address?.trim()) {
      throw new CompanyRecruitingException(400, ERROR_CODES.COMMON_VALIDATION_FAILED, "좌표를 저장하려면 주소가 필요합니다.", [
        { field: "workplaceAddress", reason: "REQUIRED_WITH_COORDINATES" },
      ]);
    }
  }

  async uploadJobDescriptionImage(
    user: CurrentUser,
    file: JobDescriptionImageUploadFile | undefined,
  ): Promise<JobDescriptionImageUploadResponse> {
    const companyId = requireCompanyId(user);
    this.assertJobDescriptionImageFile(file);

    const originalName = normalizeUploadedFileName(file.originalName);
    const storageKey = buildJobDescriptionImageStorageKey(companyId, originalName);
    await this.storageAdapter.putObject({
      key: storageKey,
      body: file.buffer,
      contentType: file.mimeType,
      contentLength: file.sizeBytes,
    });
    const fileAsset = await this.repository.createFileAsset({
      ownerUserId: user.userId,
      storageKey,
      originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    });

    return {
      ...fileAsset,
      url: buildPublicFileUrl(storageKey, this.uploadConfig.jdImagePublicBaseUrl),
    };
  }

  async updateRecruitment(user: CurrentUser, recruitmentId: number, dto: UpdateRecruitmentDto) {
    const companyId = requireCompanyId(user);
    const posting = await this.repository.findPostingForCompany(recruitmentId, companyId);
    if (!posting) {
      throw new CompanyRecruitingException(404, ERROR_CODES.COMMON_NOT_FOUND, "공고를 찾을 수 없습니다.");
    }

    const startsOn = parseOptionalDate(dto.startsOn, "startsOn");
    const endsOn = parseOptionalDate(dto.endsOn, "endsOn");
    if (startsOn && endsOn && startsOn > endsOn) {
      throw new CompanyRecruitingException(400, ERROR_CODES.COMMON_VALIDATION_FAILED, "채용 시작일은 마감일보다 늦을 수 없습니다.", [
        { field: "startsOn", reason: "AFTER_ENDS_ON" },
      ]);
    }
    // 부분 수정 시 한쪽 값만 오면 기존 공고 값과 조합한 effective range 로 검증한다.
    this.assertCareerRange(
      dto.careerMinYears ?? posting.careerMinYears,
      dto.careerMaxYears ?? posting.careerMaxYears,
    );
    this.assertWorkplaceLocation(
      dto.workplaceAddress ?? posting.workplaceAddress ?? undefined,
      dto.workplaceLat ?? posting.workplaceLat,
      dto.workplaceLng ?? posting.workplaceLng,
    );

    const nextStatus = dto.status
      ? parseEditablePostingStatus(dto.status)
      : (posting.status as PostingStatus);
    if (
      nextStatus === PostingStatus.OPEN &&
      posting.status !== PostingStatus.DRAFT &&
      posting.status !== PostingStatus.OPEN
    ) {
      throw new CompanyRecruitingException(400, ERROR_CODES.COMMON_VALIDATION_FAILED, "임시저장 공고만 공개할 수 있습니다.", [
        { field: "status", reason: "INVALID_OPEN_TRANSITION" },
      ]);
    }
    if (posting.status !== PostingStatus.OPEN && nextStatus === PostingStatus.OPEN) {
      await this.assertInterviewSettingsReadyToPublish(user, recruitmentId);
    }

    const updated = await this.repository.updatePosting(recruitmentId, companyId, {
      title: dto.title.trim(),
      jobRole: dto.jobRole.trim(),
      jobDescription: dto.jobDescription?.trim() || null,
      ...buildPostingExtraInfoInput(dto),
      startsOn,
      endsOn,
      status: nextStatus,
    });

    if (!updated) {
      throw new CompanyRecruitingException(404, ERROR_CODES.COMMON_NOT_FOUND, "공고를 찾을 수 없습니다.");
    }
    return toRecruitmentResponse(updated);
  }

  private async assertInterviewSettingsReadyToPublish(
    user: CurrentUser,
    recruitmentId: number,
  ): Promise<void> {
    if (!this.interviewPublicationReadiness) {
      throw new Error("Interview publication readiness dependency is not configured.");
    }
    const readiness = await this.interviewPublicationReadiness.getPublicationReadiness(
      user,
      recruitmentId,
    );
    if (readiness.canPublish) {
      return;
    }

    const missingSettings = readiness.reasons
      .map((reason) => publicationReadinessReasonLabel(reason))
      .join(", ");
    throw new CompanyRecruitingException(
      409,
      ERROR_CODES.COMMON_CONFLICT,
      `면접 설정이 완료되지 않아 공고를 공개할 수 없습니다: ${missingSettings}`,
      readiness.reasons.map((reason) => ({ field: "interviewSettings", reason })),
    );
  }

  async listRecruitments(user: CurrentUser, query: ListQueryDto) {
    const companyId = requireCompanyId(user);
    const normalized = normalizeListQuery(query, "createdAt");
    const [items, totalItems] = await Promise.all([
      this.repository.listPostings(companyId, normalized),
      this.repository.countPostings(companyId, normalized),
    ]);
    return {
      items: items.map(toRecruitmentResponse),
      page: buildPageMeta(normalized.page, normalized.limit, totalItems),
    };
  }

  async getRecruitment(user: CurrentUser, recruitmentId: number) {
    const companyId = requireCompanyId(user);
    const posting = await this.repository.findPostingForCompany(recruitmentId, companyId);
    if (!posting) {
      throw new CompanyRecruitingException(404, ERROR_CODES.COMMON_NOT_FOUND, "공고를 찾을 수 없습니다.");
    }
    return toRecruitmentResponse(posting);
  }

  async getPublicRecruitment(recruitmentId: number) {
    const posting = await this.repository.findOpenPostingForPublic(recruitmentId);
    if (!posting) {
      throw new CompanyRecruitingException(404, ERROR_CODES.COMMON_NOT_FOUND, "공개 지원 가능한 공고를 찾을 수 없습니다.");
    }
    return toPublicRecruitmentResponse(posting);
  }

  async submitPublicApplication(
    recruitmentId: number,
    dto: SubmitPublicApplicationDto,
    files: PublicApplicationDocumentUploadFiles = {},
  ) {
    const posting = await this.repository.findOpenPostingForPublic(recruitmentId);
    if (!posting) {
      throw new CompanyRecruitingException(404, ERROR_CODES.COMMON_NOT_FOUND, "공개 지원 가능한 공고를 찾을 수 없습니다.");
    }
    if (!dto.consentAgreed) {
      throw new CompanyRecruitingException(400, ERROR_CODES.COMMON_VALIDATION_FAILED, "개인정보 수집 및 채용 절차 이용 동의가 필요합니다.", [
        { field: "consentAgreed", reason: "REQUIRED" },
      ]);
    }

    validateApplicantName(dto.name);
    validateRequiredString(dto.phone, "phone", "연락처를 입력해주세요.");
    const githubUrl = validateRequiredUrl(dto.githubUrl, "githubUrl", "GitHub URL을 입력해주세요.");
    const blogUrl = validateRequiredUrl(dto.blogUrl, "blogUrl", "블로그 URL을 입력해주세요.");
    const portfolioUrl = normalizeOptionalString(dto.portfolioUrl);
    if (portfolioUrl) {
      validateHttpUrl(portfolioUrl, "portfolioUrl", "포트폴리오 URL을 확인해주세요.");
    }
    validateRequiredString(dto.motivation, "motivation", "지원동기를 입력해주세요.");
    validateRequiredString(dto.additionalInfo, "additionalInfo", "추가 설명을 입력해주세요.");
    const motivation = normalizeOptionalString(dto.motivation);
    const additionalInfo = normalizeOptionalString(dto.additionalInfo);
    const email = normalizeEmail(dto.email);
    if (!isValidEmail(email)) {
      throw new CompanyRecruitingException(400, ERROR_CODES.COMMON_VALIDATION_FAILED, "이메일 형식이 올바르지 않습니다.", [
        { field: "email", reason: "INVALID_EMAIL" },
      ]);
    }

    const duplicate = await this.repository.findApplicationByPostingAndEmail(recruitmentId, email);
    if (duplicate) {
      throw new CompanyRecruitingException(409, ERROR_CODES.COMMON_CONFLICT, "이미 이 공고에 지원한 이메일입니다.", [
        { field: "email", reason: "DUPLICATED_IN_RECRUITMENT" },
      ]);
    }
    await this.assertPublicApplicationEmailCanBeUsed(email);
    this.assertPublicApplicationDocumentFile(files.resumeFile, "resumeFile", "이력서 PDF 파일을 업로드해주세요.");
    if (files.portfolioFile) {
      this.assertPublicApplicationDocumentFile(files.portfolioFile, "portfolioFile", "포트폴리오 PDF 파일을 확인해주세요.");
    }
    if (!portfolioUrl && !files.portfolioFile) {
      throw new CompanyRecruitingException(400, ERROR_CODES.COMMON_VALIDATION_FAILED, "포트폴리오 URL 또는 PDF 파일을 제출해주세요.", [
        { field: "portfolio", reason: "URL_OR_FILE_REQUIRED" },
      ]);
    }

    try {
      const candidate = await this.repository.findOrCreatePublicCandidate({
        name: dto.name.trim(),
        email,
        phone: normalizeNullableString(dto.phone),
        githubUrl,
        portfolioUrl: portfolioUrl || null,
        summary: buildPublicApplicationSummary(dto),
      });
      const uploadedDocuments = [
        await this.uploadPublicApplicationDocumentFile(
          recruitmentId,
          candidate.candidateId,
          candidate.userId,
          DocumentType.RESUME,
          files.resumeFile,
        ),
      ];
      if (files.portfolioFile) {
        uploadedDocuments.push(
          await this.uploadPublicApplicationDocumentFile(
            recruitmentId,
            candidate.candidateId,
            candidate.userId,
            DocumentType.PORTFOLIO,
            files.portfolioFile,
          ),
        );
      }
      const application = await this.repository.createApplication({
        postingId: recruitmentId,
        candidateId: candidate.candidateId,
        applicantName: dto.name.trim(),
        applicantEmail: email,
        applicantPhone: dto.phone.trim(),
        githubUrl,
        blogUrl,
        portfolioUrl: portfolioUrl || null,
        motivation,
        additionalInfo,
        screeningMemo: null,
        documentStatus: DocumentStatus.SUBMITTED,
      });
      await Promise.all(
        uploadedDocuments.map((document) =>
          this.repository.createApplicationDocument({
            applicationId: application.applicationId,
            fileId: document.fileId,
            documentType: document.documentType,
          }),
        ),
      );
      const verification = await this.publicApplicationAuthAdapter.requestEmailVerification({
        applicationId: application.applicationId,
        recruitmentId: application.postingId,
        email,
      });

      return {
        applicationId: application.applicationId,
        recruitmentId: application.postingId,
        email,
        applicationStatus: application.applicationStatus,
        ...verification,
      };
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        throw duplicatePublicApplicationEmailException();
      }
      throw error;
    }
  }

  async requestPublicApplicationAccessLink(recruitmentId: number, dto: RequestPublicApplicationAccessLinkDto) {
    const posting = await this.repository.findOpenPostingForPublic(recruitmentId);
    if (!posting) {
      throw new CompanyRecruitingException(404, ERROR_CODES.COMMON_NOT_FOUND, "공개 지원 가능한 공고를 찾을 수 없습니다.");
    }

    const email = normalizeEmail(dto.email);
    if (!isValidEmail(email)) {
      throw new CompanyRecruitingException(400, ERROR_CODES.COMMON_VALIDATION_FAILED, "이메일 형식이 올바르지 않습니다.", [
        { field: "email", reason: "INVALID_EMAIL" },
      ]);
    }

    const application = await this.repository.findApplicationByPostingAndEmail(recruitmentId, email);
    if (!application) {
      throw new CompanyRecruitingException(404, ERROR_CODES.COMMON_NOT_FOUND, "해당 이메일로 제출된 지원서를 찾을 수 없습니다.");
    }

    const verification = await this.publicApplicationAuthAdapter.requestEmailVerification({
      applicationId: application.applicationId,
      recruitmentId,
      email,
    });

    return {
      recruitmentId,
      email,
      emailVerificationStatus: verification.emailVerificationStatus,
      nextAction: verification.nextAction,
      magicLinkDeliveryStatus: verification.magicLinkDeliveryStatus,
      magicLinkExpiresInSeconds: verification.magicLinkExpiresInSeconds,
    };
  }

  async getPublicApplicationStatusByMagicLink(token: string) {
    const payload = await this.publicApplicationAuthAdapter.verifyApplicationStatusToken(token);
    if (!payload) {
      throw new CompanyRecruitingException(401, ERROR_CODES.COMMON_UNAUTHORIZED, "매직링크가 만료되었거나 유효하지 않습니다.");
    }

    const application = await this.repository.findPublicApplicationStatusById(payload.applicationId);
    if (!application) {
      throw new CompanyRecruitingException(404, ERROR_CODES.COMMON_NOT_FOUND, "지원서를 찾을 수 없습니다.");
    }
    if (application.postingId !== payload.recruitmentId || normalizeEmail(application.candidate.user.email) !== normalizeEmail(payload.email)) {
      throw new CompanyRecruitingException(401, ERROR_CODES.COMMON_UNAUTHORIZED, "매직링크가 지원서 정보와 일치하지 않습니다.");
    }

    return toPublicApplicationStatusResponse(application, this.publicInterviewEntryAdapter.buildEntry(application));
  }

  async verifyPublicApplicationTokenForInterviewStart(token: string, verifySecret?: string | null) {
    const expectedSecret = process.env.PUBLIC_APPLICATION_TOKEN_VERIFY_SECRET;
    if (expectedSecret && verifySecret !== expectedSecret) {
      throw new CompanyRecruitingException(401, ERROR_CODES.COMMON_UNAUTHORIZED, "공개 지원 토큰 검증 권한이 없습니다.");
    }

    const payload = await this.publicApplicationAuthAdapter.verifyApplicationStatusToken(token);
    if (!payload) {
      throw new CompanyRecruitingException(401, ERROR_CODES.COMMON_UNAUTHORIZED, "매직링크가 만료되었거나 유효하지 않습니다.");
    }

    const application = await this.repository.findPublicApplicationStatusById(payload.applicationId);
    if (!application) {
      throw new CompanyRecruitingException(404, ERROR_CODES.COMMON_NOT_FOUND, "지원서를 찾을 수 없습니다.");
    }
    if (application.postingId !== payload.recruitmentId || normalizeEmail(application.candidate.user.email) !== normalizeEmail(payload.email)) {
      throw new CompanyRecruitingException(401, ERROR_CODES.COMMON_UNAUTHORIZED, "매직링크가 지원서 정보와 일치하지 않습니다.");
    }

    return { applicationId: application.applicationId };
  }

  async deleteRecruitment(user: CurrentUser, recruitmentId: number) {
    const companyId = requireCompanyId(user);
    const posting = await this.repository.findPostingForCompany(recruitmentId, companyId);
    if (!posting) {
      throw new CompanyRecruitingException(404, ERROR_CODES.COMMON_NOT_FOUND, "공고를 찾을 수 없습니다.");
    }
    if (posting.status !== PostingStatus.DRAFT && posting.status !== PostingStatus.CLOSED) {
      throw new CompanyRecruitingException(400, ERROR_CODES.COMMON_VALIDATION_FAILED, "임시저장 또는 마감 공고만 삭제할 수 있습니다.", [
        { field: "status", reason: "INVALID_ARCHIVE_TRANSITION" },
      ]);
    }

    const archived = await this.repository.archivePosting(recruitmentId, companyId);
    if (!archived) {
      throw new CompanyRecruitingException(404, ERROR_CODES.COMMON_NOT_FOUND, "공고를 찾을 수 없습니다.");
    }
    return toRecruitmentResponse(archived);
  }

  async copyRecruitment(user: CurrentUser, recruitmentId: number) {
    const companyId = requireCompanyId(user);
    const posting = await this.repository.findPostingForCompany(recruitmentId, companyId);
    if (!posting) {
      throw new CompanyRecruitingException(404, ERROR_CODES.COMMON_NOT_FOUND, "공고를 찾을 수 없습니다.");
    }
    if (posting.status !== PostingStatus.CLOSED) {
      throw new CompanyRecruitingException(400, ERROR_CODES.COMMON_VALIDATION_FAILED, "마감된 공고만 복사할 수 있습니다.", [
        { field: "status", reason: "NOT_CLOSED" },
      ]);
    }

    const copied = await this.repository.createPosting({
      companyId,
      title: buildCopyTitle(posting.title),
      jobRole: posting.jobRole,
      jobDescription: posting.jobDescription,
      careerRequirement: posting.careerRequirement,
      educationRequirement: posting.educationRequirement,
      salaryInfo: posting.salaryInfo,
      workLocation: posting.workLocation,
      employmentType: posting.employmentType,
      jobRoleCode: posting.jobRoleCode,
      regionCode: posting.regionCode,
      careerMinYears: posting.careerMinYears,
      careerMaxYears: posting.careerMaxYears,
      employmentTypeCode: posting.employmentTypeCode,
      recruitmentType: posting.recruitmentType,
      workplaceAddress: posting.workplaceAddress,
      workplaceLat: posting.workplaceLat,
      workplaceLng: posting.workplaceLng,
      startsOn: null,
      endsOn: null,
      status: PostingStatus.DRAFT,
    });
    return toRecruitmentResponse(copied);
  }

  async listRecruitmentApplicants(user: CurrentUser, recruitmentId: number, query: ListApplicantsQueryDto) {
    const companyId = requireCompanyId(user);
    const posting = await this.repository.findPostingForCompany(recruitmentId, companyId);
    if (!posting) {
      throw new CompanyRecruitingException(404, ERROR_CODES.COMMON_NOT_FOUND, "공고를 찾을 수 없습니다.");
    }
    const normalized = normalizeApplicantListQuery(query);
    const [items, totalItems] = await Promise.all([
      this.repository.listApplicationsForPosting(recruitmentId, companyId, normalized),
      this.repository.countApplicationsForPosting(recruitmentId, companyId, normalized),
    ]);
    return {
      items: items.map(toApplicantResponse),
      page: buildPageMeta(normalized.page, normalized.limit, totalItems),
    };
  }

  async getRecruitmentApplicantSummary(user: CurrentUser, recruitmentId: number) {
    const companyId = requireCompanyId(user);
    const posting = await this.repository.findPostingForCompany(recruitmentId, companyId);
    if (!posting) {
      throw new CompanyRecruitingException(404, ERROR_CODES.COMMON_NOT_FOUND, "공고를 찾을 수 없습니다.");
    }
    return this.repository.summarizeApplicationsForPosting(recruitmentId, companyId);
  }

  async sendRecruitmentPassMails(
    user: CurrentUser,
    recruitmentId: number,
    dto: SendRecruitmentPassMailsDto,
  ): Promise<PassMailResultRecord> {
    const companyId = requireCompanyId(user);
    const targetPassCount = parseTargetPassCount(dto.targetPassCount);
    const posting = await this.repository.findPostingForCompany(recruitmentId, companyId);
    if (!posting) {
      throw new CompanyRecruitingException(404, ERROR_CODES.COMMON_NOT_FOUND, "공고를 찾을 수 없습니다.");
    }

    const applications = await this.repository.listApplicationsForPassTargeting(recruitmentId, companyId);
    const previousById = new Map(applications.map((application) => [application.applicationId, application]));
    const targetEligibleApplications = applications
      .filter((application) => (
        application.reportStatus === "COMPLETED"
        && application.screeningResultConfirmationStatus === "PENDING"
        && isPassTargetEligibleDecision(application.effectiveScreeningDecision)
      ))
      .sort(comparePassTargetApplications);
    const currentPassApplications = targetEligibleApplications
      .filter((application) => application.effectiveScreeningDecision === ScreeningDecision.PASS);
    if (targetPassCount > targetEligibleApplications.length) {
      throw new CompanyRecruitingException(
        400,
        ERROR_CODES.COMMON_VALIDATION_FAILED,
        "목표 합격자 수만큼 리포트가 완료된 합격/보류/불합격 지원자가 부족합니다.",
        [{ field: "targetPassCount", reason: "INSUFFICIENT_DECIDED_APPLICANTS" }],
      );
    }

    const targetApplications = targetEligibleApplications.slice(0, targetPassCount);
    const targetApplicationIds = targetApplications.map((application) => application.applicationId);
    const targetApplicationIdSet = new Set(targetApplicationIds);
    const currentPassApplicationIdSet = new Set(currentPassApplications.map((application) => application.applicationId));
    const promotedCount = targetApplications.filter(
      (application) => !currentPassApplicationIdSet.has(application.applicationId),
    ).length;
    const demotedCount = currentPassApplications.filter(
      (application) => !targetApplicationIdSet.has(application.applicationId),
    ).length;

    const mailAdapter = this.mailAdapter;
    if (targetApplications.length > 0 && !mailAdapter) {
      throw new CompanyRecruitingException(500, ERROR_CODES.COMMON_VALIDATION_FAILED, "합격 메일 발송 설정이 필요합니다.");
    }

    const finalizedPassApplications = await this.repository.finalizeApplicationsPassTarget(
      recruitmentId,
      companyId,
      targetEligibleApplications.map((application) => ({
        applicationId: application.applicationId,
        decision: targetApplicationIdSet.has(application.applicationId) ? "PASS" : "FAIL",
        preserveAutomaticSnapshot: shouldPreserveAutomaticScreeningSnapshot(application),
      })),
    );
    const finalizedById = new Map(finalizedPassApplications.map((application) => [application.applicationId, application]));
    const finalPassApplications = targetApplications
      .map((application) => finalizedById.get(application.applicationId) ?? {
        ...application,
        effectiveScreeningDecision: ScreeningDecision.PASS,
      })
      .sort(comparePassTargetApplications);

    const recipients: PassMailResultRecord["recipients"] = [];
    const failedApplications: ApplicantRecord[] = [];
    for (const application of finalPassApplications) {
      if (application.passMailDeliveryStatus === "SENT") {
        recipients.push(toPassMailRecipient(application, "SKIPPED"));
        continue;
      }

      const recipient = toPassMailRecipient(application, "SENT");
      try {
        await mailAdapter?.send(buildPassMailMessage(posting, application));
        await this.repository.markPassMailSent(application.applicationId, companyId);
        recipients.push(recipient);
      } catch (error) {
        failedApplications.push(application);
        await this.repository.markPassMailFailed(application.applicationId, companyId, errorMessage(error));
        recipients.push({ ...recipient, deliveryStatus: "FAILED" });
      }
    }

    const sentCount = recipients.filter((recipient) => recipient.deliveryStatus === "SENT").length;
    const failedCount = recipients.filter((recipient) => recipient.deliveryStatus === "FAILED").length;
    const skippedCount = recipients.filter((recipient) => recipient.deliveryStatus === "SKIPPED").length;
    if (failedCount > 0) {
      const successfulApplicationIds = new Set(
        recipients
          .filter((recipient) => recipient.deliveryStatus === "SENT" || recipient.deliveryStatus === "SKIPPED")
          .map((recipient) => recipient.applicationId),
      );
      const restoreStates = [
        ...failedApplications,
        ...currentPassApplications.filter((application) => !targetApplicationIdSet.has(application.applicationId)),
      ]
        .filter((application) => !successfulApplicationIds.has(application.applicationId))
        .map((application) => previousById.get(application.applicationId))
        .filter((application): application is ApplicantRecord => Boolean(application))
        .map((application) => ({
          applicationId: application.applicationId,
          screeningDecision: application.screeningDecision,
          screeningMemo: application.screeningMemo,
          screeningReviewerDecision: application.screeningReviewerDecision,
          screeningDecisionOverrideReason: application.screeningDecisionOverrideReason,
        }));

      await this.repository.restoreApplicationScreeningDecisions(recruitmentId, companyId, restoreStates);
      throw new CompanyRecruitingException(
        503,
        ERROR_CODES.MAIL_DELIVERY_FAILED,
        "합격 메일 발송에 실패했습니다. 실패한 대상은 기존 판정으로 복구했습니다.",
        failedApplications.map((application) => ({
          field: "applicationId",
          reason: String(application.applicationId),
        })),
      );
    }

    return {
      currentPassCount: currentPassApplications.length,
      targetPassCount,
      promotedCount,
      demotedCount,
      sentCount,
      failedCount,
      skippedCount,
      recipients,
    };
  }

  async getApplicantEvaluation(user: CurrentUser, applicantId: number) {
    const companyId = requireCompanyId(user);
    const application = await this.repository.findApplicationForCompany(applicantId, companyId);
    if (!application) {
      throw new CompanyRecruitingException(404, ERROR_CODES.COMMON_NOT_FOUND, "지원자를 찾을 수 없습니다.");
    }

    return toApplicantEvaluationResponse(application);
  }

  async getApplicantDocument(user: CurrentUser, applicantId: number, fileId: number) {
    const companyId = requireCompanyId(user);
    const fileAsset = await this.findApplicantDocumentFileForCompany(applicantId, companyId, fileId);
    if (!this.storageAdapter.getObject) {
      throw new CompanyRecruitingException(500, ERROR_CODES.COMMON_VALIDATION_FAILED, "파일 저장소 조회 설정이 필요합니다.");
    }

    let object: CompanyRecruitingStorageObject;
    try {
      object = await this.storageAdapter.getObject(fileAsset.storageKey);
    } catch (error) {
      if (isStorageObjectNotFound(error)) {
        throw new CompanyRecruitingException(404, ERROR_CODES.COMMON_NOT_FOUND, "제출 서류 파일을 찾을 수 없습니다.");
      }
      throw error;
    }

    return {
      body: object.body,
      contentLength: object.contentLength ?? (Buffer.isBuffer(object.body) ? object.body.byteLength : fileAsset.sizeBytes),
      contentType: object.contentType ?? fileAsset.mimeType,
      originalName: fileAsset.originalName,
    };
  }

  async createApplicantInterviewMediaSession(user: CurrentUser, applicantId: number, fileId: number) {
    const companyId = requireCompanyId(user);
    const fileAsset = await this.findApplicantInterviewMediaFileForCompany(applicantId, companyId, fileId);
    const expiresAt = Math.floor(Date.now() / 1000) + APPLICANT_MEDIA_COOKIE_MAX_AGE_SECONDS;

    return {
      cookieName: APPLICANT_MEDIA_COOKIE_NAME,
      token: this.signApplicantMediaToken({
        applicantId,
        companyId,
        expiresAt,
        fileId: fileAsset.fileId,
        userId: user.userId,
      }),
      maxAgeSeconds: APPLICANT_MEDIA_COOKIE_MAX_AGE_SECONDS,
      mediaPath: `/api/v1/company/applicants/${applicantId}/media/${fileAsset.fileId}`,
    };
  }

  verifyApplicantInterviewMediaSession(token: string | undefined, applicantId: number, fileId: number): CurrentUser {
    const payload = this.verifyApplicantMediaToken(token);
    if (payload.applicantId !== applicantId || payload.fileId !== fileId) {
      throw new CompanyRecruitingException(403, ERROR_CODES.COMMON_FORBIDDEN, "면접 녹화 재생 권한이 없습니다.");
    }

    return {
      userId: payload.userId,
      userType: "COMPANY",
      companyId: payload.companyId,
      candidateId: null,
    };
  }

  async getApplicantInterviewMedia(user: CurrentUser, applicantId: number, fileId: number, options: { range?: string } = {}) {
    const companyId = requireCompanyId(user);
    const fileAsset = await this.findApplicantInterviewMediaFileForCompany(applicantId, companyId, fileId);
    const range = normalizeMediaRange(options.range, fileAsset.sizeBytes);
    if (!this.storageAdapter.getObject) {
      throw new CompanyRecruitingException(500, ERROR_CODES.COMMON_VALIDATION_FAILED, "파일 저장소 조회 설정이 필요합니다.");
    }

    let object: CompanyRecruitingStorageObject;
    try {
      object = await this.storageAdapter.getObject(fileAsset.storageKey, range ? { range } : undefined);
    } catch (error) {
      if (error instanceof CompanyRecruitingException) {
        throw error;
      }
      if (isStorageObjectNotFound(error)) {
        throw new CompanyRecruitingException(
          404,
          ERROR_CODES.COMMON_NOT_FOUND,
          "면접 녹화 원본이 로컬 파일 저장소에 없습니다.",
        );
      }
      if (isStorageInvalidRange(error)) {
        throw invalidMediaRange();
      }
      throw new CompanyRecruitingException(
        500,
        ERROR_CODES.COMMON_VALIDATION_FAILED,
        "면접 녹화 파일을 불러올 수 없습니다.",
      );
    }

    return {
      body: object.body,
      contentType: object.contentType ?? fileAsset.mimeType,
      contentLength: object.contentLength ?? (Buffer.isBuffer(object.body) ? object.body.byteLength : fileAsset.sizeBytes),
      contentRange: object.contentRange,
      originalName: fileAsset.originalName,
      statusCode: range ? 206 : 200,
    };
  }

  private async findApplicantInterviewMediaFileForCompany(applicantId: number, companyId: number, fileId: number) {
    const application = await this.repository.findApplicationForCompany(applicantId, companyId);
    if (!application) {
      throw new CompanyRecruitingException(404, ERROR_CODES.COMMON_NOT_FOUND, "지원자를 찾을 수 없습니다.");
    }

    const fileAsset = findApplicantInterviewMediaFile(application, fileId);
    if (!fileAsset) {
      throw new CompanyRecruitingException(404, ERROR_CODES.COMMON_NOT_FOUND, "면접 녹화 파일을 찾을 수 없습니다.");
    }
    return fileAsset;
  }

  private async findApplicantDocumentFileForCompany(applicantId: number, companyId: number, fileId: number) {
    const application = await this.repository.findApplicationForCompany(applicantId, companyId);
    if (!application) {
      throw new CompanyRecruitingException(404, ERROR_CODES.COMMON_NOT_FOUND, "지원자를 찾을 수 없습니다.");
    }
    const fileAsset = application.documents
      ?.find((document) => document.fileId === fileId)
      ?.file;
    if (!fileAsset || fileAsset.status !== "ACTIVE") {
      throw new CompanyRecruitingException(404, ERROR_CODES.COMMON_NOT_FOUND, "제출 서류 파일을 찾을 수 없습니다.");
    }
    return fileAsset;
  }

  private signApplicantMediaToken(payload: ApplicantMediaTokenPayload) {
    const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const signature = signApplicantMediaTokenBody(body);
    return `${body}.${signature}`;
  }

  private verifyApplicantMediaToken(token: string | undefined): ApplicantMediaTokenPayload {
    if (!token?.includes(".")) {
      throw new CompanyRecruitingException(401, ERROR_CODES.COMMON_UNAUTHORIZED, "면접 녹화 재생 인증이 필요합니다.");
    }

    const [body, signature] = token.split(".", 2);
    if (!body || !signature || !isEqualSignature(signature, signApplicantMediaTokenBody(body))) {
      throw new CompanyRecruitingException(401, ERROR_CODES.COMMON_UNAUTHORIZED, "면접 녹화 재생 인증이 유효하지 않습니다.");
    }

    let payload: ApplicantMediaTokenPayload;
    try {
      payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ApplicantMediaTokenPayload;
    } catch {
      throw new CompanyRecruitingException(401, ERROR_CODES.COMMON_UNAUTHORIZED, "면접 녹화 재생 인증이 유효하지 않습니다.");
    }

    if (
      !isPositiveInteger(payload.applicantId) ||
      !isPositiveInteger(payload.companyId) ||
      !isPositiveInteger(payload.expiresAt) ||
      !isPositiveInteger(payload.fileId) ||
      !isPositiveInteger(payload.userId)
    ) {
      throw new CompanyRecruitingException(401, ERROR_CODES.COMMON_UNAUTHORIZED, "면접 녹화 재생 인증이 유효하지 않습니다.");
    }
    if (payload.expiresAt < Math.floor(Date.now() / 1000)) {
      throw new CompanyRecruitingException(401, ERROR_CODES.COMMON_UNAUTHORIZED, "면접 녹화 재생 인증이 만료되었습니다.");
    }

    return payload;
  }

  async updateScreeningStatus(user: CurrentUser, applicantId: number, dto: UpdateScreeningStatusDto) {
    const companyId = requireCompanyId(user);
    const existing = await this.repository.findApplicationForCompany(
      applicantId,
      companyId,
    );
    if (!existing) {
      throw new CompanyRecruitingException(404, ERROR_CODES.COMMON_NOT_FOUND, "지원자를 찾을 수 없습니다.");
    }
    if (existing.posting.autoScreeningPolicyEnabled) {
      throw new CompanyRecruitingException(
        409,
        ERROR_CODES.COMMON_CONFLICT,
        "자동 판정 공고의 결과는 검토 수정 API를 사용해야 합니다.",
        [{ field: "screeningDecision", reason: "SCREENING_DECISION_SYSTEM_MANAGED" }],
      );
    }
    if (existing.screeningResultConfirmationStatus === "CONFIRMED") {
      throw new CompanyRecruitingException(409, ERROR_CODES.COMMON_CONFLICT, "이미 확정된 결과는 변경할 수 없습니다.", [
        { field: "screeningDecision", reason: "SCREENING_RESULT_ALREADY_CONFIRMED" },
      ]);
    }
    const screeningDecision = parseScreeningDecision(dto.screeningDecision);
    const application = await this.repository.updateApplicationScreening(applicantId, companyId, {
      screeningDecision,
      screeningMemo: dto.screeningMemo?.trim() || null,
    });

    if (!application) {
      throw new CompanyRecruitingException(409, ERROR_CODES.COMMON_CONFLICT, "결과 확정과 동시에 변경되어 저장할 수 없습니다. 목록을 새로고침해주세요.", [
        { field: "screeningDecision", reason: "SCREENING_RESULT_ALREADY_CONFIRMED" },
      ]);
    }

    return toApplicantResponse(application);
  }

  async updateScreeningReview(user: CurrentUser, applicantId: number, dto: UpdateScreeningReviewDto) {
    const companyId = requireCompanyId(user);
    const existing = await this.repository.findApplicationForCompany(applicantId, companyId);
    if (!existing) {
      throw new CompanyRecruitingException(404, ERROR_CODES.COMMON_NOT_FOUND, "지원자를 찾을 수 없습니다.");
    }
    if (existing.screeningResultConfirmationStatus === "CONFIRMED") {
      throw new CompanyRecruitingException(409, ERROR_CODES.COMMON_CONFLICT, "이미 확정된 결과는 변경할 수 없습니다.", [
        { field: "screeningReviewerDecision", reason: "SCREENING_RESULT_ALREADY_CONFIRMED" },
      ]);
    }
    const automaticDecision = existing.screeningDecision;
    if (
      automaticDecision !== ScreeningDecision.PASS &&
      automaticDecision !== ScreeningDecision.HOLD &&
      automaticDecision !== ScreeningDecision.FAIL
    ) {
      throw new CompanyRecruitingException(409, ERROR_CODES.COMMON_CONFLICT, "평가 가능한 자동 판정만 검토할 수 있습니다.", [
        { field: "screeningReviewerDecision", reason: "SCREENING_DECISION_NOT_REVIEWABLE" },
      ]);
    }
    if (
      !existing.posting.autoScreeningPolicyEnabled ||
      existing.reportStatus !== "COMPLETED" ||
      !existing.screeningDecisionReasonCode ||
      !existing.screeningDecisionPolicyVersion ||
      !existing.screeningPolicyVersion ||
      !existing.screeningCriteriaVersion ||
      !existing.screeningDecisionReportId
    ) {
      throw new CompanyRecruitingException(409, ERROR_CODES.COMMON_CONFLICT, "자동 판정의 리포트·정책 snapshot을 확인할 수 없습니다.", [
        { field: "screeningReviewerDecision", reason: "SCREENING_DECISION_NOT_REVIEWABLE" },
      ]);
    }

    const requestedDecision = dto.screeningReviewerDecision ?? null;
    const resetToAutomatic = requestedDecision === null || requestedDecision === automaticDecision;
    const overrideReason = dto.overrideReason?.trim() || null;
    if (!resetToAutomatic && (!overrideReason || overrideReason.length < 10 || overrideReason.length > 1000)) {
      throw new CompanyRecruitingException(400, ERROR_CODES.COMMON_VALIDATION_FAILED, "자동판정 변경 사유를 10~1000자로 입력해주세요.", [
        { field: "overrideReason", reason: "SCREENING_OVERRIDE_REASON_REQUIRED" },
      ]);
    }

    const updated = await this.repository.updateApplicationScreeningReview(applicantId, companyId, {
      screeningReviewerDecision: resetToAutomatic ? null : requestedDecision as ScreeningDecision,
      screeningDecisionOverrideReason: resetToAutomatic ? null : overrideReason,
    });
    if (!updated) {
      throw new CompanyRecruitingException(409, ERROR_CODES.COMMON_CONFLICT, "결과 확정과 동시에 변경되어 저장할 수 없습니다. 목록을 새로고침해주세요.", [
        { field: "screeningReviewerDecision", reason: "SCREENING_RESULT_ALREADY_CONFIRMED" },
      ]);
    }
    return toApplicantResponse(updated);
  }

  async confirmScreeningResults(user: CurrentUser, recruitmentId: number, dto: ConfirmScreeningResultsDto) {
    const companyId = requireCompanyId(user);
    const posting = await this.repository.findPostingForCompany(recruitmentId, companyId);
    if (!posting) {
      throw new CompanyRecruitingException(404, ERROR_CODES.COMMON_NOT_FOUND, "공고를 찾을 수 없습니다.");
    }
    const result = await this.repository.confirmScreeningResults(
      recruitmentId,
      companyId,
      user.userId,
      dto.expectedEligibleCount,
    );
    if (result.scopeChanged) {
      throw new CompanyRecruitingException(409, ERROR_CODES.COMMON_CONFLICT, "확정 대상이 변경되었습니다. 목록을 새로고침해주세요.", [
        { field: "expectedEligibleCount", reason: "SCREENING_CONFIRMATION_SCOPE_CHANGED" },
      ]);
    }

    let emailSentCount = 0;
    let emailFailedCount = 0;
    for (const recipient of result.emailRecipients) {
      if (!this.mailAdapter) break;
      try {
        await this.mailAdapter.send(buildScreeningResultMailMessage(posting, recipient));
        await this.repository.markScreeningResultEmailNotification(recipient.notificationId, "SENT");
        emailSentCount += 1;
      } catch {
        await this.repository.markScreeningResultEmailNotification(recipient.notificationId, "FAILED");
        emailFailedCount += 1;
      }
    }

    return {
      recruitmentId,
      idempotent: result.idempotent,
      confirmedCount: result.confirmedCount,
      confirmedCounts: result.decisionCounts,
      excludedCounts: result.excludedCounts,
      confirmedAt: result.confirmedAt?.toISOString() ?? null,
      emailSentCount,
      emailFailedCount,
    };
  }

  private async assertPublicApplicationEmailCanBeUsed(email: string) {
    const account = await this.repository.findUserAccountByEmail(email);
    if (!account) {
      return;
    }
    if (account.userType !== UserType.CANDIDATE) {
      throw new CompanyRecruitingException(409, ERROR_CODES.COMMON_CONFLICT, "지원자 계정이 아닌 이메일은 공개 지원에 사용할 수 없습니다.", [
        { field: "email", reason: "USER_TYPE_MISMATCH" },
      ]);
    }
  }

  private assertJobDescriptionImageFile(
    file: JobDescriptionImageUploadFile | undefined,
  ): asserts file is JobDescriptionImageUploadFile {
    if (
      !file ||
      !file.originalName?.trim() ||
      !file.mimeType?.trim() ||
      !Buffer.isBuffer(file.buffer) ||
      file.sizeBytes < 1
    ) {
      throw new CompanyRecruitingException(400, ERROR_CODES.COMMON_VALIDATION_FAILED, "업로드할 이미지 파일을 선택해주세요.", [
        { field: "file", reason: "REQUIRED" },
      ]);
    }
    if (!ALLOWED_JD_IMAGE_MIME_TYPES.has(file.mimeType)) {
      throw new CompanyRecruitingException(400, ERROR_CODES.FILE_INVALID_TYPE, "PNG, JPG, WEBP 이미지만 업로드할 수 있습니다.", [
        { field: "file", reason: "INVALID_MIME_TYPE", allowedMimeTypes: [...ALLOWED_JD_IMAGE_MIME_TYPES] },
      ]);
    }
    const maxUploadBytes = this.uploadConfig.jdImageMaxUploadBytes ?? getConfiguredJdImageMaxUploadBytes();
    if (file.sizeBytes > maxUploadBytes) {
      throw new CompanyRecruitingException(400, ERROR_CODES.FILE_SIZE_EXCEEDED, "이미지 파일 용량이 너무 큽니다.", [
        { field: "file", reason: "SIZE_EXCEEDED", maxSizeBytes: maxUploadBytes },
      ]);
    }
  }

  private assertPublicApplicationDocumentFile(
    file: PublicApplicationDocumentUploadFile | undefined,
    field: string,
    requiredMessage: string,
  ): asserts file is PublicApplicationDocumentUploadFile {
    if (
      !file ||
      !file.originalName?.trim() ||
      !file.mimeType?.trim() ||
      !Buffer.isBuffer(file.buffer) ||
      file.sizeBytes < 1
    ) {
      throw new CompanyRecruitingException(400, ERROR_CODES.COMMON_VALIDATION_FAILED, requiredMessage, [
        { field, reason: "REQUIRED" },
      ]);
    }
    if (!ALLOWED_PUBLIC_APPLICATION_DOCUMENT_MIME_TYPES.has(file.mimeType)) {
      throw new CompanyRecruitingException(400, ERROR_CODES.FILE_INVALID_TYPE, "PDF 파일만 업로드할 수 있습니다.", [
        { field, reason: "INVALID_MIME_TYPE", allowedMimeTypes: [...ALLOWED_PUBLIC_APPLICATION_DOCUMENT_MIME_TYPES] },
      ]);
    }
    const maxUploadBytes = this.uploadConfig.publicApplicationDocumentMaxUploadBytes ?? getConfiguredPublicApplicationDocumentMaxUploadBytes();
    if (file.sizeBytes > maxUploadBytes) {
      throw new CompanyRecruitingException(400, ERROR_CODES.FILE_SIZE_EXCEEDED, "PDF 파일 용량이 너무 큽니다.", [
        { field, reason: "SIZE_EXCEEDED", maxSizeBytes: maxUploadBytes },
      ]);
    }
  }

  private async uploadPublicApplicationDocumentFile(
    recruitmentId: number,
    candidateId: number,
    ownerUserId: number,
    documentType: DocumentType,
    file: PublicApplicationDocumentUploadFile,
  ) {
    const storageKey = buildPublicApplicationDocumentStorageKey(recruitmentId, candidateId, documentType, file.originalName);
    await this.storageAdapter.putObject({
      key: storageKey,
      body: file.buffer,
      contentType: file.mimeType,
      contentLength: file.sizeBytes,
    });
    const fileAsset = await this.repository.createFileAsset({
      ownerUserId,
      storageKey,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    });
    return {
      fileId: fileAsset.fileId,
      documentType,
    };
  }
}

export function normalizeListQuery(query: ListQueryDto, defaultSort: string): NormalizedListQuery {
  const page = query.page ?? 1;
  const limit = Math.min(query.limit ?? 20, 100);
  const q = query.q?.trim() || query.keyword?.trim() || undefined;
  const status = parseOptionalPostingStatus(query.status);
  return {
    page,
    limit,
    ...(q ? { q } : {}),
    ...(status ? { status } : {}),
    sort: query.sort?.trim() || defaultSort,
    order: query.order ?? "desc",
    skip: (page - 1) * limit,
    take: limit,
  };
}

export function normalizeApplicantListQuery(query: ListApplicantsQueryDto): NormalizedApplicantListQuery {
  const page = query.page ?? 1;
  const limit = Math.min(query.limit ?? 20, 100);
  const q = query.q?.trim() || query.keyword?.trim() || undefined;
  return {
    page,
    limit,
    ...(q ? { q } : {}),
    ...(query.applicationStatus ? { applicationStatus: query.applicationStatus as ApplicationStatusValue } : {}),
    ...(query.documentStatus ? { documentStatus: query.documentStatus as DocumentStatusValue } : {}),
    ...(query.interviewStatus ? { interviewStatus: query.interviewStatus as InterviewStatusValue } : {}),
    ...(query.reportStatus ? { reportStatus: query.reportStatus as ReportStatusValue } : {}),
    ...(query.screeningDecision ? { screeningDecision: query.screeningDecision as ScreeningDecisionValue } : {}),
    ...(query.effectiveScreeningDecision
      ? { effectiveScreeningDecision: query.effectiveScreeningDecision as ScreeningDecisionValue }
      : {}),
    ...(query.screeningResultConfirmationStatus
      ? { screeningResultConfirmationStatus: query.screeningResultConfirmationStatus }
      : {}),
    sort: query.sort?.trim() || "updatedAt",
    order: query.order ?? "desc",
    skip: (page - 1) * limit,
    take: limit,
  };
}

function requireCompanyId(user: CurrentUser): number {
  if (user.userType !== "COMPANY" || !user.companyId) {
    throw new CompanyRecruitingException(403, ERROR_CODES.COMMON_FORBIDDEN, "기업 사용자만 접근할 수 있습니다.");
  }
  return user.companyId;
}

function parseTargetPassCount(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 5000) {
    throw new CompanyRecruitingException(400, ERROR_CODES.COMMON_VALIDATION_FAILED, "목표 합격자 수를 확인해주세요.", [
      { field: "targetPassCount", reason: "INVALID_TARGET_PASS_COUNT" },
    ]);
  }
  return value;
}

function comparePassTargetApplications(left: ApplicantRecord, right: ApplicantRecord): number {
  const leftScore = latestApplicantScore(left);
  const rightScore = latestApplicantScore(right);
  if (leftScore === null && rightScore !== null) return 1;
  if (leftScore !== null && rightScore === null) return -1;
  if (leftScore !== null && rightScore !== null && leftScore !== rightScore) {
    return rightScore - leftScore;
  }

  const submittedCompare = compareNullableDatesAsc(left.submittedAt, right.submittedAt);
  if (submittedCompare !== 0) return submittedCompare;
  return left.applicationId - right.applicationId;
}

function latestApplicantScore(application: ApplicantRecord): number | null {
  return application.evaluationReports[0]?.totalScore ?? null;
}

function isPassTargetEligibleDecision(screeningDecision: string | null): boolean {
  return screeningDecision === ScreeningDecision.PASS
    || screeningDecision === ScreeningDecision.HOLD
    || screeningDecision === ScreeningDecision.FAIL;
}

function shouldPreserveAutomaticScreeningSnapshot(application: ApplicantRecord): boolean {
  return application.posting.autoScreeningPolicyEnabled
    || application.screeningDecisionReasonCode !== null
    || application.screeningDecisionPolicyVersion !== null
    || application.screeningPolicyVersion !== null
    || application.screeningCriteriaVersion !== null
    || application.screeningDecisionReportId !== null
    || application.screeningDecidedAt !== null;
}

function compareNullableDatesAsc(left: Date | null, right: Date | null): number {
  const leftTime = left?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const rightTime = right?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return leftTime - rightTime;
}

function toPassMailRecipient(
  application: ApplicantRecord,
  deliveryStatus: PassMailResultRecord["recipients"][number]["deliveryStatus"],
): PassMailResultRecord["recipients"][number] {
  return {
    applicationId: application.applicationId,
    email: application.applicantEmail ?? application.candidate.user.email,
    name: application.applicantName ?? application.candidate.user.name,
    totalScore: latestApplicantScore(application),
    deliveryStatus,
  };
}

function buildPassMailMessage(posting: RecruitmentRecord, application: ApplicantRecord): MailMessage {
  const name = application.applicantName ?? application.candidate.user.name;
  const email = application.applicantEmail ?? application.candidate.user.email;
  return {
    kind: "RECRUITING_PASS_NOTICE",
    to: email,
    subject: `[init] ${posting.title} 합격 안내`,
    text: [
      `안녕하세요, ${name}님.`,
      "",
      `${posting.title} 전형 합격을 안내드립니다.`,
      "추가 전형 또는 입사 안내는 채용 담당자가 별도로 전달드릴 예정입니다.",
      "",
      "감사합니다.",
    ].join("\n"),
  };
}

function buildScreeningResultMailMessage(
  posting: RecruitmentRecord,
  recipient: { email: string; name: string; decision: "PASS" | "HOLD" | "FAIL" },
): MailMessage {
  const label = recipient.decision === "PASS" ? "합격" : recipient.decision === "HOLD" ? "보류" : "불합격";
  return {
    kind: "SCREENING_RESULT_NOTICE",
    to: recipient.email,
    subject: `[init] ${posting.title} 전형 결과 안내`,
    text: [
      `안녕하세요, ${recipient.name}님.`,
      "",
      `${posting.title} 전형 결과가 확정되었습니다.`,
      `최종 결과: ${label}`,
      "상세 안내는 지원자 페이지에서 확인해주세요.",
      "",
      "감사합니다.",
    ].join("\n"),
  };
}

function findApplicantInterviewMediaFile(application: ApplicantRecord, fileId: number): CompanyFileAssetRecord | null {
  for (const session of application.interviewSessions) {
    for (const answer of session.answers ?? []) {
      const directMatch = [answer.videoFile, answer.audioFile].find((file) => isActiveInterviewMediaFile(file, fileId));
      if (directMatch) {
        return directMatch;
      }
      for (const followUp of answer.followUpQuestions) {
        const followUpAnswer = followUp.answer;
        const followUpMatch = [followUpAnswer?.videoFile, followUpAnswer?.audioFile].find((file) =>
          isActiveInterviewMediaFile(file, fileId),
        );
        if (followUpMatch) {
          return followUpMatch;
        }
      }
    }
  }
  return null;
}

function isActiveInterviewMediaFile(
  file: CompanyFileAssetRecord | null | undefined,
  fileId: number,
): file is CompanyFileAssetRecord {
  return file?.fileId === fileId && file.status === "ACTIVE";
}

function normalizeMediaRange(range: string | undefined, sizeBytes: number): string | undefined {
  if (!range) {
    return undefined;
  }

  const match = range.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) {
    throw invalidMediaRange();
  }

  const start = match[1];
  const end = match[2];
  if (!start && !end) {
    throw invalidMediaRange();
  }
  if (start && Number(start) >= sizeBytes) {
    throw invalidMediaRange();
  }
  if (start && end && Number(start) > Number(end)) {
    throw invalidMediaRange();
  }
  if (!start && Number(end) <= 0) {
    throw invalidMediaRange();
  }

  return range;
}

function invalidMediaRange() {
  return new CompanyRecruitingException(416, ERROR_CODES.COMMON_VALIDATION_FAILED, "요청한 미디어 범위가 유효하지 않습니다.");
}

function isStorageObjectNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const storageError = error as {
    $metadata?: { httpStatusCode?: number };
    Code?: unknown;
    code?: unknown;
    message?: unknown;
    name?: unknown;
  };
  const errorSignals = [storageError.name, storageError.Code, storageError.code]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase());

  return (
    storageError.$metadata?.httpStatusCode === 404 ||
    errorSignals.some((value) => value === "nosuchkey" || value === "notfound") ||
    (typeof storageError.message === "string" && storageError.message.toLowerCase().includes("nosuchkey"))
  );
}

function isStorageInvalidRange(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const storageError = error as { $metadata?: { httpStatusCode?: number }; Code?: unknown; code?: unknown; name?: unknown };
  const errorSignals = [storageError.name, storageError.Code, storageError.code]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase());
  return storageError.$metadata?.httpStatusCode === 416 || errorSignals.some((value) => value === "invalidrange");
}

function signApplicantMediaTokenBody(body: string) {
  return createHmac("sha256", process.env.JWT_SECRET ?? "local-dev-jwt-secret-change-me").update(body).digest("base64url");
}

function isEqualSignature(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.byteLength === expectedBuffer.byteLength && timingSafeEqual(actualBuffer, expectedBuffer);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

export function getConfiguredJdImageMaxUploadBytes() {
  const parsed = Number(process.env.JD_IMAGE_MAX_UPLOAD_BYTES ?? DEFAULT_JD_IMAGE_MAX_UPLOAD_BYTES);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_JD_IMAGE_MAX_UPLOAD_BYTES;
}

export function getConfiguredPublicApplicationDocumentMaxUploadBytes() {
  const parsed = Number(process.env.PUBLIC_APPLICATION_DOCUMENT_MAX_UPLOAD_BYTES ?? DEFAULT_PUBLIC_APPLICATION_DOCUMENT_MAX_UPLOAD_BYTES);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PUBLIC_APPLICATION_DOCUMENT_MAX_UPLOAD_BYTES;
}

function buildJobDescriptionImageStorageKey(companyId: number, originalName: string) {
  return `company/${companyId}/jd-images/${randomUUID()}-${sanitizeFileName(originalName)}`;
}

function buildPublicApplicationDocumentStorageKey(
  recruitmentId: number,
  candidateId: number,
  documentType: DocumentType,
  originalName: string,
) {
  const typePrefix = documentType === DocumentType.RESUME ? "resume" : "portfolio";
  return `public-applications/${recruitmentId}/candidate-${candidateId}/${typePrefix}/${randomUUID()}-${sanitizeFileName(originalName)}`;
}

function sanitizeFileName(originalName: string) {
  const fileName = originalName.trim().split(/[/\\]/).pop() ?? "image";
  const sanitized = fileName
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "image";
}

function normalizeUploadedFileName(originalName: string) {
  const trimmed = originalName.trim();
  if (!trimmed) {
    return trimmed;
  }

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

function buildPublicFileUrl(storageKey: string, configuredBaseUrl: string | undefined) {
  const baseUrl = configuredBaseUrl ?? process.env.S3_PUBLIC_BASE_URL ?? buildDefaultS3PublicBaseUrl();
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

function parseOptionalDate(value: string | undefined, field: string) {
  if (!value) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new CompanyRecruitingException(400, ERROR_CODES.COMMON_VALIDATION_FAILED, "날짜 형식을 확인해주세요.", [
      { field, reason: "INVALID_DATE" },
    ]);
  }
  return date;
}

function parseScreeningDecision(value: UpdateScreeningStatusDto["screeningDecision"]): ScreeningDecision {
  if (!["UNDECIDED", "PASS", "HOLD", "FAIL"].includes(value)) {
    throw new CompanyRecruitingException(400, ERROR_CODES.COMMON_VALIDATION_FAILED, "허용되지 않은 전형 상태입니다.", [
      { field: "screeningDecision", reason: "INVALID_SCREENING_DECISION" },
    ]);
  }
  return value as ScreeningDecision;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseOptionalPostingStatus(value: string | undefined): PostingStatus | undefined {
  if (!value) {
    return undefined;
  }
  if (!["DRAFT", "OPEN", "CLOSING_SOON", "CLOSED", "ARCHIVED"].includes(value)) {
    throw new CompanyRecruitingException(400, ERROR_CODES.COMMON_VALIDATION_FAILED, "허용되지 않은 공고 상태입니다.", [
      { field: "status", reason: "INVALID_POSTING_STATUS" },
    ]);
  }
  return value as PostingStatus;
}

function parseEditablePostingStatus(value: string): PostingStatus {
  if (!["DRAFT", "OPEN"].includes(value)) {
    throw new CompanyRecruitingException(400, ERROR_CODES.COMMON_VALIDATION_FAILED, "설정 화면에서는 DRAFT 또는 OPEN만 저장할 수 있습니다.", [
      { field: "status", reason: "INVALID_EDITABLE_POSTING_STATUS" },
    ]);
  }
  return value as PostingStatus;
}

function publicationReadinessReasonLabel(reason: InterviewPublicationReadiness["reasons"][number]): string {
  const labels: Record<InterviewPublicationReadiness["reasons"][number], string> = {
    CRITERIA_NOT_READY: "평가 기준",
    QUESTION_GENERATION_POLICY_MISSING: "질문 생성 정책",
    ACTIVE_QUESTION_SET_MISSING: "확정 질문 세트",
    QUESTION_SET_RECONFIRMATION_REQUIRED: "최신 평가 기준에 맞는 질문 세트 재확정",
    TIME_POLICY_MISSING: "면접 시간 설정",
  };
  return labels[reason];
}

function buildCopyTitle(title: string) {
  const suffix = " (복사본)";
  return `${title.slice(0, 200 - suffix.length)}${suffix}`;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeOptionalString(value: string | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function buildPostingExtraInfoInput(dto: CreateRecruitmentDto | UpdateRecruitmentDto) {
  return {
    careerRequirement: normalizeNullableString(dto.careerRequirement),
    educationRequirement: normalizeNullableString(dto.educationRequirement),
    salaryInfo: normalizeNullableString(dto.salaryInfo),
    workLocation: normalizeNullableString(dto.workLocation),
    employmentType: normalizeNullableString(dto.employmentType),
    // 값이 없으면 undefined 로 전달해 prisma 가 해당 컬럼을 건드리지 않게 한다(부분 수정 시 기존 값 보존).
    jobRoleCode: dto.jobRoleCode,
    regionCode: dto.regionCode,
    careerMinYears: dto.careerMinYears,
    careerMaxYears: dto.careerMaxYears,
    employmentTypeCode: dto.employmentTypeCode,
    recruitmentType: dto.recruitmentType,
    workplaceAddress: dto.workplaceAddress,
    workplaceLat: dto.workplaceLat,
    workplaceLng: dto.workplaceLng,
  };
}

function normalizeNullableString(value: string | undefined) {
  const normalized = normalizeOptionalString(value);
  return normalized || null;
}

function validateRequiredString(value: string | undefined, field: string, message: string) {
  if (!normalizeOptionalString(value)) {
    throw new CompanyRecruitingException(400, ERROR_CODES.COMMON_VALIDATION_FAILED, message, [
      { field, reason: "REQUIRED" },
    ]);
  }
}

function validateRequiredUrl(value: string | undefined, field: string, message: string) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new CompanyRecruitingException(400, ERROR_CODES.COMMON_VALIDATION_FAILED, message, [
      { field, reason: "REQUIRED" },
    ]);
  }
  validateHttpUrl(normalized, field, message);
  return normalized;
}

function validateHttpUrl(value: string, field: string, message: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("invalid protocol");
  } catch {
    throw new CompanyRecruitingException(400, ERROR_CODES.COMMON_VALIDATION_FAILED, message, [
      { field, reason: "INVALID_URL" },
    ]);
  }
}

function buildPublicApplicationSummary(dto: SubmitPublicApplicationDto) {
  const sections = [
    ["지원동기", normalizeOptionalString(dto.motivation)],
    ["추가 설명", normalizeOptionalString(dto.additionalInfo)],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}:\n${value}`);
  const summary = sections.join("\n\n") || normalizeOptionalString(dto.resumeText);
  return summary || null;
}

function validateApplicantName(name: string) {
  if (!isValidApplicantName(name.trim())) {
    throw new CompanyRecruitingException(400, ERROR_CODES.COMMON_VALIDATION_FAILED, "이름 형식을 확인해주세요.", [
      { field: "name", reason: "INVALID_NAME" },
    ]);
  }
}

function duplicatePublicApplicationEmailException() {
  return new CompanyRecruitingException(409, ERROR_CODES.COMMON_CONFLICT, "이미 이 공고에 지원한 이메일입니다.", [
    { field: "email", reason: "DUPLICATED_IN_RECRUITMENT" },
  ]);
}

function isPrismaUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002";
}

function isValidApplicantName(name: string) {
  return /^[\p{L}\p{M}][\p{L}\p{M}\s.'’\-·]{0,99}$/u.test(name);
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function buildPageMeta(page: number, limit: number, totalItems: number) {
  const totalPages = Math.ceil(totalItems / limit);
  return {
    page,
    limit,
    totalItems,
    totalPages,
    hasNext: page < totalPages,
  };
}

function toRecruitmentResponse(posting: RecruitmentRecord) {
  return {
    recruitmentId: posting.postingId,
    postingId: posting.postingId,
    companyId: posting.companyId,
    title: posting.title,
    jobRole: posting.jobRole,
    jobDescription: posting.jobDescription,
    careerRequirement: posting.careerRequirement,
    educationRequirement: posting.educationRequirement,
    salaryInfo: posting.salaryInfo,
    workLocation: posting.workLocation,
    employmentType: posting.employmentType,
    jobRoleCode: posting.jobRoleCode,
    regionCode: posting.regionCode,
    careerMinYears: posting.careerMinYears,
    careerMaxYears: posting.careerMaxYears,
    employmentTypeCode: posting.employmentTypeCode,
    recruitmentType: posting.recruitmentType,
    workplaceAddress: posting.workplaceAddress,
    workplaceLat: posting.workplaceLat,
    workplaceLng: posting.workplaceLng,
    startsOn: posting.startsOn ? formatDate(posting.startsOn) : null,
    endsOn: posting.endsOn ? formatDate(posting.endsOn) : null,
    status: posting.status,
    applicantCount: posting.applicantCount,
    createdAt: posting.createdAt.toISOString(),
    updatedAt: posting.updatedAt.toISOString(),
  };
}

function toPublicRecruitmentResponse(posting: PublicRecruitmentRecord) {
  return {
    recruitmentId: posting.postingId,
    postingId: posting.postingId,
    companyName: posting.companyName,
    title: posting.title,
    jobRole: posting.jobRole,
    jobDescription: posting.jobDescription,
    careerRequirement: posting.careerRequirement,
    educationRequirement: posting.educationRequirement,
    salaryInfo: posting.salaryInfo,
    workLocation: posting.workLocation,
    employmentType: posting.employmentType,
    startsOn: posting.startsOn ? formatDate(posting.startsOn) : null,
    endsOn: posting.endsOn ? formatDate(posting.endsOn) : null,
    status: posting.status,
  };
}

function toApplicantResponse(application: ApplicantRecord) {
  const latestReport = application.evaluationReports[0] ?? null;
  const latestSession = application.interviewSessions[0] ?? null;
  return {
    applicantId: application.applicationId,
    applicationId: application.applicationId,
    recruitmentId: application.postingId,
    candidateId: application.candidateId,
    name: application.applicantName ?? application.candidate.user.name,
    email: application.applicantEmail ?? application.candidate.user.email,
    phone: application.applicantPhone ?? application.candidate.user.phone,
    jobRole: application.posting.jobRole,
    applicationStatus: application.applicationStatus,
    documentStatus: application.documentStatus,
    interviewStatus: application.interviewStatus,
    reportStatus: latestReport?.status ?? application.reportStatus,
    screeningDecision: application.screeningDecision ?? "UNDECIDED",
    screeningReviewerDecision: application.screeningReviewerDecision,
    effectiveScreeningDecision: application.effectiveScreeningDecision,
    finalScreeningDecision: application.screeningFinalDecision,
    screeningDecisionOverrideReason: application.screeningDecisionOverrideReason,
    screeningResultConfirmationStatus: application.screeningResultConfirmationStatus,
    screeningResultConfirmedAt: application.screeningResultConfirmedAt?.toISOString() ?? null,
    autoScreeningPolicyEnabled: application.posting.autoScreeningPolicyEnabled,
    screeningDecisionReasonCode: application.screeningDecisionReasonCode,
    screeningDecisionPolicyVersion: application.screeningDecisionPolicyVersion,
    screeningPolicyVersion: application.screeningPolicyVersion,
    screeningCriteriaVersion: application.screeningCriteriaVersion,
    screeningDecidedAt: application.screeningDecidedAt?.toISOString() ?? null,
    screeningMemo: application.screeningMemo,
    interviewSession: latestSession
      ? {
          sessionId: latestSession.sessionId,
          status: latestSession.status,
          interviewType: latestSession.interviewType,
          startedAt: latestSession.startedAt?.toISOString() ?? null,
          completedAt: latestSession.completedAt?.toISOString() ?? null,
        }
      : null,
    report: latestReport
      ? {
          reportId: latestReport.reportId,
          status: latestReport.status,
          totalScore: latestReport.totalScore,
          summary: latestReport.summary,
          generatedAt: latestReport.generatedAt?.toISOString() ?? null,
        }
      : null,
    updatedAt: application.updatedAt.toISOString(),
  };
}

function toApplicantEvaluationResponse(application: ApplicantRecord) {
  const latestReport = application.evaluationReports[0] ?? null;
  const latestSession = application.interviewSessions[0] ?? null;
  const answers = latestSession?.answers ?? [];
  const integrityAdjustment = latestReport
    ? buildRecruitingIntegrityReference(answers, latestReport.totalScore)
    : null;
  const applicant = toApplicantResponse(application);

  return {
    applicant,
    recruitment: {
      recruitmentId: application.postingId,
      postingId: application.postingId,
      title: application.posting.title,
      jobRole: application.posting.jobRole,
    },
    statuses: {
      applicationStatus: application.applicationStatus,
      documentStatus: application.documentStatus,
      interviewStatus: application.interviewStatus,
      reportStatus: latestReport?.status ?? application.reportStatus,
    },
    screening: {
      decision: application.screeningDecision ?? "UNDECIDED",
      reviewerDecision: application.screeningReviewerDecision,
      effectiveDecision: application.effectiveScreeningDecision,
      finalDecision: application.screeningFinalDecision,
      overrideReason: application.screeningDecisionOverrideReason,
      confirmationStatus: application.screeningResultConfirmationStatus,
      confirmedAt: application.screeningResultConfirmedAt?.toISOString() ?? null,
      reasonCode: application.screeningDecisionReasonCode,
      decisionPolicyVersion: application.screeningDecisionPolicyVersion,
      policyVersion: application.screeningPolicyVersion,
      criteriaVersion: application.screeningCriteriaVersion,
      decidedAt: application.screeningDecidedAt?.toISOString() ?? null,
      memo: application.screeningMemo,
    },
    submission: {
      name: application.applicantName ?? application.candidate.user.name,
      email: application.applicantEmail ?? application.candidate.user.email,
      phone: application.applicantPhone ?? application.candidate.user.phone,
      githubUrl: application.githubUrl ?? application.candidate.githubUrl,
      blogUrl: application.blogUrl,
      portfolioUrl: application.portfolioUrl ?? application.candidate.portfolioUrl,
      motivation: application.motivation,
      additionalInfo: application.additionalInfo ?? application.candidate.summary,
      profileSnapshot: application.profileSnapshot ?? null,
      documents: (application.documents ?? [])
        .filter((document) => document.fileId !== null && document.file?.status === "ACTIVE")
        .map((document) => ({
          documentId: document.documentId,
          fileId: document.fileId,
          documentType: document.documentType,
          originalName: document.file?.originalName ?? "제출 서류",
          mimeType: document.file?.mimeType ?? "application/octet-stream",
          sizeBytes: document.file?.sizeBytes ?? 0,
          uploadedAt: document.uploadedAt.toISOString(),
        })),
    },
    reportAvailability: latestReport ? "AVAILABLE" : "NONE_OR_GENERATING",
    answers: latestSession
        ? answers.map((answer) => ({
          answerId: answer.answerId,
          questionId: answer.questionId,
          videoFileId: answer.videoFileId,
          audioFileId: answer.audioFileId,
          videoFile: toCompanyEvaluationFileAsset(answer.videoFile),
          audioFile: toCompanyEvaluationFileAsset(answer.audioFile),
          questionType: answer.questionType,
          questionContent: answer.questionContent,
          transcript: answer.transcript,
          durationSeconds: answer.durationSeconds,
          submittedAt: answer.submittedAt?.toISOString() ?? null,
          nonverbalMetadata: answer.nonverbalMetadata ?? null,
          followUpQuestions: answer.followUpQuestions.map((followUp) => ({
            followUpId: followUp.followUpId,
            content: followUp.content,
            generationStatus: followUp.generationStatus,
            policy: followUp.policy,
              answer: followUp.answer
              ? {
                  answerId: followUp.answer.answerId,
                  videoFileId: followUp.answer.videoFileId,
                  audioFileId: followUp.answer.audioFileId,
                  videoFile: toCompanyEvaluationFileAsset(followUp.answer.videoFile),
                  audioFile: toCompanyEvaluationFileAsset(followUp.answer.audioFile),
                  transcript: followUp.answer.transcript,
                  durationSeconds: followUp.answer.durationSeconds,
                  submittedAt: followUp.answer.submittedAt?.toISOString() ?? null,
                  nonverbalMetadata: followUp.answer.nonverbalMetadata ?? null,
                }
              : null,
          })),
        }))
      : [],
    report: latestReport
      ? {
          reportId: latestReport.reportId,
          status: latestReport.status,
          totalScore: latestReport.totalScore,
          adjustedTotalScore: integrityAdjustment?.adjustedTotalScore ?? latestReport.totalScore,
          integrityAdjustment,
          summary: latestReport.summary,
          generatedAt: latestReport.generatedAt?.toISOString() ?? null,
          scores: (latestReport.scores ?? []).filter((score) => !score.ncsProfileId).map((score) => ({
            scoreId: score.scoreId,
            criterionId: score.criterion?.criterionId ?? null,
            criterionName: score.criterion?.tagName ?? null,
            score: score.score,
            rationale: score.rationale,
            evidences: score.evidences.map((evidence) => ({
              evidenceId: evidence.evidenceId,
              evidenceText: evidence.evidenceText,
            })),
          })),
          ncsAnswerEvaluations: (latestReport.ncsAnswerEvaluations ?? []).map((evaluation) => ({
            ncsEvaluationId: evaluation.ncsEvaluationId,
            answerId: evaluation.answerId,
            sessionQuestionId: evaluation.sessionQuestionId,
            criterionId: evaluation.criterionId,
            criterionTitleSnapshot: evaluation.criterionTitleSnapshot,
            ncsProfileId: evaluation.ncsProfileId,
            ncsQuestionMode: evaluation.ncsQuestionMode,
            ncsProfileVersion: evaluation.ncsProfileVersion,
            scoreStatus: evaluation.scoreStatus,
            scores: {
              competency: evaluation.competencyScore,
              evidence: evaluation.evidenceScore,
              total: evaluation.totalScore,
            },
            coverage: evaluation.coverage,
            confidence: evaluation.confidence,
            rubricVersion: evaluation.rubricVersion,
            promptVersion: evaluation.promptVersion,
            providerMode: evaluation.providerMode,
            model: evaluation.modelName,
            result: evaluation.result,
            updatedAt: evaluation.updatedAt.toISOString(),
          })),
          ncsEvaluation: buildNcsReportEvaluation(application, latestReport, latestSession),
        }
      : null,
  };
}

const NCS_REPORT_PROFILE_IDS = [
  "JOB_TECHNICAL",
  "COLLABORATION_COMMUNICATION",
  "PROBLEM_SOLVING",
] as const;

const NCS_PROFILE_LABELS: Record<(typeof NCS_REPORT_PROFILE_IDS)[number], string> = {
  JOB_TECHNICAL: "기술·직무",
  COLLABORATION_COMMUNICATION: "협업·의사소통",
  PROBLEM_SOLVING: "문제 해결력",
};

const NCS_EVALUATION_SCOPE_NOTICE =
  "AI는 답변의 논리 구조와 NCS 행동 근거를 평가합니다. 기술적 사실 여부와 실제 경험의 진위는 확정하지 않으며 면접관 검토가 필요합니다.";

type ApplicantReportRecord = ApplicantRecord["evaluationReports"][number];
type ApplicantSessionRecord = ApplicantRecord["interviewSessions"][number];
type ApplicantNcsEvaluationRecord = NonNullable<ApplicantReportRecord["ncsAnswerEvaluations"]>[number];
type NcsReportProfileId = (typeof NCS_REPORT_PROFILE_IDS)[number];

function buildNcsReportEvaluation(
  application: ApplicantRecord,
  report: ApplicantReportRecord,
  session: ApplicantSessionRecord | null,
) {
  if (
    report.status !== "COMPLETED" ||
    !report.ncsCompletionStatus ||
    !report.ncsThresholdResult ||
    !report.ncsAiDecision ||
    !report.ncsDecisionReasonCode ||
    !report.ncsScoringVersion ||
    !report.ncsDecisionPolicyVersion
  ) {
    return null;
  }
  const reportSessionId = report.sessionId ?? session?.sessionId ?? null;
  if (!reportSessionId) return null;

  const evaluations = report.ncsAnswerEvaluations ?? [];
  const evidences = evaluations.flatMap((evaluation) =>
    (evaluation.evidences ?? []).map((evidence) => ({
      evidenceId: evidence.evidenceId,
      ncsEvaluationId: evaluation.ncsEvaluationId,
      ncsProfileId: canonicalReportProfileId(evaluation.ncsProfileId),
      sessionQuestionId: evaluation.sessionQuestionId,
      sourceAnswerId: evidence.sourceAnswerId,
      sourceKind: evidence.sourceKind === "FOLLOW_UP" ? "FOLLOW_UP" as const : "BASE" as const,
      quote: evidence.quote,
      sortOrder: evidence.sortOrder,
    })),
  );
  const summary = recordOf(report.ncsSummary);
  const isV2 = report.ncsScoringVersion === "NCS_RECRUITING_SCORING_V2" ||
    summary?.schemaVersion === "ncs-report-evaluation-output-v2";
  const summaryProfiles = arrayOfRecords(summary?.profiles);
  const activeProfileIds = isV2
    ? NCS_REPORT_PROFILE_IDS.filter((profileId) =>
        summaryProfiles.length > 0
          ? summaryProfiles.some((item) => nullableProfileId(item.ncsProfileId) === profileId)
          : (report.scores ?? []).some((score) =>
              typeof score.ncsProfileId === "string" && canonicalReportProfileId(score.ncsProfileId) === profileId,
            ),
      )
    : [...NCS_REPORT_PROFILE_IDS];
  const incompleteReasons = arrayOfRecords(summary?.incompleteReasons).map((item) => ({
    code: stringOf(item.code, "SESSION_SNAPSHOT_MISSING"),
    message: stringOf(item.message, "NCS 평가 입력 snapshot이 완전하지 않습니다."),
    ncsProfileId: nullableProfileId(item.ncsProfileId),
    sessionQuestionId: nullableNumber(item.sessionQuestionId),
    answerId: nullableNumber(item.answerId),
    retryable: item.retryable === true,
  }));
  const findings = activeProfileIds.flatMap((ncsProfileId) => {
    const profileEvidenceIds = evidences
      .filter((evidence) => evidence.ncsProfileId === ncsProfileId)
      .map((evidence) => evidence.evidenceId);
    const score = (report.scores ?? []).find((item) =>
      typeof item.ncsProfileId === "string" && canonicalReportProfileId(item.ncsProfileId) === ncsProfileId,
    );
    if (profileEvidenceIds.length === 0 || score?.averageScore == null) return [];
    const isStrength = score.averageScore >= (score.minimumAverageScore ?? 3);
    return [{
      findingId: `${isStrength ? "strength" : "gap"}-${ncsProfileId.toLowerCase()}`,
      type: isStrength ? "STRENGTH" as const : "GAP" as const,
      ncsProfileId,
      title: isStrength
        ? `${NCS_PROFILE_LABELS[ncsProfileId]} 근거가 기준 이상 확인되었습니다.`
        : `${NCS_PROFILE_LABELS[ncsProfileId]} 근거를 추가로 확인해야 합니다.`,
      detail: isStrength
        ? "답변 원문에서 확인된 행동과 논리 구조를 기준으로 산정했습니다."
        : "답변 원문 근거가 최소 기준에 미치지 않아 면접관 검토가 필요합니다.",
      evidenceIds: [...new Set(profileEvidenceIds)],
      generationMode: "DETERMINISTIC" as const,
    }];
  });
  const findingsByProfile = new Map(findings.map((finding) => [finding.ncsProfileId, finding.findingId]));
  const profileScores = activeProfileIds.map((ncsProfileId, index) => {
    const score = (report.scores ?? []).find((item) =>
      typeof item.ncsProfileId === "string" && canonicalReportProfileId(item.ncsProfileId) === ncsProfileId,
    );
    const status = score?.averageScore == null ? "INCOMPLETE" as const : "SCORED" as const;
    const findingId = findingsByProfile.get(ncsProfileId);
    const summaryProfile = summaryProfiles.find((item) => nullableProfileId(item.ncsProfileId) === ncsProfileId);
    return {
      ncsProfileId,
      profileOrder: (index + 1) as 1 | 2 | 3,
      displayName: NCS_PROFILE_LABELS[ncsProfileId],
      status,
      averageScore: score?.averageScore ?? null,
      normalizedScore: score?.normalizedScore ?? null,
      weight: score?.weight ?? 0,
      weightedScore: score?.weightedScore ?? null,
      minimumAverageScore: score?.minimumAverageScore ?? 3,
      assignedQuestionCount: score?.assignedQuestionCount ?? 0,
      validQuestionCount: score?.validQuestionCount ?? 0,
      requiredQuestionCount: isV2 ? (nullableNumber(summaryProfile?.requiredQuestionCount) ?? 1) : 2,
      findingIds: findingId ? [findingId] : [],
    };
  });
  const evaluationsByQuestion = new Map<number, ApplicantNcsEvaluationRecord[]>();
  for (const evaluation of evaluations) {
    const items = evaluationsByQuestion.get(evaluation.sessionQuestionId) ?? [];
    items.push(evaluation);
    evaluationsByQuestion.set(evaluation.sessionQuestionId, items);
  }
  const questions = [...evaluationsByQuestion.entries()]
    .map(([sessionQuestionId, items]) => buildNcsQuestionOutput(sessionQuestionId, items, session))
    .sort((left, right) => left.sortOrder - right.sortOrder);

  return {
    schemaVersion: isV2
      ? "ncs-report-evaluation-output-v2" as const
      : "ncs-report-evaluation-output-v1" as const,
    report: {
      reportId: report.reportId,
      applicationId: report.applicationId ?? application.applicationId,
      sessionId: reportSessionId,
      reportStatus: "COMPLETED" as const,
      generatedAt: report.generatedAt?.toISOString() ?? null,
    },
    policy: isV2 ? {
      evaluationFramework: "NCS_ACTIVE_PROFILE_V2" as const,
      scoringVersion: "NCS_RECRUITING_SCORING_V2" as const,
      decisionPolicyVersion: report.ncsDecisionPolicyVersion,
      scoreScale: 5 as const,
      overallPassScore: 80 as const,
      profileMinimumAverageScore: 3 as const,
      activeProfileCount: activeProfileIds.length,
    } : {
      scoringVersion: "NCS_RECRUITING_SCORING_V1" as const,
      decisionPolicyVersion: report.ncsDecisionPolicyVersion,
      scoreScale: 5 as const,
      overallPassScore: 80 as const,
      profileMinimumAverageScore: 3 as const,
      requiredQuestionCountPerProfile: 2 as const,
    },
    result: {
      completionStatus: report.ncsCompletionStatus,
      thresholdResult: report.ncsThresholdResult,
      aiDecision: report.ncsAiDecision,
      decisionReasonCode: report.ncsDecisionReasonCode,
      totalScore: report.totalScore,
    },
    profiles: profileScores,
    questions,
    evidences,
    findings,
    incompleteReasons,
    notices: [
      { code: "NCS_EVALUATION_SCOPE" as const, message: NCS_EVALUATION_SCOPE_NOTICE },
      ...(report.ncsCompletionStatus === "INCOMPLETE"
        ? [{
            code: "INCOMPLETE_FAIL_CLOSED" as const,
            message: "평가 미완료는 발표용 임시 정책에 따라 AI 추천 불합격으로 표시됩니다.",
          }]
        : []),
    ],
  };
}

function buildNcsQuestionOutput(
  sessionQuestionId: number,
  evaluations: ApplicantNcsEvaluationRecord[],
  session: ApplicantSessionRecord | null,
) {
  const first = evaluations[0]!;
  const question = first.sessionQuestion;
  const baseAnswer = session?.answers?.find((answer) => answer.answerId === first.answerId);
  const followUpQuestion = baseAnswer?.followUpQuestions.find((item) => item.policy === "RECRUITING") ?? null;
  const followUpAnswer = followUpQuestion?.answer ?? null;
  const recoveredCount = evaluations.filter((evaluation) =>
    evaluation.followUpApplied &&
    evaluation.baseScore !== null &&
    evaluation.baseScore !== undefined &&
    evaluation.effectiveScore !== null &&
    evaluation.effectiveScore !== undefined &&
    evaluation.effectiveScore > evaluation.baseScore,
  ).length;
  const fullyRecovered = recoveredCount > 0 && evaluations.every((evaluation) => evaluation.effectiveScore === 5);
  return {
    sessionQuestionId,
    runtimeQuestionId: question?.runtimeQuestionId ?? sessionQuestionId,
    questionSource: question?.generationSource === "RESUME_PERSONALIZED"
      ? "RESUME_PERSONALIZED" as const
      : "JD_CRITERIA" as const,
    questionText: question?.content ?? baseAnswer?.questionContent ?? "",
    questionMode: question?.ncsQuestionMode ?? first.ncsQuestionMode,
    sortOrder: question?.sortOrder ?? sessionQuestionId,
    baseAnswerId: first.answerId,
    profileEvaluations: evaluations.map((evaluation) => ({
      ncsEvaluationId: evaluation.ncsEvaluationId,
      ncsProfileId: canonicalReportProfileId(evaluation.ncsProfileId),
      scoreStatus: normalizeNcsScoreStatus(evaluation.scoreStatus),
      behaviorPoints: evaluation.behaviorPoints ?? null,
      logicPoints: evaluation.logicPoints ?? null,
      baseScore: evaluation.baseScore ?? null,
      effectiveScore: evaluation.effectiveScore ?? null,
      followUpApplied: evaluation.followUpApplied ?? false,
      confidence: normalizeNcsConfidence(evaluation.confidence),
      rationale: evaluationRationale(evaluation),
      evidenceIds: (evaluation.evidences ?? []).map((evidence) => evidence.evidenceId),
      incompleteReasonCodes: evaluation.scoreStatus === "SCORED"
        ? []
        : [evaluation.scoreStatus === "LOW_ALIGNMENT" ? "LOW_ALIGNMENT" : "INSUFFICIENT_INPUT"],
    })),
    followUp: followUpQuestion
      ? {
          followUpQuestionId: followUpQuestion.followUpId,
          followUpAnswerId: followUpAnswer?.answerId ?? null,
          questionText: followUpQuestion.content,
          answerTimeSec: session?.answerTimeSecSnapshot ?? 90,
          answerStatus: !followUpAnswer
            ? "NOT_ANSWERED" as const
            : fullyRecovered
              ? "RECOVERED" as const
              : recoveredCount > 0
                ? "PARTIALLY_RECOVERED" as const
                : "NOT_RECOVERED" as const,
        }
      : null,
  };
}

function canonicalReportProfileId(value: unknown): NcsReportProfileId {
  if (value === "DIGITAL" || value === "JOB_TECHNICAL") return "JOB_TECHNICAL";
  if (value === "COMMUNICATION" || value === "COLLABORATION_COMMUNICATION") {
    return "COLLABORATION_COMMUNICATION";
  }
  return "PROBLEM_SOLVING";
}

function normalizeNcsScoreStatus(value: string) {
  if (value === "SCORED" || value === "INSUFFICIENT_INPUT" || value === "LOW_ALIGNMENT") return value;
  return "BLOCKED" as const;
}

function normalizeNcsConfidence(value: string) {
  if (value === "HIGH" || value === "MEDIUM" || value === "LOW") return value;
  return null;
}

function evaluationRationale(evaluation: ApplicantNcsEvaluationRecord): string | null {
  const result = recordOf(evaluation.result);
  const competencies = arrayOfRecords(result?.competencies);
  const target = canonicalReportProfileId(evaluation.ncsProfileId);
  const competency = competencies.find((item) =>
    typeof item.profileId === "string" && canonicalReportProfileId(item.profileId) === target,
  );
  return competency ? stringOf(competency.rationale, null) : null;
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function arrayOfRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(recordOf).filter((item): item is Record<string, unknown> => item !== null) : [];
}

function stringOf(value: unknown, fallback: string): string;
function stringOf(value: unknown, fallback: null): string | null;
function stringOf(value: unknown, fallback: string | null): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function nullableProfileId(value: unknown): NcsReportProfileId | null {
  return typeof value === "string" ? canonicalReportProfileId(value) : null;
}

function toCompanyEvaluationFileAsset(fileAsset: CompanyFileAssetRecord | null | undefined) {
  if (!fileAsset) {
    return null;
  }
  return {
    fileId: fileAsset.fileId,
    ownerUserId: fileAsset.ownerUserId,
    storageKey: fileAsset.storageKey,
    originalName: fileAsset.originalName,
    mimeType: fileAsset.mimeType,
    sizeBytes: fileAsset.sizeBytes,
    status: fileAsset.status,
    createdAt: fileAsset.createdAt.toISOString(),
  };
}

type ApplicantEvaluationAnswerRecord = NonNullable<ApplicantRecord["interviewSessions"][number]["answers"]>[number];
type RecruitingIntegrityLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH";

type RecruitingIntegrityCounts = {
  screenAway: number;
  cameraLost: number;
  faceMissing: number;
  faceOutOfFrame: number;
  multipleFaces: number;
  facePositionShift: number;
  gazeAway: number;
  voiceMouthMismatch: number;
  voiceWithoutFace: number;
  staticVideoFrame: number;
  earlyScreenAway: number;
};

function buildRecruitingIntegrityReference(answers: ApplicantEvaluationAnswerRecord[], rawTotalScore: number | null) {
  const answerMetadataById = new Map<number, Record<string, unknown>>();

  for (const answer of answers) {
    collectAnswerMetadata(answerMetadataById, answer.answerId, answer.nonverbalMetadata);
    for (const followUp of answer.followUpQuestions) {
      if (followUp.answer) {
        collectAnswerMetadata(answerMetadataById, followUp.answer.answerId, followUp.answer.nonverbalMetadata);
      }
    }
  }

  const evaluations = [...answerMetadataById.values()].map(evaluateRecruitingIntegrityMetadata);
  const hasSignal = evaluations.some((evaluation) => evaluation.level !== "NONE");
  const hasHigh = evaluations.some((evaluation) => evaluation.level === "HIGH");
  const hasMedium = evaluations.some((evaluation) => evaluation.level === "MEDIUM");
  const level: RecruitingIntegrityLevel = hasHigh
    ? "HIGH"
    : hasMedium
      ? "MEDIUM"
      : hasSignal
        ? "LOW"
        : "NONE";
  const reasons = [...new Set(evaluations.flatMap((evaluation) => evaluation.reasons))];

  return {
    rawTotalScore,
    adjustedTotalScore: rawTotalScore,
    penalty: 0,
    scoreApplied: false,
    source: "CLIENT_RUNTIME_UNVERIFIED" as const,
    level,
    reasons,
    reason: buildRecruitingIntegrityReferenceReason(level, reasons),
  };
}

function collectAnswerMetadata(target: Map<number, Record<string, unknown>>, answerId: number, metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) return;
  target.set(answerId, metadata);
}

function evaluateRecruitingIntegrityMetadata(metadata: Record<string, unknown>) {
  const counts = readRecruitingIntegrityCounts(metadata);
  const reasons = buildRecruitingIntegrityReasons(counts);
  const hasSignal = reasons.length > 0;

  if (!hasSignal) {
    return { level: "NONE" as RecruitingIntegrityLevel, reasons: [] };
  }

  const severeFaceSignal = counts.faceMissing + counts.faceOutOfFrame >= 2 || counts.cameraLost >= 2;
  const severeAudioVisualSignal = counts.voiceMouthMismatch >= 2 || counts.voiceWithoutFace >= 2 || counts.staticVideoFrame > 0;
  const high =
    counts.screenAway >= 4 ||
    counts.multipleFaces > 0 ||
    counts.facePositionShift > 0 ||
    severeFaceSignal ||
    severeAudioVisualSignal;
  if (high) {
    return { level: "HIGH" as RecruitingIntegrityLevel, reasons };
  }

  const medium =
    counts.screenAway >= 2 ||
    counts.gazeAway >= 2 ||
    counts.cameraLost > 0 ||
    counts.faceMissing > 0 ||
    counts.faceOutOfFrame > 0 ||
    counts.voiceMouthMismatch > 0 ||
    counts.voiceWithoutFace > 0 ||
    counts.earlyScreenAway >= 2;
  if (medium) {
    return { level: "MEDIUM" as RecruitingIntegrityLevel, reasons };
  }

  return { level: "LOW" as RecruitingIntegrityLevel, reasons };
}

function readRecruitingIntegrityCounts(metadata: Record<string, unknown>): RecruitingIntegrityCounts {
  return {
    screenAway: Math.max(readSummaryCount(metadata, "screenAwayCount"), readEventCount(metadata, ["TAB_HIDDEN", "WINDOW_BLUR"])),
    cameraLost: Math.max(readSummaryCount(metadata, "cameraLostCount"), readEventCount(metadata, ["CAMERA_LOST"])),
    faceMissing: Math.max(readSummaryCount(metadata, "faceMissingCount"), readEventCount(metadata, ["FACE_MISSING"])),
    faceOutOfFrame: Math.max(readSummaryCount(metadata, "faceOutOfFrameCount"), readEventCount(metadata, ["FACE_OUT_OF_FRAME"])),
    multipleFaces: Math.max(readSummaryCount(metadata, "multipleFacesCount"), readEventCount(metadata, ["MULTIPLE_FACES"])),
    facePositionShift: Math.max(readSummaryCount(metadata, "facePositionShiftCount"), readEventCount(metadata, ["FACE_POSITION_SHIFT"])),
    gazeAway: Math.max(readSummaryCount(metadata, "gazeAwayCount"), readEventCount(metadata, ["GAZE_AWAY"])),
    voiceMouthMismatch: Math.max(readSummaryCount(metadata, "voiceMouthMismatchCount"), readEventCount(metadata, ["VOICE_MOUTH_MISMATCH"])),
    voiceWithoutFace: Math.max(readSummaryCount(metadata, "voiceWithoutFaceCount"), readEventCount(metadata, ["VOICE_WITHOUT_FACE"])),
    staticVideoFrame: Math.max(readSummaryCount(metadata, "staticVideoFrameCount"), readEventCount(metadata, ["STATIC_VIDEO_FRAME"])),
    earlyScreenAway: Math.max(readSummaryCount(metadata, "earlyScreenAwayCount"), readEventCount(metadata, ["EARLY_SCREEN_AWAY"])),
  };
}

function buildRecruitingIntegrityReasons(counts: RecruitingIntegrityCounts) {
  const reasons: string[] = [];
  if (counts.screenAway > 0) reasons.push(`화면/탭 이탈 ${counts.screenAway}회`);
  if (counts.earlyScreenAway > 0) reasons.push(`질문 직후 화면 이탈 ${counts.earlyScreenAway}회`);
  if (counts.cameraLost > 0) reasons.push(`카메라 연결 이탈 ${counts.cameraLost}회`);
  if (counts.faceMissing > 0) reasons.push(`얼굴 미검출 ${counts.faceMissing}회`);
  if (counts.faceOutOfFrame > 0) reasons.push(`얼굴 화면 밖 ${counts.faceOutOfFrame}회`);
  if (counts.multipleFaces > 0) reasons.push(`여러 사람 감지 ${counts.multipleFaces}회`);
  if (counts.facePositionShift > 0) reasons.push(`얼굴 위치 급변 ${counts.facePositionShift}회`);
  if (counts.gazeAway > 0) reasons.push(`시선 이탈 ${counts.gazeAway}회`);
  if (counts.voiceMouthMismatch > 0) reasons.push(`음성-입모양 불일치 ${counts.voiceMouthMismatch}회`);
  if (counts.voiceWithoutFace > 0) reasons.push(`얼굴 미검출 중 음성 입력 ${counts.voiceWithoutFace}회`);
  if (counts.staticVideoFrame > 0) reasons.push(`영상 프레임 고정 ${counts.staticVideoFrame}회`);
  return reasons;
}

function buildRecruitingIntegrityReferenceReason(level: RecruitingIntegrityLevel, reasons: string[]) {
  if (level === "NONE") {
    return "브라우저에서 수집된 응시 무결성 참고 신호가 없습니다. 이 정보는 평가 점수에 반영되지 않습니다.";
  }
  return `브라우저에서 수집된 미검증 참고 신호입니다. 부정행위로 단정할 수 없으며 평가 점수에는 반영하지 않았습니다. ${reasons.join(", ")}`;
}

function readSummaryCount(metadata: Record<string, unknown>, key: string) {
  const summary = readRecord(metadata.integritySummary);
  return readNumber(summary?.[key]);
}

function readEventCount(metadata: Record<string, unknown>, types: string[]) {
  const events = Array.isArray(metadata.integrityEvents) ? metadata.integrityEvents : [];
  return events.filter((event) => {
    const record = readRecord(event);
    return typeof record?.type === "string" && types.includes(record.type);
  }).length;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toPublicApplicationStatusResponse(application: ApplicantRecord, interviewEntry: ReturnType<PublicInterviewEntryAdapterPort["buildEntry"]>) {
  return {
    applicationId: application.applicationId,
    recruitmentId: application.postingId,
    email: application.candidate.user.email,
    name: application.candidate.user.name,
    jobRole: application.posting.jobRole,
    applicationStatus: application.applicationStatus,
    documentStatus: application.documentStatus,
    interviewStatus: application.interviewStatus,
    reportStatus: application.reportStatus,
    interviewEntry,
    submittedAt: application.submittedAt?.toISOString() ?? null,
    updatedAt: application.updatedAt.toISOString(),
  };
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
