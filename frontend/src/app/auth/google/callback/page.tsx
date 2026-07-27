"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getDefaultEntryPath, refreshAuthSession } from "@/api/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { toOAuthLoginErrorPath } from "@/features/auth/oauth-login-message";

export default function GoogleOAuthCallbackPage() {
  const router = useRouter();
  const { completeLogin } = useAuth();
  const startedRef = useRef(false);
  const [message, setMessage] = useState("Completing Google login...");

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let canceled = false;

    async function completeGoogleLogin() {
      try {
        const session = await refreshAuthSession();
        if (canceled) return;
        completeLogin(session);
        router.replace(getDefaultEntryPath(session.user.userType));
      } catch {
        if (canceled) return;
        const errorMessage = "Google 로그인 세션을 확인할 수 없습니다. 다시 로그인해 주세요.";
        setMessage(errorMessage);
        router.replace(toOAuthLoginErrorPath(errorMessage));
      }
    }

    void completeGoogleLogin();

    return () => {
      canceled = true;
    };
  }, [completeLogin, router]);

  return (
    <main className="app auth">
      <section className="auth-wrap">
        <div className="form-card">
          <span className="eyebrow">GOOGLE OAUTH</span>
          <h2>Completing login</h2>
          <p className="lead">{message}</p>
        </div>
      </section>
    </main>
  );
}
