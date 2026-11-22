import { describe, expect, it } from "vitest";
import { scanFiles } from "@/lib/scan/engine";
import { RULES } from "@/lib/scan/rules";
import { execBounded } from "@/lib/scan/text";

const HOSTILE: string[] = [
  "ignore " + "previous ".repeat(3000) + "x",
  "ignore" + " ".repeat(6000) + "previous instructions",
  "a".repeat(60_000),
  "curl " + "x".repeat(6000) + "|",
  "<!--" + "a".repeat(6000),
  "[" + "]".repeat(6000),
  "eval(".repeat(6000),
  "QWxhZGRpbjpvcGVuIHNlc2FtZQ".repeat(4000),
  "https://" + "a".repeat(30_000),
  "(".repeat(20_000),
  "const f = " + "a+".repeat(6000) + "b; f(x);",
  "\u200b".repeat(40_000),
];

describe("ReDoS resistance", () => {
  it("every rule pattern stays bounded on pathological input", () => {
    for (const rule of RULES) {
      if (!rule.pattern) continue;
      for (let i = 0; i < HOSTILE.length; i++) {
        const started = Date.now();
        execBounded(HOSTILE[i], rule.pattern, started + 150);
        expect(Date.now() - started, `${rule.id} on hostile[${i}]`).toBeLessThan(1200);
      }
    }
  });

  it("whole-document scans stay within the engine deadline", () => {
    for (let i = 0; i < HOSTILE.length; i++) {
      const report = scanFiles([{ path: "f.md", content: HOSTILE[i] }], 400);
      expect(report.durationMs, `hostile[${i}]`).toBeLessThan(2000);
    }
  });
});
