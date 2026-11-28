"use client";

import { useState } from "react";
import { runOcr } from "@/lib/deep/ocr";
import type { Finding, RawScanFile } from "@/lib/scan/types";

export function OcrScan({
  images,
  applied,
  onResult,
  onClear,
}: {
  images: RawScanFile[];
  applied: number;
  onResult: (findings: Finding[], processed: number) => void;
  onClear: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [processed, setProcessed] = useState(0);

  if (images.length === 0) return null;

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const result = await runOcr(images);
      setProcessed(result.processed);
      setNote(result.note ?? null);
      onResult(result.findings, result.processed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ss-panel overflow-hidden border-l-2 border-l-[#246b96]">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span className="ss-label" style={{ color: "#246b96" }}>Deep scan · optional</span>
        <span className="text-sm text-[#374541]">Read text inside images (OCR)</span>
        <span className="ml-auto flex gap-1.5">
          {applied > 0 ? (
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-focus"
              onClick={() => { onClear(); setNote(null); setProcessed(0); }}
            >
              Remove results
            </button>
          ) : null}
          <button
            type="button"
            className={`ss-btn ss-btn-sm ss-btn-primary ss-focus ${busy ? "ss-sweep" : ""}`}
            onClick={run}
            disabled={busy}
          >
            {busy ? "Reading…" : `Read ${images.length} image(s)`}
          </button>
        </span>
      </div>

      <div className="space-y-2 px-4 pb-4">
        <p className="text-xs leading-relaxed text-[#58655f]">
          Catches an instruction hidden as a <span className="text-[#374541]">picture of text</span> rather than a
          string — the case a reviewer skimming the markdown never sees. Recognition runs in your browser; image
          pixels are never uploaded. Only the locally served recognition library is loaded. Text recognition is
          noisy, so these findings are Medium at reduced confidence and always show the exact recognized text.
          capped at {images.length} image(s) per run.
        </p>

        {processed > 0 && !note ? (
          <p className="text-xs text-[#08745d]">
            Read {processed} image(s) — {applied} finding(s) merged into this report.
          </p>
        ) : null}

        {note ? <p className="text-xs text-[#946200]">{note}</p> : null}
      </div>
    </section>
  );
}
