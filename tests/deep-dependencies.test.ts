import { describe, expect, it } from "vitest";
import { collectDependencies, exactVersion, MAX_DEPENDENCIES } from "@/lib/scan/detect/dependencies";

const far = () => Date.now() + 60_000;
const file = (path: string, content: string) => ({ path, content });

describe("exactVersion", () => {
  it("accepts exact pins and rejects ranges", () => {
    expect(exactVersion("1.2.3")).toBe("1.2.3");
    expect(exactVersion("=1.2.3")).toBe("1.2.3");
    expect(exactVersion("v2.0.0")).toBe("2.0.0");
    expect(exactVersion("^1.2.3")).toBeNull();
    expect(exactVersion("~1.2.3")).toBeNull();
    expect(exactVersion(">=1.0.0")).toBeNull();
    expect(exactVersion("1.x.0")).toBeNull();
    expect(exactVersion("*")).toBeNull();
    expect(exactVersion("workspace:*")).toBeNull();
    expect(exactVersion("git+https://x.example/y.git")).toBeNull();
  });
});

describe("collectDependencies", () => {
  it("extracts exact npm pins", () => {
    const pkg = JSON.stringify({ dependencies: { lodash: "4.17.21", react: "^18.2.0" } });
    const deps = collectDependencies([file("package.json", pkg)], far());
    expect(deps.length).toBe(1);
    expect(deps[0]).toMatchObject({ name: "lodash", version: "4.17.21", ecosystem: "npm" });
  });

  it("skips non-registry and range specifiers", () => {
    const pkg = JSON.stringify({
      dependencies: { a: "file:../a", b: "workspace:*", c: "1.0.0 - 2.0.0", d: "github:x/y" },
    });
    expect(collectDependencies([file("package.json", pkg)], far())).toEqual([]);
  });

  it("extracts exact requirements pins only", () => {
    const req = "requests==2.31.0\nnumpy>=1.24\nflask~=3.0.0\n# comment\nurllib3==1.26.5\n";
    const deps = collectDependencies([file("requirements.txt", req)], far());
    expect(deps.map((d) => d.name).sort()).toEqual(["requests", "urllib3"]);
    expect(deps.every((d) => d.ecosystem === "PyPI")).toBe(true);
  });

  it("extracts resolved versions from a lockfile", () => {
    const lock = JSON.stringify({
      lockfileVersion: 3,
      packages: { "": { version: "1.0.0" }, "node_modules/lodash": { version: "4.17.21" } },
    });
    const deps = collectDependencies([file("package-lock.json", lock)], far());
    expect(deps.some((d) => d.name === "lodash" && d.version === "4.17.21")).toBe(true);
  });

  it("caps the number of collected dependencies", () => {
    const dependencies: Record<string, string> = {};
    for (let i = 0; i < 400; i++) dependencies[`pkg-${i}`] = "1.0.0";
    const deps = collectDependencies([file("package.json", JSON.stringify({ dependencies }))], far());
    expect(deps.length).toBe(MAX_DEPENDENCIES);
  });
});
