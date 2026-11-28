"use client";

import { useCallback, useEffect, useState } from "react";
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
  const [url, setUrl] = useState("");
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlNote, setUrlNote] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const { state, scan, reset } = useScanner();
  const running = state.status === "running";

  const addFiles = useCallback((picked: File[]) => {
    setFiles((prev) => [...prev, ...picked].slice(0, 300));
  }, []);

  const runScan = useCallback(async () => {
    if (urlBusy) return;
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
  }, [files, text, scan, urlBusy]);

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
    setUrlNote(null);
  }, [reset]);

  const fetchUrl = useCallback(async () => {
    if (urlBusy || running || !url.trim()) return;
    setUrlBusy(true);
    setUrlNote(null);
    try {
      const response = await fetch("/api/fetch-skill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok || !result || typeof result !== "object" || !("ok" in result) || result.ok !== true) {
        const error = result && typeof result === "object" && "error" in result && typeof result.error === "string"
          ? result.error
          : "Fetch failed.";
        setUrlNote({ tone: "warn", text: error });
        return;
      }

      const fetched = result as { ok: true; name?: unknown; bytes?: unknown; size?: unknown };
      if (
        typeof fetched.name !== "string" ||
        typeof fetched.bytes !== "string" ||
        fetched.bytes.length > 14_000_000 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(fetched.bytes)
      ) {
        setUrlNote({ tone: "warn", text: "Fetch endpoint returned an invalid file." });
        return;
      }
      const binary = atob(fetched.bytes);
      if (binary.length > 10 * 1024 * 1024) {
        setUrlNote({ tone: "warn", text: "Remote file exceeds the 10MB limit." });
        return;
      }
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      setText("");
      setFiles([]);
      setSkipped([]);
      setNotice(null);
      setScanId((n) => n + 1);
      const size = typeof fetched.size === "number" ? fetched.size : bytes.byteLength;
      setUrlNote({ tone: "ok", text: `Fetched ${fetched.name} (${size} bytes). Scanning on your device.` });
      await scan([{ path: fetched.name, bytes }]);
    } catch {
      setUrlNote({ tone: "warn", text: "Could not reach the fetch endpoint." });
    } finally {
      setUrlBusy(false);
    }
  }, [url, urlBusy, running, scan]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void runScan(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runScan]);

  return (
    <>
      <main className="ss-main">
        <div className="app-page__heading">
          <h1>Security scans for AI skills</h1>
          <p>
            Check skill files for prompt injection, hidden text, unsafe links, and dangerous code before installing.
            42 rules run on every scan in your browser.
          </p>
        </div>

        <div className="ss-layout">
          <div className="ss-sticky">
            <IntakePanel
              text={text} onText={setText} files={files} onFiles={addFiles}
              onRemoveFile={(i) => setFiles((prev) => prev.filter((_, j) => j !== i))}
              onScan={runScan} onClear={onClear} onSample={onSample} running={running || urlBusy}
            />
            <div className="ss-panel mt-3 space-y-2 p-4">
              <label htmlFor="skill-url" className="ss-label">Fetch from a public URL</label>
              <input
                id="skill-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") void fetchUrl(); }}
                placeholder="https://raw.githubusercontent.com/…/SKILL.md"
                spellCheck={false}
                className="ss-input ss-focus font-mono text-xs"
              />
              <button
                type="button"
                className={`ss-btn ss-btn-sm ss-focus w-full ${urlBusy ? "ss-sweep" : ""}`}
                onClick={fetchUrl}
                disabled={urlBusy || running}
              >
                {urlBusy ? "Fetching…" : "Fetch & scan"}
              </button>
              <p className="text-[11px] leading-relaxed text-[#65736d]">
                Our server fetches it — never your browser — with credentials omitted, every redirect hop
                re-validated against the private-host blocklist, an 8-second timeout and a 10MB streaming cap.
                GitHub blob links are rewritten to raw. The bytes come back here and are scanned on your device.
              </p>
              {urlNote ? (
                <p className="text-xs" style={{ color: urlNote.tone === "ok" ? "#08745d" : "#946200" }}>{urlNote.text}</p>
              ) : null}
            </div>
          </div>

          <div className="min-w-0 space-y-3">
            <EngineStatus />

            <div className="ss-panel flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="ss-label">Pipeline</span>
              {LAYERS.map((l, i) => (
                <span key={l.id}
                  className={`text-xs font-semibold ${running ? "ss-layer-on" : "text-[#65736d]"}`}
                  style={running ? { animationDelay: `${i * 0.12}s` } : undefined}>
                  {l.id} <span className="font-normal">{l.name}</span>
                </span>
              ))}
              <span className="ml-auto text-[11px] text-[#65736d]">45/45 rules · deep layers opt-in</span>
            </div>

            {notice ? (
              <p className="ss-panel border-l-2 border-l-[#946200] p-4 text-sm text-[#946200]">{notice}</p>
            ) : null}

            {skipped.length > 0 ? (
              <div className="ss-panel border-l-2 border-l-[#246b96] p-4">
                <div className="ss-label" style={{ color: "#246b96" }}>{skipped.length} file(s) skipped</div>
                <ul className="mt-1.5 space-y-1">
                  {skipped.map((s, i) => (
                    <li key={`${s.name}-${i}`} className="text-xs text-[#58655f]">
                      <span className="font-mono text-[#374541]">{displayPath(s.name)}</span> — {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {state.status === "error" ? (
              <p className="ss-panel border-l-2 border-l-[#b42332] p-4 text-sm text-[#b42332]">{state.message}</p>
            ) : null}

            {running ? (
              <div role="status" className="ss-panel ss-sweep p-8 text-center text-sm text-[#58655f]">
                Extracting, hashing and running bounded patterns…
              </div>
            ) : null}

            {state.status === "idle" ? (
              <div className="ss-panel p-6">
                <div className="ss-label">What gets inspected</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {COVERAGE.map(([n, title, desc]) => (
                    <div key={n} className="rounded-lg border border-[#e4e9e5] bg-[#ffffff] p-3">
                      <div className="text-[13px] font-semibold">
                        <span className="text-[#65736d]">{n}.</span> {title}
                      </div>
                      <div className="mt-0.5 text-[11px] leading-snug text-[#58655f]">{desc}</div>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-[#65736d]">
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