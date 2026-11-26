import { beforeEach, describe, expect, it } from "vitest";
import {
  checkHashes,
  EMPTY_LISTS,
  parseHashLists,
  resetHashListCache,
} from "@/lib/scan/hash-reputation";
import type { FileHash } from "@/lib/scan/types";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

const file = (path: string, sha256: string): FileHash => ({ path, sha256, size: 10 });

beforeEach(() => resetHashListCache());

describe("parseHashLists", () => {
  it("normalizes valid hashes and drops malformed entries", () => {
    const lists = parseHashLists({
      version: 3,
      updated: "2026-11-23",
      denylist: [HASH_A.toUpperCase(), "not-a-hash", HASH_A, 42, null],
      allowlist: [HASH_B],
    });
    expect(lists.version).toBe(3);
    expect(lists.denylist).toEqual([HASH_A]);
    expect(lists.allowlist).toEqual([HASH_B]);
  });

  it("returns empty lists for malformed payloads", () => {
    expect(parseHashLists(null)).toEqual(EMPTY_LISTS);
    expect(parseHashLists("nope")).toEqual(EMPTY_LISTS);
    expect(parseHashLists({ denylist: "nope" })).toEqual(EMPTY_LISTS);
  });
});

describe("checkHashes", () => {
  it("returns nothing when both lists are empty", () => {
    expect(checkHashes([file("a.md", HASH_A)], HASH_B, EMPTY_LISTS)).toEqual([]);
  });

  it("raises a non-negotiable CRITICAL on a denylist file match", () => {
    const lists = parseHashLists({ version: 2, denylist: [HASH_A], allowlist: [] });
    const findings = checkHashes([file("evil.md", HASH_A)], undefined, lists);
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe("hash-001");
    expect(findings[0].severity).toBe("CRITICAL");
    expect(findings[0].confidence).toBe(1);
    expect(findings[0].snippet).toContain(HASH_A);
  });

  it("raises a CRITICAL on a bundle denylist match", () => {
    const lists = parseHashLists({ version: 2, denylist: [HASH_C], allowlist: [] });
    const findings = checkHashes([file("a.md", HASH_A)], HASH_C, lists);
    expect(findings.some((f) => f.file === "(bundle)" && f.ruleId === "hash-001")).toBe(true);
  });

  it("raises only INFO on an allowlist match and never suppresses other findings", () => {
    const lists = parseHashLists({ version: 2, denylist: [], allowlist: [HASH_A] });
    const findings = checkHashes([file("good.md", HASH_A)], undefined, lists);
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe("hash-002");
    expect(findings[0].severity).toBe("INFO");
  });

  it("prefers the denylist when a hash appears in both lists", () => {
    const lists = parseHashLists({ version: 2, denylist: [HASH_A], allowlist: [HASH_A] });
    const findings = checkHashes([file("x.md", HASH_A)], undefined, lists);
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe("hash-001");
  });

  it("ignores hashes absent from both lists", () => {
    const lists = parseHashLists({ version: 2, denylist: [HASH_A], allowlist: [HASH_B] });
    expect(checkHashes([file("x.md", HASH_C)], HASH_C, lists)).toEqual([]);
  });
});
