import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { CandidateProfileSnapshotV1 } from "./api";
import { appendProfileSnapshotItem, createProfileFormState, getAccordionIndicator, isSupportedProfileDateInput, serializeProfileForm, validateProfileForm } from "./candidate-profile-form";
import { isCandidateNameConfirmed, toSubmitApplicationRequest } from "./view-model";

assert.equal(getAccordionIndicator(false), "▼");
assert.equal(getAccordionIndicator(true), "▲");
assert.equal(isSupportedProfileDateInput("2026-07", "month"), true);
assert.equal(isSupportedProfileDateInput("12026-07", "month"), false);
assert.equal(isSupportedProfileDateInput("2026-07-16", "date"), true);
assert.equal(isSupportedProfileDateInput("0999-12-31", "date"), false);
assert.equal(isCandidateNameConfirmed("candidate", "candidate@example.com"), false);
assert.equal(isCandidateNameConfirmed("candidate@example.com", "candidate@example.com"), false);
assert.equal(isCandidateNameConfirmed("홍길동", "candidate@example.com"), true);
assert.throws(() => toSubmitApplicationRequest({
  candidateName: "candidate",
  email: "candidate@example.com",
  phone: "010-0000-0000",
  githubUrl: "",
  blogUrl: "",
  motivation: "",
  additionalInfo: "",
  consentTypes: [],
}), /OAuth account ID/);

const form = createProfileFormState({
  name: "지원자",
  email: "candidate@example.com",
  phone: null,
  githubUrl: null,
  blogUrl: null,
  portfolioUrl: null,
  summary: "백엔드 개발자",
  coverLetter: "Redis 캐시 운영 경험을 바탕으로 안정적인 서비스를 만들고 싶습니다.",
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
assert.equal(payload.coverLetter, "Redis 캐시 운영 경험을 바탕으로 안정적인 서비스를 만들고 싶습니다.");
assert.equal("key" in (payload.careers?.[0] ?? {}), false);

const invalid = validateProfileForm({
  ...form,
  careers: [{ ...form.careers[0]!, isCurrent: false, endMonth: "" }],
});
assert.equal(invalid[0]?.section, "careers");
assert.equal(invalid[0]?.field, "careers.0.endMonth");

const emptySnapshot: CandidateProfileSnapshotV1 = {
  schemaVersion: 1,
  name: "지원자",
  email: "candidate@example.com",
  phone: null,
  githubUrl: null,
  blogUrl: null,
  portfolioUrl: null,
  summary: null,
  coverLetter: null,
  educations: [],
  careers: [],
  activities: [],
  credentials: [],
};
const withEducation = appendProfileSnapshotItem(emptySnapshot, "educations");
assert.equal(withEducation.educations.length, 1);
assert.equal(withEducation.educations[0]?.educationLevel, "UNIVERSITY");
const fullEducation = { ...emptySnapshot, educations: Array.from({ length: 10 }, () => withEducation.educations[0]!) };
assert.equal(appendProfileSnapshotItem(fullEducation, "educations"), fullEducation);

const snapshotEditorSource = readFileSync("src/features/candidate-application-interview/CandidateProfileSnapshotEditor.tsx", "utf8");
assert.equal(snapshotEditorSource.includes("<details"), false);
assert.equal(snapshotEditorSource.includes('className="candidate-profile-remove"'), true);
assert.equal(snapshotEditorSource.includes("aria-expanded={open}"), true);
assert.equal(snapshotEditorSource.includes("isSupportedProfileDateInput(nextValue, type)"), true);
assert.equal(snapshotEditorSource.includes("const nullable = (value: string) => value || null;"), true);

const mypageProfileSource = readFileSync("src/features/candidate-application-interview/CandidateProfileSection.tsx", "utf8");
assert.equal(mypageProfileSource.includes('section="coverLetter"'), true);
assert.equal(mypageProfileSource.includes("open={open.coverLetter}"), true);

const candidatePagesSource = readFileSync("src/features/candidate-application-interview/CandidatePages.tsx", "utf8");
assert.equal(candidatePagesSource.includes('value={form.githubUrl ?? ""}'), false);
assert.equal(candidatePagesSource.includes('const recruitingActive = active === "jobs";'), true);

const viewsSource = readFileSync("src/features/candidate-application-interview/views.tsx", "utf8");
assert.equal(viewsSource.includes('aria-label="편집"'), true);
assert.equal(viewsSource.includes('{folder.motivation || "지원 동기 미작성"}'), true);

const modalDocumentsStepStart = viewsSource.indexOf("{step === 1 ? (");
const modalReviewStepStart = viewsSource.indexOf("{step === 2 ? (");
assert.notEqual(modalDocumentsStepStart, -1);
assert.notEqual(modalReviewStepStart, -1);

const modalDocumentsStepSource = viewsSource.slice(modalDocumentsStepStart, modalReviewStepStart);
for (const requiredLabel of [
  "이력서",
  "지원 동기",
  "추가 설명",
]) {
  assert.equal(
    modalDocumentsStepSource.includes(
      `<span className="candidate-apply-required-label">${requiredLabel} <span className="req-mark">*</span></span>`,
    ),
    true,
    `${requiredLabel} 문구와 필수 표시가 같은 라벨 래퍼 안에 있어야 합니다.`,
  );
}
assert.equal(modalDocumentsStepSource.includes("포트폴리오 제출 방식"), true);
assert.equal(modalDocumentsStepSource.includes("URL로 제출"), true);
assert.equal(modalDocumentsStepSource.includes("PDF로 제출"), true);
assert.equal(modalDocumentsStepSource.includes('portfolioMethod === "url"'), true);
assert.equal(modalDocumentsStepSource.includes("URL 또는 PDF 중 하나 필수"), false);

console.log("candidate profile form helpers: ok");
