export function GET(request: Request) {
  return Response.redirect(new URL("/logo-init-v2.png", request.url), 307);
}
