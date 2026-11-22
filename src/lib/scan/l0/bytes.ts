export function be16(b: Uint8Array, o: number): number {
  return o + 2 <= b.length ? (b[o] << 8) | b[o + 1] : 0;
}

export function be32(b: Uint8Array, o: number): number {
  return o + 4 <= b.length
    ? ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0
    : 0;
}

export function le32(b: Uint8Array, o: number): number {
  return o + 4 <= b.length
    ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
    : 0;
}

export function ascii(b: Uint8Array, o: number, n: number): string {
  let s = "";
  for (let i = o; i < Math.min(o + n, b.length); i++) s += String.fromCharCode(b[i]);
  return s;
}

export function startsWith(b: Uint8Array, sig: readonly number[]): boolean {
  if (b.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (b[i] !== sig[i]) return false;
  return true;
}

export function concat(parts: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p.subarray(0, Math.max(0, total - o)), o);
    o += p.length;
    if (o >= total) break;
  }
  return out;
}

export const MAX_META_STRINGS = 64;
export const MAX_META_STRING_LEN = 8192;

/** Collect a candidate metadata string, bounded in count and length. */
export function pushString(out: string[], raw: string): void {
  if (out.length >= MAX_META_STRINGS) return;
  const s = raw.replace(/\u0000{1,8}/g, "").trim().slice(0, MAX_META_STRING_LEN);
  if (s.length >= 4) out.push(s);
}
