import {
  SEED_ACCOUNT_PASSWORD,
  SEED_COMPANY_LOGO_MIME_TYPE,
  buildSeedCompanyLogoSourceUrl,
  companyJobListingSeeds,
} from "./seed-data";

describe("companyJobListingSeeds", () => {
  it("provides multiple visible companies with logo file metadata for the candidate job list", () => {
    const publicPostings = companyJobListingSeeds.flatMap((company) =>
      company.postings.filter((posting) => posting.status === "OPEN" || posting.status === "CLOSING_SOON"),
    );

    expect(companyJobListingSeeds).toHaveLength(30);
    expect(publicPostings).toHaveLength(30);
    expect(new Set(companyJobListingSeeds.map((company) => company.ownerUser.email)).size).toBe(
      companyJobListingSeeds.length,
    );
    expect(new Set(companyJobListingSeeds.map((company) => company.companySlug)).size).toBe(companyJobListingSeeds.length);
    expect(companyJobListingSeeds.some((company) => /krafton|크래프톤/i.test(`${company.companySlug} ${company.company.name}`))).toBe(
      false,
    );

    const postingIds = companyJobListingSeeds.flatMap((company) => company.postings.map((posting) => posting.postingId));
    expect(new Set(postingIds).size).toBe(postingIds.length);
    expect(Math.min(...postingIds)).toBe(1101);
    expect(Math.max(...postingIds)).toBe(1130);

    for (const company of companyJobListingSeeds) {
      expect(company.logoFile.storageKey).toBe(`seed/company-logos/${company.companySlug}.png`);
      expect(company.logoFile.originalName).toBe(`${company.companySlug}-logo.png`);
      expect(company.logoFile.mimeType).toBe(SEED_COMPANY_LOGO_MIME_TYPE);
      expect(company.logoSourceUrl).toBe(buildSeedCompanyLogoSourceUrl(company.logoSourceDomain));
      expect(company.company.logoFileId).toBe(company.logoFile.fileId);
      expect(company.postings).toHaveLength(1);
      expect(company.postings.every((posting) => posting.status === "OPEN" || posting.status === "CLOSING_SOON")).toBe(
        true,
      );
    }
  });

  it("keeps a documented local password for seeded candidate and company accounts", () => {
    expect(SEED_ACCOUNT_PASSWORD).toBe("Password123");
  });
});
