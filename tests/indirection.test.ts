import { describe, expect, it } from "vitest";
import { scanFiles } from "@/lib/scan/engine";

const has = (content: string, path: string) =>
  scanFiles([{ path, content }]).findings.some((f) => f.ruleId === "code-005");

describe("L2 indirection true positives", () => {
  const cases: Array<[string, string]> = [
    ["const f = eval; f(userInput);", "a.js"],
    ["const s = 'ev' + 'al'; window[s](userInput);", "a.js"],
    ["window['ev' + 'al'](userInput);", "a.js"],
    ["f = eval\nf(userInput)", "a.py"],
    ["getattr(os, 'system')(cmd)", "a.py"],
    ["const F = Function; new F('return 1')();", "a.js"],
  ];
  for (const [content, path] of cases) {
    it(`fires for ${path}: ${content.slice(0, 40)}`, () => {
      expect(has(content, path)).toBe(true);
    });
  }
});

describe("L2 indirection true negatives", () => {
  it("does not fire on a similarly named safe function", () => {
    expect(has("const f = evaluate; f(userInput);", "a.js")).toBe(false);
  });
  it("does not fire on ordinary string concatenation", () => {
    expect(has("const s = 'hello' + ' world'; console.log(s);", "a.js")).toBe(false);
  });
  it("does not fire on regex exec", () => {
    expect(has("const m = pattern.exec(line);", "a.js")).toBe(false);
  });
});
