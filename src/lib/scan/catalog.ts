import { CATALOG_VERSION } from "./rules";
import type { Finding, Severity } from "./types";

export interface RuleOverride {
  confidence?: number;
  severity?: Severity;
  enabled?: boolean;
  note?: string;
}

export interface CatalogOverlay {
  version: number;
  updated: string;
  notes: string;
  overrides: Record<string, RuleOverride>;
  retired: string[];
}

export const EMPTY_OVERLAY: CatalogOverlay = {
  version: 0,
  updated: "",
  notes: "",
  overrides: {},
  retired: [],
};

const SEVERITIES: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
const RULE_ID = /^[a-z]{2,6}-\d{3}$/;
const MAX_OVERRIDE_KEYS = 200;
const CACHE_TTL_MS = 5 * 60 * 1000;

let cached: CatalogOverlay | null = null;
let cachedAt = 0;

export function parseOverlay(payload: unknown): CatalogOverlay {
  if (!payload || typeof payload !== "object") return EMPTY_OVERLAY;
  const record = payload as Record<string, unknown>;

  const version =
    typeof record.version === "number" && Number.isFinite(record.version) && record.version >= 0
      ? Math.floor(record.version)
      : 0;
  const updated = typeof record.updated === "string" ? record.updated.slice(0, 40) : "";
  const notes = typeof record.notes === "string" ? record.notes.slice(0, 300) : "";

  const overrides: Record<string, RuleOverride> = {};
  const raw = record.overrides;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (Object.keys(overrides).length >= MAX_OVERRIDE_KEYS) break;
      if (!RULE_ID.test(key) || !value || typeof value !== "object") continue;
      const entry = value as Record<string, unknown>;
      const next: RuleOverride = {};
      if (typeof entry.confidence === "number" && entry.confidence >= 0 && entry.confidence <= 1) {
        next.confidence = entry.confidence;
      }
      if (typeof entry.severity === "string" && SEVERITIES.includes(entry.severity as Severity)) {
        next.severity = entry.severity as Severity;
      }
      if (typeof entry.enabled === "boolean") next.enabled = entry.enabled;
      if (typeof entry.note === "string") next.note = entry.note.slice(0, 200);
      if (Object.keys(next).length > 0) overrides[key] = next;
    }
  }

  const retired: string[] = [];
  if (Array.isArray(record.retired)) {
    for (const entry of record.retired) {
      if (retired.length >= MAX_OVERRIDE_KEYS) break;
      if (typeof entry === "string" && RULE_ID.test(entry) && !retired.includes(entry)) retired.push(entry);
    }
  }

  return { version, updated, notes, overrides, retired };
}

/** Same-origin static fetch; sends nothing about the scan. */
export async function loadOverlay(): Promise<CatalogOverlay> {
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;
  try {
    const response = await fetch("/rule-catalog.json", {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return EMPTY_OVERLAY;
    const overlay = parseOverlay(await response.json());
    cached = overlay;
    cachedAt = Date.now();
    return overlay;
  } catch {
    return EMPTY_OVERLAY;
  }
}

export function resetOverlayCache(): void {
  cached = null;
  cachedAt = 0;
}

export function catalogFingerprint(overlay: CatalogOverlay): number {
  return CATALOG_VERSION * 1000 + overlay.version;
}

export function applyOverlay(findings: Finding[], overlay: CatalogOverlay): Finding[] {
  if (overlay.retired.length === 0 && Object.keys(overlay.overrides).length === 0) return findings;
  const retired = new Set(overlay.retired);
  const out: Finding[] = [];

  for (const finding of findings) {
    if (retired.has(finding.ruleId)) continue;
    const override = overlay.overrides[finding.ruleId];
    if (!override || override.enabled === false) {
      if (override?.enabled === false) continue;
      out.push(finding);
      continue;
    }
    out.push({
      ...finding,
      severity: override.severity ?? finding.severity,
      confidence: override.confidence ?? finding.confidence,
      why: override.note ? `${finding.why} Catalog note: ${override.note}` : finding.why,
    });
  }

  return out;
}
