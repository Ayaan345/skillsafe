"use client";

import { useRef, useState } from "react";
import { displayPath } from "@/lib/scan/intake";
import { SAMPLES, type Sample } from "@/lib/ui/samples";

const TONE_COLOR: Record<Sample["tone"], string> = {
  danger: "#ff3b5c",
  warn: "#ffc53d",
  clean: "#3df5c4",
};

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
  onFiles: (f: FileList | null) => void;
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
        className={`ss-panel ss-drop p-4 ${dragging ? "ss-drop-active" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); onFiles(e.dataTransfer.files); }}
      >
        <div className="flex items-center justify-between">
          <label htmlFor="skill-text" className="ss-label">Skill source</label>
          <span className="text-[10px] text-[#8296b3]">⌘/Ctrl + ↵</span>
        </div>

        <textarea
          id="skill-text"
          value={text}
          onChange={(e) => onText(e.target.value)}
          rows={10}
          spellCheck={false}
          placeholder={"# My Skill\n\nPaste the contents of SKILL.md here…"}
          className="ss-input ss-focus mt-2 font-mono leading-relaxed"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }}
          />
          <button type="button" className="ss-btn ss-btn-sm ss-focus" onClick={() => inputRef.current?.click()}>
            Add files
          </button>
          <span className="text-xs text-[#8296b3]">or drop them anywhere in this panel</span>
        </div>

        {files.length > 0 ? (
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="ss-chip">
                <span className="max-w-[150px] truncate">{displayPath(f.name)}</span>
                <button
                  type="button"
                  className="ss-focus text-[#8296b3] hover:text-[#ff3b5c]"
                  onClick={() => onRemoveFile(i)}
                  aria-label={`Remove ${displayPath(f.name)}`}
                >
                  ✕
                </button>
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
            {running ? "Scanning…" : "Scan"}
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
              className="ss-btn ss-focus w-full flex-col items-start gap-1 py-2.5 text-left"
              style={{ borderColor: `${TONE_COLOR[s.tone]}44` }}
            >
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: TONE_COLOR[s.tone] }} />
                <span className="text-[13px] font-semibold">{s.label}</span>
              </span>
              <span className="text-[11px] font-normal leading-snug text-[#8fa3bf]">{s.blurb}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
