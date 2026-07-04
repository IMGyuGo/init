import { COMPANY_MYPAGE_ROUTE } from "../company-profile/routes";

const COMPANY_BILLING_ROUTE = "/company/billing" as const;

export const companyNavLabels = {
  postings: "공고 목록",
  accountBilling: "계정/결제",
} as const;

export const companyAccountBillingNav = [
  {
    label: "계정",
    href: COMPANY_MYPAGE_ROUTE,
  },
  {
    label: "결제",
    href: COMPANY_BILLING_ROUTE,
  },
] as const;

export function isCompanyAccountBillingPath(pathname: string | null | undefined) {
  return Boolean(pathname?.startsWith(COMPANY_MYPAGE_ROUTE) || pathname?.startsWith(COMPANY_BILLING_ROUTE));
}
