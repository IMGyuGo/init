export const CANDIDATE_MYPAGE_ROUTE = "/candidate/mypage" as const;
export const CANDIDATE_BILLING_ROUTE = "/candidate/billing" as const;
export const AI_PERFORMANCE_ROUTE = "/ai/performance" as const;

export const candidateNavLabels = {
  accountBilling: "계정/결제",
  performance: "지표",
} as const;

export const candidateAccountBillingNav = [
  {
    label: "계정",
    href: CANDIDATE_MYPAGE_ROUTE,
  },
  {
    label: "결제",
    href: CANDIDATE_BILLING_ROUTE,
  },
] as const;

export function isCandidateAccountBillingPath(pathname: string | null | undefined) {
  return Boolean(pathname?.startsWith(CANDIDATE_MYPAGE_ROUTE) || pathname?.startsWith(CANDIDATE_BILLING_ROUTE));
}

