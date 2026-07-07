export const CANDIDATE_MYPAGE_ROUTE = "/candidate/mypage" as const;
export const CANDIDATE_BILLING_ROUTE = "/candidate/billing" as const;
export const CANDIDATE_APPLICATIONS_ROUTE = "/candidate/applications" as const;
export const AI_PERFORMANCE_ROUTE = "/ai/performance" as const;

export const candidateNavLabels = {
  accountBilling: "마이페이지",
  performance: "지표",
} as const;

// 마이페이지 하위 탭(드롭다운·마이페이지 탭 바 공용). 지표는 마이페이지 하위 흐름으로 배치한다.
export const candidateAccountBillingNav = [
  {
    label: "마이페이지",
    href: CANDIDATE_MYPAGE_ROUTE,
  },
  {
    label: "결제",
    href: CANDIDATE_BILLING_ROUTE,
  },
  {
    label: "지원현황",
    href: CANDIDATE_APPLICATIONS_ROUTE,
  },
  {
    label: "지표",
    href: AI_PERFORMANCE_ROUTE,
  },
] as const;

export function isCandidateAccountBillingPath(pathname: string | null | undefined) {
  return Boolean(
    pathname?.startsWith(CANDIDATE_MYPAGE_ROUTE) ||
      pathname?.startsWith(CANDIDATE_BILLING_ROUTE) ||
      pathname?.startsWith(AI_PERFORMANCE_ROUTE),
  );
}
