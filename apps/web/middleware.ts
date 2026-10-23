import { NextResponse, type NextRequest } from "next/server";
import { adminTelegramIds, originAllowed, tokensMatch, usesMiniAppAuth } from "../../src/server/auth/http";
import { adminForbiddenPage } from "../../src/server/auth/missingPage";
import { openSession } from "../../src/server/auth/sessionOpen";

function forbidden() {
  const requestId = crypto.randomUUID();
  return NextResponse.json(
    { error: "forbidden", message: "You don't have permission to do this on this project.", requestId },
    { status: 403 },
  );
}

function adminClosed(html: boolean): NextResponse {
  if (!html) {
    return NextResponse.json(
      { error: "forbidden", message: "You don't have permission to do this on this project." },
      { status: 403 },
    );
  }
  return new NextResponse(adminForbiddenPage(), {
    status: 403,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function guardAdmin(request: NextRequest, html: boolean): Promise<NextResponse> {
  const token = request.cookies.get("certa_session")?.value;
  if (!token) return adminClosed(html);
  try {
    const claims = await openSession(token);
    if (!adminTelegramIds().has(claims.tid) || claims.pra !== "platform_admin") return adminClosed(html);
  } catch {
    return adminClosed(html);
  }
  return NextResponse.next();
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/admin" || path.startsWith("/admin/")) return guardAdmin(request, true);
  if (path === "/api/admin" || path.startsWith("/api/admin/")) return guardAdmin(request, false);
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return NextResponse.next();
  if (
    path.startsWith("/api/health") ||
    path.startsWith("/api/telegram") ||
    path.startsWith("/api/cron") ||
    path.startsWith("/api/paid") ||
    path.startsWith("/api/files")
  ) {
    return NextResponse.next();
  }
  if (usesMiniAppAuth(request)) return NextResponse.next();
  const session = request.cookies.get("certa_session")?.value;
  if (!session) return NextResponse.next();
  if (path === "/api/auth/telegram") {
    if (!originAllowed(request.headers.get("origin"))) return forbidden();
    return NextResponse.next();
  }
  if (!originAllowed(request.headers.get("origin"))) return forbidden();
  const header = request.headers.get("x-csrf-token") ?? "";
  const cookie = request.cookies.get("certa_csrf")?.value ?? "";
  if (!tokensMatch(header, cookie)) return forbidden();
  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*", "/admin", "/admin/:path*"] };
