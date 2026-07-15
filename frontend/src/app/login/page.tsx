import Image from "next/image";
import Link from "next/link";

import { LoginForm } from "@/features/auth/AuthForms";

export default function LoginPage() {
  return (
    <main className="app auth notion">
      <section className="auth-wrap">
        <Link className="auth-logo" href="/" aria-label="init 홈">
          <Image src="/logo-init-v4.png" alt="init" width={1108} height={460} priority />
        </Link>
        <LoginForm fixedUserType="CANDIDATE" />
      </section>
    </main>
  );
}
