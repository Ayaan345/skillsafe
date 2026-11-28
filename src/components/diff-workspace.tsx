"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { scanText } from "@/lib/scan/engine";
import { rememberScan, sessionRecords, subscribeHistory } from "@/lib/history/store";
import { reportToRecord, type HistoryRecord } from "@/lib/history/types";
import type { Finding, Severity } from "@/lib/scan/types";
import { SAMPLES } from "@/lib/ui/samples";

const SEVERITIES: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
const SEV_COLOR: Record<Severity, string> = {
  CRITICAL: "#b42332", HIGH: "#b54708", MEDIUM: "#946200", LOW: "#246b96", INFO: "#58656b",
};
const VERDICT_COLOR: Record<string, string> = { SAFE: "#08745d", SUSPICIOUS: "#946200", MALICIOUS: "#b42332" };
type Status = "new" | "resolved" | "changed" | "unchanged";
const META: Record<Status, { label: string; color: string; glyph: string }> = {
  new: { label: "New", color: "#b42332", glyph: "+" },
  resolved: { label: "Resolved", color: "#08745d", glyph: "−" },
  changed: { label: "Changed", color: "#946200", glyph: "~" },
  unchanged: { label: "Unchanged", color: "#65736d", glyph: "=" },
};

function keyed(findings: Finding[]): Map<string, Finding> {
  const seen = new Map<string, number>();
  const out = new Map<string, Finding>();
  for (const finding of findings) {
    const base = `${finding.ruleId}|${finding.file}|${finding.snippet.trim().slice(0, 120)}`;
    const number = (seen.get(base) ?? 0) + 1;
    seen.set(base, number);
    out.set(number > 1 ? `${base}#${number}` : base, finding);
  }
  return out;
}

