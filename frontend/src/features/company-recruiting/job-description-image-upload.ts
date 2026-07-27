export const ALLOWED_JOB_DESCRIPTION_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const JOB_DESCRIPTION_IMAGE_ACCEPT = ALLOWED_JOB_DESCRIPTION_IMAGE_MIME_TYPES.join(",");
export const JOB_DESCRIPTION_IMAGE_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

type JobDescriptionImageFileLike = Pick<File, "size" | "type">;

export type JobDescriptionImageValidationResult = { ok: true } | { ok: false; message: string };

export function validateJobDescriptionImageFile(file: JobDescriptionImageFileLike): JobDescriptionImageValidationResult {
  if (!ALLOWED_JOB_DESCRIPTION_IMAGE_MIME_TYPES.includes(file.type as (typeof ALLOWED_JOB_DESCRIPTION_IMAGE_MIME_TYPES)[number])) {
    return { ok: false, message: "PNG, JPG, WebP 이미지만 업로드할 수 있습니다." };
  }

  if (file.size > JOB_DESCRIPTION_IMAGE_MAX_UPLOAD_BYTES) {
    return { ok: false, message: "이미지는 최대 5MB까지 업로드할 수 있습니다." };
  }

  return { ok: true };
}
