import { AuthUserType, UserType, getDefaultEntryPath } from "../../api/client";

export type RouteAccess =
  | { kind: "common" }
  | { kind: "public" }
  | { kind: "protected"; allowedUserTypes: UserType[] };

const publicRoutes = ["/", "/login", "/company/login", "/signup", "/password/reset", "/public"] as const;
const protectedRoutePrefixes: Array<{ prefix: string; allowedUserTypes: UserType[] }> = [
  { prefix: "/company", allowedUserTypes: ["COMPANY"] },
  { prefix: "/candidate", allowedUserTypes: ["CANDIDATE"] },
];

export function getRouteAccess(pathname: string): RouteAccess {
  const publicRoute = publicRoutes.find((route) => isRouteOrChild(pathname, route));
  if (publicRoute) return { kind: "public" };

  const protectedRoute = protectedRoutePrefixes.find(({ prefix }) => isRouteOrChild(pathname, prefix));
  if (protectedRoute) return { kind: "protected", allowedUserTypes: protectedRoute.allowedUserTypes };

  return { kind: "common" };
}

export function getRedirectForAuthenticatedPublicRoute(userType: AuthUserType) {
  return getDefaultEntryPath(userType);
}

export function getRedirectForUnauthorizedRole(userType: AuthUserType) {
  return getDefaultEntryPath(userType);
}

export function isAllowedUserType(userType: AuthUserType, allowedUserTypes: UserType[]) {
  return allowedUserTypes.includes(userType as UserType);
}

function isRouteOrChild(pathname: string, route: string) {
  if (route === "/") return pathname === "/";
  return pathname === route || pathname.startsWith(`${route}/`);
}
