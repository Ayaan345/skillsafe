import { RULE_BY_ID } from "../rules";
import type { Finding } from "../types";
import { ascii, startsWith } from "./bytes";

export type Family =
  | "png" | "jpeg" | "gif" | "webp" | "bmp" | "ico" | "pdf" | "zip"
  | "ttf" | "otf" | "woff" | "woff2" | "wasm" | "mp3" | "mp4"
  | "text" | "unknown";

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

const TEXT_EXT = new Set([
  "md", "txt", "py", "js", "mjs", "cjs", "ts", "jsx", "tsx", "sh", "ps1",
  "json", "yaml", "yml", "html", "css", "rb", "svg", "toml", "lock", "env",
]);

const EXT_FAMILY: Record<string, Family> = {
  png: "png", jpg: "jpeg", jpeg: "jpeg", gif: "gif", webp: "webp",
  bmp: "bmp", ico: "ico", pdf: "pdf", zip: "zip",
  ttf: "ttf", otf: "otf", woff: "woff", woff2: "woff2",
  wasm: "wasm", mp3: "mp3", mp4: "mp4", m4a: "mp4", m4v: "mp4",
};

function extensionOf(path: string): string {
  const i = path.lastIndexOf(".");
  return i < 0 ? "" : path.slice(i + 1).toLowerCase();
}

export function declaredFamily(path: string): Family | null {
  const ext = extensionOf(path);
  if (TEXT_EXT.has(ext)) return "text";
  return EXT_FAMILY[ext] ?? null;
}

function looksLikeText(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 512);
  if (n === 0) return true;
  let printable = 0;
  for (let i = 0; i < n; i++) {
    const c = bytes[i];
    if (c === 0) return false;
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c <= 126) || c >= 128) printable++;
  }
  return printable / n >= 0.85;
}

export function sniff(bytes: Uint8Array): Family {
  if (startsWith(bytes, PNG_SIG)) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  const head6 = ascii(bytes, 0, 6);
  if (head6 === "GIF87a" || head6 === "GIF89a") return "gif";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "webp";
  if (ascii(bytes, 0, 2) === "BM") return "bmp";
  if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00])) return "ico";
  if (ascii(bytes, 0, 4) === "%PDF") return "pdf";
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])) return "zip";
  const head4 = ascii(bytes, 0, 4);
  if (head4 === "wOFF") return "woff";
  if (head4 === "wOF2") return "woff2";
  if (head4 === "OTTO") return "otf";
  if (startsWith(bytes, [0x00, 0x01, 0x00, 0x00]) || head4 === "true" || head4 === "typ1") return "ttf";
  if (startsWith(bytes, [0x00, 0x61, 0x73, 0x6d])) return "wasm";
  if (ascii(bytes, 0, 3) === "ID3" || startsWith(bytes, [0xff, 0xfb])) return "mp3";
  if (ascii(bytes, 4, 4) === "ftyp") return "mp4";
  if (looksLikeText(bytes)) return "text";
  return "unknown";
}

export function magicFinding(path: string, bytes: Uint8Array): Finding | null {
  if (bytes.byteLength === 0) return null;
  const declared = declaredFamily(path);
  if (declared === null) return null;
  const actual = sniff(bytes);
  if (actual === "unknown" || actual === declared) return null;

  const r = RULE_BY_ID["asset-001"];
  return {
    ruleId: r.id,
    category: r.category,
    categoryName: r.categoryName,
    severity: r.severity,
    layer: r.layer,
    file: path,
    line: 1,
    start: 0,
    snippet: `Declared .${extensionOf(path)} (${declared}) but the header bytes are ${actual}.`,
    why: r.why,
    fix: r.fix,
    confidence: 1,
  };
}
