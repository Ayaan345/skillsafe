import type { Finding, Severity } from "./types";

const ORDER: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

export interface CategoryGroup {
  category: number;
  categoryName: string;
  findings: Finding[];
  counts: Record<Severity, number>;
  topSeverity: Severity | null;
}

export function groupByCategory(findings: Finding[]): CategoryGroup[] {
  const map = new Map<number, CategoryGroup>();

  for (const f of findings) {
    let g = map.get(f.category);
    if (!g) {
      g = {
        category: f.category,
        categoryName: f.categoryName,
        findings: [],
        counts: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 },
        topSeverity: null,
      };
      map.set(f.category, g);
    }
    g.findings.push(f);
    g.counts[f.severity]++;
  }

  const groups = [...map.values()];
  for (const g of groups) {
    g.topSeverity = ORDER.find((s) => g.counts[s] > 0) ?? null;
    g.findings.sort(
      (a, b) =>
        ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity) ||
        a.file.localeCompare(b.file) ||
        a.line - b.line ||
        a.start - b.start,
    );
  }

  groups.sort(
    (a, b) =>
      ORDER.indexOf(a.topSeverity ?? "INFO") - ORDER.indexOf(b.topSeverity ?? "INFO") ||
      a.category - b.category,
  );

  return groups;
}
