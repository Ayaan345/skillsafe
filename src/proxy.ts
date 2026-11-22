import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, staticSecurityHeaders } from "@/lib/security-headers";

export default function proxy(request: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";
  const csp = buildCsp({ isDev, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  for (const [key, value] of Object.entries(staticSecurityHeaders(isDev))) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};