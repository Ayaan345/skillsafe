import { buildLineIndex, lineAt } from "../text";
import type { LinkRef, ScanInputFile } from "../types";

export const MAX_LINK_REFS = 50;

const MD_LINK = /\[([^\]\n]{0,200})\]\(([^)\s\n]{1,2000})\)/g;
const HTML_HREF = /<a\b[^>]{0,500}?href\s{0,3}=\s{0,3}["']([^"'\n]{1,2000})["']/gi;
const BARE_URL = /\bhttps?:\/\/[^\s<>"'`)\]]{1,2000}/gi;

export function collectLinkRefs(files: ScanInputFile[], deadline: number): LinkRef[] {
  const out: LinkRef[] = [];
  const seen = new Set<string>();

  const push = (file: ScanInputFile, starts: number[], href: string, index: number) => {
    if (out.length >= MAX_LINK_REFS) return;
    if (!/^https?:\/\//i.test(href)) return;
    const url = href.slice(0, 2000);
    if (seen.has(url)) return;
    let host = "";
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      return;
    }
    seen.add(url);
    out.push({ url, host, file: file.path, line: lineAt(starts, index), start: index });
  };

  for (const file of files) {
    if (out.length >= MAX_LINK_REFS || Date.now() > deadline) break;
    const starts = buildLineIndex(file.content);

    for (const pattern of [MD_LINK, HTML_HREF, BARE_URL]) {
      const re = new RegExp(pattern.source, pattern.flags);
      let match: RegExpExecArray | null;
      let guard = 0;
      while ((match = re.exec(file.content)) !== null && out.length < MAX_LINK_REFS) {
        const href = pattern === MD_LINK ? match[2] : match[1] ?? match[0];
        push(file, starts, href, match.index);
        if (++guard % 32 === 0 && Date.now() > deadline) break;
        if (re.lastIndex >= file.content.length) break;
      }
    }
  }

  return out;
}
