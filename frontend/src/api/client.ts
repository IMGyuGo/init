"use client";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
const TOKEN_KEY = "init.accessToken";
export const AUTH_SESSION_CLEARED_EVENT = "init:auth-session-cleared";

export type UserType = "COMPANY" | "CANDIDATE";
export type AuthUserType = "ADMIN" | UserType;

export type AuthUser = {
  userId: number;
  userType: AuthUserType;
  companyId?: number | null;
  candidateId?: number | null;
  email: string;
  name: string;
};

export type AuthTokenResponse = {
  accessToken: string;
  user: AuthUser;
};

export type ApiPageMeta = {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
};

export type ApiMeta = {
  traceId: string;
  timestamp: string;
  page?: ApiPageMeta;
};

export type ApiEnvelope<T, M = ApiMeta> = {
  data: T;
  meta: M;
};

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) {
    window.sessionStorage.setItem(TOKEN_KEY, token);
    return;
  }

  window.sessionStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event(AUTH_SESSION_CLEARED_EVENT));
}

export function getDefaultEntryPath(userType: "COMPANY"): "/company/applications/dashboard";
export function getDefaultEntryPath(userType: "CANDIDATE"): "/candidate/jobs";
export function getDefaultEntryPath(userType: "ADMIN"): "/";
export function getDefaultEntryPath(userType: AuthUserType): "/company/applications/dashboard" | "/candidate/jobs" | "/";
export function getDefaultEntryPath(userType: AuthUserType) {
  if (userType === "COMPANY") return "/company/applications/dashboard";
  if (userType === "CANDIDATE") return "/candidate/jobs";
  return "/";
}

export async function authFetch(input: string | URL, options: RequestInit = {}, retry = true): Promise<Response> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined && !isFormDataBody(options.body) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(input, {
    ...options,
    headers,
    credentials: "include",
  });

  if (response.status === 401 && retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return authFetch(input, options, false);
  }

  return response;
}

function isFormDataBody(body: BodyInit | null | undefined) {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const response = await authFetch(`${API_BASE}/api/v1${path}`, options, retry);

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.error?.message ?? "요청을 처리할 수 없습니다.");
  }
  return json.data as T;
}

export async function apiFetchEnvelope<T, M = ApiMeta>(path: string, options: RequestInit = {}, retry = true): Promise<ApiEnvelope<T, M>> {
  const response = await authFetch(`${API_BASE}/api/v1${path}`, options, retry);

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.error?.message ?? "Request failed.");
  }

  return json as ApiEnvelope<T, M>;
}

export async function refreshAccessToken() {
  try {
    const data = await apiFetch<AuthTokenResponse>("/auth/refresh", { method: "POST", body: "{}" }, false);
    setAccessToken(data.accessToken);
    return true;
  } catch {
    setAccessToken(null);
    return false;
  }
}

export async function refreshAuthSession() {
  const data = await apiFetch<AuthTokenResponse>("/auth/refresh", { method: "POST", body: "{}" }, false);
  setAccessToken(data.accessToken);
  return data;
}

export async function fetchCurrentUser() {
  return apiFetch<AuthUser>("/auth/me");
}

export async function logoutAuthSession() {
  return apiFetch<{ loggedOut: boolean }>("/auth/logout", { method: "POST" }, false);
}
