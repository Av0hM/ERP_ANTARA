import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";

import { routing } from "@/i18n/routing";

const handleI18nRouting = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname !== "/" &&
    pathname !== "/en" &&
    pathname !== "/hi"
  ) {
    return NextResponse.next();
  }

  return handleI18nRouting(
    request as unknown as Parameters<typeof handleI18nRouting>[0]
  );
}

export const runtime = "nodejs";

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};