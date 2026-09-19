import { NextResponse, type NextRequest } from "next/server";
import { locales, Locale, defaultLocale, isValidLocale, getLocaleFromPath } from "@/i18n/config";

const authCookiePattern = /^(authjs\.|__Secure-authjs\.|next-auth\.)/;
const demoCookieName = "orbitalops-dev-session";
const demoLoginEnabled = process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN === "true";

export default function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  
  // Extract locale from path
  const pathnameLocale = getLocaleFromPath(pathname);
  const locale = pathnameLocale || defaultLocale;
  
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
  const response = NextResponse.next();
  response.headers.set("x-locale", locale);
  
  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)",
  ],
};