export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type Layer = "L0" | "L1" | "L2" | "L3" | "L4" | "L5" | "L6" | "L7" | "L8" | "L9";
export type RuleStatus = "active" | "pending" | "deep";
export type SourceKind = "text" | "svg" | "image-metadata" | "font-metadata" | "ocr";

export interface Rule {
  id: string;
  category: number;
  categoryName: string;
  severity: Severity;
  layer: Layer;
  title: string;
  why: string;
  fix: string;
  status: RuleStatus;
  pattern?: RegExp;
  appliesTo?: (path: string) => boolean;
}

export interface Finding {
  ruleId: string;
  category: number;
  categoryName: string;
  severity: Severity;
  layer: Layer;
  file: string;
  line: number;
  start: number;
  snippet: string;
  why: string;
  fix: string;
  confidence: number;
}

export interface ScanInputFile {
  path: string;
  content: string;
  sourceKind?: SourceKind;
}

export interface RawScanFile {
  path: string;
  bytes: Uint8Array;
}

export interface FileHash {
  path: string;
  sha256: string;
  size: number;
}

export type VerdictLabel =
  | "Critical risk"
  | "High risk"
  | "Needs review"
  | "Minor notes"
  | "No findings";

export interface ScanReport {
  findings: Finding[];
  score: number;
  score100: number;
  verdict: "SAFE" | "SUSPICIOUS" | "MALICIOUS";
  label: VerdictLabel;
  counts: Record<Severity, number>;
  filesScanned: number;
  layersRun: Layer[];
  durationMs: number;
  truncated: boolean;
  catalogVersion: number;
  hashes?: FileHash[];
  bundleHash?: string;
  ingestNotes?: { name: string; reason: string }[];
}

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  CRITICAL: 40,
  HIGH: 18,
  MEDIUM: 8,
  LOW: 3,
  INFO: 1,
};

export const CATEGORY_NAMES: Record<number, string> = {
  1: "Prompt injection",
  2: "Hidden / obfuscated content",
  3: "Malicious or deceptive links",
  4: "Dangerous code execution",
  5: "Secrets & credential exposure",
  6: "Over-broad permissions",
  7: "Supply-chain & dependency risk",
  8: "Manifest & metadata integrity",
  9: "Known-bad signatures",
  10: "Embedded asset content",
};
