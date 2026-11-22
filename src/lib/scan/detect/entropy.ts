import { RULE_BY_ID } from "../rules";
import { execBounded, lineAt, snippetAt } from "../text";
import type { Finding, ScanInputFile } from "../types";

interface Ctx {
  starts: number[];
  deadline: number;
}

const LITERAL_RE = /["'][A-Za-z0-9+/=_\-.]{24,512}["']/g;
export const ENTROPY_THRESHOLD = 5.8;

export function shannon(s: string): number {
  if (s.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

function f(ruleId: string, file: string, text: string, ctx: Ctx, index: number, confidence: number, snippet?: string): Finding {
  const r = RULE_BY_ID[ruleId];
  return {
    ruleId: r.id,
    category: r.category,
    categoryName: r.categoryName,
    severity: r.severity,
    layer: r.layer,
    file,
    line: lineAt(ctx.starts, index),
    start: index,
    snippet: snippet ?? snippetAt(text, ctx.starts, index),
    why: r.why,
    fix: r.fix,
    confidence,
  };
}

export function detectEntropy(file: ScanInputFile, text: string, ctx: Ctx): Finding[] {
  const out: Finding[] = [];

  for (const hit of execBounded(text, LITERAL_RE, ctx.deadline)) {
    const inner = hit.text.slice(1, -1);
    const h = shannon(inner);
    if (h > ENTROPY_THRESHOLD) {
      out.push(f("sec-003", file.path, text, ctx, hit.index, 0.5,
        `Entropy ${h.toFixed(2)} > ${ENTROPY_THRESHOLD} — "${inner.slice(0, 80)}${inner.length > 80 ? "…" : ""}"`));
    }
  }

  return out;
}
