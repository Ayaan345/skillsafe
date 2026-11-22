import { describe, expect, it } from "vitest";
import { readZip, safeEntryPath } from "@/lib/scan/l0/zip";

const enc = (s: string) => new TextEncoder().encode(s);
const u16 = (v: number) => [v & 255, (v >> 8) & 255];
const u32 = (v: number) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];

function makeZip(entries: Array<{ name: string; data: Uint8Array; declaredSize?: number }>): Uint8Array {
  const out: number[] = [];
  const cd: number[] = [];
  for (const e of entries) {
    const localOffset = out.length;
    const name = [...enc(e.name)];
    const declared = e.declaredSize ?? e.data.length;
    out.push(
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(e.data.length), ...u32(declared), ...u16(name.length), ...u16(0),
      ...name, ...e.data,
    );
    cd.push(
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(e.data.length), ...u32(declared), ...u16(name.length), ...u16(0),
      ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(localOffset), ...name,
    );
  }
  const cdOffset = out.length;
  out.push(...cd);
  out.push(
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length),
    ...u32(cd.length), ...u32(cdOffset), ...u16(0),
  );
  return new Uint8Array(out);
}

function patchEocd(zip: Uint8Array, fieldOffset: number, bytes: number[]): Uint8Array {
  const copy = new Uint8Array(zip);
  const eocd = copy.length - 22;
  for (let i = 0; i < bytes.length; i++) copy[eocd + fieldOffset + i] = bytes[i];
  return copy;
}

const far = () => Date.now() + 60_000;

describe("zip adversarial corpus", () => {
  it("strips invisibles before validating, so a disguised traversal is still rejected", () => {
    expect(safeEntryPath(".\u200B./evil.txt")).toBeNull();
    expect(safeEntryPath("a/.\u200B./evil.txt")).toBeNull();
    expect(safeEntryPath("\u202E../evil.txt")).toBeNull();
  });

  it("rejects UNC and drive-relative paths", () => {
    expect(safeEntryPath("\\\\server\\share\\x.txt")).toBeNull();
    expect(safeEntryPath("C:evil.txt")).toBeNull();
  });

  it("reports a truncated central directory instead of looking clean", async () => {
    const zip = patchEocd(makeZip([{ name: "a.md", data: enc("x") }]), 10, u16(5));
    const result = await readZip(zip, far());
    expect(result.rejected.some((r) => r.reason.includes("Central directory"))).toBe(true);
    expect(result.truncated).toBe(true);
  });

  it("reports an out-of-range central directory offset instead of looking clean", async () => {
    const zip = patchEocd(makeZip([{ name: "a.md", data: enc("x") }]), 16, u32(0xfffffff0));
    const result = await readZip(zip, far());
    expect(result.entries.length).toBe(0);
    expect(result.rejected.length).toBeGreaterThan(0);
  });

  it("survives an oversized name length without throwing", async () => {
    const zip = new Uint8Array(makeZip([{ name: "a.md", data: enc("x") }]));
    const cdStart = zip.length - 22 - (46 + 4);
    zip[cdStart + 28] = 0xff;
    zip[cdStart + 29] = 0xff;
    const result = await readZip(zip, far());
    expect(result.rejected.length).toBeGreaterThan(0);
  });

  it("rejects a stored entry whose declared size does not match its data", async () => {
    const zip = makeZip([{ name: "a.md", data: enc("xx"), declaredSize: 99 }]);
    const result = await readZip(zip, far());
    expect(result.rejected.some((r) => r.reason.includes("Stored size"))).toBe(true);
  });

  it("rejects ZIP64 rather than misparsing it", async () => {
    const zip = patchEocd(makeZip([{ name: "a.md", data: enc("x") }]), 16, u32(0xffffffff));
    const result = await readZip(zip, far());
    expect(result.rejected.some((r) => r.reason.includes("ZIP64"))).toBe(true);
  });

  it("notes an empty archive", async () => {
    const result = await readZip(makeZip([]), far());
    expect(result.rejected.some((r) => r.reason.includes("no entries"))).toBe(true);
  });

  it("does not throw on garbage carrying a valid EOCD signature", async () => {
    const junk = new Uint8Array(200);
    for (let i = 0; i < junk.length; i++) junk[i] = (i * 37) & 255;
    const sig = u32(0x06054b50);
    for (let i = 0; i < 4; i++) junk[junk.length - 22 + i] = sig[i];
    const result = await readZip(junk, far());
    expect(Array.isArray(result.entries)).toBe(true);
  });
});
