import assert from "node:assert/strict";
import { createProfileFormState, getAccordionIndicator, serializeProfileForm, validateProfileForm } from "./candidate-profile-form";

assert.equal(getAccordionIndicator(false), "▼");
assert.equal(getAccordionIndicator(true), "▲");

const form = createProfileFormState({
  name: "지원자",
  email: "candidate@example.com",
  phone: null,
  githubUrl: null,
  blogUrl: null,
  portfolioUrl: null,
  summary: "백엔드 개발자",
  educations: [],
  careers: [{
    companyName: "정글랩",
    startMonth: "2024-01",
    endMonth: null,
    isCurrent: true,
    jobRole: "백엔드 개발자",
    department: null,
    position: null,
    responsibilities: "Redis 캐시 운영",
  }],
  activities: [],
  credentials: [],
});

assert.notEqual(form.careers[0]?.key, undefined);
const payload = serializeProfileForm(form);
assert.equal("email" in payload, false);
assert.equal(payload.careers?.[0]?.endMonth, null);
assert.equal("key" in (payload.careers?.[0] ?? {}), false);

const invalid = validateProfileForm({
  ...form,
  careers: [{ ...form.careers[0]!, isCurrent: false, endMonth: "" }],
});
assert.equal(invalid[0]?.section, "careers");
assert.equal(invalid[0]?.field, "careers.0.endMonth");

console.log("candidate profile form helpers: ok");
