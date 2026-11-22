import { ascii, be16, be32, concat, le32, pushString, startsWith, MAX_META_STRING_LEN } from "./bytes";
import { inflateBytes } from "./inflate";

const utf8 = new TextDecoder("utf-8", { fatal: false });
const latin1 = new TextDecoder("latin1");
const utf16be = new TextDecoder("utf-16be");

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const EXIF_SIG = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00] as const;

export interface AssetExtraction {
  strings: string[];
  note?: string;
}

function subBlocks(bytes: Uint8Array, offset: number): { data: Uint8Array; next: number } {
  const parts: Uint8Array[] = [];
  let p = offset;
  let total = 0;
  let guard = 0;
  while (p < bytes.length && guard++ < 1024) {
    const n = bytes[p];
    p++;
    if (n === 0) break;
    parts.push(bytes.subarray(p, Math.min(p + n, bytes.length)));
    total += n;
    p += n;
    if (total > MAX_META_STRING_LEN) break;
  }
  return { data: concat(parts, Math.min(total, MAX_META_STRING_LEN)), next: p };
}

/** TIFF/EXIF IFD walk: ASCII tags plus UserComment. */
function tiffStrings(bytes: Uint8Array, out: string[]): void {
  if (bytes.length < 8) return;
  const order = ascii(bytes, 0, 2);
  const little = order === "II";
  if (!little && order !== "MM") return;

  const u16 = (o: number) => (o + 2 <= bytes.length ? (little ? bytes[o] | (bytes[o + 1] << 8) : be16(bytes, o)) : 0);
  const u32 = (o: number) => (o + 4 <= bytes.length ? (little ? le32(bytes, o) : be32(bytes, o)) : 0);
  if (u16(2) !== 42) return;

  const queue: number[] = [u32(4)];
  const seen = new Set<number>();
  let guard = 0;

  while (queue.length > 0 && guard++ < 8) {
    const ifd = queue.shift() as number;
    if (ifd <= 0 || ifd + 2 > bytes.length || seen.has(ifd)) continue;
    seen.add(ifd);
    const entries = u16(ifd);
    if (entries > 512) continue;

    for (let i = 0; i < entries; i++) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > bytes.length) break;
      const tag = u16(e);
      const type = u16(e + 2);
      const n = u32(e + 4);
      if (tag === 0x8769 || tag === 0x8825) { queue.push(u32(e + 8)); continue; }
      if (n === 0 || n > 4096) continue;
      const valueOffset = n <= 4 ? e + 8 : u32(e + 8);
      if (valueOffset + n > bytes.length) continue;
      const raw = bytes.subarray(valueOffset, valueOffset + n);
      if (type === 2) {
        pushString(out, latin1.decode(raw));
      } else if (type === 7 && tag === 0x9286) {
        const body = ascii(raw, 0, 5) === "ASCII" ? raw.subarray(8) : raw;
        pushString(out, utf8.decode(body));
      }
    }
  }
}

async function pngStrings(bytes: Uint8Array, deadline: number): Promise<string[]> {
  const out: string[] = [];
  let offset = 8;
  let guard = 0;

  while (offset + 12 <= bytes.length && guard++ < 256 && Date.now() < deadline) {
    const length = be32(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    if (offset + 12 + length > bytes.length) break;
    const data = bytes.subarray(offset + 8, offset + 8 + length);

    if (type === "tEXt") {
      const z = data.indexOf(0);
      if (z > 0) pushString(out, latin1.decode(data.subarray(z + 1)));
    } else if (type === "iTXt") {
      const z = data.indexOf(0);
      if (z > 0 && z + 3 < data.length) {
        const compressed = data[z + 1];
        const langEnd = data.indexOf(0, z + 3);
        const transEnd = langEnd >= 0 ? data.indexOf(0, langEnd + 1) : -1;
        if (transEnd >= 0) {
          const body = data.subarray(transEnd + 1);
          if (compressed === 0) {
            pushString(out, utf8.decode(body));
          } else {
            try {
              pushString(out, utf8.decode(await inflateBytes(body, MAX_META_STRING_LEN, deadline, "deflate")));
            } catch { /* compressed metadata unavailable */ }
          }
        }
      }
    } else if (type === "zTXt") {
      const z = data.indexOf(0);
      if (z > 0 && z + 1 < data.length) {
        try {
          pushString(out, latin1.decode(await inflateBytes(data.subarray(z + 2), MAX_META_STRING_LEN, deadline, "deflate")));
        } catch { /* compressed metadata unavailable */ }
      }
    } else if (type === "eXIf") {
      tiffStrings(data, out);
    } else if (type === "IEND") {
      break;
    }

    offset += 12 + length;
  }

  return out;
}

function jpegStrings(bytes: Uint8Array, out: string[], deadline: number): void {
  let offset = 2;
  let guard = 0;
  while (offset + 4 <= bytes.length && guard++ < 256 && Date.now() < deadline) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
    const length = be16(bytes, offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) break;
    const segment = bytes.subarray(offset + 4, offset + 2 + length);
    if (marker === 0xfe) {
      pushString(out, latin1.decode(segment));
    } else if (marker === 0xe1) {
      if (startsWith(segment, EXIF_SIG)) {
        tiffStrings(segment.subarray(6), out);
      } else {
        const text = utf8.decode(segment);
        if (text.includes("<x:xmpmeta") || text.includes("<?xpacket")) pushString(out, text);
      }
    }
    offset += 2 + length;
  }
}

