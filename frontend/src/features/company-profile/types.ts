export type CompanyProfile = {
  companyId: number;
  ownerUserId: number;
  name: string;
  businessRegistrationNumber: string;
  verificationStatus: "PENDING" | "VERIFIED" | "REJECTED" | string;
  logoFileId: number | null;
  logoUrl: string | null;
  industry: string | null;
  profile: string | null;
  talentProfile: string | null;
  evaluationPolicy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpdateCompanyProfileInput = {
  name: string;
  industry?: string | null;
  profile?: string | null;
  talentProfile?: string | null;
  evaluationPolicy?: string | null;
};
