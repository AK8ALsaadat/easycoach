// Browsers request /favicon.ico on pages without a <link rel="icon"> (redirects, raw 404s).
// Point them at the real app icon instead of returning a 404.
export function GET(request: Request) {
  return Response.redirect(new URL("/icon.svg", request.url), 308);
}
