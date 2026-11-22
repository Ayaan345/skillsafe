export const MAX_MATCHES_PER_RULE = 200;
export const MAX_TEXT_PER_FILE = 400_000;

export function normalize(text: string): string {
  const noBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return noBom.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function buildLineIndex(text: string): number[] {
  const starts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

export function lineAt(starts: number[], index: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

export function snippetAt(text: string, starts: number[], index: number): string {
  const line = lineAt(starts, index) - 1;
  const from = starts[line];
  const next = line + 1 < starts.length ? starts[line + 1] - 1 : text.length;
  const raw = text.slice(from, Math.min(next, from + 240));
  return raw.trim().slice(0, 240);
}

export interface MatchHit {
  index: number;
  text: string;
}

/** Bounded, deadline-checked regex execution. Never runs an unbounded scan. */
export function execBounded(
  text: string,
  pattern: RegExp,
  deadline: number,
  maxMatches = MAX_MATCHES_PER_RULE,
): MatchHit[] {
  const hits: MatchHit[] = [];
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  re.lastIndex = 0;
  let guard = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    hits.push({ index: m.index, text: m[0] });
    if (m[0].length === 0) re.lastIndex++;
    if (hits.length >= maxMatches) break;
    if (++guard % 32 === 0 && Date.now() > deadline) break;
    if (re.lastIndex >= text.length) break;
  }
  return hits;
}
