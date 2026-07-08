export function getOAuthLoginMessageState(href: string) {
  const url = new URL(href);
  const message = url.searchParams.get("message")?.trim() ?? "";
  url.searchParams.delete("message");
  url.searchParams.delete("errorCode");

  return {
    message,
    cleanPath: `${url.pathname}${url.search}${url.hash}`,
  };
}

export function toOAuthLoginErrorPath(message: string, errorCode = "COMMON_UNAUTHORIZED") {
  const params = new URLSearchParams({
    errorCode,
    message,
  });
  return `/login?${params.toString()}`;
}
