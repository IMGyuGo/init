import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../../shared/prisma.service";
import type { CompanyProfileFileAssetRecord, CompanyProfileRecord } from "../company-profile.types";
import type {
  CompanyProfileRepositoryPort,
  CreateCompanyProfileFileAssetInput,
  UpdateCompanyProfileInput,
} from "../service/company-profile.service";

@Injectable()
export class PrismaCompanyProfileRepository implements CompanyProfileRepositoryPort {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findCompanyProfile(companyId: number): Promise<CompanyProfileRecord | null> {
    const company = await this.prisma.company.findUnique({
      where: { companyId: BigInt(companyId) },
      include: { logoFile: true },
    });
    return company ? mapCompanyProfile(company) : null;
  }

  async updateCompanyProfile(companyId: number, input: UpdateCompanyProfileInput): Promise<CompanyProfileRecord | null> {
    const existing = await this.prisma.company.findUnique({
      where: { companyId: BigInt(companyId) },
      select: { companyId: true },
    });
    if (!existing) {
      return null;
    }

    const company = await this.prisma.company.update({
      where: { companyId: BigInt(companyId) },
      data: input,
      include: { logoFile: true },
    });
    return mapCompanyProfile(company);
  }

  async createFileAsset(input: CreateCompanyProfileFileAssetInput): Promise<CompanyProfileFileAssetRecord> {
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
    return mapFileAsset(fileAsset);
  }

  async updateCompanyLogoFileId(companyId: number, logoFileId: number): Promise<CompanyProfileRecord | null> {
    const existing = await this.prisma.company.findUnique({
      where: { companyId: BigInt(companyId) },
      select: { companyId: true },
    });
    if (!existing) {
      return null;
    }

    const company = await this.prisma.company.update({
      where: { companyId: BigInt(companyId) },
      data: { logoFileId: BigInt(logoFileId) },
      include: { logoFile: true },
    });
    return mapCompanyProfile(company);
  }
}

type CompanyWithLogoFile = Prisma.CompanyGetPayload<{ include: { logoFile: true } }>;
type FileAssetRecord = Prisma.FileAssetGetPayload<Record<string, never>>;

function mapCompanyProfile(company: CompanyWithLogoFile): CompanyProfileRecord {
  return {
    companyId: Number(company.companyId),
    ownerUserId: Number(company.ownerUserId),
    name: company.name,
    businessRegistrationNumber: company.businessRegistrationNumber,
    verificationStatus: company.verificationStatus,
    logoFileId: company.logoFileId === null ? null : Number(company.logoFileId),
    logoStorageKey: company.logoFile?.storageKey ?? null,
    industry: company.industry,
    profile: company.profile,
    talentProfile: company.talentProfile,
    evaluationPolicy: company.evaluationPolicy,
    createdAt: company.createdAt,
    updatedAt: company.updatedAt,
  };
}

function mapFileAsset(fileAsset: FileAssetRecord): CompanyProfileFileAssetRecord {
  return {
    fileId: Number(fileAsset.fileId),
    ownerUserId: Number(fileAsset.ownerUserId),
    storageKey: fileAsset.storageKey,
    originalName: fileAsset.originalName,
    mimeType: fileAsset.mimeType,
    sizeBytes: Number(fileAsset.sizeBytes),
    status: fileAsset.status,
    createdAt: fileAsset.createdAt,
  };
}
