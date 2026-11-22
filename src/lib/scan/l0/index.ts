import { bundleHashOf, sha256Hex } from "../hash";
import { MAX_TOTAL_BYTES } from "../intake";
import type { FileHash, Finding, RawScanFile, ScanInputFile, SourceKind } from "../types";
import { extractAssetStrings } from "./assets";
import { declaredFamily, magicFinding } from "./magic";
import { readZip } from "./zip";

const TEXT_EXT = new Set([
  "md", "txt", "py", "js", "mjs", "cjs", "ts", "jsx", "tsx", "sh", "ps1",
  "json", "yaml", "yml", "html", "css", "rb", "toml", "lock", "env",
]);

const RASTER_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico"]);
const FONT_EXT = new Set(["ttf", "otf", "woff", "woff2"]);

export interface IngestResult {
  files: ScanInputFile[];
  findings: Finding[];
  hashes: FileHash[];
  bundleHash: string;
  notes: { name: string; reason: string }[];
  truncated: boolean;
}

function extensionOf(path: string): string {
  const i = path.lastIndexOf(".");
  return i < 0 ? "" : path.slice(i + 1).toLowerCase();
}

/** Explicit charset detection: BOM first, then a UTF-16 NUL-parity heuristic. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  const probe = Math.min(bytes.length, 256);
  let nulEven = 0;
  let nulOdd = 0;
  for (let i = 0; i < probe; i++) {
    if (bytes[i] === 0) { if (i % 2 === 0) nulEven++; else nulOdd++; }
  }
  if (probe > 8 && nulOdd > probe / 4 && nulEven === 0) return new TextDecoder("utf-16le").decode(bytes);
  if (probe > 8 && nulEven > probe / 4 && nulOdd === 0) return new TextDecoder("utf-16be").decode(bytes);
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export async function ingest(raw: RawScanFile[], deadline: number): Promise<IngestResult> {
  const files: ScanInputFile[] = [];
  const findings: Finding[] = [];
  const hashes: FileHash[] = [];
  const notes: { name: string; reason: string }[] = [];
  let truncated = false;

  const route = async (file: RawScanFile, depth: number): Promise<void> => {
    if (Date.now() > deadline) { truncated = true; return; }

    hashes.push({ path: file.path, sha256: await sha256Hex(file.bytes), size: file.bytes.byteLength });

    const mismatch = magicFinding(file.path, file.bytes);
    if (mismatch) findings.push(mismatch);

    const ext = extensionOf(file.path);

    if (ext === "zip") {
      if (depth > 0) {
        notes.push({ name: file.path, reason: "Nested archives are not unpacked; hashed and magic-checked only." });
        return;
      }
      const archive = await readZip(file.bytes, deadline);
      notes.push(...archive.rejected);
      truncated = truncated || archive.truncated;
      for (const entry of archive.entries) await route(entry, depth + 1);
      return;
    }

    if (ext === "svg") {
      files.push({ path: file.path, content: decodeText(file.bytes), sourceKind: "svg" });
      return;
    }

    if (TEXT_EXT.has(ext) || declaredFamily(file.path) === "text") {
      files.push({ path: file.path, content: decodeText(file.bytes), sourceKind: "text" });
      return;
    }

    if (RASTER_EXT.has(ext) || FONT_EXT.has(ext)) {
      const kind: SourceKind = RASTER_EXT.has(ext) ? "image-metadata" : "font-metadata";
      const label = kind === "image-metadata" ? "metadata" : "name table";
      const extraction = await extractAssetStrings(file.path, file.bytes, deadline);
      if (extraction.note) notes.push({ name: file.path, reason: extraction.note });
      for (const value of extraction.strings) {
        files.push({ path: `${file.path} [${label}]`, content: value, sourceKind: kind });
      }
      return;
    }

    notes.push({ name: file.path, reason: "Opaque binary: magic-byte check and SHA-256 only." });
  };

  let rawTotal = 0;
  for (const file of raw) {
    if (Date.now() > deadline) { truncated = true; break; }
    rawTotal += file.bytes.byteLength;
    if (rawTotal > MAX_TOTAL_BYTES) {
      notes.push({ name: file.path, reason: "Top-level total-size limit (50MB) reached; file not ingested." });
      truncated = true;
      continue;
    }
    await route(file, 0);
  }

  return { files, findings, hashes, bundleHash: await bundleHashOf(hashes), notes, truncated };
}
