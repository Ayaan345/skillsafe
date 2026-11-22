import { describe, expect, it } from "vitest";
import { scanFiles } from "@/lib/scan/engine";
import { extractAssetStrings } from "@/lib/scan/l0/assets";
import { magicFinding, sniff } from "@/lib/scan/l0/magic";
import { readZip } from "@/lib/scan/l0/zip";

const SEED = 0x5f3a9c11;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const enc = (s: string) => new TextEncoder().encode(s);
const be32 = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];

function pngSeed(): Uint8Array {
  const chunk = (type: string, data: number[]) => [...be32(data.length), ...enc(type), ...data, ...be32(0)];
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk("IHDR", [...be32(1), ...be32(1), 8, 0, 0, 0, 0]),
    ...chunk("tEXt", [...enc("Comment"), 0, ...enc("hello")]),
    ...chunk("IEND", []),
  ]);
}

const SEEDS: Uint8Array[] = [
  pngSeed(),
  new Uint8Array([0xff, 0xd8, 0xff, 0xfe, 0x00, 0x06, 0x68, 0x69, 0xff, 0xd9]),
  enc("GIF89a\u0001\u0000\u0001\u0000\u0000\u0000\u0000;"),
  new Uint8Array([0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x10, 0x00, 0x00, 0x00, 0x00]),
  enc("PK\u0003\u0004"),
];

function corpus(count: number): Uint8Array[] {
  const next = rng(SEED);
  const out: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    const mode = Math.floor(next() * 3);
    if (mode === 0) {
      const len = Math.floor(next() * 2048);
      const b = new Uint8Array(len);
      for (let j = 0; j < len; j++) b[j] = Math.floor(next() * 256);
      out.push(b);
    } else {
      const base = SEEDS[Math.floor(next() * SEEDS.length)];
      const cut = mode === 1 ? Math.floor(next() * base.length) : base.length;
      const b = new Uint8Array(base.subarray(0, cut));
      const flips = 1 + Math.floor(next() * 6);
      for (let k = 0; k < flips && b.length > 0; k++) {
        b[Math.floor(next() * b.length)] = Math.floor(next() * 256);
      }
      out.push(b);
    }
  }
  return out;
}

const NAMES = ["a.png", "a.jpg", "a.gif", "a.webp", "a.ttf", "a.woff", "a.zip", "a.md", "a.bin"];
const far = () => Date.now() + 60_000;

describe("fuzz: magic-byte sniffing", () => {
  it("never throws on 250 random or mutated buffers", () => {
    const buffers = corpus(250);
    for (let i = 0; i < buffers.length; i++) {
      const name = NAMES[i % NAMES.length];
      expect(() => sniff(buffers[i]), `seed=${SEED} index=${i}`).not.toThrow();
      expect(() => magicFinding(name, buffers[i]), `seed=${SEED} index=${i}`).not.toThrow();
    }
  });
});

describe("fuzz: asset metadata extraction", () => {
  it("never throws and stays bounded on 250 random or mutated buffers", async () => {
    const buffers = corpus(250);
    const started = Date.now();
    for (let i = 0; i < buffers.length; i++) {
      const name = NAMES[i % NAMES.length];
      await expect(
        extractAssetStrings(name, buffers[i], far()),
        `seed=${SEED} index=${i}`,
      ).resolves.toBeDefined();
    }
    expect(Date.now() - started).toBeLessThan(20_000);
  });
});

describe("fuzz: zip reader", () => {
  it("never throws on 250 random or mutated buffers", async () => {
    const buffers = corpus(250);
    for (let i = 0; i < buffers.length; i++) {
      await expect(readZip(buffers[i], far()), `seed=${SEED} index=${i}`).resolves.toBeDefined();
    }
  });
});

describe("fuzz: text engine", () => {
  it("never throws and stays bounded on random Unicode documents", () => {
    const next = rng(SEED ^ 0xabcdef);
    const pool = ["a", " ", "\n", "\u200b", "\u202e", "[", "]", "'", '"', "/", "e", "v", "l"];
    for (let i = 0; i < 80; i++) {
      const len = Math.floor(next() * 4000);
      let s = "";
      for (let j = 0; j < len; j++) {
        s += next() < 0.05
          ? String.fromCodePoint(0xe0000 + Math.floor(next() * 0x80))
          : pool[Math.floor(next() * pool.length)];
      }
      const report = scanFiles([{ path: "f.md", content: s }], 400);
      expect(report.durationMs, `seed=${SEED} index=${i}`).toBeLessThan(2000);
    }
  });
});
