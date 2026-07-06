import Image from "next/image";
import Link from "next/link";

import { SignupChoice } from "@/features/auth/AuthForms";

export default function SignupPage() {
  return (
    <main className="app auth notion">
      <section className="auth-wrap">
        <Link className="auth-logo" href="/" aria-label="init 홈">
          <Image src="/logo-init-v3.png" alt="init" width={1900} height={580} priority />
        </Link>
        <SignupChoice />
      </section>
    </main>
  );
}
