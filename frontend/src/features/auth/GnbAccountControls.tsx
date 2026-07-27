"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "./AuthProvider";
import { getLogoutRedirectPath } from "./routePolicy";

const LOGOUT_LABEL = "\uB85C\uADF8\uC544\uC6C3";
const USER_LABEL = "\uC0AC\uC6A9\uC790";
const COMPANY_ACCOUNT_LABEL = "\uAE30\uC5C5 \uACC4\uC815";
const CANDIDATE_ACCOUNT_LABEL = "\uC9C0\uC6D0\uC790 \uACC4\uC815";

export function GnbLogoutButton() {
  const router = useRouter();
  const { logout, user } = useAuth();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    if (pending) return;
    setPending(true);
    router.replace(getLogoutRedirectPath(user?.userType));
    await logout();
  }

  return (
    <button
      className="icon-btn gnb-logout"
      type="button"
      aria-label={LOGOUT_LABEL}
      title={LOGOUT_LABEL}
      disabled={pending}
      onClick={handleLogout}
    >
      <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
        <path
          d="M10 17l5-5-5-5M15 12H3M21 19V5a2 2 0 0 0-2-2h-5M14 21h5a2 2 0 0 0 2-2"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    </button>
  );
}

export function GnbAvatar({ accountLabel }: { accountLabel: string }) {
  const { user } = useAuth();
  const resolvedAccountLabel =
    user?.userType === "COMPANY" ? COMPANY_ACCOUNT_LABEL : user?.userType === "CANDIDATE" ? CANDIDATE_ACCOUNT_LABEL : accountLabel;
  const accessibleName = user?.name?.trim() || user?.email?.trim() || USER_LABEL;

  return (
    <div className="avatar" aria-label={`${resolvedAccountLabel}: ${accessibleName}`} title={accessibleName}>
      {getAvatarLabel(user?.name, user?.email)}
    </div>
  );
}

function getAvatarLabel(name?: string, email?: string) {
  const trimmedName = name?.trim();
  if (trimmedName) {
    const parts = trimmedName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2 && parts.every((part) => /^[A-Za-z]/.test(part))) {
      return parts
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join("");
    }

    return Array.from(trimmedName)[0].toUpperCase();
  }

  const emailInitial = email?.trim().split("@")[0]?.[0];
  return emailInitial ? emailInitial.toUpperCase() : "?";
}
