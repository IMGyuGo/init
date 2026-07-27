import {
  ALLOWED_JOB_DESCRIPTION_IMAGE_MIME_TYPES,
  JOB_DESCRIPTION_IMAGE_ACCEPT,
  JOB_DESCRIPTION_IMAGE_MAX_UPLOAD_BYTES,
  validateJobDescriptionImageFile,
} from "./job-description-image-upload";

const validFile = {
  type: "image/png",
  size: JOB_DESCRIPTION_IMAGE_MAX_UPLOAD_BYTES,
};

if (!validateJobDescriptionImageFile(validFile).ok) {
  throw new Error("Allowed JD image at the max upload size should pass validation.");
}

const invalidMimeType = validateJobDescriptionImageFile({
  type: "image/gif",
  size: 1000,
});

if (invalidMimeType.ok || invalidMimeType.message !== "PNG, JPG, WebP 이미지만 업로드할 수 있습니다.") {
  throw new Error("Unsupported JD image mime types should fail with the expected message.");
}

const tooLarge = validateJobDescriptionImageFile({
  type: "image/jpeg",
  size: JOB_DESCRIPTION_IMAGE_MAX_UPLOAD_BYTES + 1,
});

if (tooLarge.ok || tooLarge.message !== "이미지는 최대 5MB까지 업로드할 수 있습니다.") {
  throw new Error("Oversized JD image files should fail with the expected message.");
}

if (JOB_DESCRIPTION_IMAGE_ACCEPT !== ALLOWED_JOB_DESCRIPTION_IMAGE_MIME_TYPES.join(",")) {
  throw new Error("Accept attribute should stay aligned with allowed JD image mime types.");
}
