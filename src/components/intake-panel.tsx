"use client";

import { useRef, useState } from "react";
import { displayPath } from "@/lib/scan/intake";
import { SAMPLES, type Sample } from "@/lib/ui/samples";

const TONE: Record<Sample["tone"], string> = {
  danger: "#b42332",
  warn: "#946200",
  clean: "#08745d",
};

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function IntakePanel({
  text,
  onText,
  files,
  onFiles,
  onRemoveFile,
  onScan,
  onClear,
  onSample,
  running,
}: {
  text: string;
  onText: (v: string) => void;
  files: File[];
  onFiles: (picked: File[]) => void;
  onRemoveFile: (i: number) => void;
  onScan: () => void;
  onClear: () => void;
  onSample: (s: Sample) => void;
  running: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-3">
      <div
        className={`ss-panel ss-drop p-4 ${dragging ? "ss-drop-on" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const picked = Array.from(e.dataTransfer.files);
          if (picked.length > 0) onFiles(picked);
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="skill-text" className="ss-label">Skill source</label>
          <span className="text-[10px] text-[#65736d]">⌘/Ctrl + ↵</span>
        </div>

        <textarea
          id="skill-text"
          value={text}
          onChange={(e) => onText(e.target.value)}
          rows={9}
          spellCheck={false}
          placeholder={"# My Skill\n\nPaste the contents of SKILL.md here…"}
          className="ss-input ss-focus mt-2 font-mono leading-relaxed"
        />
        <div className="mt-1 text-right text-[10px] text-[#65736d]">
          {text.length.toLocaleString()} characters
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              // Snapshot BEFORE clearing: FileList is live, and clearing the
              // input empties it before React's deferred updater could read it.
              const picked = e.target.files ? Array.from(e.target.files) : [];
              e.target.value = "";
              if (picked.length > 0) onFiles(picked);
            }}
          />
          <button type="button" className="ss-btn ss-btn-sm ss-focus" onClick={() => inputRef.current?.click()}>
            Choose files
          </button>
          <span className="text-xs text-[#65736d]">
            {dragging ? "release to add" : "or drop them on this panel"}
          </span>
        </div>

        {files.length > 0 ? (
          <ul className="mt-2.5 space-y-1.5">
            {files.map((f, i) => (
              <li key={`${f.name}-${f.size}-${i}`} className="ss-chip w-full justify-between">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#246b96]" />
                  <span className="truncate">{displayPath(f.name)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-[#65736d]">{sizeLabel(f.size)}</span>
                  <button
                    type="button"
                    className="ss-focus text-[#65736d] hover:text-[#b42332]"
                    onClick={() => onRemoveFile(i)}
                    aria-label={`Remove ${displayPath(f.name)}`}
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className={`ss-btn ss-btn-primary ss-focus flex-1 ${running ? "ss-sweep" : ""}`}
            onClick={onScan}
            disabled={running}
          >
            {running ? "Scanning…" : files.length > 0 ? `Scan ${files.length} file${files.length === 1 ? "" : "s"}${text.trim() ? " + text" : ""}` : "Scan"}
          </button>
          <button type="button" className="ss-btn ss-btn-ghost ss-focus" onClick={onClear} disabled={running}>
            Clear
          </button>
        </div>
      </div>

      <div className="ss-panel p-4">
        <div className="ss-label">Try a sample</div>
        <div className="mt-2.5 space-y-2">
          {SAMPLES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSample(s)}
              disabled={running}
              className="ss-btn ss-focus w-full flex-col items-start justify-start gap-1 py-2.5 text-left"
              style={{ borderColor: `${TONE[s.tone]}55` }}
            >
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: TONE[s.tone] }} />
                <span className="text-[13px] font-semibold">{s.label}</span>
              </span>
              <span className="text-[11px] font-normal leading-snug text-[#58655f]">{s.blurb}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}