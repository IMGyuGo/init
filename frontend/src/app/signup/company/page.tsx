import Image from "next/image";
import Link from "next/link";

import { SignupForm } from "@/features/auth/AuthForms";

export default function CompanySignupPage() {
  return (
    <main className="app auth notion">
      <section className="auth-wrap">
        <Link className="auth-logo" href="/" aria-label="init 홈">
          <Image src="/logo-init-v5.png" alt="init" width={2030} height={775} priority />
        </Link>
        <SignupForm userType="COMPANY" />
      </section>
    </main>
  );
}
