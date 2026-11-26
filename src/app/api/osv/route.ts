import { NextResponse } from "next/server";
import { osvRequestSchema } from "@/lib/deep/osv-schema";
import { createLimiter } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fixed host, never derived from input: no user-controlled URL means no SSRF surface.
const OSV_URL = "https://api.osv.dev/v1/querybatch";
const UPSTREAM_TIMEOUT_MS = 8000;
const MAX_RESPONSE_CHARS = 2_000_000;

const limiter = createLimiter({ limit: 30, windowMs: 300_000 });

function fail(error: string, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "cache-control": "no-store", ...headers } });
}

export async function POST(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0].trim() || "local";
  const gate = limiter.check(ip);
  if (!gate.allowed) {
    return fail("Rate limit reached for advisory checks. Try again shortly.", 429, {
      "retry-after": String(Math.ceil(gate.retryAfterMs / 1000)),
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Invalid JSON body.", 400);
  }

  const parsed = osvRequestSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid query batch.", 400);

  const upstream = {
    queries: parsed.data.queries.map((q) => ({
      package: { name: q.name, ecosystem: q.ecosystem },
      version: q.version,
    })),
  };

  try {
    const response = await fetch(OSV_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(upstream),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
      redirect: "error",
      credentials: "omit",
    });

    if (!response.ok) return fail(`Advisory service returned ${response.status}.`, 502);

    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARS) return fail("Advisory response exceeded the size cap.", 502);

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return fail("Advisory service returned malformed JSON.", 502);
    }

    return NextResponse.json({ ok: true, data }, { headers: { "cache-control": "no-store" } });
  } catch {
    return fail("Advisory service unreachable.", 502);
  }
}
