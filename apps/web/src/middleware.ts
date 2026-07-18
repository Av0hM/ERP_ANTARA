import { NextResponse, type NextRequest } from "next/server";

const authCookiePattern = /^(authjs\.|__Secure-authjs\.|next-auth\.)/;
const demoCookieName = "orbitalops-dev-session";
const demoLoginEnabled = process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN === "true";

export default function middleware(request: NextRequest) {
  const hasAuthCookie = request.cookies.getAll().some((cookie) => authCookiePattern.test(cookie.name));
  const hasDemoCookie = demoLoginEnabled && request.cookies.get(demoCookieName)?.value === "1";

  if (!hasAuthCookie && !hasDemoCookie) {
    const callbackUrl = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    return NextResponse.redirect(new URL(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`, request.url));
  }

  return NextResponse.next();
}

export const runtime = "nodejs";

export const config = {
  matcher: ["/dashboard/:path*", "/tasks/:path*", "/calendar/:path*", "/worklogs/:path*", "/analytics/:path*"],
};
