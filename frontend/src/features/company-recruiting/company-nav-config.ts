import { COMPANY_MYPAGE_ROUTE } from "../company-profile/routes";

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
    disabled: true,
  },
] as const;
