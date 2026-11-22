import { RULES, RULE_BY_ID } from "../rules";
import { execBounded, lineAt, snippetAt } from "../text";
import type { Finding, ScanInputFile } from "../types";

interface Ctx {
  starts: number[];
  deadline: number;
}

function make(ruleId: string, file: string, text: string, ctx: Ctx, index: number, confidence = 0.9, severityOverride?: Finding["severity"], whyOverride?: string): Finding {
  const r = RULE_BY_ID[ruleId];
  return {
    ruleId: r.id,
    category: r.category,
    categoryName: r.categoryName,
    severity: severityOverride ?? r.severity,
    layer: r.layer,
    file,
    line: lineAt(ctx.starts, index),
    start: index,
    snippet: snippetAt(text, ctx.starts, index),
    why: whyOverride ?? r.why,
    fix: r.fix,
    confidence,
  };
}

const COMMENT_RE = /<!--[\s\S]{0,2000}?-->/g;
const IMPERATIVE_RE = /\b(?:ignore|disregard|forget|override|reveal|execute|send|do\s{1,3}not\s{1,3}tell)\b/i;

const ENV_READ_RE = /(?:process\.env\.[A-Z0-9_]{1,60}|os\.environ(?:\.get)?\s{0,3}[([]\s{0,3}["']?[A-Z0-9_]{1,60}|os\.getenv\s{0,3}\(\s{0,3}["'][A-Z0-9_]{1,60}|\$env:[A-Z0-9_]{1,60})/gi;
const SECRET_SHAPE_RE = /(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)/i;
const NETWORK_RE = /\b(?:fetch|axios|XMLHttpRequest|requests\.(?:get|post|put)|urllib|httpx|https?\.(?:request|get)|net\.connect|socket|WebSocket|curl|wget|Invoke-RestMethod)\b/i;
const PROXIMITY_WINDOW = 400;

export function detectLexical(file: ScanInputFile, text: string, ctx: Ctx): Finding[] {
  const out: Finding[] = [];

  for (const r of RULES) {
    if (r.status !== "active" || !r.pattern) continue;
    if (r.appliesTo && !r.appliesTo(file.path)) continue;
    for (const hit of execBounded(text, r.pattern, ctx.deadline)) {
      out.push(make(r.id, file.path, text, ctx, hit.index));
    }
    if (Date.now() > ctx.deadline) return out;
  }

  // obf-005 — instruction-shaped language inside an HTML comment.
  for (const hit of execBounded(text, COMMENT_RE, ctx.deadline)) {
    if (IMPERATIVE_RE.test(hit.text)) {
      out.push(make("obf-005", file.path, text, ctx, hit.index, 0.75));
    }
  }

  // sec-002 — secret-shaped env read co-occurring with a network call.
  for (const hit of execBounded(text, ENV_READ_RE, ctx.deadline)) {
    if (!SECRET_SHAPE_RE.test(hit.text)) continue;
    const from = Math.max(0, hit.index - PROXIMITY_WINDOW);
    const to = Math.min(text.length, hit.index + hit.text.length + PROXIMITY_WINDOW);
    const window = text.slice(from, to);
    if (NETWORK_RE.test(window)) {
      out.push(make("sec-002", file.path, text, ctx, hit.index, 0.85));
    } else {
      out.push(
        make("sec-002", file.path, text, ctx, hit.index, 0.4, "INFO",
          "A secret-shaped environment variable is read, but no network call appears nearby. Hygiene note only, not an exfiltration signal."),
      );
    }
  }

  return out;
}
