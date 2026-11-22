import { describe, expect, it } from "vitest";
import { buildCsp, staticSecurityHeaders } from "@/lib/security-headers";

describe("buildCsp", () => {
  it("embeds the per-request nonce", () => {
    expect(buildCsp({ nonce: "abc123", isDev: false })).toContain("'nonce-abc123'");
  });

  it("never allows unsafe-eval in production, but allows WASM compile", () => {
    const csp = buildCsp({ nonce: "n", isDev: false });
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("'wasm-unsafe-eval'");
  });

  it("locks down plugins and embedding", () => {
    const csp = buildCsp({ nonce: "n", isDev: false });
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("permits dev-only eval and hot-reload websockets in development", () => {
    const csp = buildCsp({ nonce: "n", isDev: true });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("ws:");
  });
});

describe("staticSecurityHeaders", () => {
  it("sets nosniff always, HSTS only in production", () => {
    expect(staticSecurityHeaders(true)["X-Content-Type-Options"]).toBe("nosniff");
    expect(staticSecurityHeaders(true)["Strict-Transport-Security"]).toBeUndefined();
    expect(staticSecurityHeaders(false)["Strict-Transport-Security"]).toContain("max-age=63072000");
  });
});
