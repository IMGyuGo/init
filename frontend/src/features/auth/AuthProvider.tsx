"use client";

import { usePathname, useRouter } from "next/navigation";
import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  AUTH_SESSION_CLEARED_EVENT,
  AuthTokenResponse,
  AuthUser,
  fetchCurrentUser,
  getAccessToken,
  logoutAuthSession,
  refreshAuthSession,
  setAccessToken,
} from "../../api/client";
import {
  getRedirectForUnauthorizedRole,
  getRouteAccess,
  isAllowedUserType,
} from "./routePolicy";

type AuthStatus = "checking" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  completeLogin: (session: AuthTokenResponse) => void;
  clearSession: () => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [user, setUser] = useState<AuthUser | null>(null);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutAuthSession();
    } catch {
      // Server cookie cleanup is best-effort; local auth state must still be cleared.
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const completeLogin = useCallback((session: AuthTokenResponse) => {
    setAccessToken(session.accessToken);
    setUser(session.user);
    setStatus("authenticated");
  }, []);

  useEffect(() => {
    let canceled = false;

    async function restoreSession() {
      try {
        const existingToken = getAccessToken();
        const session = existingToken ? { user: await fetchCurrentUser() } : await refreshAuthSession();
        if (canceled) return;
        setUser(session.user);
        setStatus("authenticated");
      } catch {
        if (canceled) return;
        setAccessToken(null);
        setUser(null);
        setStatus("unauthenticated");
      }
    }

    void restoreSession();

    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    function handleSessionCleared() {
      setUser(null);
      setStatus("unauthenticated");
    }

    window.addEventListener(AUTH_SESSION_CLEARED_EVENT, handleSessionCleared);
    return () => window.removeEventListener(AUTH_SESSION_CLEARED_EVENT, handleSessionCleared);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      completeLogin,
      clearSession: () => {
        clearSession();
      },
      logout,
    }),
    [clearSession, completeLogin, logout, status, user],
  );

  return (
    <AuthContext.Provider value={value}>
      <AuthRouteGuard>{children}</AuthRouteGuard>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

function AuthRouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status, user } = useAuth();
  const routeAccess = useMemo(() => getRouteAccess(pathname), [pathname]);

  useEffect(() => {
    if (status === "checking") return;

    if (routeAccess.kind === "protected" && status === "unauthenticated") {
      router.replace("/login");
      return;
    }

    if (
      routeAccess.kind === "protected" &&
      status === "authenticated" &&
      user &&
      !isAllowedUserType(user.userType, routeAccess.allowedUserTypes)
    ) {
      router.replace(getRedirectForUnauthorizedRole(user.userType));
    }
  }, [pathname, routeAccess, router, status, user]);

  if (routeAccess.kind !== "common" && status === "checking") {
    return null;
  }

  if (routeAccess.kind === "protected") {
    if (status !== "authenticated" || !user) return null;
    if (!isAllowedUserType(user.userType, routeAccess.allowedUserTypes)) return null;
  }

  return children;
}
