import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

const authCookiePattern = /^(authjs\.|__Secure-authjs\.|next-auth\.)/;
const demoCookieName = "orbitalops-dev-session";
const demoLoginEnabled = process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN === "true";

const handleI18nRouting = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Let next-intl handle locale routing first
  const response = handleI18nRouting(
    request as unknown as Parameters<typeof handleI18nRouting>[0]
  );

  // If next-intl redirected, return that response
  if (response.status === 307 || response.status === 308) {
    return response;
  }

  // Get locale from response headers (set by next-intl middleware)
  const locale = response.headers.get("x-next-intl-locale") || routing.defaultLocale;

  // Check auth
  const hasAuthCookie = request.cookies.getAll().some((cookie) => 
    /^(authjs\.|__Secure-authjs\.|next-auth\.)/.test(cookie.name)
  );
  const hasDemoCookie = process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN === "true" && 
    request.cookies.get("orbitalops-dev-session")?.value === "1";

  // Protected routes
  const protectedPaths = ["/dashboard", "/tasks", "/calendar", "/worklogs", "/analytics", "/decisions", "/resources", "/reports", "/settings"];
  const isProtectedPath = protectedPaths.some(path => pathname.startsWith(`/${locale}${path}`) || pathname.startsWith(path));
  
  if (isProtectedPath && !hasAuthCookie && !hasDemoCookie) {
    const callbackUrl = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    return NextResponse.redirect(new URL(`/${locale}/login?callbackUrl=${encodeURIComponent(callbackUrl)}`, request.url));
  }

  // Add locale to response headers
  response.headers.set("x-locale", locale);
  
  return response;
}

export const config = {
  matcher: [
    "/",
    "/(en|hi)/:path*",
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)",
  ],
};