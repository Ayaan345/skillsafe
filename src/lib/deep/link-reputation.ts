import { RULE_BY_ID } from "@/lib/scan/rules";
import type { Finding, LinkRef, Severity } from "@/lib/scan/types";

export const MAX_REPUTATION_URLS = 50;

export interface LinkRunResult {
  findings: Finding[];
  checked: number;
  configured: boolean;
  note?: string;
}

const THREAT_SEVERITY: Record<string, Severity> = {
  MALWARE: "CRITICAL",
  SOCIAL_ENGINEERING: "CRITICAL",
  UNWANTED_SOFTWARE: "HIGH",
  POTENTIALLY_HARMFUL_APPLICATION: "HIGH",
};

export function threatSeverity(threatType: string): Severity {
  return THREAT_SEVERITY[threatType] ?? "HIGH";
}

export function mapMatches(links: LinkRef[], payload: unknown): Finding[] {
  if (!payload || typeof payload !== "object") return [];
  const matches = (payload as Record<string, unknown>).matches;
  if (!Array.isArray(matches)) return [];

  const byUrl = new Map(links.map((l) => [l.url, l]));
  const rule = RULE_BY_ID["lnk-007"];
  const out: Finding[] = [];
  const seen = new Set<string>();

  for (const entry of matches) {
    if (out.length >= MAX_REPUTATION_URLS) break;
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const threat = record.threat;
    const url = (threat as Record<string, unknown> | undefined)?.url;
    if (typeof url !== "string") continue;
    const link = byUrl.get(url);
    if (!link) continue;
    const threatType = typeof record.threatType === "string" ? record.threatType : "UNKNOWN";
    const key = `${url}|${threatType}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      ruleId: rule.id,
      category: rule.category,
      categoryName: rule.categoryName,
      severity: threatSeverity(threatType),
      layer: rule.layer,
      file: link.file,
      line: link.line,
      start: link.start,
      snippet: `${threatType} — ${url.slice(0, 180)}`,
      why: `Google Safe Browsing lists this destination under ${threatType}. The listing is about the live destination, not the link's wording.`,
      fix: rule.fix,
      confidence: 0.95,
    });
  }

  return out;
}

export async function runLinkCheck(links: LinkRef[]): Promise<LinkRunResult> {
  const unique = links.slice(0, MAX_REPUTATION_URLS);
  if (unique.length === 0) {
    return { findings: [], checked: 0, configured: true, note: "No http(s) links in this submission to look up." };
  }

  try {
    const response = await fetch("/api/links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ urls: unique.map((l) => l.url) }),
    });
    const json: unknown = await response.json().catch(() => null);
    const record = json && typeof json === "object" ? (json as Record<string, unknown>) : null;

    if (!record) return { findings: [], checked: unique.length, configured: true, note: "Reputation check failed." };
    if (record.configured === false) {
      return {
        findings: [],
        checked: 0,
        configured: false,
        note: typeof record.error === "string" ? record.error : "Live reputation is not configured on this deployment.",
      };
    }
    if (!response.ok || record.ok !== true) {
      return {
        findings: [],
        checked: unique.length,
        configured: true,
        note: typeof record.error === "string" ? record.error : "Reputation check failed.",
      };
    }

    return { findings: mapMatches(unique, record.data), checked: unique.length, configured: true };
  } catch {
    return { findings: [], checked: unique.length, configured: true, note: "Reputation service unreachable from this browser." };
  }
}
