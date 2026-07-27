"use client";

import { usePathname } from "next/navigation";

import { CompanyNav } from "@/features/company-recruiting/CompanyRecruitingChrome";

export default function CompanyLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/company/login") return children;

  return (
    <main className="app-shell">
      <CompanyNav />
      {children}
    </main>
  );
}
