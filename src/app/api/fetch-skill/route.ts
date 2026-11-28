import { lookup } from "node:dns";
import { request as httpRequest, type ClientRequest, type IncomingMessage } from "node:http";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { NextResponse } from "next/server";
import { z } from "zod";
import { publicHttpUrl } from "@/lib/server/egress";
import { createLimiter } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_BODY_BYTES = 8192;
const limiter = createLimiter({ limit: 15, windowMs: 300_000 });
const schema = z.object({ url: z.string().min(10).max(2000) });

class PayloadTooLargeError extends Error {}

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "cache-control": "no-store" } });
}

function isPublicIpv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (
      (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99) || b === 168
    )) ||
    (a === 198 && (
      b === 18 || b === 19 || (b === 51 && c === 100)
    )) ||
    (a === 203 && b === 0 && c === 113)
  );
}

async function resolvePublicAddress(hostname: string): Promise<string | null> {
  const records = await new Promise<Array<{ address: string; family: number }>>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("DNS lookup timed out.")), 3000);
    lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(addresses);
    });
  });
  return records.find((record) => record.family === 4 && isPublicIpv4(record.address))?.address ?? null;
}

function requestPinned(target: URL, address: string): Promise<{ status: number; location: string | null; bytes: Buffer }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const requestRef: { current?: ClientRequest } = {};
    const timer = setTimeout(() => requestRef.current?.destroy(new Error("Remote request timed out.")), 8000);

    const finish = (error?: Error, result?: { status: number; location: string | null; bytes: Buffer }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else if (result) resolve(result);
      else reject(new Error("Remote request returned no result."));
    };

    const options = {
      method: "GET",
      agent: false as const,
      headers: {
        accept: "text/*,application/json,application/zip,application/octet-stream",
        "accept-encoding": "identity",
      },
      lookup: (_hostname: string, _options: object, callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void) => {
        callback(null, address, 4);
      },
    };

    const onResponse = (response: IncomingMessage) => {
      const length = Number(response.headers["content-length"] ?? 0);
      if (Number.isFinite(length) && length > MAX_BYTES) {
        const error = new PayloadTooLargeError("Remote file exceeds the 10MB limit.");
        finish(error);
        response.destroy(error);
        requestRef.current?.destroy(error);
        return;
      }

      const chunks: Buffer[] = [];
      let total = 0;
      response.on("data", (chunk: Buffer | string) => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += bytes.byteLength;
        if (total > MAX_BYTES) {
          const error = new PayloadTooLargeError("Remote file exceeded the 10MB limit while streaming.");
          finish(error);
          response.destroy(error);
          requestRef.current?.destroy(error);
          return;
        }
        chunks.push(bytes);
      });
      response.once("aborted", () => finish(new Error("Remote response ended unexpectedly.")));
      response.once("error", (error) => finish(error));
      response.once("end", () => finish(undefined, {
        status: response.statusCode ?? 502,
        location: typeof response.headers.location === "string" ? response.headers.location : null,
        bytes: Buffer.concat(chunks, total),
      }));
    };

    const request = target.protocol === "https:"
      ? httpsRequest(target, options, onResponse)
      : httpRequest(target, options, onResponse);

    requestRef.current = request;
    request.once("error", (error) => finish(error));
    request.end();
  });
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new Error("Request body exceeds the limit.");
  }
  if (!request.body) throw new Error("Request body is missing.");

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error("Request body exceeds the limit.");
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return JSON.parse(text);
}

export async function POST(request: Request) {
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (!limiter.check(ip).allowed) return fail("Rate limit reached for URL fetches. Try again shortly.", 429);

  let body: unknown;
  try {
    body = await readBoundedJson(request);
  } catch {
    return fail("Invalid or oversized JSON body.", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("Invalid URL.", 400);

  let target = publicHttpUrl(parsed.data.url);
  if (!target) return fail("Only public http(s) URLs are allowed. Internal, link-local and metadata hosts are refused.", 400);

  try {
    if (target.hostname.toLowerCase() === "github.com" && target.pathname.includes("/blob/")) {
      target = new URL(`https://raw.githubusercontent.com${target.pathname.replace("/blob/", "/")}`);
    }
  } catch {
    return fail("Invalid URL.", 400);
  }

  for (let hop = 0; hop <= 3; hop++) {
    if ((target.protocol === "https:" && target.port && target.port !== "443") ||
        (target.protocol === "http:" && target.port && target.port !== "80")) {
      return fail("Only standard public HTTP and HTTPS ports are allowed.", 400);
    }

    let address: string | null;
    try {
      address = await resolvePublicAddress(target.hostname);
    } catch {
      return fail("Could not resolve a public IPv4 address for that host.", 400);
    }
    if (!address) return fail("The host does not resolve to a public IPv4 address.", 400);

    let remote: { status: number; location: string | null; bytes: Buffer };
    try {
      remote = await requestPinned(target, address);
    } catch (error) {
      if (error instanceof PayloadTooLargeError) return fail(error.message, 413);
      return fail("Remote host unreachable or timed out.", 502);
    }

    if (remote.status >= 300 && remote.status < 400) {
      if (!remote.location) return fail("Redirect without a destination.", 502);
      try {
        const next = publicHttpUrl(new URL(remote.location, target).toString());
        if (!next) return fail("Redirect pointed at a non-public host and was refused.", 400);
        target = next;
        continue;
      } catch {
        return fail("Redirect destination was invalid.", 502);
      }
    }
    if (remote.status < 200 || remote.status >= 300) return fail(`Remote returned ${remote.status}.`, 502);

    const encodedName = target.pathname.split("/").filter(Boolean).pop() || "SKILL.md";
    let name = encodedName;
    try { name = decodeURIComponent(encodedName); } catch { /* retain the encoded path component */ }
    name = name.replace(/[\\/\u0000-\u001f\u007f]/g, "_").slice(0, 200) || "SKILL.md";

    return NextResponse.json(
      { ok: true, name, bytes: remote.bytes.toString("base64"), size: remote.bytes.byteLength },
      { headers: { "cache-control": "no-store" } },
    );
  }

  return fail("Too many redirects.", 502);
}
