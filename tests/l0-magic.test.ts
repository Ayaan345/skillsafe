import { describe, expect, it } from "vitest";
import { magicFinding, sniff } from "@/lib/scan/l0/magic";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const enc = (s: string) => new TextEncoder().encode(s);

describe("sniff", () => {
  it("identifies png and text", () => {
    expect(sniff(PNG)).toBe("png");
    expect(sniff(enc("# Title\n\nSome prose."))).toBe("text");
  });
});

describe("magicFinding", () => {
  it("flags a png payload named as markdown", () => {
    const f = magicFinding("readme.md", PNG);
    expect(f?.ruleId).toBe("asset-001");
    expect(f?.severity).toBe("CRITICAL");
  });

  it("flags html named as a png", () => {
    expect(magicFinding("icon.png", enc("<!DOCTYPE html><html></html>"))?.ruleId).toBe("asset-001");
  });

  it("flags a png named as a jpeg", () => {
    expect(magicFinding("icon.jpg", PNG)?.ruleId).toBe("asset-001");
  });

  it("does not flag a correctly declared png", () => {
    expect(magicFinding("icon.png", PNG)).toBeNull();
  });

  it("does not flag ordinary markdown", () => {
    expect(magicFinding("SKILL.md", enc("# Summarizer\n\nSummarize text."))).toBeNull();
  });

  it("does not flag an extension that declares no format", () => {
    expect(magicFinding("mystery.bin", PNG)).toBeNull();
  });
});
