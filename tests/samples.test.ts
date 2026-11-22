import { describe, expect, it } from "vitest";
import { scanText } from "@/lib/scan/engine";
import { SAMPLES } from "@/lib/ui/samples";

describe("seeded samples", () => {
  it("has unique ids and non-empty content", () => {
    expect(new Set(SAMPLES.map((s) => s.id)).size).toBe(SAMPLES.length);
    for (const s of SAMPLES) expect(s.content.length).toBeGreaterThan(40);
  });

  it("clean formatter produces no findings", () => {
    const s = SAMPLES.find((x) => x.id === "clean-formatter");
    const r = scanText(s!.content, s!.filename);
    expect(r.findings).toEqual([]);
    expect(r.label).toBe("No findings");
  });

  it("trojan summarizer produces a critical verdict", () => {
    const s = SAMPLES.find((x) => x.id === "hostile-summarizer");
    const r = scanText(s!.content, s!.filename);
    expect(r.counts.CRITICAL).toBeGreaterThan(0);
    expect(r.label).toBe("Critical risk");
  });

  it("hidden channels sample trips tag-block smuggling", () => {
    const s = SAMPLES.find((x) => x.id === "hidden-channels");
    const r = scanText(s!.content, s!.filename);
    expect(r.findings.some((f) => f.ruleId === "obf-003")).toBe(true);
    expect(r.findings.some((f) => f.ruleId === "obf-001")).toBe(true);
  });
});
