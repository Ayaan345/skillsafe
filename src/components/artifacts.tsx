"use client";

import { useState } from "react";
import { displayPath } from "@/lib/scan/intake";
import type { ScanReport } from "@/lib/scan/types";

export function Artifacts({ report }: { report: ScanReport }) {
  const [open, setOpen] = useState(false);
  const hashes = report.hashes ?? [];
  const notes = report.ingestNotes ?? [];
  if (hashes.length === 0 && notes.length === 0) return null;

  return (
    <section className="ss-panel overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="ss-focus flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="text-[#8296b3]">{open ? "▾" : "▸"}</span>
        <span className="font-semibold">Artifacts &amp; ingestion</span>
        <span className="ml-auto text-sm text-[#8fa3bf]">
          {hashes.length} hashed{notes.length > 0 ? ` · ${notes.length} note(s)` : ""}
        </span>
      </button>

      {open ? (
        <div className="space-y-3 px-4 pb-4">
          {report.bundleHash ? (
            <div>
              <div className="ss-label">Bundle SHA-256</div>
              <pre className="ss-evidence mt-1.5" style={{ borderLeftColor: "#4da3ff" }}>
                {report.bundleHash}
              </pre>
            </div>
          ) : null}

          {hashes.length > 0 ? (
            <div>
              <div className="ss-label">Per-file SHA-256</div>
              <ul className="mt-1.5 space-y-1">
                {hashes.map((h) => (
                  <li key={h.path} className="text-xs text-[#8fa3bf]">
                    <span className="font-mono text-[#c3d2e6]">{displayPath(h.path)}</span>
                    <span className="ml-2 text-[#8296b3]">{h.size} B</span>
                    <div className="font-mono break-all text-[#8296b3]">{h.sha256}</div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {notes.length > 0 ? (
            <div>
              <div className="ss-label" style={{ color: "#ffc53d" }}>Ingestion notes</div>
              <ul className="mt-1.5 space-y-1">
                {notes.map((n, i) => (
                  <li key={`${n.name}-${i}`} className="text-xs text-[#8fa3bf]">
                    <span className="font-mono text-[#c3d2e6]">{displayPath(n.name)}</span> — {n.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="text-xs text-[#8296b3]">
            Hashes are computed for every file. Denylist/allowlist matching (hash-001/002) needs the
            optional community list backend and is currently off.
          </p>
        </div>
      ) : null}
    </section>
  );
}
