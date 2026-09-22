import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

const handleI18nRouting = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  // Let next-intl handle locale routing first
  const response = handleI18nRouting(request as unknown as Parameters<typeof handleI18nRouting>[0]);

  // If next-intl redirected, return that response
  if (response.status === 307 || response.status === 308) {
    return response;
  }

  return response;
}

export const runtime = "nodejs";

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};