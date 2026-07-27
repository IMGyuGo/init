import assert from "node:assert/strict";
import { describe, it } from "@jest/globals";
import type { CurrentUser } from "@init/common";

import {
  CompanyProfileService,
  type CompanyProfileRepositoryPort,
  type CompanyProfileStorageAdapterPort,
} from "./company-profile.service";
import type { CompanyProfileRecord } from "../company-profile.types";

const companyUser: CurrentUser = {
  userId: 1,
  userType: "COMPANY",
  companyId: 7,
  candidateId: null,
};

const baseCompany: CompanyProfileRecord = {
  companyId: 7,
  ownerUserId: 1,
  name: "Init Labs",
  businessRegistrationNumber: "1234567890",
  verificationStatus: "VERIFIED",
  logoFileId: null,
  logoStorageKey: null,
  industry: "IT",
  profile: "AI interview platform.",
  talentProfile: "Clear communicators.",
  evaluationPolicy: "Technical 60, collaboration 40.",
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-01T00:00:00.000Z"),
};

function createRepository(company: CompanyProfileRecord | null = baseCompany) {
  const calls: {
    updateProfile?: unknown;
    createFileAsset?: unknown;
    updateLogoFileId?: unknown;
  } = {};
  const repository: CompanyProfileRepositoryPort = {
    async findCompanyProfile(companyId) {
      assert.equal(companyId, 7);
      return company;
    },
    async updateCompanyProfile(companyId, input) {
      assert.equal(companyId, 7);
      calls.updateProfile = input;
      return company ? { ...company, ...input, updatedAt: new Date("2026-07-02T00:00:00.000Z") } : null;
    },
    async createFileAsset(input) {
      calls.createFileAsset = input;
      return {
        fileId: 77,
        ownerUserId: Number(input.ownerUserId),
        storageKey: input.storageKey,
        originalName: input.originalName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        status: "UPLOADED",
        createdAt: new Date("2026-07-02T00:00:00.000Z"),
      };
    },
    async updateCompanyLogoFileId(companyId, logoFileId) {
      assert.equal(companyId, 7);
      calls.updateLogoFileId = logoFileId;
      return company
        ? {
            ...company,
            logoFileId,
            logoStorageKey: "company/7/profile-logo/logo.png",
            updatedAt: new Date("2026-07-02T00:00:00.000Z"),
          }
        : null;
    },
  };
  return { repository, calls };
}

function createStorage() {
  const puts: unknown[] = [];
  const storage: CompanyProfileStorageAdapterPort = {
    async putObject(input) {
      puts.push(input);
    },
  };
  return { storage, puts };
}

describe("CompanyProfileService", () => {
  it("returns the current company profile with a public logo URL", async () => {
    const { repository } = createRepository({
      ...baseCompany,
      logoFileId: 11,
      logoStorageKey: "company/7/profile-logo/logo.png",
    });
    const service = new CompanyProfileService(repository, createStorage().storage, {
      publicBaseUrl: "http://localhost:14566/init-local-assets",
    });

    const result = await service.getProfile(companyUser);

    assert.equal(result.companyId, 7);
    assert.equal(result.logoFileId, 11);
    assert.equal(result.logoUrl, "http://localhost:14566/init-local-assets/company/7/profile-logo/logo.png");
  });

  it("updates editable company profile fields after trimming input", async () => {
    const { repository, calls } = createRepository();
    const service = new CompanyProfileService(repository, createStorage().storage);

    const result = await service.updateProfile(companyUser, {
      name: "  Init Corp  ",
      industry: "  AI  ",
      profile: "  Company profile  ",
      talentProfile: "  Talent profile  ",
      evaluationPolicy: "  Evaluation policy  ",
    });

    assert.deepEqual(calls.updateProfile, {
      name: "Init Corp",
      industry: "AI",
      profile: "Company profile",
      talentProfile: "Talent profile",
      evaluationPolicy: "Evaluation policy",
    });
    assert.equal(result.name, "Init Corp");
  });

  it("uploads a validated logo and stores only file metadata on the company", async () => {
    const { repository, calls } = createRepository();
    const { storage, puts } = createStorage();
    const service = new CompanyProfileService(repository, storage, {
      publicBaseUrl: "http://localhost:14566/init-local-assets",
    });

    const result = await service.uploadLogo(companyUser, {
      originalName: "logo.png",
      mimeType: "image/png",
      sizeBytes: 1024,
      buffer: Buffer.from("logo"),
    });

    assert.equal(puts.length, 1);
    assert.equal(calls.updateLogoFileId, 77);
    assert.equal((calls.createFileAsset as { ownerUserId: number }).ownerUserId, 1);
    assert.match((calls.createFileAsset as { storageKey: string }).storageKey, /^company\/7\/profile-logo\/.+-logo\.png$/);
    assert.equal((calls.createFileAsset as { originalName: string }).originalName, "logo.png");
    assert.equal((calls.createFileAsset as { mimeType: string }).mimeType, "image/png");
    assert.equal((calls.createFileAsset as { sizeBytes: number }).sizeBytes, 1024);
    assert.equal(result.logoFileId, 77);
    assert.match(result.logoUrl ?? "", /^http:\/\/localhost:14566\/init-local-assets\/company\/7\/profile-logo\//);
  });

  it("rejects non-company users", async () => {
    const service = new CompanyProfileService(createRepository().repository, createStorage().storage);

    await assert.rejects(
      () =>
        service.getProfile({
          userId: 2,
          userType: "CANDIDATE",
          companyId: null,
          candidateId: 1,
        }),
      /기업 사용자만 접근할 수 있습니다/,
    );
  });
});
