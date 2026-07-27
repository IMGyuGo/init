export const ALLOWED_COMPANY_LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const COMPANY_LOGO_ACCEPT = ALLOWED_COMPANY_LOGO_MIME_TYPES.join(",");
export const COMPANY_LOGO_MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

type CompanyLogoFileLike = Pick<File, "size" | "type">;

export type CompanyLogoValidationResult = { ok: true } | { ok: false; message: string };

export function validateCompanyLogoFile(file: CompanyLogoFileLike): CompanyLogoValidationResult {
  if (!ALLOWED_COMPANY_LOGO_MIME_TYPES.includes(file.type as (typeof ALLOWED_COMPANY_LOGO_MIME_TYPES)[number])) {
    return { ok: false, message: "PNG, JPG, WebP 이미지만 업로드할 수 있습니다." };
  }

  if (file.size > COMPANY_LOGO_MAX_UPLOAD_BYTES) {
    return { ok: false, message: "로고는 최대 2MB까지 업로드할 수 있습니다." };
  }

  return { ok: true };
}
