import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@/lib/env/server";

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function secret(): string | null {
  return getServerEnv().REPORT_SIGNING_SECRET ?? null;
}

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function sign(body: string, key: string): string {
  return createHmac("sha256", key).update(body).digest("base64url");
}

export function sharingConfigured(): boolean {
  return Boolean(secret());
}

export function mintShareToken(scanId: string): string | null {
  const key = secret();
  if (!key) return null;
  const body = b64url(JSON.stringify({ s: scanId, e: Date.now() + TTL_MS }));
  return `${body}.${sign(body, key)}`;
}

export function verifyShareToken(token: string): { scanId: string } | null {
  const key = secret();
  if (!key || typeof token !== "string" || token.length > 400) return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;

  const body = token.slice(0, dot);
  const given = token.slice(dot + 1);
  const expected = sign(body, key);
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { s?: unknown; e?: unknown };
    if (typeof parsed.s !== "string" || typeof parsed.e !== "number") return null;
    if (parsed.e < Date.now()) return null;
    return { scanId: parsed.s };
  } catch {
    return null;
  }
}

export function shareExpiry(): string {
  return new Date(Date.now() + TTL_MS).toISOString();
}
