"use client";

import { useMemo, useState } from "react";
import { chunkInstructionalText, runSemanticCheck } from "@/lib/deep/semantic";
import type { Finding, RawScanFile } from "@/lib/scan/types";

export function SemanticScan({
  raw,
  applied,
  onResult,
  onClear,
}: {
  raw: RawScanFile[];
  applied: number;
  onResult: (findings: Finding[], checked: number) => void;
  onClear: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [checked, setChecked] = useState(0);
  const [byok, setByok] = useState("");
  const [showChunks, setShowChunks] = useState(false);
  const [consented, setConsented] = useState(false);

  const chunks = useMemo(() => chunkInstructionalText(raw), [raw]);
  if (chunks.length === 0) return null;

  const run = async () => {
    if (busy || !consented) return;
    setBusy(true);
    setNote(null);
    try {
      const result = await runSemanticCheck(raw, byok.trim() || undefined);
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
        <span className="text-sm text-[#374541]">Semantic review (paraphrase backstop)</span>
        <span className="ml-auto flex gap-1.5">
          {applied > 0 ? (
            <button type="button" className="ss-btn ss-btn-sm ss-focus" onClick={() => { onClear(); setNote(null); setChecked(0); }}>
              Remove results
            </button>
          ) : null}
          <button
            type="button"
            className={`ss-btn ss-btn-sm ss-btn-primary ss-focus ${busy ? "ss-sweep" : ""}`}
            onClick={run}
            disabled={busy || !consented}
          >
            {busy ? "Classifying…" : `Classify ${chunks.length} passage(s)`}
          </button>
        </span>
      </div>

      <div className="space-y-2.5 px-4 pb-4">
        <p className="text-xs leading-relaxed text-[#58655f]">
          Phrasing can be rewritten forever, so no regex list is ever complete. This sends{" "}
          <span className="text-[#374541]">instructional prose</span> to a classification-only model with no tools
          and no ability to act, asking one question per passage: does this try to manipulate an agent reading it?
          The reply is a label and a confidence score, nothing else, and is treated as untrusted scanner data.
        </p>

        <p className="rounded-md border border-[#e7d6a5] bg-[#fff9e7] p-2.5 text-xs leading-relaxed text-[#946200]">
          This is the one feature that sends <strong>actual skill text</strong> off your device, to the model
          provider. Do not use it on a skill that may contain live credentials or private material. Everything
          else in SkillSafe stays local.
        </p>

        <label className="flex items-start gap-2 text-xs text-[#374541]">
          <input
            type="checkbox"
            checked={consented}
            onChange={(e) => setConsented(e.target.checked)}
            className="ss-focus mt-0.5 h-3.5 w-3.5 accent-[#58656b]"
          />
          <span>I understand this sends the passages below to a model provider, and I want to run it.</span>
        </label>

        <div>
          <label htmlFor="byok" className="ss-label">Your own API key (optional)</label>
          <input
            id="byok"
            type="password"
            value={byok}
            onChange={(e) => setByok(e.target.value)}
            placeholder="Leave blank to use the deployment key, if one is set"
            autoComplete="off"
            spellCheck={false}
            className="ss-input ss-focus mt-1.5 font-mono"
          />
          <p className="mt-1 text-[11px] text-[#65736d]">
            Held in this page&apos;s memory only, sent once with this request, never stored, logged, or written to disk.
          </p>
        </div>

        <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost ss-focus" onClick={() => setShowChunks((v) => !v)}>
          {showChunks ? "Hide" : "Show"} exactly what will be sent
        </button>

        {showChunks ? (
          <pre dir="ltr" className="ss-evidence" style={{ borderLeftColor: "#58656b" }}>
            {chunks.map((c, i) => `--- PASSAGE ${i} (${c.file}:${c.line}) ---\n${c.text}`).join("\n\n")}
          </pre>
        ) : null}

        {checked > 0 && !note ? (
          <p className="text-xs text-[#08745d]">
            Classified {checked} passage(s) — {applied} finding(s) merged into this report.
          </p>
        ) : null}

        {note ? <p className="text-xs text-[#946200]">{note}</p> : null}
      </div>
    </section>
  );
}
