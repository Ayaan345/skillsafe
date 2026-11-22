"use client";

import { useMemo, useState } from "react";
import { FindingCard } from "@/components/finding-card";
import { Artifacts } from "@/components/artifacts";
import { Verdict } from "@/components/verdict";
import { groupByCategory } from "@/lib/scan/group";
import type { ScanReport, Severity } from "@/lib/scan/types";
import type { ScanMode } from "@/lib/scan/worker-client";
import {
  ALL_SEVERITIES,
  buildExport,
  DEFAULT_FILTERS,
  downloadJson,
  filterFindings,
  findingKey,
  recompute,
  type SortKey,
} from "@/lib/ui/report-tools";

function CategoryBlock({
  name,
  index,
  children,
  count,
  top,
  defaultOpen,
}: {
  name: string;
  index: number;
  children: React.ReactNode;
  count: number;
  top: Severity;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="ss-panel ss-section overflow-hidden" id={`cat-${index}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="ss-focus flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="text-[#8296b3]">{open ? "▾" : "▸"}</span>
        <span className="font-semibold">
          <span className="text-[#8296b3]">{index}.</span> {name}
        </span>
        <span className="ml-auto flex items-center gap-2.5">
          <span className={`ss-pill ss-${top}`}>{top}</span>
          <span className="text-sm text-[#8fa3bf]">{count}</span>
        </span>
      </button>
      {open ? <ul className="space-y-2.5 px-3 pb-3">{children}</ul> : null}
    </section>
  );
}

export function Report({ report, mode }: { report: ScanReport; mode: ScanMode }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [showDismissed, setShowDismissed] = useState(false);

  const effective = useMemo(() => recompute(report, dismissed), [report, dismissed]);
  const visible = useMemo(() => {
    const base = showDismissed
      ? report.findings
      : report.findings.filter((f) => !dismissed.has(findingKey(f)));
    return filterFindings(base, filters);
  }, [report.findings, dismissed, showDismissed, filters]);

  const groups = useMemo(() => groupByCategory(visible), [visible]);

  const toggle = (key: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSeverity = (s: Severity) => {
    setFilters((f) => ({
      ...f,
      severities: f.severities.includes(s) ? f.severities.filter((x) => x !== s) : [...f.severities, s],
    }));
  };

  return (
    <div className="space-y-4" aria-live="polite">
      <Verdict report={effective} mode={mode} dismissedCount={dismissed.size} />

      <Artifacts report={report} />

      <div className="ss-panel flex flex-wrap items-center gap-2 p-3">
        <input
          className="ss-input ss-focus max-w-[260px] flex-1"
          placeholder="Search findings, files, rules…"
          value={filters.query}
          onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
          aria-label="Search findings"
        />
        <div className="flex flex-wrap gap-1.5">
          {ALL_SEVERITIES.map((s) => {
            const on = filters.severities.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleSeverity(s)}
                aria-pressed={on}
                className={`ss-btn ss-btn-sm ss-focus ${on ? "ss-btn-primary" : ""}`}
              >
                {s}
              </button>
            );
          })}
        </div>
        <select
          className="ss-input ss-focus w-auto"
          value={filters.sort}
          onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as SortKey }))}
          aria-label="Sort findings"
        >
          <option value="severity">Sort: severity</option>
          <option value="file">Sort: file</option>
          <option value="rule">Sort: rule id</option>
        </select>
        <div className="ml-auto flex gap-1.5">
          {dismissed.size > 0 ? (
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-focus"
              onClick={() => setShowDismissed((v) => !v)}
            >
              {showDismissed ? "Hide" : "Show"} {dismissed.size} dismissed
            </button>
          ) : null}
          {dismissed.size > 0 ? (
            <button type="button" className="ss-btn ss-btn-sm ss-focus" onClick={() => setDismissed(new Set())}>
              Undo all
            </button>
          ) : null}
          <button
            type="button"
            className="ss-btn ss-btn-sm ss-focus"
            onClick={() => downloadJson("skillsafe-report.json", buildExport(report, dismissed))}
          >
            Export JSON
          </button>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="ss-panel p-5 text-sm text-[#8fa3bf]">
          {report.findings.length === 0
            ? "Nothing matched. Pair a clean report with least-privilege execution — static analysis cannot observe runtime behavior."
            : "No findings match the current filters."}
        </p>
      ) : (
        <div className="space-y-2.5">
          {groups.map((g) => (
            <CategoryBlock
              key={g.category}
              index={g.category}
              name={g.categoryName}
              count={g.findings.length}
              top={g.topSeverity ?? "INFO"}
              defaultOpen={g.topSeverity === "CRITICAL" || g.topSeverity === "HIGH"}
            >
              {g.findings.map((f) => {
                const key = findingKey(f);
                return (
                  <FindingCard
                    key={key}
                    finding={f}
                    dismissed={dismissed.has(key)}
                    onToggle={() => toggle(key)}
                  />
                );
              })}
            </CategoryBlock>
          ))}
        </div>
      )}

      <p className="px-1 text-xs leading-relaxed text-[#8296b3]">
        39 of 45 catalog rules are active. The remaining six need optional backends or an OCR pass:
        live link reputation, dependency advisories, community hash lists, the semantic classifier,
        and OCR-extracted image text. False-positive marks apply to this report only and are included
        in the export.
      </p>
    </div>
  );
}
