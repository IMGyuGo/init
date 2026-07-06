const DEFAULT_API_BASE_URL = "http://localhost:3001";

type BrowserLocationLike = Pick<Location, "hostname" | "protocol">;

export function getApiBaseUrl() {
  return resolveApiBaseUrl(
    process.env.NEXT_PUBLIC_API_BASE_URL,
    typeof window === "undefined" ? undefined : window.location,
  );
}

export function resolveApiBaseUrl(configuredBaseUrl?: string, browserLocation?: BrowserLocationLike) {
  const baseUrl = normalizeBaseUrl(configuredBaseUrl || DEFAULT_API_BASE_URL);
  if (!browserLocation || isLoopbackHost(browserLocation.hostname)) {
    return baseUrl;
  }

  try {
    const url = new URL(baseUrl);
    if (!isLoopbackHost(url.hostname)) {
      return baseUrl;
    }

    url.hostname = browserLocation.hostname;
    return normalizeBaseUrl(url.toString());
  } catch {
    return baseUrl;
  }
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

function isLoopbackHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "0.0.0.0";
}
