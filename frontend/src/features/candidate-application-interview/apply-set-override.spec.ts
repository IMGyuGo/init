import { applyFolderToApplicationForm, restoreApplicationSetContent } from "./apply-set";
import type { CandidateApplicationFormState } from "./view-model";
import type { CandidateFolder } from "./api";

// 지원서 세트는 명시적인 빈 값까지 포함한 전체 프로필·지원 내용을 교체하고,
// 해제 시 선택 전 입력 전체를 복원해야 한다.

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
    profileSnapshot: {
      schemaVersion: 1,
      name: "세트 지원자",
      email: "set@example.com",
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
    },
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

// 1) 세트는 기본정보와 빈 값을 포함한 전체 프로필을 교체한다.
const githubOnly = applyFolderToApplicationForm(baseline, baseline, makeFolder({ githubUrl: "https://github.com/set-value" }));
if (githubOnly.candidateName !== "세트 지원자" || githubOnly.email !== "set@example.com") {
  throw new Error("세트 프로필의 기본정보로 교체되어야 한다.");
}
if (githubOnly.githubUrl !== "" || githubOnly.blogUrl !== "") {
  throw new Error("세트 프로필의 명시적인 빈 URL도 반영해야 한다.");
}

// 2) 세트 전환 시 이전 세트 값과 중간 편집값은 남지 않는다.
const afterSetA = applyFolderToApplicationForm(baseline, baseline, makeFolder({ resumeFileId: 10, profileSnapshot: { ...makeFolder({}).profileSnapshot, githubUrl: "https://github.com/set-a" } }));
// 사용자가 A 로딩 후 연락처를 수정.
const editedAfterA: CandidateApplicationFormState = { ...afterSetA, phone: "010-9999-8888" };
// B 로 전환: current=편집본, baseline=세트 이전 스냅샷.
const afterSetB = applyFolderToApplicationForm(editedAfterA, baseline, makeFolder({ profileSnapshot: { ...makeFolder({}).profileSnapshot, blogUrl: "https://blog.set-b.dev" } }));
if (afterSetB.githubUrl !== "") {
  throw new Error("세트 B로 전환하면 세트 A의 GitHub가 남지 않아야 한다.");
}
if (afterSetB.resumeFileId !== undefined) {
  throw new Error("세트 B로 전환하면 세트 A의 이력서 ID가 남지 않아야 한다.");
}
if (afterSetB.blogUrl !== "https://blog.set-b.dev") {
  throw new Error("세트 B의 블로그 값은 덮어써야 한다.");
}
if (afterSetB.phone !== "") {
  throw new Error("세트 전환 시 중간에 수정한 연락처도 세트 값으로 교체되어야 한다.");
}

// 3) 세트 해제: 전체 입력을 선택 전 기준으로 되돌린다.
const restored = restoreApplicationSetContent(editedAfterA, baseline);
if (restored.githubUrl !== baseline.githubUrl || restored.resumeFileId !== baseline.resumeFileId) {
  throw new Error("세트 해제 시 콘텐츠는 세트 이전 값으로 되돌려야 한다.");
}
if (restored.phone !== baseline.phone) {
  throw new Error("세트 해제 시 기본정보도 선택 전 값으로 돌아가야 한다.");
}

console.log("apply-set-override.spec passed");
