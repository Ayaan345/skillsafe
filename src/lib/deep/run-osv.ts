import type { DependencyRef, Finding } from "@/lib/scan/types";
import { buildQueryBatch, mapOsvResults } from "./osv";

export interface OsvRunResult {
  findings: Finding[];
  checked: number;
  note?: string;
}

export async function runOsvCheck(deps: DependencyRef[]): Promise<OsvRunResult> {
  const { queries, index } = buildQueryBatch(deps);
  if (queries.length === 0) {
    return {
      findings: [],
      checked: 0,
      note: "No exact version pins to check. Ranges, wildcards and unpinned dependencies are skipped.",
    };
  }

  const payload = {
    queries: queries.map((q) => ({
      name: q.package.name,
      version: q.version,
      ecosystem: q.package.ecosystem,
    })),
  };

  try {
    const response = await fetch("/api/osv", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json: unknown = await response.json().catch(() => null);
    const record = json && typeof json === "object" ? (json as Record<string, unknown>) : null;

    if (!response.ok || !record || record.ok !== true) {
      const message = record && typeof record.error === "string" ? record.error : "Advisory check failed.";
      return { findings: [], checked: queries.length, note: message };
    }

    return { findings: mapOsvResults(index, record.data), checked: queries.length };
  } catch {
    return { findings: [], checked: queries.length, note: "Advisory service unreachable from this browser." };
  }
}
