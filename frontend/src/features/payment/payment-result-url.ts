export function clearPaymentResultQuery(pathname: string) {
  if (typeof window === "undefined") return;
  const hash = window.location.hash || "";
  window.history.replaceState(window.history.state, "", `${pathname}${hash}`);
}
