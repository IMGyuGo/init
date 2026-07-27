import { apiFetch } from "../../api/client";
import type { CompanyProfile, UpdateCompanyProfileInput } from "./types";

export async function getCompanyProfile() {
  return apiFetch<CompanyProfile>("/company/profile");
}

export async function updateCompanyProfile(input: UpdateCompanyProfileInput) {
  return apiFetch<CompanyProfile>("/company/profile", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function uploadCompanyLogo(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  return apiFetch<CompanyProfile>("/company/profile/logo", {
    method: "POST",
    body: formData,
  });
}
