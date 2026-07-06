const DEFAULT_FRONTEND_ORIGIN = "http://localhost:3000";

type CorsEnv = Partial<Pick<NodeJS.ProcessEnv, "FRONTEND_ORIGIN" | "FRONTEND_ALLOWED_ORIGINS" | "NODE_ENV">>;

export function getAllowedFrontendOrigins(env: CorsEnv = process.env) {
  return uniqueOrigins([env.FRONTEND_ORIGIN ?? DEFAULT_FRONTEND_ORIGIN, ...splitOrigins(env.FRONTEND_ALLOWED_ORIGINS)]);
}

export function createCorsOriginMatcher(allowedOrigins = getAllowedFrontendOrigins(), nodeEnv = process.env.NODE_ENV) {
  const allowed = new Set(allowedOrigins.map(normalizeOrigin));

  return (origin?: string) => {
    if (!origin) return true;
    return allowed.has(normalizeOrigin(origin)) || isDevelopmentLanFrontendOrigin(origin, nodeEnv);
  };
}

export function createCorsOriginDelegate(env: CorsEnv = process.env) {
  const matcher = createCorsOriginMatcher(getAllowedFrontendOrigins(env), env.NODE_ENV);

  return (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
    callback(null, matcher(origin));
  };
}

function splitOrigins(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function uniqueOrigins(origins: string[]) {
  return [...new Set(origins.map(normalizeOrigin).filter(Boolean))];
}

function normalizeOrigin(origin: string) {
  return origin.trim().replace(/\/+$/, "");
}

function isDevelopmentLanFrontendOrigin(origin: string, nodeEnv: string | undefined) {
  if (nodeEnv === "production") return false;

  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:") && url.port === "3000" && isPrivateIpv4(url.hostname);
  } catch {
    return false;
  }
}

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = parts;
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}