function gifStrings(bytes: Uint8Array, out: string[], deadline: number): void {
  if (bytes.length < 13) return;
  let offset = 13;
  const packed = bytes[10];
  if ((packed & 0x80) !== 0) offset += 3 * (1 << ((packed & 7) + 1));
  let guard = 0;

  while (offset < bytes.length && guard++ < 512 && Date.now() < deadline) {
    const block = bytes[offset];
    if (block === 0x3b) break;
    if (block === 0x21) {
      const label = bytes[offset + 1];
      const result = subBlocks(bytes, offset + 2);
      if (label === 0xfe) pushString(out, latin1.decode(result.data));
      offset = result.next;
    } else if (block === 0x2c) {
      if (offset + 10 > bytes.length) break;
      const local = bytes[offset + 9];
      offset += 10;
      if ((local & 0x80) !== 0) offset += 3 * (1 << ((local & 7) + 1));
      offset = subBlocks(bytes, offset + 1).next;
    } else {
      break;
    }
  }
}

function webpStrings(bytes: Uint8Array, out: string[]): void {
  let offset = 12;
  let guard = 0;
  while (offset + 8 <= bytes.length && guard++ < 128) {
    const tag = ascii(bytes, offset, 4);
    const size = le32(bytes, offset + 4);
    if (offset + 8 + size > bytes.length) break;
    const data = bytes.subarray(offset + 8, offset + 8 + size);
    if (tag === "EXIF") tiffStrings(data, out);
    else if (tag === "XMP ") pushString(out, utf8.decode(data));
    offset += 8 + size + (size & 1);
  }
}

function nameTable(b: Uint8Array): string[] {
  const out: string[] = [];
  if (b.length < 6) return out;
  const count = be16(b, 2);
  const stringOffset = be16(b, 4);
  for (let i = 0; i < Math.min(count, 256); i++) {
    const record = 6 + i * 12;
    if (record + 12 > b.length) break;
    const platform = be16(b, record);
    const length = be16(b, record + 8);
    const offset = be16(b, record + 10);
    const start = stringOffset + offset;
    if (length === 0 || start + length > b.length) continue;
    const raw = b.subarray(start, start + length);
    pushString(out, platform === 0 || platform === 3 ? utf16be.decode(raw) : latin1.decode(raw));
  }
  return out;
}

async function fontStrings(bytes: Uint8Array, deadline: number): Promise<AssetExtraction> {
  const signature = ascii(bytes, 0, 4);

  if (signature === "wOF2") {
    return {
      strings: [],
      note: "WOFF2 name-table extraction is not implemented (Brotli plus a transformed table directory). Magic-byte check and SHA-256 still ran.",
    };
  }

  if (signature === "wOFF") {
    const tables = be16(bytes, 12);
    for (let i = 0; i < Math.min(tables, 64); i++) {
      const record = 44 + i * 20;
      if (record + 20 > bytes.length) break;
      if (ascii(bytes, record, 4) !== "name") continue;
      const offset = be32(bytes, record + 4);
      const compLength = be32(bytes, record + 8);
      const origLength = be32(bytes, record + 12);
      if (offset + compLength > bytes.length) break;
      let table = bytes.subarray(offset, offset + compLength);
      if (compLength < origLength) {
        try {
          table = await inflateBytes(table, 1024 * 1024, deadline, "deflate");
        } catch {
          return { strings: [], note: "WOFF name table is compressed and could not be inflated." };
        }
      }
      return { strings: nameTable(table) };
    }
    return { strings: [] };
  }

  const tables = be16(bytes, 4);
  for (let i = 0; i < Math.min(tables, 64); i++) {
    const record = 12 + i * 16;
    if (record + 16 > bytes.length) break;
    if (ascii(bytes, record, 4) !== "name") continue;
    const offset = be32(bytes, record + 8);
    const length = be32(bytes, record + 12);
    if (offset + length > bytes.length) break;
    return { strings: nameTable(bytes.subarray(offset, offset + length)) };
  }
  return { strings: [] };
}

export async function extractAssetStrings(
  path: string,
  bytes: Uint8Array,
  deadline: number,
): Promise<AssetExtraction> {
  const head = ascii(bytes, 0, 4);

  if (startsWith(bytes, PNG_SIG)) return { strings: await pngStrings(bytes, deadline) };

  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    const out: string[] = [];
    jpegStrings(bytes, out, deadline);
    return { strings: out };
  }

  const six = ascii(bytes, 0, 6);
  if (six === "GIF87a" || six === "GIF89a") {
    const out: string[] = [];
    gifStrings(bytes, out, deadline);
    return { strings: out };
  }

  if (head === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    const out: string[] = [];
    webpStrings(bytes, out);
    return { strings: out };
  }

  if (head === "wOFF" || head === "wOF2" || head === "OTTO" || startsWith(bytes, [0x00, 0x01, 0x00, 0x00])) {
    return fontStrings(bytes, deadline);
  }

  return { strings: [], note: "Opaque binary: magic-byte check and SHA-256 only, no text-bearing structure." };
}
