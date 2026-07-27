import type { CandidateFolder } from "./api";
import type { CandidateApplicationFormState } from "./view-model";

// 순수 로직만 담는 모듈(런타임 의존성 없음) — 세트 override/해제 규칙. 단위 테스트로 검증 가능. (#272)

// 지원서 세트가 덮어쓰는 필드. 동의만 현재 지원서 입력을 유지한다.
const APPLICATION_SET_CONTENT_KEYS = [
  "candidateName",
  "email",
  "phone",
  "githubUrl",
  "blogUrl",
  "portfolioUrl",
  "resumeFileId",
  "portfolioFileId",
  "motivation",
  "additionalInfo",
  "profileSnapshot",
] as const;

// 지원서 세트(폴더)를 지원 폼에 반영한다.
// 선택한 세트는 명시적인 빈 값까지 포함해 프로필과 지원 내용을 완전히 교체한다.
export function applyFolderToApplicationForm(
  current: CandidateApplicationFormState,
  _baseline: CandidateApplicationFormState,
  folder: CandidateFolder,
): CandidateApplicationFormState {
  const profile = folder.profileSnapshot ?? _baseline.profileSnapshot ?? current.profileSnapshot;
  if (!profile) return current;
  return {
    candidateName: profile.name,
    email: profile.email,
    phone: profile.phone ?? "",
    githubUrl: profile.githubUrl ?? "",
    blogUrl: profile.blogUrl ?? "",
    portfolioUrl: profile.portfolioUrl ?? undefined,
    resumeFileId: folder.resumeFileId ?? undefined,
    portfolioFileId: folder.portfolioFileId ?? undefined,
    motivation: folder.motivation ?? "",
    additionalInfo: folder.extraNote ?? "",
    profileSnapshot: profile,
    consentTypes: current.consentTypes,
  };
}

// 세트 해제 시 세트 선택 전의 전체 지원서로 되돌리되 현재 동의 선택은 유지한다.
export function restoreApplicationSetContent(
  current: CandidateApplicationFormState,
  baseline: CandidateApplicationFormState,
): CandidateApplicationFormState {
  const restored = { ...current, consentTypes: current.consentTypes };
  for (const key of APPLICATION_SET_CONTENT_KEYS) {
    (restored[key] as CandidateApplicationFormState[typeof key]) = baseline[key];
  }
  return restored;
}
