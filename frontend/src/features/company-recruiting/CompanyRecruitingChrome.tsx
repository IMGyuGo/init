"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { GnbAvatar, GnbLogoutButton } from "../auth/GnbAccountControls";
import { COMPANY_MYPAGE_ROUTE } from "../company-profile/routes";
import { AI_PERFORMANCE_ROUTE, companyAccountBillingNav, companyNavLabels, isCompanyAccountBillingPath } from "./company-nav-config";
import { formatRecruitingStatusLabel, getRecruitingStatusTone } from "./status-labels";

type CompanyNavSection = "postings" | "accountBilling" | "performance";

export function CompanyNav({ active }: { active?: CompanyNavSection }) {
  const pathname = usePathname();
  const current = active ?? (pathname?.startsWith(AI_PERFORMANCE_ROUTE) ? "performance" : isCompanyAccountBillingPath(pathname) ? "accountBilling" : "postings");

  return (
    <header className="gnb">
      <div className="gnb-inner">
        <Link className="brand" href="/company/recruitments">
          <Image src="/logo-init-v4.png" alt="init" width={1900} height={580} priority />
        </Link>
        <nav className="gnb-menu" aria-label="기업 메뉴">
          <div className={`gnb-item ${current === "postings" ? "active" : ""}`}>
            <Link className="gnb-link" href="/company/recruitments" aria-current={current === "postings" ? "page" : undefined}>
              {companyNavLabels.postings}
            </Link>
          </div>
          <div className={`gnb-item ${current === "accountBilling" ? "active" : ""}`}>
            <Link
              className="gnb-link"
              href={COMPANY_MYPAGE_ROUTE}
              aria-current={current === "accountBilling" ? "page" : undefined}
              aria-haspopup="true"
              onClick={(event) => event.currentTarget.blur()}
            >
              {companyNavLabels.accountBilling}
            </Link>
            <div className="gnb-panel">
              {companyAccountBillingNav.map((item) => {
                const isActive = pathname?.startsWith(item.href);
                return (
                  <Link
                    className={isActive ? "active" : ""}
                    href={item.href}
                    key={item.href}
                    aria-current={isActive ? "page" : undefined}
                    onClick={(event) => event.currentTarget.blur()}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className={`gnb-item ${current === "performance" ? "active" : ""}`}>
            <Link className="gnb-link" href={AI_PERFORMANCE_ROUTE} aria-current={current === "performance" ? "page" : undefined}>
              {companyNavLabels.performance}
            </Link>
          </div>
        </nav>
        <div className="gnb-right">
          <button className="icon-btn" type="button" aria-label="알림">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </button>
          <GnbAvatar accountLabel="기업 계정" />
          <GnbLogoutButton />
        </div>
      </div>
    </header>
  );
}

type CrumbItem = {
  label: string;
  href?: string;
};

export function BackButton({ fallbackHref }: { fallbackHref?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="page-back-btn"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) router.back();
        else if (fallbackHref) router.push(fallbackHref);
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m15 18-6-6 6-6" />
      </svg>
      뒤로가기
    </button>
  );
}

export function Breadcrumb({ items }: { items: CrumbItem[] }) {
  return (
    <nav className="crumb" aria-label="현재 위치">
      {items.map((item, index) => (
        <span className="crumb-segment" key={`${item.label}-${index}`}>
          {item.href ? (
            <Link href={item.href}>{item.label}</Link>
          ) : (
            <span aria-current="page">{item.label}</span>
          )}
          {index < items.length - 1 ? (
            <span className="crumb-sep" aria-hidden="true">
              /
            </span>
          ) : null}
        </span>
      ))}
    </nav>
  );
}

export function StatusBadge({ value }: { value?: string | null }) {
  return <span className={`badge ${getRecruitingStatusTone(value)}`}>{formatRecruitingStatusLabel(value)}</span>;
}
