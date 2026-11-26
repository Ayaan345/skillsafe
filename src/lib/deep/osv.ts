import { RULE_BY_ID } from "@/lib/scan/rules";
import type { DependencyRef, Finding } from "@/lib/scan/types";

export const MAX_QUERIES = 200;
export const MAX_IDS_SHOWN = 8;

export interface OsvBatchQuery {
  package: { name: string; ecosystem: string };
  version: string;
}

export interface OsvBatch {
  queries: OsvBatchQuery[];
  index: DependencyRef[];
}

export function buildQueryBatch(deps: DependencyRef[]): OsvBatch {
  const seen = new Set<string>();
  const queries: OsvBatchQuery[] = [];
  const index: DependencyRef[] = [];

  for (const dep of deps) {
    if (queries.length >= MAX_QUERIES) break;
    const key = `${dep.ecosystem}|${dep.name}|${dep.version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    queries.push({ package: { name: dep.name, ecosystem: dep.ecosystem }, version: dep.version });
    index.push(dep);
  }

  return { queries, index };
}

function advisoryIds(entry: unknown): string[] {
  if (!entry || typeof entry !== "object") return [];
  const vulns = (entry as Record<string, unknown>).vulns;
  if (!Array.isArray(vulns)) return [];
  const ids: string[] = [];
  for (const vuln of vulns) {
    if (ids.length >= MAX_IDS_SHOWN) break;
    if (!vuln || typeof vuln !== "object") continue;
    const id = (vuln as Record<string, unknown>).id;
    if (typeof id === "string" && /^[A-Za-z0-9._:-]{1,60}$/.test(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Advisory responses are untrusted data; only validated ID strings are surfaced. */
export function mapOsvResults(index: DependencyRef[], payload: unknown): Finding[] {
  if (!payload || typeof payload !== "object") return [];
  const results = (payload as Record<string, unknown>).results;
  if (!Array.isArray(results)) return [];

  const rule = RULE_BY_ID["sup-003"];
  const out: Finding[] = [];

  for (let i = 0; i < Math.min(results.length, index.length); i++) {
    const ids = advisoryIds(results[i]);
    if (ids.length === 0) continue;
    const dep = index[i];
    out.push({
      ruleId: rule.id,
      category: rule.category,
      categoryName: rule.categoryName,
      severity: rule.severity,
      layer: rule.layer,
      file: dep.file,
      line: dep.line,
      start: dep.start,
      snippet: `${dep.name}@${dep.version} — ${ids.join(", ")}`,
      why: `This exact pinned version has ${ids.length} disclosed advisory record(s) in OSV.dev: ${ids.join(", ")}. Reference: osv.dev/vulnerability/${ids[0]}`,
      fix: rule.fix,
      confidence: 0.95,
    });
  }

  return out;
}
