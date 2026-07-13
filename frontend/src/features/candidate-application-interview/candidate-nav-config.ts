export const CANDIDATE_MYPAGE_ROUTE = "/candidate/mypage" as const;
export const CANDIDATE_BILLING_ROUTE = "/candidate/billing" as const;
export const CANDIDATE_APPLICATIONS_ROUTE = "/candidate/applications" as const;
export const CANDIDATE_APPLICATION_SETS_ROUTE = "/candidate/application-sets" as const;
export const AI_PERFORMANCE_ROUTE = "/ai/performance" as const;

export const candidateNavLabels = {
  accountBilling: "마이페이지",
  performance: "지표",
} as const;

// 마이페이지 하위 탭(드롭다운·마이페이지 탭 바 공용). 순서: 프로필 → 지원 내역 → 지원서 세트 → 결제 → 지표. (#272)
export const candidateAccountBillingNav = [
  {
    label: "프로필",
    href: CANDIDATE_MYPAGE_ROUTE,
  },
  {
    label: "지원 내역",
    href: CANDIDATE_APPLICATIONS_ROUTE,
  },
  {
    label: "지원서 세트",
    href: CANDIDATE_APPLICATION_SETS_ROUTE,
  },
  {
    label: "결제",
    href: CANDIDATE_BILLING_ROUTE,
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
      pathname?.startsWith(CANDIDATE_APPLICATIONS_ROUTE) ||
      pathname?.startsWith(CANDIDATE_APPLICATION_SETS_ROUTE) ||
      pathname?.startsWith(AI_PERFORMANCE_ROUTE),
  );
}
