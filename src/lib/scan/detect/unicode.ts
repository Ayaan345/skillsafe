import { RULE_BY_ID } from "../rules";
import { execBounded, lineAt, snippetAt } from "../text";
import type { Finding, ScanInputFile } from "../types";

interface Ctx {
  starts: number[];
  deadline: number;
}

const INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u180E]/g;
// Unicode tag block U+E0000..U+E007F, written as surrogate pairs.
const TAG_RE = /\uDB40[\uDC00-\uDC7F]/g;
const MIXED_RE = /[A-Za-z0-9._-]{0,60}[\u0400-\u04FF\u0370-\u03FF][A-Za-z0-9._-]{0,60}/g;

const ZERO_WIDTH = new Set([0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0x180e]);
const BIDI = new Set([0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]);

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

function hex(cp: number): string {
  return "U+" + cp.toString(16).toUpperCase().padStart(4, "0");
}

export function detectUnicode(file: ScanInputFile, text: string, ctx: Ctx): Finding[] {
  const out: Finding[] = [];

  for (const hit of execBounded(text, INVISIBLE_RE, ctx.deadline)) {
    const cp = hit.text.codePointAt(0) ?? 0;
    if (ZERO_WIDTH.has(cp)) {
      out.push(f("obf-001", file.path, text, ctx, hit.index, 1, `${hex(cp)} (zero-width) at column ${hit.index + 1} — ${snippetAt(text, ctx.starts, hit.index)}`));
    } else if (BIDI.has(cp)) {
      out.push(f("obf-002", file.path, text, ctx, hit.index, 1, `${hex(cp)} (bidi control) at column ${hit.index + 1} — ${snippetAt(text, ctx.starts, hit.index)}`));
    }
  }

  const tags = execBounded(text, TAG_RE, ctx.deadline);
  if (tags.length > 0) {
    let decoded = "";
    for (const t of tags.slice(0, 200)) {
      const cp = text.codePointAt(t.index) ?? 0;
      const ascii = cp - 0xe0000;
      if (ascii >= 0x20 && ascii <= 0x7e) decoded += String.fromCharCode(ascii);
    }
    out.push(
      f("obf-003", file.path, text, ctx, tags[0].index, 1,
        `${tags.length} Unicode tag character(s). Hidden message decodes to: "${decoded.slice(0, 200)}"`),
    );
  }

  for (const hit of execBounded(text, MIXED_RE, ctx.deadline)) {
    if (/[A-Za-z]/.test(hit.text)) {
      out.push(f("obf-006", file.path, text, ctx, hit.index, 0.7, `Mixed-script token: "${hit.text.slice(0, 80)}"`));
    }
  }

  return out;
}
