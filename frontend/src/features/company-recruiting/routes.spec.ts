import { buildPublicApplicationInterviewHref } from "./routes";

const href = buildPublicApplicationInterviewHref(77, "token with space");

if (href !== "/public/applications/77/interview?token=token%20with%20space") {
  throw new Error("Public application interview href should include applicationId and encoded magic-link token.");
}
