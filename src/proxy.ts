import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { buildCsp, staticSecurityHeaders } from "@/lib/security-headers";

export default async function proxy(request: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";
  const csp = buildCsp({ isDev, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  for (const [key, value] of Object.entries(staticSecurityHeaders(isDev))) response.headers.set(key, value);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    const client = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    });
    await client.auth.getUser();
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
