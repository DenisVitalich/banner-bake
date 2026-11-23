import { NextResponse, type NextRequest } from "next/server";

const workspaceId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function middleware(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname === "/api/health") return NextResponse.next();
  const current = request.cookies.get("creative-workspace")?.value;
  const workspace = current && workspaceId.test(current) ? current : crypto.randomUUID();
  const headers = new Headers(request.headers);
  headers.set("x-creative-workspace", workspace);
  const response = NextResponse.next({ request: { headers } });
  if (current !== workspace) {
    response.cookies.set("creative-workspace", workspace, {
      httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365,
      secure: request.nextUrl.protocol === "https:",
    });
  }
  return response;
}

export const config = { matcher: ["/", "/api/:path*"] };
