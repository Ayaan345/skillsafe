import { describe, expect, it } from "vitest";
import { OSV_MAX_QUERIES, osvRequestSchema } from "@/lib/deep/osv-schema";

const valid = { name: "lodash", version: "4.17.21", ecosystem: "npm" };

describe("osvRequestSchema", () => {
  it("accepts a well-formed batch", () => {
    expect(osvRequestSchema.safeParse({ queries: [valid] }).success).toBe(true);
    expect(osvRequestSchema.safeParse({ queries: [{ name: "requests", version: "2.31.0", ecosystem: "PyPI" }] }).success).toBe(true);
  });

  it("rejects an unknown ecosystem", () => {
    expect(osvRequestSchema.safeParse({ queries: [{ ...valid, ecosystem: "RubyGems" }] }).success).toBe(false);
  });

  it("rejects an oversized batch", () => {
    const queries = Array.from({ length: OSV_MAX_QUERIES + 1 }, () => valid);
    expect(osvRequestSchema.safeParse({ queries }).success).toBe(false);
  });

  it("rejects malformed names and versions", () => {
    expect(osvRequestSchema.safeParse({ queries: [{ ...valid, name: "https://evil.example" }] }).success).toBe(false);
    expect(osvRequestSchema.safeParse({ queries: [{ ...valid, name: "../../etc/passwd" }] }).success).toBe(false);
    expect(osvRequestSchema.safeParse({ queries: [{ ...valid, version: "1.0.0; rm -rf /" }] }).success).toBe(false);
    expect(osvRequestSchema.safeParse({ queries: [] }).success).toBe(false);
  });
});
