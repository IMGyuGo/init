import type { Recruitment } from "./types";

type PublicApplicationRecruitment = Pick<Recruitment, "postingId" | "status">;

export type PublicApplicationLinkState = {
  path: string;
  url: string;
  isAvailable: boolean;
  statusLabel: "사용 가능" | "사용 불가";
  helperText: string;
};

// Temporary B-owned boundary: this public link opens the public application form, not the email magic-link flow.
export function buildPublicApplicationPath(recruitment: Pick<Recruitment, "postingId">) {
  return `/public/recruitments/${recruitment.postingId}/apply`;
}

export function buildPublicApplicationUrl(recruitment: Pick<Recruitment, "postingId">, origin: string) {
  const normalizedOrigin = origin.replace(/\/+$/, "");
  return `${normalizedOrigin}${buildPublicApplicationPath(recruitment)}`;
}

export function getPublicApplicationLinkState(
  recruitment: PublicApplicationRecruitment,
  origin: string,
): PublicApplicationLinkState {
  const isAvailable = recruitment.status === "OPEN";
  const path = buildPublicApplicationPath(recruitment);
  const url = origin ? buildPublicApplicationUrl(recruitment, origin) : path;

  return {
    path,
    url,
    isAvailable,
    statusLabel: isAvailable ? "사용 가능" : "사용 불가",
    helperText: isAvailable
      ? "외부 채용사이트에 게시할 공개 지원 링크입니다."
      : "OPEN 상태 공고에서만 공개 지원 링크를 사용할 수 있습니다.",
  };
}
