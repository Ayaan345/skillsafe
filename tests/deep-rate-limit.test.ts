import { describe, expect, it } from "vitest";
import { createLimiter } from "@/lib/server/rate-limit";

describe("createLimiter", () => {
  it("allows up to the limit then blocks", () => {
    const limiter = createLimiter({ limit: 3, windowMs: 1000 });
    expect(limiter.check("ip", 0).allowed).toBe(true);
    expect(limiter.check("ip", 10).allowed).toBe(true);
    expect(limiter.check("ip", 20).allowed).toBe(true);
    const blocked = limiter.check("ip", 30);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("allows again after the window elapses", () => {
    const limiter = createLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.check("ip", 0).allowed).toBe(true);
    expect(limiter.check("ip", 500).allowed).toBe(false);
    expect(limiter.check("ip", 1001).allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    const limiter = createLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("b", 0).allowed).toBe(true);
    expect(limiter.check("a", 1).allowed).toBe(false);
  });
});
