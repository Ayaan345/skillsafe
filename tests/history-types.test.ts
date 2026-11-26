import { describe, expect, it } from "vitest";
import { sourceTypeFromRaw } from "@/lib/history/types";

describe("sourceTypeFromRaw", () => {
  it("classifies an image with extracted metadata as a file", () => {
    expect(sourceTypeFromRaw([{ path: "logo.png" }])).toBe("file");
  });

  it("classifies archives and multiple raw files as zip sources", () => {
    expect(sourceTypeFromRaw([{ path: "skill.zip" }])).toBe("zip");
    expect(sourceTypeFromRaw([{ path: "skill.md" }, { path: "rules.json" }])).toBe("zip");
  });

  it("classifies pasted skill text separately", () => {
    expect(sourceTypeFromRaw([{ path: "SKILL.md" }])).toBe("paste");
  });
});
