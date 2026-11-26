import { detectEntropy } from "./detect/entropy";
import { detectIndirection } from "./detect/indirection";
import { detectLexical } from "./detect/lexical";
import { detectLinks } from "./detect/links";
import { detectManifest } from "./detect/manifest";
import { detectSupply } from "./detect/supply";
import { detectUnicode } from "./detect/unicode";
import { collectDependencies } from "./detect/dependencies";
import { collectLinkRefs } from "./detect/link-refs";
import { checkHashes, loadHashLists } from "./hash-reputation";
import { ingest } from "./l0";
import { RULE_BY_ID } from "./rules";
import { applyOverlay, catalogFingerprint, loadOverlay } from "./catalog";
import { aggregate } from "./score";
import { buildLineIndex, MAX_TEXT_PER_FILE, normalize } from "./text";
import type { Finding, Layer, RawScanFile, ScanInputFile, ScanReport, SourceKind } from "./types";

export const SCAN_DEADLINE_MS = 2000;

export interface ScanExtras {
  findings?: Finding[];
  hashes?: ScanReport["hashes"];
  bundleHash?: string;
  notes?: ScanReport["ingestNotes"];
  truncated?: boolean;
  layers?: Layer[];
  startedAt?: number;
  deadline?: number;
}

/** Injection phrasing found in asset metadata is reported as the Category 10 rule. */
function attributeAsset(findings: Finding[], kind?: SourceKind): Finding[] {
  if (kind !== "image-metadata" && kind !== "font-metadata") return findings;
  const rule = RULE_BY_ID[kind === "image-metadata" ? "asset-004" : "asset-005"];
  return findings.map((f) =>
    f.category === 1
      ? {
          ...f,
          ruleId: rule.id,
          category: rule.category,
          categoryName: rule.categoryName,
          severity: rule.severity,
          layer: rule.layer,
          why: rule.why,
          fix: rule.fix,
        }
      : f,
  );
}

export function scanFiles(
  files: ScanInputFile[],
  deadlineMs = SCAN_DEADLINE_MS,
  extras: ScanExtras = {},
): ScanReport {
  const started = extras.startedAt ?? Date.now();
  const deadline = extras.deadline ?? started + deadlineMs;
  const findings: Finding[] = [...(extras.findings ?? [])];
  let truncated = extras.truncated ?? false;
  let scanned = 0;

  for (const file of files) {
    if (Date.now() > deadline) { truncated = true; break; }
    let text = normalize(file.content);
    if (text.length > MAX_TEXT_PER_FILE) { text = text.slice(0, MAX_TEXT_PER_FILE); truncated = true; }
    const ctx = { starts: buildLineIndex(text), deadline };
    const local: Finding[] = [];

    local.push(...detectLexical(file, text, ctx));
    local.push(...detectUnicode(file, text, ctx));
    local.push(...detectEntropy(file, text, ctx));
    local.push(...detectLinks(file, text, ctx));
    local.push(...detectIndirection(file, text, ctx));

    findings.push(...attributeAsset(local, file.sourceKind));
    scanned++;
    if (Date.now() > deadline) { truncated = true; break; }
  }

  if (Date.now() <= deadline) {
    findings.push(...detectSupply(files, deadline));
    findings.push(...detectManifest(files, findings, deadline));
  } else {
    truncated = true;
  }

  const dependencies = Date.now() <= deadline ? collectDependencies(files, deadline) : [];
  const links = Date.now() <= deadline ? collectLinkRefs(files, deadline) : [];

  const layers: Layer[] = extras.layers ?? ["L1", "L2", "L3", "L4", "L5", "L6"];
  const report = aggregate(findings, scanned, Date.now() - started, truncated, layers);
  report.durationMs = Date.now() - started;
  if (dependencies.length > 0) report.dependencies = dependencies;
  if (links.length > 0) report.links = links;
  if (extras.hashes) report.hashes = extras.hashes;
  if (extras.bundleHash) report.bundleHash = extras.bundleHash;
  if (extras.notes && extras.notes.length > 0) report.ingestNotes = extras.notes;
  return report;
}

export function scanText(content: string, path = "SKILL.md"): ScanReport {
  return scanFiles([{ path, content }]);
}

export async function scanRawFiles(raw: RawScanFile[], deadlineMs = SCAN_DEADLINE_MS): Promise<ScanReport> {
  const started = Date.now();
  const l0Budget = Math.max(200, Math.floor(deadlineMs * 0.55));
  const result = await ingest(raw, started + l0Budget);

  const lists = await loadHashLists();
  const hashFindings = checkHashes(result.hashes, result.bundleHash, lists);
  const base = scanFiles(result.files, deadlineMs, {
    findings: [...result.findings, ...hashFindings],
    hashes: result.hashes,
    bundleHash: result.bundleHash,
    notes: result.notes,
    truncated: result.truncated,
    layers: ["L0", "L1", "L2", "L3", "L4", "L5", "L6", "L7"],
    startedAt: started,
    deadline: started + deadlineMs,
  });

  const overlay = await loadOverlay();
  const findings = applyOverlay(base.findings, overlay);
  const report = aggregate(findings, base.filesScanned, Date.now() - started, base.truncated, base.layersRun);
  report.durationMs = Date.now() - started;
  report.catalogVersion = catalogFingerprint(overlay);
  report.hashes = base.hashes;
  report.bundleHash = base.bundleHash;
  report.ingestNotes = base.ingestNotes;
  report.dependencies = base.dependencies;
  report.links = base.links;
  return report;
}