export function DiffWorkspace({ initial }: { initial: HistoryRecord[] }) {
  const [local, setLocal] = useState<HistoryRecord[]>(() => sessionRecords());
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    return subscribeHistory(() => setLocal(sessionRecords()));
  }, []);

  const all = useMemo(() => {
    const map = new Map<string, HistoryRecord>();
    for (const record of initial) map.set(record.id, record);
    for (const record of local) if (!map.has(record.id)) map.set(record.id, record);
    return [...map.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }, [initial, local]);

  const beforeId = all.some((record) => record.id === a) ? a : all[all.length - 2]?.id ?? "";
  const afterId = all.some((record) => record.id === b) ? b : all[all.length - 1]?.id ?? "";
  const before = all.find((record) => record.id === beforeId);
  const after = all.find((record) => record.id === afterId);

  const diff = useMemo(() => {
    if (!before || !after || before.id === after.id) return null;
    const left = keyed(before.findings);
    const right = keyed(after.findings);
    const rows = [...new Set([...left.keys(), ...right.keys()])].map((key) => {
      const beforeFinding = left.get(key);
      const afterFinding = right.get(key);
      const status: Status = beforeFinding && !afterFinding ? "resolved" : !beforeFinding && afterFinding ? "new"
        : beforeFinding && afterFinding && (
          beforeFinding.severity !== afterFinding.severity ||
          Math.abs(beforeFinding.confidence - afterFinding.confidence) > 0.05 ||
          beforeFinding.why !== afterFinding.why
        ) ? "changed" : "unchanged";
      return { key, status, before: beforeFinding, after: afterFinding };
    });
    const counts: Record<Status, number> = { new: 0, resolved: 0, changed: 0, unchanged: 0 };
    for (const row of rows) counts[row.status] += 1;
    const weight: Record<Status, number> = { new: 0, changed: 1, resolved: 2, unchanged: 3 };
    rows.sort((leftRow, rightRow) => weight[leftRow.status] - weight[rightRow.status]
      || SEVERITIES.indexOf(((leftRow.after ?? leftRow.before) as Finding).severity)
      - SEVERITIES.indexOf(((rightRow.after ?? rightRow.before) as Finding).severity));
    const scoreDelta = after.rawScore - before.rawScore;
    const rank = { SAFE: 0, SUSPICIOUS: 1, MALICIOUS: 2 } as const;
    const verdictDelta = rank[after.verdict] - rank[before.verdict];
    return {
      rows,
      counts,
      scoreDelta,
      direction: verdictDelta > 0 || scoreDelta > 0 ? "worsened"
        : verdictDelta < 0 || scoreDelta < 0 ? "improved" : "unchanged",
    };
  }, [before, after]);

  const rows = useMemo(() => {
    if (!diff) return [];
    const needle = query.trim().toLowerCase();
    return diff.rows.filter((row) => {
      if (filter !== "all" && row.status !== filter) return false;
      const finding = row.after ?? row.before;
      return !needle || Boolean(finding && (
        finding.ruleId.includes(needle) ||
        finding.file.toLowerCase().includes(needle) ||
        finding.snippet.toLowerCase().includes(needle)
      ));
    });
  }, [diff, filter, query]);

  const seed = () => {
    const hostile = SAMPLES.find((sample) => sample.id === "hostile-summarizer");
    const clean = SAMPLES.find((sample) => sample.id === "clean-formatter");
    if (!hostile || !clean) return;
    rememberScan(reportToRecord(scanText(clean.content, clean.filename), "Formatter · hardened", "file"));
    setTimeout(() => rememberScan(reportToRecord(scanText(hostile.content, hostile.filename), "Formatter · published fork", "file")), 1200);
  };

  const label = (record: HistoryRecord) => `${record.title} · ${new Date(record.createdAt).toLocaleDateString()} · ${record.label}`;
  const directionColor = diff?.direction === "worsened" ? "#b42332" : diff?.direction === "improved" ? "#08745d" : "#65736d";

  if (all.length < 2) {
    return (
      <section className="ss-panel border-l-2 border-l-[#58656b] p-6">
        <div className="ss-label" style={{ color: "#58656b" }}>Two scans needed</div>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#58655f]">
          Diffing compares two saved scans of the same skill — what appeared, what disappeared, and what the rule
          catalog re-scored between versions. Load a real pair now, or scan and save your own twice.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="ss-btn ss-btn-sm ss-btn-primary ss-focus" onClick={seed}>Load a real comparison</button>
          <Link href="/" className="ss-btn ss-btn-sm ss-focus">Scan a skill</Link>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <div className="ss-panel grid gap-3 p-4 md:grid-cols-2">
        <div>
          <label htmlFor="d-before" className="ss-label">Baseline</label>
          <select id="d-before" className="ss-input ss-focus mt-1.5" value={beforeId} onChange={(event) => setA(event.target.value)}>
            {all.map((record) => <option key={record.id} value={record.id}>{label(record)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="d-after" className="ss-label">Comparison</label>
          <select id="d-after" className="ss-input ss-focus mt-1.5" value={afterId} onChange={(event) => setB(event.target.value)}>
            {all.map((record) => <option key={record.id} value={record.id}>{label(record)}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:col-span-2">
          <button type="button" className="ss-btn ss-btn-sm ss-focus" onClick={() => { setA(afterId); setB(beforeId); }}>Swap sides</button>
          {before && after && before.bundleHash && before.bundleHash === after.bundleHash ? (
            <span className="ss-chip">identical bundle hash — any difference is rule tuning</span>
          ) : null}
        </div>
      </div>

      {!diff || !before || !after ? (
        <p className="ss-panel p-6 text-sm text-[#58655f]">Pick two different scans to compare.</p>
      ) : (
        <>
          <div className="ss-panel ss-rise overflow-hidden">
            <div className="flex flex-wrap items-center gap-5 p-5" style={{ background: `${directionColor}12` }}>
              <div>
                <div className="ss-label">Verdict transition</div>
                <div className="mt-1.5 flex items-center gap-3 text-lg font-bold">
                  <span style={{ color: VERDICT_COLOR[before.verdict] }}>{before.verdict}</span>
                  <span className="text-[#65736d]">→</span>
                  <span style={{ color: VERDICT_COLOR[after.verdict] }}>{after.verdict}</span>
                </div>
              </div>
              <div className="ml-auto text-right">
                <div className="ss-label">Score change</div>
                <div className="text-3xl font-bold" style={{ color: directionColor }}>
                  {diff.scoreDelta > 0 ? "+" : ""}{diff.scoreDelta}
                </div>
                <div className="text-[11px] text-[#65736d]">{before.rawScore} → {after.rawScore}</div>
              </div>
              <div className="text-right">
                <div className="ss-label">Catalog</div>
                <div className="text-sm font-semibold text-[#374541]">v{before.catalogVersion} → v{after.catalogVersion}</div>
                {before.catalogVersion !== after.catalogVersion ? (
                  <div className="text-[11px] text-[#946200]">rules changed between scans</div>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-px bg-[#e4e9e5] sm:grid-cols-4">
              {(["new", "resolved", "changed", "unchanged"] as Status[]).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setFilter(filter === status ? "all" : status)}
                  aria-pressed={filter === status}
                  className="ss-focus bg-[#ffffff] px-3 py-3 text-center transition-colors hover:bg-[#f8faf8]"
                  style={filter === status ? { background: "#f8faf8" } : undefined}
                >
                  <div className="text-2xl font-bold" style={{ color: META[status].color }}>{diff.counts[status]}</div>
                  <div className="ss-label mt-0.5">{META[status].label}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="ss-panel p-4">
            <div className="ss-label">Severity shift</div>
            <div className="mt-3 space-y-2">
              {SEVERITIES.map((severity) => {
                const delta = after.counts[severity] - before.counts[severity];
                const width = Math.min(50, Math.abs(delta) * 10);
                return (
                  <div key={severity} className="flex items-center gap-3">
                    <span className="w-20 text-[11px] font-semibold" style={{ color: SEV_COLOR[severity] }}>{severity}</span>
                    <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-[#e4e9e5]">
                      <div className="absolute left-1/2 top-0 h-full w-px bg-[#d3ddd7]" />
                      <div
                        className="absolute top-0 h-full rounded-full transition-all"
                        style={{ background: delta > 0 ? SEV_COLOR[severity] : "#08745d", width: `${width}%`, left: delta > 0 ? "50%" : `${50 - width}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-xs text-[#58655f]">{delta > 0 ? "+" : ""}{delta}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="ss-panel flex flex-wrap items-center gap-2 p-3">
            <input
              className="ss-input ss-focus max-w-[260px] flex-1"
              placeholder="Search changed findings…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search diff"
            />
            <div className="flex flex-wrap gap-1.5">
              {(["all", "new", "changed", "resolved", "unchanged"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setFilter(status)}
                  aria-pressed={filter === status}
                  className={`ss-btn ss-btn-sm ss-focus ${filter === status ? "ss-btn-primary" : ""}`}
                >
                  {status === "all" ? "All" : META[status].label}
                </button>
              ))}
            </div>
            <span className="ml-auto text-xs text-[#58655f]">{rows.length} shown</span>
          </div>

          {rows.length === 0 ? (
            <p className="ss-panel p-6 text-sm text-[#58655f]">
              {diff.rows.length === 0 ? "These two scans produced identical findings." : "Nothing matches this filter."}
            </p>
          ) : (
            <ul className="space-y-2">
              {rows.map((row) => {
                const meta = META[row.status];
                const primary = (row.after ?? row.before) as Finding;
                return (
                  <li key={row.key} className="ss-panel ss-rise overflow-hidden" style={{ borderLeft: `3px solid ${meta.color}` }}>
                    <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
                      <span className="ss-pill" style={{ background: meta.color, color: "#ffffff" }}>{meta.glyph} {meta.label}</span>
                      <code className="text-xs font-bold text-[#08745d]">{primary.ruleId}</code>
                      <span className="text-sm">{primary.file}</span>
                      {row.before && row.after && row.before.severity !== row.after.severity ? (
                        <span className="flex items-center gap-1.5">
                          <span className={`ss-pill ss-${row.before.severity}`}>{row.before.severity}</span>
                          <span className="text-[#65736d]">→</span>
                          <span className={`ss-pill ss-${row.after.severity}`}>{row.after.severity}</span>
                        </span>
                      ) : (
                        <span className={`ss-pill ss-${primary.severity}`}>{primary.severity}</span>
                      )}
                    </div>
                    <div className="grid gap-2 px-4 pb-4 md:grid-cols-2">
                      <div>
                        <div className="ss-label mb-1.5">Before</div>
                        {row.before ? (
                          <pre dir="ltr" className="ss-evidence" style={{ borderLeftColor: "#65736d" }}>{row.before.snippet}</pre>
                        ) : (
                          <p className="rounded-md border border-dashed border-[#d3ddd7] p-3 text-xs text-[#65736d]">Not present in the baseline.</p>
                        )}
                      </div>
                      <div>
                        <div className="ss-label mb-1.5">After</div>
                        {row.after ? (
                          <pre dir="ltr" className="ss-evidence" style={{ borderLeftColor: meta.color }}>{row.after.snippet}</pre>
                        ) : (
                          <p className="rounded-md border border-dashed border-[#d3ddd7] p-3 text-xs text-[#08745d]">No longer detected.</p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
