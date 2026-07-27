import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { ERROR_CODES, type CurrentUser, type ErrorCode } from "@init/common";

import { ApiException as SharedApiException } from "../../../shared/api-exception";
import type { UpdateCompanyProfileDto } from "../dto/update-company-profile.dto";
import type {
  CompanyLogoUploadFile,
  CompanyProfileFileAssetRecord,
  CompanyProfileRecord,
  CompanyProfileResponse,
} from "../company-profile.types";

class CompanyProfileException extends SharedApiException {
  constructor(status: number, code: ErrorCode, message: string, details: Array<Record<string, unknown>> = []) {
    super(code, message, status, details);
  }
}

export type UpdateCompanyProfileInput = {
  name: string;
  industry: string | null;
  profile: string | null;
  talentProfile: string | null;
  evaluationPolicy: string | null;
};

export type CreateCompanyProfileFileAssetInput = {
  ownerUserId: number;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

export type CompanyProfileRepositoryPort = {
  findCompanyProfile(companyId: number): Promise<CompanyProfileRecord | null>;
  updateCompanyProfile(companyId: number, input: UpdateCompanyProfileInput): Promise<CompanyProfileRecord | null>;
  createFileAsset(input: CreateCompanyProfileFileAssetInput): Promise<CompanyProfileFileAssetRecord>;
  updateCompanyLogoFileId(companyId: number, logoFileId: number): Promise<CompanyProfileRecord | null>;
};

export type CompanyProfileStoragePutObjectInput = {
  key: string;
  body: Buffer;
  contentType: string;
  contentLength: number;
};

export type CompanyProfileStorageAdapterPort = {
  putObject(input: CompanyProfileStoragePutObjectInput): Promise<void>;
};

export type CompanyProfileUploadConfig = {
  publicBaseUrl?: string;
  logoMaxUploadBytes?: number;
};

const ALLOWED_LOGO_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const DEFAULT_LOGO_MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

class MissingCompanyProfileStorageAdapter implements CompanyProfileStorageAdapterPort {
  async putObject(): Promise<void> {
    throw new CompanyProfileException(500, ERROR_CODES.COMMON_VALIDATION_FAILED, "파일 저장소 설정이 필요합니다.");
  }
}

@Injectable()
export class CompanyProfileService {
  constructor(
    private readonly repository: CompanyProfileRepositoryPort,
    private readonly storageAdapter: CompanyProfileStorageAdapterPort = new MissingCompanyProfileStorageAdapter(),
    private readonly uploadConfig: CompanyProfileUploadConfig = {},
  ) {}

  async getProfile(user: CurrentUser): Promise<CompanyProfileResponse> {
    const companyId = requireCompanyId(user);
    const company = await this.repository.findCompanyProfile(companyId);
    return toCompanyProfileResponse(requireCompanyProfile(company), this.uploadConfig.publicBaseUrl);
  }

  async updateProfile(user: CurrentUser, dto: UpdateCompanyProfileDto): Promise<CompanyProfileResponse> {
    const companyId = requireCompanyId(user);
    const input = normalizeUpdateCompanyProfileInput(dto);
    const company = await this.repository.updateCompanyProfile(companyId, input);
    return toCompanyProfileResponse(requireCompanyProfile(company), this.uploadConfig.publicBaseUrl);
  }

  async uploadLogo(user: CurrentUser, file: CompanyLogoUploadFile | undefined): Promise<CompanyProfileResponse> {
    const companyId = requireCompanyId(user);
    await this.ensureCompanyProfile(companyId);
    this.assertLogoFile(file);

    const storageKey = buildLogoStorageKey(companyId, file.originalName);
    await this.storageAdapter.putObject({
      key: storageKey,
      body: file.buffer,
      contentType: file.mimeType,
      contentLength: file.sizeBytes,
    });
    const fileAsset = await this.repository.createFileAsset({
      ownerUserId: user.userId,
      storageKey,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    });
    const company = await this.repository.updateCompanyLogoFileId(companyId, fileAsset.fileId);
    return toCompanyProfileResponse(requireCompanyProfile(company), this.uploadConfig.publicBaseUrl);
  }

  private async ensureCompanyProfile(companyId: number) {
    requireCompanyProfile(await this.repository.findCompanyProfile(companyId));
  }

  private assertLogoFile(file: CompanyLogoUploadFile | undefined): asserts file is CompanyLogoUploadFile {
    if (
      !file ||
      !file.originalName?.trim() ||
      !file.mimeType?.trim() ||
      !Buffer.isBuffer(file.buffer) ||
      file.sizeBytes < 1
    ) {
      throw new CompanyProfileException(400, ERROR_CODES.COMMON_VALIDATION_FAILED, "업로드할 로고 파일을 선택해주세요.", [
        { field: "file", reason: "REQUIRED" },
      ]);
    }
    if (!ALLOWED_LOGO_MIME_TYPES.has(file.mimeType)) {
      throw new CompanyProfileException(400, ERROR_CODES.FILE_INVALID_TYPE, "PNG, JPG, WEBP 이미지만 업로드할 수 있습니다.", [
        { field: "file", reason: "INVALID_MIME_TYPE", allowedMimeTypes: [...ALLOWED_LOGO_MIME_TYPES] },
      ]);
    }
    const maxUploadBytes = this.uploadConfig.logoMaxUploadBytes ?? getConfiguredLogoMaxUploadBytes();
    if (file.sizeBytes > maxUploadBytes) {
      throw new CompanyProfileException(400, ERROR_CODES.FILE_SIZE_EXCEEDED, "로고 파일 용량이 너무 큽니다.", [
        { field: "file", reason: "SIZE_EXCEEDED", maxSizeBytes: maxUploadBytes },
      ]);
    }
  }
}

function requireCompanyId(user: CurrentUser): number {
  if (user.userType !== "COMPANY" || !user.companyId) {
    throw new CompanyProfileException(403, ERROR_CODES.COMMON_FORBIDDEN, "기업 사용자만 접근할 수 있습니다.");
  }
  return user.companyId;
}

function requireCompanyProfile(company: CompanyProfileRecord | null): CompanyProfileRecord {
  if (!company) {
    throw new CompanyProfileException(404, ERROR_CODES.COMMON_NOT_FOUND, "회사 정보를 찾을 수 없습니다.");
  }
  return company;
}

function normalizeUpdateCompanyProfileInput(dto: UpdateCompanyProfileDto): UpdateCompanyProfileInput {
  const name = normalizeOptionalString(dto.name);
  if (!name) {
    throw new CompanyProfileException(400, ERROR_CODES.COMMON_VALIDATION_FAILED, "회사명을 입력해주세요.", [
      { field: "name", reason: "REQUIRED" },
    ]);
  }
  return {
    name,
    industry: normalizeNullableString(dto.industry),
    profile: normalizeNullableString(dto.profile),
    talentProfile: normalizeNullableString(dto.talentProfile),
    evaluationPolicy: normalizeNullableString(dto.evaluationPolicy),
  };
}

function normalizeOptionalString(value: string | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNullableString(value: string | undefined) {
  const normalized = normalizeOptionalString(value);
  return normalized || null;
}

export function getConfiguredLogoMaxUploadBytes() {
  const parsed = Number(process.env.COMPANY_LOGO_MAX_UPLOAD_BYTES ?? DEFAULT_LOGO_MAX_UPLOAD_BYTES);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LOGO_MAX_UPLOAD_BYTES;
}

function buildLogoStorageKey(companyId: number, originalName: string) {
  return `company/${companyId}/profile-logo/${randomUUID()}-${sanitizeFileName(originalName)}`;
}

function sanitizeFileName(originalName: string) {
  const fileName = originalName.trim().split(/[/\\]/).pop() ?? "logo";
  const sanitized = fileName
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "logo";
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

function toCompanyProfileResponse(company: CompanyProfileRecord, publicBaseUrl: string | undefined): CompanyProfileResponse {
  return {
    companyId: company.companyId,
    ownerUserId: company.ownerUserId,
    name: company.name,
    businessRegistrationNumber: company.businessRegistrationNumber,
    verificationStatus: company.verificationStatus,
    logoFileId: company.logoFileId,
    logoUrl: company.logoStorageKey ? buildPublicFileUrl(company.logoStorageKey, publicBaseUrl) : null,
    industry: company.industry,
    profile: company.profile,
    talentProfile: company.talentProfile,
    evaluationPolicy: company.evaluationPolicy,
    createdAt: company.createdAt,
    updatedAt: company.updatedAt,
  };
}
