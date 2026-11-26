import { describe, expect, it } from "vitest";
import { buildQueryBatch, mapOsvResults, MAX_IDS_SHOWN } from "@/lib/deep/osv";
import type { DependencyRef } from "@/lib/scan/types";

const dep = (name: string, version = "1.0.0"): DependencyRef => ({
  name, version, ecosystem: "npm", file: "package.json", line: 3, start: 40,
});

describe("buildQueryBatch", () => {
  it("dedupes identical pins and shapes the OSV query", () => {
    const batch = buildQueryBatch([dep("lodash"), dep("lodash"), dep("react", "18.2.0")]);
    expect(batch.queries.length).toBe(2);
    expect(batch.queries[0]).toEqual({ package: { name: "lodash", ecosystem: "npm" }, version: "1.0.0" });
    expect(batch.index.length).toBe(2);
  });
});

describe("mapOsvResults", () => {
  it("produces a HIGH sup-003 finding carrying advisory ids", () => {
    const index = [dep("lodash", "4.17.20")];
    const findings = mapOsvResults(index, { results: [{ vulns: [{ id: "GHSA-xxxx-yyyy-zzzz" }] }] });
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe("sup-003");
    expect(findings[0].severity).toBe("HIGH");
    expect(findings[0].snippet).toContain("lodash@4.17.20");
    expect(findings[0].snippet).toContain("GHSA-xxxx-yyyy-zzzz");
  });

  it("produces nothing when no advisories match", () => {
    expect(mapOsvResults([dep("lodash")], { results: [{}] })).toEqual([]);
  });

  it("survives malformed or hostile payloads", () => {
    expect(mapOsvResults([dep("a")], null)).toEqual([]);
    expect(mapOsvResults([dep("a")], { results: "nope" })).toEqual([]);
    expect(mapOsvResults([dep("a")], { results: [{ vulns: [{ id: "<img src=x onerror=alert(1)>" }] }] })).toEqual([]);
  });

  it("caps the advisory ids surfaced per dependency", () => {
    const vulns = Array.from({ length: 40 }, (_, i) => ({ id: `GHSA-${i}` }));
    const findings = mapOsvResults([dep("a")], { results: [{ vulns }] });
    expect(findings[0].snippet.split(", ").length).toBe(MAX_IDS_SHOWN);
  });
});
