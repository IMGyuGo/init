import type { CandidateFolder } from "./api";
import type { CandidateApplicationFormState } from "./view-model";

// 순수 로직만 담는 모듈(런타임 의존성 없음) — 세트 override/해제 규칙. 단위 테스트로 검증 가능. (#272)

// 지원서 세트가 덮어쓰는 "콘텐츠" 필드. 기본정보(이름/이메일/연락처/동의)는 세트가 건드리지 않는다.
const APPLICATION_SET_CONTENT_KEYS = [
  "githubUrl",
  "blogUrl",
  "portfolioUrl",
  "resumeFileId",
  "portfolioFileId",
  "motivation",
  "additionalInfo",
] as const;

// 지원서 세트(폴더)를 지원 폼에 반영한다.
// - 기본정보와 사용자가 편집 중인 값은 `current`에서 유지한다.
// - 콘텐츠 필드는 세트 값이 있으면 덮어쓰고, 없으면 `baseline`(세트 이전 = 프로필 자동입력 등) 값을 쓴다.
// 세트 전환 시 이전 세트 값이 남거나 기본정보 편집이 유실되지 않도록 current/baseline 을 분리한다. (#272 P2)
export function applyFolderToApplicationForm(
  current: CandidateApplicationFormState,
  baseline: CandidateApplicationFormState,
  folder: CandidateFolder,
): CandidateApplicationFormState {
  const overrideText = (value: string | null | undefined, fallback: string): string =>
    value && value.trim() ? value : fallback;
  return {
    ...current,
    githubUrl: overrideText(folder.githubUrl, baseline.githubUrl),
    blogUrl: overrideText(folder.blogUrl, baseline.blogUrl),
    portfolioUrl: folder.portfolioUrl && folder.portfolioUrl.trim() ? folder.portfolioUrl : baseline.portfolioUrl,
    resumeFileId: folder.resumeFileId ?? baseline.resumeFileId,
    portfolioFileId: folder.portfolioFileId ?? baseline.portfolioFileId,
    motivation: overrideText(folder.motivation, baseline.motivation),
    additionalInfo: overrideText(folder.extraNote, baseline.additionalInfo),
  };
}

// 세트 해제 시: 기본정보/편집은 유지하고 콘텐츠 필드만 세트 이전 값(baseline)으로 되돌린다. (#272 P2)
export function restoreApplicationSetContent(
  current: CandidateApplicationFormState,
  baseline: CandidateApplicationFormState,
): CandidateApplicationFormState {
  const restored = { ...current };
  for (const key of APPLICATION_SET_CONTENT_KEYS) {
    (restored[key] as CandidateApplicationFormState[typeof key]) = baseline[key];
  }
  return restored;
}
