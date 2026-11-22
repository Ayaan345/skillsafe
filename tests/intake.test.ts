import { describe, expect, it } from "vitest";
import { classifyFile, displayPath, MAX_FILES, planIntake } from "@/lib/scan/intake";

describe("classifyFile", () => {
  it("routes text, archives and binary assets into L0", () => {
    expect(classifyFile("SKILL.md", 100).status).toBe("scan");
    expect(classifyFile("skill.zip", 100).status).toBe("scan");
    expect(classifyFile("shot.png", 100).status).toBe("scan");
    expect(classifyFile("font.woff2", 100).status).toBe("scan");
    expect(classifyFile("mystery.bin", 100).status).toBe("scan");
  });

  it("rejects files over the per-file cap", () => {
    expect(classifyFile("huge.md", 11 * 1024 * 1024).status).toBe("rejected");
  });
});

describe("planIntake", () => {
  it("enforces the 250-file count cap", () => {
    const files = Array.from({ length: 251 }, (_, i) => ({ name: `f${i}.md`, size: 10 }));
    const plan = planIntake(files);
    expect(plan.accepted.length).toBe(MAX_FILES);
    expect(plan.skipped.length).toBe(1);
  });

  it("enforces the 50MB total cap", () => {
    const files = Array.from({ length: 6 }, (_, i) => ({ name: `f${i}.md`, size: 9 * 1024 * 1024 }));
    const plan = planIntake(files);
    expect(plan.accepted.length).toBe(5);
    expect(plan.skipped.length).toBe(1);
  });
});

describe("displayPath", () => {
  it("strips bidi and zero-width characters from display paths", () => {
    expect(displayPath("evil\u202Ename\u200B.md")).toBe("evilname.md");
    expect(displayPath("a\u0000b.md")).toBe("ab.md");
  });
});
