import { NextResponse } from "next/server";
import { z } from "zod";
import { createLimiter } from "@/lib/server/rate-limit";
import { publicHttpUrl } from "@/lib/server/egress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENDPOINT = "https://safebrowsing.googleapis.com/v4/threatMatches:find";
const TIMEOUT_MS = 8000;
const MAX_RESPONSE_CHARS = 1_000_000;

const limiter = createLimiter({ limit: 20, windowMs: 300_000 });

const schema = z.object({
  urls: z.array(z.string().min(8).max(2000)).min(1).max(50),
});

function fail(error: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json(
    { ok: false, ...extra, error },
    { status, headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const key = process.env.SAFE_BROWSING_API_KEY;
  if (!key) {
    return fail(
      "Live link reputation is off on this deployment. Set SAFE_BROWSING_API_KEY (free from Google Cloud) to enable it. Structural link checks already ran offline.",
      503,
      { configured: false },
    );
  }

  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  const gate = limiter.check(ip);
  if (!gate.allowed) {
    return NextResponse.json(
      { ok: false, error: "Rate limit reached for reputation checks. Try again shortly." },
      { status: 429, headers: { "cache-control": "no-store", "retry-after": String(Math.ceil(gate.retryAfterMs / 1000)) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Invalid JSON body.", 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("Invalid URL batch.", 400);

  const safe: string[] = [];
  for (const candidate of parsed.data.urls) {
    const url = publicHttpUrl(candidate);
    if (url) safe.push(url.toString());
  }
  if (safe.length === 0) return fail("No public http(s) URLs to look up.", 400);

  const payload = {
    client: { clientId: "skillsafe", clientVersion: "1.0" },
    threatInfo: {
      threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
      platformTypes: ["ANY_PLATFORM"],
      threatEntryTypes: ["URL"],
      threatEntries: safe.map((url) => ({ url })),
    },
  };

  try {
    const upstream = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
      redirect: "error",
      credentials: "omit",
    });

    if (!upstream.ok) return fail(`Reputation service returned ${upstream.status}.`, 502);
    const text = await upstream.text();
    if (text.length > MAX_RESPONSE_CHARS) return fail("Reputation response exceeded the size cap.", 502);

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return fail("Reputation service returned malformed JSON.", 502);
    }

    return NextResponse.json({ ok: true, configured: true, data }, { headers: { "cache-control": "no-store" } });
  } catch {
    return fail("Reputation service unreachable.", 502);
  }
}
