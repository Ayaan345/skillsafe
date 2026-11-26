"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { EngineStatus } from "@/components/engine-status";
import { IntakePanel } from "@/components/intake-panel";
import { Report } from "@/components/report";
import { useScanner } from "@/hooks/use-scanner";
import { displayPath, planIntake } from "@/lib/scan/intake";
import type { RawScanFile } from "@/lib/scan/types";
import type { Sample } from "@/lib/ui/samples";

const LAYERS = [
  { id: "L0", name: "Ingest" },
  { id: "L1", name: "Lexical" },
  { id: "L2", name: "Indirection" },
  { id: "L3", name: "Entropy" },
  { id: "L4", name: "Unicode" },
  { id: "L5", name: "Links" },
  { id: "L6", name: "Supply" },
];

const COVERAGE: Array<[string, string, string]> = [
  ["1", "Prompt injection", "Override, jailbreak and exfiltration phrasing"],
  ["2", "Hidden content", "Zero-width, bidi, tag smuggling, encoded blobs"],
  ["3", "Deceptive links", "Anchor mismatch, punycode, raw IP, data: URIs"],
  ["4", "Dangerous code", "eval, download-to-shell, decode-then-run, indirection"],
  ["5", "Secrets", "Credential paths, secret read near a network call"],
  ["6", "Over-broad scope", "Full-access and whole-filesystem claims"],
  ["7", "Supply chain", "Typosquats and install-hook payloads"],
  ["10", "Embedded assets", "SVG scripts, image and font metadata, polyglots"],
];

