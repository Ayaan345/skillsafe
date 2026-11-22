import type { FileHash } from "./types";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes)));
}

/** Bundle digest = SHA-256 over sorted "path:hash" lines. Order-independent. */
export async function bundleHashOf(hashes: FileHash[]): Promise<string> {
  const manifest = [...hashes]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((h) => `${h.path}:${h.sha256}`)
    .join("\n");
  return sha256Hex(new TextEncoder().encode(manifest));
}
