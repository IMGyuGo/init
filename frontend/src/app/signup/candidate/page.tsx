import Image from "next/image";
import Link from "next/link";

import { SignupForm } from "@/features/auth/AuthForms";

export default function CandidateSignupPage() {
  return (
    <main className="app auth notion">
      <section className="auth-wrap">
        <Link className="auth-logo" href="/" aria-label="init 홈">
          <Image src="/logo-init-v4.png" alt="init" width={1108} height={460} priority />
        </Link>
        <SignupForm userType="CANDIDATE" />
      </section>
    </main>
  );
}
