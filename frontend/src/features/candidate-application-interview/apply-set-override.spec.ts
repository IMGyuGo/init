import { applyFolderToApplicationForm, restoreApplicationSetContent } from "./apply-set";
import type { CandidateApplicationFormState } from "./view-model";
import type { CandidateFolder } from "./api";

// #272: 지원서 세트는 콘텐츠 필드만 덮어쓰고, 빈 항목은 기준(프로필 자동입력)을 유지하며,
// 기본정보/사용자 편집은 세트 전환·해제 후에도 보존되어야 한다.

function makeFolder(overrides: Partial<CandidateFolder>): CandidateFolder {
  return {
    id: 1,
    name: "세트",
    githubUrl: null,
    blogUrl: null,
    portfolioUrl: null,
    resumeFileId: null,
    resumeFileName: null,
    portfolioFileId: null,
    portfolioFileName: null,
    motivation: null,
    extraNote: null,
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
    ...overrides,
  };
}

// 기준 상태: 프로필에서 자동 입력된 GitHub/블로그/포트폴리오가 있는 폼.
const baseline: CandidateApplicationFormState = {
  candidateName: "홍길동",
  email: "hong@example.com",
  phone: "010-1111-2222",
  githubUrl: "https://github.com/profile-user",
  blogUrl: "https://blog.profile-user.dev",
  portfolioUrl: "https://portfolio.profile-user.dev",
  motivation: "",
  additionalInfo: "",
  consentTypes: [],
};

// 1) 세트에 값이 있는 항목만 덮어쓰고, 빈 항목은 기준(프로필) 값을 유지한다.
const githubOnly = applyFolderToApplicationForm(baseline, baseline, makeFolder({ githubUrl: "https://github.com/set-value" }));
if (githubOnly.githubUrl !== "https://github.com/set-value") {
  throw new Error("세트에 GitHub 값이 있으면 덮어써야 한다.");
}
if (githubOnly.blogUrl !== baseline.blogUrl) {
  throw new Error("세트에 블로그 값이 없으면 프로필(기준) 블로그를 유지해야 한다.");
}
if (githubOnly.portfolioUrl !== baseline.portfolioUrl) {
  throw new Error("세트에 포트폴리오 값이 없으면 프로필(기준) 포트폴리오를 유지해야 한다.");
}

// 2) 공백만 있는 값은 덮어쓰기로 취급하지 않는다.
const blankGithub = applyFolderToApplicationForm(baseline, baseline, makeFolder({ githubUrl: "   " }));
if (blankGithub.githubUrl !== baseline.githubUrl) {
  throw new Error("세트 GitHub가 공백뿐이면 기준 값을 유지해야 한다.");
}

// 3) 세트 전환 시: 이전 세트 값이 남지 않고, 그 사이 수정한 기본정보(연락처)는 보존된다.
const afterSetA = applyFolderToApplicationForm(baseline, baseline, makeFolder({ githubUrl: "https://github.com/set-a", resumeFileId: 10 }));
// 사용자가 A 로딩 후 연락처를 수정.
const editedAfterA: CandidateApplicationFormState = { ...afterSetA, phone: "010-9999-8888" };
// B 로 전환: current=편집본, baseline=세트 이전 스냅샷.
const afterSetB = applyFolderToApplicationForm(editedAfterA, baseline, makeFolder({ blogUrl: "https://blog.set-b.dev" }));
if (afterSetB.githubUrl !== baseline.githubUrl) {
  throw new Error("세트 B로 전환하면 세트 A의 GitHub가 남지 않아야 한다.");
}
if (afterSetB.resumeFileId !== baseline.resumeFileId) {
  throw new Error("세트 B로 전환하면 세트 A의 이력서 ID가 남지 않아야 한다.");
}
if (afterSetB.blogUrl !== "https://blog.set-b.dev") {
  throw new Error("세트 B의 블로그 값은 덮어써야 한다.");
}
if (afterSetB.phone !== "010-9999-8888") {
  throw new Error("세트 전환 후에도 사용자가 수정한 연락처는 보존되어야 한다.");
}

// 4) 세트 해제: 콘텐츠는 기준으로 되돌리되 기본정보 편집은 유지한다.
const restored = restoreApplicationSetContent(editedAfterA, baseline);
if (restored.githubUrl !== baseline.githubUrl || restored.resumeFileId !== baseline.resumeFileId) {
  throw new Error("세트 해제 시 콘텐츠는 세트 이전 값으로 되돌려야 한다.");
}
if (restored.phone !== "010-9999-8888") {
  throw new Error("세트 해제 시에도 사용자가 수정한 연락처는 보존되어야 한다.");
}

console.log("apply-set-override.spec passed");
