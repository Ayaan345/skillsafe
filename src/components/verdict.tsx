"use client";

import type { ScanReport, Severity, VerdictLabel } from "@/lib/scan/types";
import { ALL_SEVERITIES } from "@/lib/ui/report-tools";

const TONE: Record<VerdictLabel, { fg: string; bg: string; edge: string }> = {
  "Critical risk": { fg: "#ff3b5c", bg: "rgba(255,59,92,0.10)", edge: "#ff3b5c" },
  "High risk": { fg: "#ff8a3d", bg: "rgba(255,138,61,0.10)", edge: "#ff8a3d" },
  "Needs review": { fg: "#ffc53d", bg: "rgba(255,197,61,0.10)", edge: "#ffc53d" },
  "Minor notes": { fg: "#4da3ff", bg: "rgba(77,163,255,0.10)", edge: "#4da3ff" },
  "No findings": { fg: "#3df5c4", bg: "rgba(61,245,196,0.10)", edge: "#3df5c4" },
};

const SEV_COLOR: Record<Severity, string> = {
  CRITICAL: "#ff3b5c",
  HIGH: "#ff8a3d",
  MEDIUM: "#ffc53d",
  LOW: "#4da3ff",
  INFO: "#a78bfa",
};

const BLURB: Record<VerdictLabel, string> = {
  "Critical risk": "Do not install. At least one pattern strongly associated with active exploitation is present.",
  "High risk": "Stop and read the findings before installing. Risky or manipulative behavior is present.",
  "Needs review": "Worth a human look before you install. Nothing here is conclusive on its own.",
  "Minor notes": "Only informational notes. Check they match what the skill claims to do.",
  "No findings": "No known pattern matched in the layers that ran. This is not a certification of safety.",
};

function Dial({ value, color }: { value: number; color: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" role="img" aria-label={`Risk score ${value} of 100`}>
      <circle cx="44" cy="44" r={r} fill="none" stroke="#18233c" strokeWidth="8" />
      <circle
        cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 44 44)"
        style={{ transition: "stroke-dasharray 0.5s cubic-bezier(0.22,1,0.36,1)" }}
      />
      <text x="44" y="49" textAnchor="middle" fill="#e6edf7" fontSize="20" fontWeight="700">
        {value}
      </text>
    </svg>
  );
}

export function Verdict({
  report,
  mode,
  dismissedCount,
}: {
  report: ScanReport;
  mode: "worker" | "main-thread";
  dismissedCount: number;
}) {
  const tone = TONE[report.label];
  const total = ALL_SEVERITIES.reduce((n, s) => n + report.counts[s], 0);

  return (
    <div className="ss-panel ss-rise overflow-hidden">
      <div className="flex flex-wrap items-center gap-5 p-5" style={{ background: tone.bg }}>
        <Dial value={report.score100} color={tone.fg} />
        <div className="min-w-[220px] flex-1">
          <div className="ss-label" style={{ color: tone.fg }}>Verdict</div>
          <h2 className="mt-1 text-3xl font-bold tracking-tight" style={{ color: tone.fg }}>
            {report.label}
          </h2>
          <p className="mt-1.5 max-w-xl text-sm text-[#8fa3bf]">{BLURB[report.label]}</p>
        </div>
        <div className="text-right text-xs text-[#8296b3]">
          <div>raw score <span className="text-[#e6edf7]">{report.score}</span></div>
          <div>{report.filesScanned} file{report.filesScanned === 1 ? "" : "s"} · {report.durationMs}ms</div>
          <div>{report.layersRun.join(" · ")} · catalog v{report.catalogVersion}</div>
          <div>{mode === "worker" ? "web worker" : "main thread fallback"}</div>
        </div>
      </div>

      <div className="flex h-2 w-full overflow-hidden bg-[#0b1120]">
        {ALL_SEVERITIES.map((s) =>
          report.counts[s] > 0 ? (
            <div
              key={s}
              style={{ width: `${(report.counts[s] / total) * 100}%`, background: SEV_COLOR[s] }}
              title={`${report.counts[s]} ${s}`}
            />
          ) : null,
        )}
      </div>

      <div className="grid grid-cols-2 gap-px bg-[#18233c] sm:grid-cols-5">
        {ALL_SEVERITIES.map((s) => (
          <div key={s} className="bg-[#0b1120] px-3 py-3 text-center">
            <div className="text-2xl font-bold" style={{ color: report.counts[s] > 0 ? SEV_COLOR[s] : "#24334f" }}>
              {report.counts[s]}
            </div>
            <div className="ss-label mt-0.5">{s}</div>
          </div>
        ))}
      </div>

      {report.truncated || dismissedCount > 0 || mode === "main-thread" ? (
        <div className="space-y-1 border-t border-[#18233c] px-5 py-3 text-xs text-[#8fa3bf]">
          {report.truncated ? (
            <p className="font-semibold text-[#ffc53d]">
              Scan hit its time or size budget — coverage is incomplete.
            </p>
          ) : null}
          {dismissedCount > 0 ? (
            <p>{dismissedCount} finding(s) marked false positive. Verdict above reflects that.</p>
          ) : null}
          {mode === "main-thread" ? <p>The Web Worker was unavailable; the scan ran on the main thread.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
