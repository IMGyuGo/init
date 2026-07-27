import type { CompanyProfile } from "./types";

type CompanyProfileDisplaySource = Pick<CompanyProfile, "name" | "logoUrl"> | null;

export function getCompanyDisplayName(profile: CompanyProfileDisplaySource) {
  return profile?.name.trim() ?? "";
}

export function getCompanyLogoUrl(profile: CompanyProfileDisplaySource) {
  return profile?.logoUrl?.trim() || null;
}

export function getCompanyInitial(profile: CompanyProfileDisplaySource, fallbackTitle: string) {
  const source = getCompanyDisplayName(profile) || getPostingTitleCompanyName(fallbackTitle) || fallbackTitle;
  return source.trim().charAt(0).toUpperCase() || "·";
}

function getPostingTitleCompanyName(title: string) {
  const bracket = title.match(/^\s*\[([^\]]+)\]/);
  return bracket?.[1]?.trim() ?? "";
}
