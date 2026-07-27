export type CompanyProfileRecord = {
  companyId: number;
  ownerUserId: number;
  name: string;
  businessRegistrationNumber: string;
  verificationStatus: string;
  logoFileId: number | null;
  logoStorageKey: string | null;
  industry: string | null;
  profile: string | null;
  talentProfile: string | null;
  evaluationPolicy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CompanyProfileResponse = {
  companyId: number;
  ownerUserId: number;
  name: string;
  businessRegistrationNumber: string;
  verificationStatus: string;
  logoFileId: number | null;
  logoUrl: string | null;
  industry: string | null;
  profile: string | null;
  talentProfile: string | null;
  evaluationPolicy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CompanyProfileFileAssetRecord = {
  fileId: number;
  ownerUserId: number;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  createdAt: Date;
};

export type CompanyLogoUploadFile = {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
};
