/**
 * Server-side route protection (runs at the edge before any page is served, so it covers direct
 * URL access and browser refreshes - not just client-side navigation).
 *
 * It reads the `st_auth` presence cookie set alongside the JWT on sign-in. This cookie only drives
 * navigation/redirects; the authoritative authorization gate is the JWT the FastAPI backend
 * validates on every API call, so no protected data is ever served without a valid token.
 *
 *  - Unauthenticated visitors may only reach the public auth pages; everything else -> /login.
 *  - Authenticated users can never sit on the landing / login / register pages -> /map.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Pages a signed-OUT visitor may load directly.
const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
]);

// Pages a signed-IN user must not sit on (bounced to the app home).
const AUTHED_BLOCKED = new Set(["/", "/login", "/register"]);

const HOME = "/map";
const SIGNIN = "/login";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const authed = req.cookies.get("st_auth")?.value === "1";

  if (authed && AUTHED_BLOCKED.has(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = HOME;
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (!authed && !PUBLIC_PATHS.has(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = SIGNIN;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Run on every route EXCEPT Next internals and static assets (anything with a file extension).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