export function Scanner() {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [skipped, setSkipped] = useState<{ name: string; reason: string }[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [scanId, setScanId] = useState(0);
  const { state, scan, reset } = useScanner();

  const addFiles = useCallback((picked: File[]) => {
    setFiles((prev) => [...prev, ...picked].slice(0, 300));
  }, []);

  const runScan = useCallback(async () => {
    setNotice(null);
    const plan = planIntake(files.map((f) => ({ name: f.name, size: f.size })));
    setSkipped(plan.skipped);

    const inputs: RawScanFile[] = [];
    if (text.trim().length > 0) inputs.push({ path: "SKILL.md", bytes: new TextEncoder().encode(text) });
    for (const i of plan.accepted) {
      const file = files[i];
      inputs.push({ path: displayPath(file.name), bytes: new Uint8Array(await file.arrayBuffer()) });
    }

    if (inputs.length === 0) {
      setNotice(
        plan.skipped.length > 0
          ? "Every selected file was rejected by the size caps. See the skipped list below."
          : "Nothing to scan yet — paste some text, choose a file, or pick a sample.",
      );
      return;
    }
    setScanId((n) => n + 1);
    await scan(inputs);
  }, [files, text, scan]);

  const onSample = useCallback(async (s: Sample) => {
    setText(s.content);
    setFiles([]);
    setSkipped([]);
    setNotice(null);
    setScanId((n) => n + 1);
    await scan([{ path: s.filename, bytes: new TextEncoder().encode(s.content) }]);
  }, [scan]);

  const onClear = useCallback(() => {
    setText(""); setFiles([]); setSkipped([]); setNotice(null); reset();
  }, [reset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void runScan(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runScan]);

  const running = state.status === "running";

  return (
    <>
      <div className="ss-bg" />
      <div className="ss-grid" />

      <header className="ss-bar">
        <div className="flex items-center gap-2.5">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2 4 5.5v6.2c0 5 3.4 9.3 8 10.3 4.6-1 8-5.3 8-10.3V5.5Z"
              fill="none" stroke="#3df5c4" strokeWidth="1.6" strokeLinejoin="round" />
            <circle cx="12" cy="11.5" r="3.1" fill="none" stroke="#4da3ff" strokeWidth="1.6" />
            <path d="M12 8.4v6.2M8.9 11.5h6.2" stroke="#a78bfa" strokeWidth="1.2" />
          </svg>
          <span className="text-[15px] font-bold tracking-tight">SkillSafe</span>
        </div>
        <span className="ss-chip hidden sm:inline-flex">
          <span className="ss-dot" />
          on-device · nothing uploaded
        </span>
        <nav className="ml-auto flex items-center gap-1.5">
          {state.status === "done" ? (
            <a href="#findings" className="ss-btn ss-btn-sm ss-btn-ghost ss-focus">Findings</a>
          ) : null}
          <Link href="/rules" className="ss-btn ss-btn-sm ss-btn-ghost ss-focus">Rule catalog</Link>
          <Link href="/history" className="ss-btn ss-btn-sm ss-btn-ghost ss-focus">History</Link>
          <button type="button" className="ss-btn ss-btn-sm ss-focus" onClick={onClear} disabled={running}>
            Reset
          </button>
        </nav>
      </header>

      <main className="ss-main relative z-10 mx-auto max-w-[1320px] px-4">
        <div className="mb-5">
          <h1 className="text-[26px] font-bold leading-tight tracking-tight sm:text-[32px]">
            Read a skill before it reads <span className="ss-headline">you</span>.
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-[#8fa3bf]">
            Prompt injection, hidden Unicode, deceptive links, dangerous code, supply-chain hooks and
            asset payloads — checked in your browser, with no account and no upload.
          </p>
        </div>

        <div className="ss-layout">
          <div className="ss-sticky">
            <IntakePanel
              text={text} onText={setText} files={files} onFiles={addFiles}
              onRemoveFile={(i) => setFiles((prev) => prev.filter((_, j) => j !== i))}
              onScan={runScan} onClear={onClear} onSample={onSample} running={running}
            />
          </div>

          <div className="min-w-0 space-y-3">
            <EngineStatus />

            <div className="ss-panel flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="ss-label">Pipeline</span>
              {LAYERS.map((l, i) => (
                <span key={l.id}
                  className={`text-xs font-semibold ${running ? "ss-layer-on" : "text-[#8296b3]"}`}
                  style={running ? { animationDelay: `${i * 0.12}s` } : undefined}>
                  {l.id} <span className="font-normal">{l.name}</span>
                </span>
              ))}
              <span className="ml-auto text-[11px] text-[#8296b3]">45/45 rules · deep layers opt-in</span>
            </div>

            {notice ? (
              <p className="ss-panel border-l-2 border-l-[#ffc53d] p-4 text-sm text-[#ffc53d]">{notice}</p>
            ) : null}

            {skipped.length > 0 ? (
              <div className="ss-panel border-l-2 border-l-[#4da3ff] p-4">
                <div className="ss-label" style={{ color: "#4da3ff" }}>{skipped.length} file(s) skipped</div>
                <ul className="mt-1.5 space-y-1">
                  {skipped.map((s, i) => (
                    <li key={`${s.name}-${i}`} className="text-xs text-[#8fa3bf]">
                      <span className="font-mono text-[#c3d2e6]">{displayPath(s.name)}</span> — {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {state.status === "error" ? (
              <p className="ss-panel border-l-2 border-l-[#ff3b5c] p-4 text-sm text-[#ff3b5c]">{state.message}</p>
            ) : null}

            {running ? (
              <div role="status" className="ss-panel ss-sweep p-8 text-center text-sm text-[#8fa3bf]">
                Extracting, hashing and running bounded patterns…
              </div>
            ) : null}

            {state.status === "idle" ? (
              <div className="ss-panel p-6">
                <div className="ss-label">What gets inspected</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {COVERAGE.map(([n, title, desc]) => (
                    <div key={n} className="rounded-lg border border-[#18233c] bg-[#0b1120] p-3">
                      <div className="text-[13px] font-semibold">
                        <span className="text-[#8296b3]">{n}.</span> {title}
                      </div>
                      <div className="mt-0.5 text-[11px] leading-snug text-[#8fa3bf]">{desc}</div>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-[#8296b3]">
                  Pick a sample on the left for a full report immediately, or choose a .zip skill folder.
                </p>
              </div>
            ) : null}

            {state.status === "done" ? (
              <div id="findings" className="ss-section">
                <Report key={scanId} report={state.report} mode={state.mode} raw={state.raw} />
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </>
  );
}