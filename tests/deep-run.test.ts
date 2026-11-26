import { afterEach, describe, expect, it, vi } from "vitest";
import { runOsvCheck } from "@/lib/deep/run-osv";
import type { DependencyRef } from "@/lib/scan/types";

const dep: DependencyRef = {
  name: "lodash", version: "4.17.20", ecosystem: "npm", file: "package.json", line: 2, start: 10,
};

afterEach(() => vi.unstubAllGlobals());

describe("runOsvCheck", () => {
  it("returns advisory findings on success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, data: { results: [{ vulns: [{ id: "GHSA-1" }] }] } }), { status: 200 }),
    ));
    const result = await runOsvCheck([dep]);
    expect(result.checked).toBe(1);
    expect(result.findings[0].ruleId).toBe("sup-003");
  });

  it("degrades to a note on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, error: "Rate limit reached." }), { status: 429 }),
    ));
    const result = await runOsvCheck([dep]);
    expect(result.findings).toEqual([]);
    expect(result.note).toContain("Rate limit");
  });

  it("degrades to a note when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const result = await runOsvCheck([dep]);
    expect(result.findings).toEqual([]);
    expect(result.note).toContain("unreachable");
  });

  it("makes no request when there are no pins", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const result = await runOsvCheck([]);
    expect(spy).not.toHaveBeenCalled();
    expect(result.checked).toBe(0);
    expect(result.note).toBeDefined();
  });
});
