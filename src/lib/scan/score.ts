import { SEVERITY_WEIGHT, type Finding, type ScanReport, type Severity, type VerdictLabel } from "./types";
import { CATALOG_VERSION } from "./rules";

const ORDER: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

/** Dedupe repeated hits on the same span, preferring the highest-confidence source. */
export function dedupe(findings: Finding[]): Finding[] {
  const seen = new Map<string, Finding>();
  for (const f of findings) {
    const key = `${f.ruleId}|${f.file}|${f.start}`;
    const prev = seen.get(key);
    if (!prev || f.confidence > prev.confidence) seen.set(key, f);
  }
  return [...seen.values()].sort((a, b) => {
    const s = ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity);
    if (s !== 0) return s;
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.line - b.line || a.start - b.start;
  });
}

export function aggregate(
  raw: Finding[],
  filesScanned: number,
  durationMs: number,
  truncated: boolean,
  layersRun: ScanReport["layersRun"],
): ScanReport {
  const findings = dedupe(raw);
  const counts: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  let score = 0;
  for (const f of findings) {
    counts[f.severity]++;
    score += SEVERITY_WEIGHT[f.severity];
  }

  let label: VerdictLabel;
  let verdict: ScanReport["verdict"];
  if (counts.CRITICAL > 0) { label = "Critical risk"; verdict = "MALICIOUS"; }
  else if (counts.HIGH > 0) { label = "High risk"; verdict = "SUSPICIOUS"; }
  else if (counts.MEDIUM > 0) { label = "Needs review"; verdict = "SUSPICIOUS"; }
  else if (counts.LOW > 0 || counts.INFO > 0) { label = "Minor notes"; verdict = "SAFE"; }
  else { label = "No findings"; verdict = "SAFE"; }

  return {
    findings,
    score,
    score100: Math.min(100, score),
    verdict,
    label,
    counts,
    filesScanned,
    layersRun,
    durationMs,
    truncated,
    catalogVersion: CATALOG_VERSION,
  };
}
