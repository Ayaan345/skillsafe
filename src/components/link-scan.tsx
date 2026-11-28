"use client";

import { useState } from "react";
import { runLinkCheck } from "@/lib/deep/link-reputation";
import type { Finding, LinkRef } from "@/lib/scan/types";

export function LinkScan({
  links,
  applied,
  onResult,
  onClear,
}: {
  links: LinkRef[];
  applied: number;
  onResult: (findings: Finding[], checked: number) => void;
  onClear: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [checked, setChecked] = useState(0);
  const [showUrls, setShowUrls] = useState(false);

  if (links.length === 0) return null;

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const result = await runLinkCheck(links);
      setChecked(result.checked);
      setNote(result.note ?? null);
      onResult(result.findings, result.checked);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ss-panel overflow-hidden border-l-2 border-l-[#b54708]">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span className="ss-label" style={{ color: "#b54708" }}>Deep scan · optional</span>
        <span className="text-sm text-[#374541]">Live link reputation</span>
        <span className="ml-auto flex gap-1.5">
          {applied > 0 ? (
            <button type="button" className="ss-btn ss-btn-sm ss-focus" onClick={() => { onClear(); setNote(null); setChecked(0); }}>
              Remove results
            </button>
          ) : null}
          <button type="button" className={`ss-btn ss-btn-sm ss-btn-primary ss-focus ${busy ? "ss-sweep" : ""}`} onClick={run} disabled={busy}>
            {busy ? "Looking up…" : `Look up ${links.length} link(s)`}
          </button>
        </span>
      </div>

      <div className="space-y-2 px-4 pb-4">
        <p className="text-xs leading-relaxed text-[#58655f]">
          Structural checks already ran offline. This asks Google Safe Browsing whether the{" "}
          <span className="text-[#374541]">live destinations</span> are currently listed as malware or phishing —
          the case a perfectly normal-looking HTTPS link to a freshly registered domain would otherwise pass.
          Only the URLs are sent, via our own server. No file content, filenames, or hashes. Internal, link-local
          and cloud-metadata hosts are refused before egress.
        </p>

        <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost ss-focus" onClick={() => setShowUrls((v) => !v)}>
          {showUrls ? "Hide" : "Show"} exactly what will be sent
        </button>

        {showUrls ? (
          <pre dir="ltr" className="ss-evidence" style={{ borderLeftColor: "#b54708" }}>
            {links.map((l) => l.url).join("\n")}
          </pre>
        ) : null}

        {checked > 0 && !note ? (
          <p className="text-xs text-[#08745d]">
            Looked up {checked} destination(s) — {applied} listing(s) merged into this report.
          </p>
        ) : null}

        {note ? <p className="text-xs text-[#946200]">{note}</p> : null}
      </div>
    </section>
  );
}
