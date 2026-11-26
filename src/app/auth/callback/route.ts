import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/history";
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/history";

  if (!code) return NextResponse.redirect(new URL("/history?auth=missing", url.origin));

  const client = await supabaseServer();
  if (!client) return NextResponse.redirect(new URL("/history?auth=unconfigured", url.origin));

  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/history?auth=failed", url.origin));

  return NextResponse.redirect(new URL(target, url.origin));
}
