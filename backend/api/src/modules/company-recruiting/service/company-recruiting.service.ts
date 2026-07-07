import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
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
import type { ListQueryDto } from "../dto/list-query.dto";
import type { RequestPublicApplicationAccessLinkDto } from "../dto/request-public-application-access-link.dto";
import type { SubmitPublicApplicationDto } from "../dto/submit-public-application.dto";
import type { UpdateRecruitmentDto } from "../dto/update-recruitment.dto";
import type { UpdateScreeningStatusDto } from "../dto/update-screening-status.dto";
import type { CompanyRecruitingRepositoryPort } from "../repository/company-recruiting.repository";
import type {
  ApplicantRecord,
  JobDescriptionImageUploadFile,
  JobDescriptionImageUploadResponse,
  NormalizedListQuery,
  PublicApplicationDocumentUploadFile,
  PublicRecruitmentRecord,
  RecruitmentRecord,
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

export type CompanyRecruitingStorageAdapterPort = {
  putObject(input: CompanyRecruitingStoragePutObjectInput): Promise<void>;
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

type PublicApplicationDocumentUploadFiles = {
  resumeFile?: PublicApplicationDocumentUploadFile;
  portfolioFile?: PublicApplicationDocumentUploadFile;
};

class MissingCompanyRecruitingStorageAdapter implements CompanyRecruitingStorageAdapterPort {
  async putObject(): Promise<void> {
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
  ) {}

  async createRecruitment(user: CurrentUser, dto: CreateRecruitmentDto) {
    const companyId = requireCompanyId(user);
    const startsOn = parseOptionalDate(dto.startsOn, "startsOn");
    const endsOn = parseOptionalDate(dto.endsOn, "endsOn");
    if (startsOn && endsOn && startsOn > endsOn) {
      throw new CompanyRecruitingException(400, ERROR_CODES.COMMON_VALIDATION_FAILED, "채용 시작일은 마감일보다 늦을 수 없습니다.", [
        { field: "startsOn", reason: "AFTER_ENDS_ON" },
      ]);
    }

    const posting = await this.repository.createPosting({
      companyId,
      title: dto.title.trim(),
      jobRole: dto.jobRole.trim(),
      jobDescription: dto.jobDescription?.trim() || null,
      ...buildPostingExtraInfoInput(dto),
      startsOn,
      endsOn,
      status: (dto.status ?? PostingStatus.DRAFT) as PostingStatus,
    });
    return toRecruitmentResponse(posting);
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

    const updated = await this.repository.updatePosting(recruitmentId, companyId, {
      title: dto.title.trim(),
      jobRole: dto.jobRole.trim(),
      jobDescription: dto.jobDescription?.trim() || null,
      ...buildPostingExtraInfoInput(dto),
      startsOn,
      endsOn,
      status: dto.status ? parseEditablePostingStatus(dto.status) : (posting.status as PostingStatus),
    });

    if (!updated) {
      throw new CompanyRecruitingException(404, ERROR_CODES.COMMON_NOT_FOUND, "공고를 찾을 수 없습니다.");
    }
    return toRecruitmentResponse(updated);
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
    await this.assertPublicApplicationEmailIsNew(email);
    this.assertPublicApplicationDocumentFile(files.resumeFile, "resumeFile", "이력서 PDF 파일을 업로드해주세요.");
    if (files.portfolioFile) {
      this.assertPublicApplicationDocumentFile(files.portfolioFile, "portfolioFile", "포트폴리오 PDF 파일을 확인해주세요.");
    }

    try {
      const candidate = await this.repository.findOrCreatePublicCandidate({
        name: dto.name.trim(),
        email,
        phone: normalizeNullableString(dto.phone),
        githubUrl: normalizeNullableString(dto.githubBlogUrl),
        portfolioUrl: normalizeNullableString(dto.portfolioUrl),
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
      startsOn: null,
      endsOn: null,
      status: PostingStatus.DRAFT,
    });
    return toRecruitmentResponse(copied);
  }

  async listRecruitmentApplicants(user: CurrentUser, recruitmentId: number, query: ListQueryDto) {
    const companyId = requireCompanyId(user);
    const posting = await this.repository.findPostingForCompany(recruitmentId, companyId);
    if (!posting) {
      throw new CompanyRecruitingException(404, ERROR_CODES.COMMON_NOT_FOUND, "공고를 찾을 수 없습니다.");
    }
    const normalized = normalizeListQuery(query, "updatedAt");
    const [items, totalItems] = await Promise.all([
      this.repository.listApplicationsForPosting(recruitmentId, companyId, normalized),
      this.repository.countApplicationsForPosting(recruitmentId, companyId, normalized),
    ]);
    return {
      items: items.map(toApplicantResponse),
      page: buildPageMeta(normalized.page, normalized.limit, totalItems),
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

  async updateScreeningStatus(user: CurrentUser, applicantId: number, dto: UpdateScreeningStatusDto) {
    const companyId = requireCompanyId(user);
    const screeningDecision = parseScreeningDecision(dto.screeningDecision);
    const application = await this.repository.updateApplicationScreening(applicantId, companyId, {
      screeningDecision,
      screeningMemo: dto.screeningMemo?.trim() || null,
    });

    if (!application) {
      throw new CompanyRecruitingException(404, ERROR_CODES.COMMON_NOT_FOUND, "지원자를 찾을 수 없습니다.");
    }

    return toApplicantResponse(application);
  }

  private async assertPublicApplicationEmailIsNew(email: string) {
    const account = await this.repository.findUserAccountByEmail(email);
    if (!account) {
      return;
    }
    if (account.userType !== UserType.CANDIDATE) {
      throw new CompanyRecruitingException(409, ERROR_CODES.COMMON_CONFLICT, "지원자 계정이 아닌 이메일은 공개 지원에 사용할 수 없습니다.", [
        { field: "email", reason: "USER_TYPE_MISMATCH" },
      ]);
    }
    throw new CompanyRecruitingException(409, ERROR_CODES.COMMON_CONFLICT, "이미 가입된 이메일은 공개 지원 폼에서 사용할 수 없습니다.", [
      { field: "email", reason: "EXISTING_USER_REQUIRES_VERIFICATION" },
    ]);
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

function requireCompanyId(user: CurrentUser): number {
  if (user.userType !== "COMPANY" || !user.companyId) {
    throw new CompanyRecruitingException(403, ERROR_CODES.COMMON_FORBIDDEN, "기업 사용자만 접근할 수 있습니다.");
  }
  return user.companyId;
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
    name: application.candidate.user.name,
    email: application.candidate.user.email,
    phone: application.candidate.user.phone,
    jobRole: application.posting.jobRole,
    applicationStatus: application.applicationStatus,
    documentStatus: application.documentStatus,
    interviewStatus: application.interviewStatus,
    reportStatus: latestReport?.status ?? application.reportStatus,
    screeningDecision: application.screeningDecision ?? "UNDECIDED",
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
      memo: application.screeningMemo,
    },
    reportAvailability: latestReport ? "AVAILABLE" : "NONE_OR_GENERATING",
    answers: latestSession
      ? (latestSession.answers ?? []).map((answer) => ({
          answerId: answer.answerId,
          questionId: answer.questionId,
          questionType: answer.questionType,
          questionContent: answer.questionContent,
          transcript: answer.transcript,
          durationSeconds: answer.durationSeconds,
          submittedAt: answer.submittedAt?.toISOString() ?? null,
          followUpQuestions: answer.followUpQuestions.map((followUp) => ({
            followUpId: followUp.followUpId,
            content: followUp.content,
            generationStatus: followUp.generationStatus,
            policy: followUp.policy,
            answer: followUp.answer
              ? {
                  answerId: followUp.answer.answerId,
                  transcript: followUp.answer.transcript,
                  durationSeconds: followUp.answer.durationSeconds,
                  submittedAt: followUp.answer.submittedAt?.toISOString() ?? null,
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
          summary: latestReport.summary,
          generatedAt: latestReport.generatedAt?.toISOString() ?? null,
          scores: (latestReport.scores ?? []).map((score) => ({
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
        }
      : null,
  };
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
