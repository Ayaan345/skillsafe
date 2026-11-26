import { scanFiles } from "@/lib/scan/engine";
import { RULE_BY_ID } from "@/lib/scan/rules";
import type { Finding, RawScanFile } from "@/lib/scan/types";

const RASTER_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp"]);
export const MAX_OCR_IMAGES = 3;
const OCR_TIMEOUT_MS = 15_000;
const OCR_CONFIDENCE = 0.5;

function extensionOf(path: string): string {
  const i = path.lastIndexOf(".");
  return i < 0 ? "" : path.slice(i + 1).toLowerCase();
}

export function rasterImages(raw: RawScanFile[]): RawScanFile[] {
  return raw.filter((f) => RASTER_EXT.has(extensionOf(f.path))).slice(0, MAX_OCR_IMAGES);
}

export interface OcrRunResult {
  findings: Finding[];
  processed: number;
  note?: string;
}

const NOT_INSTALLED =
  "OCR assets are not installed. Run: node scripts/setup-ocr.mjs — then reload and try again.";

/**
 * OCR is noisy by nature, so findings are Medium at reduced confidence and
 * always shown with the exact recognized text. Pixels stay on-device; only
 * locally served library assets are fetched.
 */
export async function runOcr(images: RawScanFile[]): Promise<OcrRunResult> {
  if (images.length === 0) {
    return { findings: [], processed: 0, note: "No raster images in this submission to read." };
  }

  try {
    const probe = await fetch("/tesseract/worker.min.js", { method: "HEAD", cache: "no-store" });
    if (!probe.ok) return { findings: [], processed: 0, note: NOT_INSTALLED };
  } catch {
    return { findings: [], processed: 0, note: NOT_INSTALLED };
  }

  let createWorker: typeof import("tesseract.js").createWorker;
  try {
    ({ createWorker } = await import("tesseract.js"));
  } catch {
    return { findings: [], processed: 0, note: "tesseract.js is not installed. Run: npm i tesseract.js" };
  }

  const findings: Finding[] = [];
  let processed = 0;
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

  try {
    worker = await createWorker("eng", 1, {
      workerPath: "/tesseract/worker.min.js",
      corePath: "/tesseract",
      langPath: "/tessdata",
      gzip: true,
    });

    for (const image of images) {
      let text = "";
      const imageBuffer = new ArrayBuffer(image.bytes.byteLength);
      new Uint8Array(imageBuffer).set(image.bytes);
      const imageBlob = new Blob([imageBuffer]);
      try {
        const result = await Promise.race([
          worker.recognize(imageBlob),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("OCR timeout")), OCR_TIMEOUT_MS),
          ),
        ]);
        text = result.data.text ?? "";
      } catch {
        break;
      }

      processed += 1;
      if (text.trim().length < 4) continue;

      const report = scanFiles([{ path: `${image.path} [OCR]`, content: text, sourceKind: "ocr" }], 1000);
      const rule = RULE_BY_ID["asset-006"];
      for (const found of report.findings) {
        if (found.category !== 1) continue;
        findings.push({
          ...found,
          ruleId: rule.id,
          category: rule.category,
          categoryName: rule.categoryName,
          severity: rule.severity,
          layer: rule.layer,
          why: `${rule.why} Recognized text: "${text.trim().slice(0, 160)}"`,
          fix: rule.fix,
          confidence: OCR_CONFIDENCE,
        });
      }
    }
  } catch {
    return { findings, processed, note: NOT_INSTALLED };
  } finally {
    if (worker) {
      try { await worker.terminate(); } catch { /* already gone */ }
    }
  }

  return { findings, processed };
}
