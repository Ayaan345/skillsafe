"use client";

import { useState } from "react";
import { runOsvCheck } from "@/lib/deep/run-osv";
import type { DependencyRef, Finding } from "@/lib/scan/types";

export function DeepScan({
  dependencies,
  applied,
  onResult,
  onClear,
}: {
  dependencies: DependencyRef[];
  applied: number;
  onResult: (findings: Finding[], checked: number) => void;
  onClear: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [checked, setChecked] = useState(0);
  const [showPins, setShowPins] = useState(false);

  if (dependencies.length === 0) return null;

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const result = await runOsvCheck(dependencies);
      setChecked(result.checked);
      setNote(result.note ?? null);
      onResult(result.findings, result.checked);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ss-panel overflow-hidden border-l-2 border-l-[#58656b]">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span className="ss-label" style={{ color: "#58656b" }}>Deep scan · optional</span>
        <span className="text-sm text-[#374541]">Dependency advisories (OSV.dev)</span>
        <span className="ml-auto flex gap-1.5">
          {applied > 0 ? (
            <button type="button" className="ss-btn ss-btn-sm ss-focus" onClick={() => { onClear(); setNote(null); setChecked(0); }}>
              Remove results
            </button>
          ) : null}
          <button type="button" className={`ss-btn ss-btn-sm ss-btn-primary ss-focus ${busy ? "ss-sweep" : ""}`} onClick={run} disabled={busy}>
            {busy ? "Checking…" : `Check ${dependencies.length} pin(s)`}
          </button>
        </span>
      </div>

      <div className="space-y-2 px-4 pb-4">
        <p className="text-xs leading-relaxed text-[#58655f]">
          This is the only feature that leaves your device, and only when you press the button. It sends{" "}
          <span className="text-[#374541]">package names and exact versions</span> — nothing else. No file content,
          no filenames, no hashes, no scan results. Ranges and unpinned dependencies are skipped because advisories
          need an exact version.
        </p>

        <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost ss-focus" onClick={() => setShowPins((v) => !v)}>
          {showPins ? "Hide" : "Show"} exactly what will be sent
        </button>

        {showPins ? (
          <pre dir="ltr" className="ss-evidence" style={{ borderLeftColor: "#58656b" }}>
            {dependencies.map((d) => `${d.ecosystem}  ${d.name}@${d.version}`).join("\n")}
          </pre>
        ) : null}

        {checked > 0 && !note ? (
          <p className="text-xs text-[#08745d]">
            Checked {checked} pin(s) — {applied} advisory finding(s) merged into this report.
          </p>
        ) : null}

        {note ? <p className="text-xs text-[#946200]">{note}</p> : null}
      </div>
    </section>
  );
}
