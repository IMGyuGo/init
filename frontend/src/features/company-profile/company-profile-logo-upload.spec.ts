import {
  ALLOWED_COMPANY_LOGO_MIME_TYPES,
  COMPANY_LOGO_ACCEPT,
  COMPANY_LOGO_MAX_UPLOAD_BYTES,
  validateCompanyLogoFile,
} from "./company-profile-logo-upload";
import { COMPANY_MYPAGE_ROUTE } from "./routes";

const validFile = {
  type: "image/png",
  size: COMPANY_LOGO_MAX_UPLOAD_BYTES,
};

if (!validateCompanyLogoFile(validFile).ok) {
  throw new Error("Allowed company logo at the max upload size should pass validation.");
}

const invalidMimeType = validateCompanyLogoFile({
  type: "image/gif",
  size: 1000,
});

if (invalidMimeType.ok || invalidMimeType.message !== "PNG, JPG, WebP 이미지만 업로드할 수 있습니다.") {
  throw new Error("Unsupported company logo mime types should fail with the expected message.");
}

const tooLarge = validateCompanyLogoFile({
  type: "image/jpeg",
  size: COMPANY_LOGO_MAX_UPLOAD_BYTES + 1,
});

if (tooLarge.ok || tooLarge.message !== "로고는 최대 2MB까지 업로드할 수 있습니다.") {
  throw new Error("Oversized company logo files should fail with the expected message.");
}

if (COMPANY_LOGO_ACCEPT !== ALLOWED_COMPANY_LOGO_MIME_TYPES.join(",")) {
  throw new Error("Accept attribute should stay aligned with allowed company logo mime types.");
}

const mypageRoute: "/company/mypage" = COMPANY_MYPAGE_ROUTE;
void mypageRoute;
