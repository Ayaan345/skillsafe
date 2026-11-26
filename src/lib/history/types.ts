import type { Finding, RawScanFile, ScanReport, Severity } from "@/lib/scan/types";

export interface HistoryRecord {
  id: string;
  title: string;
  createdAt: string;
  sourceType: "paste" | "file" | "zip";
  verdict: ScanReport["verdict"];
  label: ScanReport["label"];
  score100: number;
  rawScore: number;
  catalogVersion: number;
  fileCount: number;
  bundleHash?: string;
  counts: Record<Severity, number>;
  findings: Finding[];
  archivedAt?: string | null;
}

export interface SavedView {
  id: string;
  name: string;
  query: string;
  severity: Severity | "";
  sort: "severity" | "date" | "score" | "title";
}

export function sourceTypeFromRaw(raw: readonly Pick<RawScanFile, "path">[]): HistoryRecord["sourceType"] {
  if (raw.some((file) => file.path.toLowerCase().endsWith(".zip")) || raw.length > 1) return "zip";
  return raw[0]?.path === "SKILL.md" ? "paste" : "file";
}

export function reportToRecord(report: ScanReport, title: string, sourceType: HistoryRecord["sourceType"]): HistoryRecord {
  return {
    id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    createdAt: new Date().toISOString(),
    sourceType,
    verdict: report.verdict,
    label: report.label,
    score100: report.score100,
    rawScore: report.score,
    catalogVersion: report.catalogVersion,
    fileCount: report.filesScanned,
    bundleHash: report.bundleHash,
    counts: report.counts,
    findings: report.findings,
  };
}
