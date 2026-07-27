import { getCompanyDisplayName, getCompanyInitial, getCompanyLogoUrl } from "./company-profile-display";
import type { CompanyProfile } from "./types";

const profile = {
  name: "  Init Labs  ",
  logoUrl: "https://cdn.example.com/company-logo.png",
} as CompanyProfile;

if (getCompanyDisplayName(profile) !== "Init Labs") {
  throw new Error("Company display name should come from the saved company profile.");
}

if (getCompanyInitial(profile, "[Old Name] Backend Developer") !== "I") {
  throw new Error("Company initial should prefer the saved company profile name over posting title prefixes.");
}

if (getCompanyLogoUrl(profile) !== "https://cdn.example.com/company-logo.png") {
  throw new Error("Company logo URL should come from the saved company profile.");
}

if (getCompanyInitial(null, "[Old Name] Backend Developer") !== "O") {
  throw new Error("Company initial should fall back to the posting title prefix when profile is unavailable.");
}

if (getCompanyDisplayName(null) !== "") {
  throw new Error("Missing company profile should not invent a company display name.");
}
