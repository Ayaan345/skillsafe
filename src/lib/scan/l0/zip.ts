import type { RawScanFile } from "../types";
import { concat } from "./bytes";
import { inflateBytes } from "./inflate";

export const ZIP_MAX_FILES = 250;
export const ZIP_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ZIP_MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_RATIO = 200;
const RATIO_FLOOR = 1024 * 1024;

export interface ZipReadResult {
  entries: RawScanFile[];
  rejected: { name: string; reason: string }[];
  truncated: boolean;
}

/** Strip invisibles FIRST, then reject traversal — order matters. */
export function safeEntryPath(raw: string): string | null {
  const stripped = raw.replace(
    /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g,
    "",
  );
  const cleaned = stripped.replace(/\\/g, "/");
  if (cleaned.startsWith("/") || /^[a-zA-Z]:/.test(cleaned)) return null;
  const parts: string[] = [];
  for (const segment of cleaned.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") return null;
    parts.push(segment);
  }
  if (parts.length === 0) return null;
  return parts.join("/").slice(0, 300);
}

export async function readZip(bytes: Uint8Array, deadline: number): Promise<ZipReadResult> {
  const entries: RawScanFile[] = [];
  const rejected: { name: string; reason: string }[] = [];
  let truncated = false;

  if (bytes.length < 22) {
    return { entries, rejected: [{ name: "archive", reason: "Too short to be a ZIP archive." }], truncated };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  const floor = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= floor; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) {
    return { entries, rejected: [{ name: "archive", reason: "No end-of-central-directory record found." }], truncated };
  }

  const count = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (count === 0xffff || cdOffset === 0xffffffff) {
    return { entries, rejected: [{ name: "archive", reason: "ZIP64 archives are not supported." }], truncated };
  }

  const decoder = new TextDecoder("utf-8", { fatal: false });
  let pointer = cdOffset;
  let totalBytes = 0;

  for (let n = 0; n < count; n++) {
    if (Date.now() > deadline) { truncated = true; break; }
    if (pointer + 46 > bytes.length || view.getUint32(pointer, true) !== 0x02014b50) {
      rejected.push({
        name: "archive",
        reason: "Central directory is truncated or corrupt; remaining entries were not read.",
      });
      truncated = true;
      break;
    }

    const flags = view.getUint16(pointer + 8, true);
    const method = view.getUint16(pointer + 10, true);
    const compSize = view.getUint32(pointer + 20, true);
    const uncompSize = view.getUint32(pointer + 24, true);
    const nameLen = view.getUint16(pointer + 28, true);
    const extraLen = view.getUint16(pointer + 30, true);
    const commentLen = view.getUint16(pointer + 32, true);
    const extAttr = view.getUint32(pointer + 38, true);
    const localOffset = view.getUint32(pointer + 42, true);
    if (pointer + 46 + nameLen + extraLen + commentLen > bytes.length) {
      rejected.push({
        name: "archive",
        reason: "Central directory entry is truncated or corrupt.",
      });
      truncated = true;
      break;
    }
    const rawName = decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLen));
    pointer += 46 + nameLen + extraLen + commentLen;

    if (rawName.endsWith("/")) continue;

    const path = safeEntryPath(rawName);
    if (path === null) {
      rejected.push({ name: rawName, reason: "Zip-slip: entry path would resolve outside the extraction root." });
      continue;
    }
    if ((flags & 1) !== 0) {
      rejected.push({ name: rawName, reason: "Encrypted entries are not supported." });
      continue;
    }
    if (((extAttr >>> 16) & 0xf000) === 0xa000) {
      rejected.push({ name: rawName, reason: "Symbolic-link entries are rejected." });
      continue;
    }
    if (entries.length >= ZIP_MAX_FILES) {
      rejected.push({ name: rawName, reason: `File-count limit (${ZIP_MAX_FILES}) reached.` });
      truncated = true;
      continue;
    }
    if (uncompSize > ZIP_MAX_FILE_BYTES) {
      rejected.push({ name: rawName, reason: "Over the 10MB per-file extraction limit." });
      continue;
    }
    if (totalBytes + uncompSize > ZIP_MAX_TOTAL_BYTES) {
      rejected.push({ name: rawName, reason: "Total extracted-size limit (50MB) reached." });
      truncated = true;
      continue;
    }
    if (method === 8 && compSize > 0 && uncompSize > RATIO_FLOOR && uncompSize / compSize > MAX_RATIO) {
      rejected.push({ name: rawName, reason: "Compression ratio exceeds 200:1 — probable decompression bomb." });
      continue;
    }
    if (method !== 0 && method !== 8) {
      rejected.push({ name: rawName, reason: `Unsupported compression method (${method}).` });
      continue;
    }
    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) {
      rejected.push({ name: rawName, reason: "Local file header is missing or corrupt." });
      continue;
    }

    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    if (dataStart + compSize > bytes.length) {
      rejected.push({ name: rawName, reason: "Compressed data runs past the end of the archive." });
      continue;
    }
    const data = bytes.subarray(dataStart, dataStart + compSize);

    try {
      let content: Uint8Array;
      if (method === 0) {
        if (data.length !== uncompSize) {
          rejected.push({ name: rawName, reason: "Stored size does not match the declared size." });
          continue;
        }
        content = data;
      } else {
        content = await inflateBytes(data, Math.min(uncompSize, ZIP_MAX_FILE_BYTES), deadline, "deflate-raw");
      }
      entries.push({ path, bytes: concat([content], content.length) });
      totalBytes += content.length;
    } catch (err) {
      rejected.push({ name: rawName, reason: err instanceof Error ? err.message : "Extraction failed." });
    }
  }

  if (count === 0) {
    rejected.push({ name: "archive", reason: "Archive contains no entries." });
  } else if (entries.length === 0 && rejected.length === 0) {
    rejected.push({
      name: "archive",
      reason: "No files could be extracted from this archive; coverage is incomplete.",
    });
    truncated = true;
  }

  return { entries, rejected, truncated };
}
