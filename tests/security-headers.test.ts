import { describe, expect, it } from "vitest";
import { buildCsp, staticSecurityHeaders } from "@/lib/security-headers";

describe("buildCsp", () => {
  it("permits same-origin and inline bootstrap scripts without a nonce dependency", () => {
    const csp = buildCsp({ isDev: false });
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("strict-dynamic");
    expect(csp).not.toContain("nonce-");
  });

  it("permits no third-party script origin", () => {
    const csp = buildCsp({ isDev: false });
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src")) ?? "";
    expect(scriptSrc).not.toContain("https:");
    expect(scriptSrc).not.toContain("http:");
  });

  it("never allows unsafe-eval in production, but allows WASM compile", () => {
    const csp = buildCsp({ isDev: false });
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("'wasm-unsafe-eval'");
  });

  it("blocks cross-origin exfiltration and locks down plugins and embedding", () => {
    const csp = buildCsp({ isDev: false });
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("permits dev-only eval and hot-reload websockets in development", () => {
    const csp = buildCsp({ isDev: true });
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