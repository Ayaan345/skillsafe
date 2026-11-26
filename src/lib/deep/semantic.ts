import { RULE_BY_ID } from "@/lib/scan/rules";
import type { Finding, RawScanFile } from "@/lib/scan/types";

export const MAX_CHUNKS = 6;
export const CHUNK_CHARS = 1800;
const MIN_CONFIDENCE = 0.6;

const TEXT_EXT = new Set(["md", "txt", "markdown"]);

export interface SemanticChunk {
  file: string;
  line: number;
  text: string;
}

export interface SemanticRunResult {
  findings: Finding[];
  checked: number;
  configured: boolean;
  note?: string;
}

function extensionOf(path: string): string {
  const i = path.lastIndexOf(".");
  return i < 0 ? "" : path.slice(i + 1).toLowerCase();
}

export function chunkInstructionalText(raw: RawScanFile[]): SemanticChunk[] {
  const out: SemanticChunk[] = [];
  const decoder = new TextDecoder("utf-8", { fatal: false });

  for (const file of raw) {
    if (out.length >= MAX_CHUNKS) break;
    if (!TEXT_EXT.has(extensionOf(file.path))) continue;
    const text = decoder.decode(file.bytes).replace(/\r\n/g, "\n");
    const paragraphs = text.split(/\n{2,}/);
    let buffer = "";
    let startLine = 1;
    let line = 1;

    const flush = () => {
      const trimmed = buffer.trim();
      if (trimmed.length >= 40 && out.length < MAX_CHUNKS) {
        out.push({ file: file.path, line: startLine, text: trimmed.slice(0, CHUNK_CHARS) });
      }
      buffer = "";
    };

    for (const paragraph of paragraphs) {
      if (buffer.length + paragraph.length > CHUNK_CHARS) {
        flush();
        startLine = line;
      }
      buffer += `${paragraph}\n\n`;
      line += paragraph.split("\n").length + 1;
      if (out.length >= MAX_CHUNKS) break;
    }
    flush();
  }

  return out.slice(0, MAX_CHUNKS);
}

interface Label {
  i: number;
  label: string;
  confidence: number;
}

export function parseLabels(payload: unknown): Label[] {
  if (!payload || typeof payload !== "object") return [];
  const results = (payload as Record<string, unknown>).results;
  if (!Array.isArray(results)) return [];
  const out: Label[] = [];
  for (const entry of results) {
    if (out.length >= MAX_CHUNKS) break;
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const i = typeof record.i === "number" ? Math.floor(record.i) : -1;
    const label = typeof record.label === "string" ? record.label.toLowerCase() : "";
    const confidence = typeof record.confidence === "number" ? record.confidence : 0;
    if (i < 0 || i >= MAX_CHUNKS) continue;
    if (!["benign", "manipulative", "uncertain"].includes(label)) continue;
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) continue;
    out.push({ i, label, confidence });
  }
  return out;
}

/** Model output is untrusted scanner data: only a validated label and score are used. */
export function mapLabels(chunks: SemanticChunk[], payload: unknown): Finding[] {
  const rule = RULE_BY_ID["inj-008"];
  const out: Finding[] = [];
  for (const label of parseLabels(payload)) {
    if (label.label !== "manipulative" || label.confidence < MIN_CONFIDENCE) continue;
    const chunk = chunks[label.i];
    if (!chunk) continue;
    out.push({
      ruleId: rule.id,
      category: rule.category,
      categoryName: rule.categoryName,
      severity: rule.severity,
      layer: rule.layer,
      file: chunk.file,
      line: chunk.line,
      start: 0,
      snippet: chunk.text.slice(0, 200),
      why: `The classification-only model judged this passage manipulative toward an AI agent at ${Math.round(label.confidence * 100)}% confidence, without matching any fixed phrasing template. Treat it as a prompt for human judgement, not a verdict.`,
      fix: rule.fix,
      confidence: Math.min(0.85, label.confidence),
    });
  }
  return out;
}

export async function runSemanticCheck(raw: RawScanFile[], apiKey?: string): Promise<SemanticRunResult> {
  const chunks = chunkInstructionalText(raw);
  if (chunks.length === 0) {
    return { findings: [], checked: 0, configured: true, note: "No markdown or text instructions long enough to classify." };
  }

  try {
    const response = await fetch("/api/semantic", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chunks: chunks.map((c) => c.text),
        ...(apiKey ? { apiKey } : {}),
      }),
    });
    const json: unknown = await response.json().catch(() => null);
    const record = json && typeof json === "object" ? (json as Record<string, unknown>) : null;

    if (!record) return { findings: [], checked: chunks.length, configured: true, note: "Semantic check failed." };
    if (record.configured === false) {
      return {
        findings: [],
        checked: 0,
        configured: false,
        note: typeof record.error === "string" ? record.error : "Semantic review is not configured on this deployment.",
      };
    }
    if (!response.ok || record.ok !== true) {
      return {
        findings: [],
        checked: chunks.length,
        configured: true,
        note: typeof record.error === "string" ? record.error : "Semantic check failed.",
      };
    }

    return { findings: mapLabels(chunks, record.data), checked: chunks.length, configured: true };
  } catch {
    return { findings: [], checked: chunks.length, configured: true, note: "Semantic service unreachable from this browser." };
  }
}
