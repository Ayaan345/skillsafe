import { RULE_BY_ID } from "./rules";
import type { FileHash, Finding } from "./types";

export interface HashLists {
  version: number;
  updated: string;
  denylist: string[];
  allowlist: string[];
}

export const EMPTY_LISTS: HashLists = { version: 0, updated: "", denylist: [], allowlist: [] };

const HASH_RE = /^[0-9a-f]{64}$/;
const MAX_LIST_ENTRIES = 50_000;
const CACHE_TTL_MS = 5 * 60 * 1000;

let cached: HashLists | null = null;
let cachedAt = 0;

function normalizeHashes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (out.length >= MAX_LIST_ENTRIES) break;
    if (typeof entry !== "string") continue;
    const hash = entry.trim().toLowerCase();
    if (HASH_RE.test(hash) && !out.includes(hash)) out.push(hash);
  }
  return out;
}

export function parseHashLists(payload: unknown): HashLists {
  if (!payload || typeof payload !== "object") return EMPTY_LISTS;
  const record = payload as Record<string, unknown>;
  const version = typeof record.version === "number" && Number.isFinite(record.version) ? record.version : 0;
  const updated = typeof record.updated === "string" ? record.updated.slice(0, 40) : "";
  return {
    version,
    updated,
    denylist: normalizeHashes(record.denylist),
    allowlist: normalizeHashes(record.allowlist),
  };
}

/** Same-origin static fetch. No scan content, hash, or filename is ever sent. */
export async function loadHashLists(): Promise<HashLists> {
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;
  try {
    const response = await fetch("/hash-lists.json", {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return EMPTY_LISTS;
    const lists = parseHashLists(await response.json());
    cached = lists;
    cachedAt = Date.now();
    return lists;
  } catch {
    return EMPTY_LISTS;
  }
}

export function resetHashListCache(): void {
  cached = null;
  cachedAt = 0;
}

function makeFinding(ruleId: string, path: string, hash: string, listVersion: number, isBundle: boolean): Finding {
  const rule = RULE_BY_ID[ruleId];
  const subject = isBundle ? "Bundle" : "File";
  return {
    ruleId: rule.id,
    category: rule.category,
    categoryName: rule.categoryName,
    severity: rule.severity,
    layer: rule.layer,
    file: path,
    line: 1,
    start: 0,
    snippet: `${subject} SHA-256: ${hash}`,
    why:
      ruleId === "hash-001"
        ? `${subject} hash matches entry in the community denylist (list v${listVersion}). This is byte-identical to previously confirmed malicious content.`
        : `${subject} hash matches entry in the community allowlist (list v${listVersion}). This is a previously reviewed quantity, but content scanning still ran.`,
    fix: rule.fix,
    confidence: 1,
  };
}

export function checkHashes(
  hashes: FileHash[],
  bundleHash: string | undefined,
  lists: HashLists,
): Finding[] {
  if (lists.denylist.length === 0 && lists.allowlist.length === 0) return [];

  const deny = new Set(lists.denylist);
  const allow = new Set(lists.allowlist);
  const out: Finding[] = [];

  for (const file of hashes) {
    const hash = file.sha256.toLowerCase();
    if (deny.has(hash)) {
      out.push(makeFinding("hash-001", file.path, hash, lists.version, false));
    } else if (allow.has(hash)) {
      out.push(makeFinding("hash-002", file.path, hash, lists.version, false));
    }
  }

  if (bundleHash) {
    const hash = bundleHash.toLowerCase();
    if (deny.has(hash)) {
      out.push(makeFinding("hash-001", "(bundle)", hash, lists.version, true));
    } else if (allow.has(hash)) {
      out.push(makeFinding("hash-002", "(bundle)", hash, lists.version, true));
    }
  }

  return out;
}
