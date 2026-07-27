import { AuthUserType, UserType, getDefaultEntryPath } from "../../api/client";

type LoginPath = "/login" | "/company/login";

export type RouteAccess =
  | { kind: "common" }
  | { kind: "public" }
  | { kind: "protected"; allowedUserTypes: UserType[]; loginPath: LoginPath };

const publicRoutes = ["/", "/login", "/company/login", "/signup", "/password/reset", "/public"] as const;
const protectedRoutePrefixes: Array<{ prefix: string; allowedUserTypes: UserType[]; loginPath: LoginPath }> = [
  { prefix: "/company", allowedUserTypes: ["COMPANY"], loginPath: "/company/login" },
  { prefix: "/candidate", allowedUserTypes: ["CANDIDATE"], loginPath: "/login" },
];

export function getRouteAccess(pathname: string): RouteAccess {
  const publicRoute = publicRoutes.find((route) => isRouteOrChild(pathname, route));
  if (publicRoute) return { kind: "public" };

  const protectedRoute = protectedRoutePrefixes.find(({ prefix }) => isRouteOrChild(pathname, prefix));
  if (protectedRoute) {
    return {
      kind: "protected",
      allowedUserTypes: protectedRoute.allowedUserTypes,
      loginPath: protectedRoute.loginPath,
    };
  }

  return { kind: "common" };
}

export function getRedirectForAuthenticatedPublicRoute(userType: AuthUserType) {
  return getDefaultEntryPath(userType);
}

export function getRedirectForUnauthorizedRole(userType: AuthUserType) {
  return getDefaultEntryPath(userType);
}

export function getLogoutRedirectPath(userType?: AuthUserType | null) {
  return userType === "COMPANY" ? "/" : "/login";
}

export function isAllowedUserType(userType: AuthUserType, allowedUserTypes: UserType[]) {
  return allowedUserTypes.includes(userType as UserType);
}

function isRouteOrChild(pathname: string, route: string) {
  if (route === "/") return pathname === "/";
  return pathname === route || pathname.startsWith(`${route}/`);
}
