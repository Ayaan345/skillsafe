import { aggregate } from "@/lib/scan/score";
import type { Finding, ScanReport, Severity } from "@/lib/scan/types";

export type SortKey = "severity" | "file" | "rule";
export type GroupMode = "category" | "file" | "severity";

export const ALL_SEVERITIES: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

export interface FilterState {
  query: string;
  severities: Severity[];
  sort: SortKey;
}

export const DEFAULT_FILTERS: FilterState = { query: "", severities: [], sort: "severity" };

export const FILTER_PRESETS: Array<{ id: string; label: string; state: FilterState }> = [
  { id: "all", label: "Everything", state: DEFAULT_FILTERS },
  { id: "blocking", label: "Blocking only", state: { query: "", severities: ["CRITICAL", "HIGH"], sort: "severity" } },
  { id: "code", label: "Code & secrets", state: { query: "", severities: [], sort: "file" } },
];

export function findingKey(f: Finding): string {
  return `${f.ruleId}|${f.file}|${f.start}`;
}

export function filterFindings(findings: Finding[], state: FilterState): Finding[] {
  const q = state.query.trim().toLowerCase();
  const out = findings.filter((f) => {
    if (state.severities.length > 0 && !state.severities.includes(f.severity)) return false;
    if (q.length === 0) return true;
    return (
      f.ruleId.toLowerCase().includes(q) ||
      f.file.toLowerCase().includes(q) ||
      f.snippet.toLowerCase().includes(q) ||
      f.why.toLowerCase().includes(q) ||
      f.categoryName.toLowerCase().includes(q)
    );
  });

  if (state.sort === "file") {
    out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.start - b.start);
  } else if (state.sort === "rule") {
    out.sort((a, b) => a.ruleId.localeCompare(b.ruleId) || a.line - b.line);
  } else {
    out.sort(
      (a, b) =>
        ALL_SEVERITIES.indexOf(a.severity) - ALL_SEVERITIES.indexOf(b.severity) ||
        a.file.localeCompare(b.file) ||
        a.line - b.line,
    );
  }
  return out;
}

export interface DisplayGroup {
  key: string;
  title: string;
  subtitle: string;
  findings: Finding[];
  topSeverity: Severity;
}

export function groupForDisplay(findings: Finding[], mode: GroupMode): DisplayGroup[] {
  const map = new Map<string, DisplayGroup>();

  for (const f of findings) {
    const key = mode === "category" ? `c${f.category}` : mode === "file" ? f.file : f.severity;
    const title =
      mode === "category" ? `${f.category}. ${f.categoryName}` : mode === "file" ? f.file : f.severity;
    const subtitle =
      mode === "category" ? "vulnerability category" : mode === "file" ? "file" : "severity band";

    let group = map.get(key);
    if (!group) {
      group = { key, title, subtitle, findings: [], topSeverity: f.severity };
      map.set(key, group);
    }
    group.findings.push(f);
    if (ALL_SEVERITIES.indexOf(f.severity) < ALL_SEVERITIES.indexOf(group.topSeverity)) {
      group.topSeverity = f.severity;
    }
  }

  const groups = [...map.values()];
  for (const g of groups) {
    g.findings.sort(
      (a, b) =>
        ALL_SEVERITIES.indexOf(a.severity) - ALL_SEVERITIES.indexOf(b.severity) ||
        a.file.localeCompare(b.file) ||
        a.line - b.line ||
        a.start - b.start,
    );
  }
  groups.sort(
    (a, b) =>
      ALL_SEVERITIES.indexOf(a.topSeverity) - ALL_SEVERITIES.indexOf(b.topSeverity) ||
      a.title.localeCompare(b.title),
  );
  return groups;
}

export function recompute(report: ScanReport, dismissed: ReadonlySet<string>): ScanReport {
  const active = report.findings.filter((f) => !dismissed.has(findingKey(f)));
  return aggregate(active, report.filesScanned, report.durationMs, report.truncated, report.layersRun);
}

export function buildExport(report: ScanReport, dismissed: ReadonlySet<string>): string {
  const effective = recompute(report, dismissed);
  return JSON.stringify(
    {
      tool: "SkillSafe",
      catalogVersion: report.catalogVersion,
      generatedAt: new Date().toISOString(),
      filesScanned: report.filesScanned,
      durationMs: report.durationMs,
      layersRun: report.layersRun,
      truncated: report.truncated,
      bundleHash: report.bundleHash ?? null,
      fileHashes: report.hashes ?? [],
      verdict: effective.verdict,
      label: effective.label,
      score: effective.score,
      score100: effective.score100,
      counts: effective.counts,
      markedFalsePositive: report.findings
        .filter((f) => dismissed.has(findingKey(f)))
        .map((f) => ({ ruleId: f.ruleId, file: f.file, line: f.line })),
      findings: effective.findings,
      note: "Static analysis only. A clean report means no known pattern matched, not that the skill is certified safe.",
    },
    null,
    2,
  );
}

export function downloadJson(filename: string, body: string): void {
  const blob = new Blob([body], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}