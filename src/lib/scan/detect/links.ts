import { RULE_BY_ID } from "../rules";
import { execBounded, lineAt, snippetAt } from "../text";
import type { Finding, ScanInputFile } from "../types";

interface Ctx {
  starts: number[];
  deadline: number;
}

const MD_LINK_RE = /\[([^\]\n]{0,200})\]\(([^)\s\n]{1,2000})\)/g;
const HTML_A_RE = /<a\b[^>]{0,500}?href\s{0,3}=\s{0,3}["']([^"'\n]{1,2000})["'][^>]{0,500}?>([\s\S]{0,200}?)<\/a>/gi;
const BARE_URL_RE = /\bhttps?:\/\/[^\s<>"'`)\]]{1,2000}/gi;
const DATA_URI_RE = /\bdata:[a-z/+.-]{0,60};base64,/gi;
const DOMAINISH_RE = /\b[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63}){1,3}\b/i;
const IPV4_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

const SHORTENERS = new Set([
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly",
  "rebrand.ly", "cutt.ly", "shorturl.at", "rb.gy", "lnkd.in", "tiny.cc", "bl.ink",
]);

const EXECUTABLE_DATA_TYPES = [
  "text/html", "image/svg+xml", "application/javascript",
  "text/javascript", "application/x-sh", "application/xhtml+xml",
];

interface LinkRef {
  index: number;
  href: string;
  text: string;
}

function hostOf(href: string): string | null {
  try {
    return new URL(href).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function registrable(host: string): string {
  const parts = host.split(".").filter(Boolean);
  return parts.slice(-2).join(".");
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

function collectLinks(text: string, deadline: number): LinkRef[] {
  const links: LinkRef[] = [];
  const reMd = new RegExp(MD_LINK_RE.source, MD_LINK_RE.flags);
  let m: RegExpExecArray | null;
  let guard = 0;
  while ((m = reMd.exec(text)) !== null && links.length < 300) {
    links.push({ index: m.index, href: m[2], text: m[1] });
    if (++guard % 32 === 0 && Date.now() > deadline) break;
  }
  const reA = new RegExp(HTML_A_RE.source, HTML_A_RE.flags);
  guard = 0;
  while ((m = reA.exec(text)) !== null && links.length < 300) {
    links.push({ index: m.index, href: m[1], text: m[2] });
    if (++guard % 32 === 0 && Date.now() > deadline) break;
  }
  for (const hit of execBounded(text, BARE_URL_RE, deadline, 300)) {
    links.push({ index: hit.index, href: hit.text, text: "" });
  }
  return links;
}

export function detectLinks(file: ScanInputFile, text: string, ctx: Ctx): Finding[] {
  const out: Finding[] = [];

  for (const link of collectLinks(text, ctx.deadline)) {
    const host = hostOf(link.href);
    if (host) {
      if (IPV4_RE.test(host) || host.includes(":")) {
        out.push(f("lnk-001", file.path, text, ctx, link.index, 0.9, `Host is a raw IP: ${host}`));
      }
      if (SHORTENERS.has(host)) {
        out.push(f("lnk-002", file.path, text, ctx, link.index, 0.95, `Shortener: ${host} → ${link.href.slice(0, 120)}`));
      }
      if (host.includes("xn--")) {
        out.push(f("lnk-003", file.path, text, ctx, link.index, 0.9, `Punycode host: ${host}`));
      }
      if (link.href.toLowerCase().startsWith("http://")) {
        out.push(f("lnk-005", file.path, text, ctx, link.index, 0.95, `Plain HTTP: ${link.href.slice(0, 120)}`));
      }
      const apparent = link.text.match(DOMAINISH_RE);
      if (apparent) {
        const shown = registrable(apparent[0].toLowerCase());
        if (shown.includes(".") && shown !== registrable(host)) {
          out.push(f("lnk-004", file.path, text, ctx, link.index, 0.85,
            `Text shows "${shown}" but the link actually goes to "${registrable(host)}"`));
        }
      }
    }
  }

  for (const hit of execBounded(text, DATA_URI_RE, ctx.deadline)) {
    const type = hit.text.slice(5, -8).toLowerCase();
    if (EXECUTABLE_DATA_TYPES.some((t) => type.startsWith(t))) {
      out.push(f("lnk-006", file.path, text, ctx, hit.index, 0.9, `Executable data: URI of type ${type}`));
    }
  }

  return out;
}
