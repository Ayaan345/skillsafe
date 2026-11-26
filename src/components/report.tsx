"use client";

import { useEffect, useMemo, useState } from "react";
import { Artifacts } from "@/components/artifacts";
import { DeepScan } from "@/components/deep-scan";
import { FindingCard } from "@/components/finding-card";
import { LinkScan } from "@/components/link-scan";
import { OcrScan } from "@/components/ocr-scan";
import { RuleHealth } from "@/components/rule-health";
import { SaveReport } from "@/components/save-report";
import { SemanticScan } from "@/components/semantic-scan";
import { Verdict } from "@/components/verdict";
import { recordMark } from "@/lib/feedback/store";
import { rasterImages } from "@/lib/deep/ocr";
import { EMPTY_OVERLAY, loadOverlay } from "@/lib/scan/catalog";
import { sourceTypeFromRaw } from "@/lib/history/types";
import type { Finding, RawScanFile, ScanReport, Severity } from "@/lib/scan/types";
import type { ScanMode } from "@/lib/scan/worker-client";
import {
  ALL_SEVERITIES, buildExport, DEFAULT_FILTERS, downloadJson, FILTER_PRESETS,
  filterFindings, findingKey, groupForDisplay, recompute,
  type FilterState, type GroupMode, type SortKey,
} from "@/lib/ui/report-tools";

export function Report({ report, mode, raw }: { report: ScanReport; mode: ScanMode; raw: RawScanFile[] }) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [groupBy, setGroupBy] = useState<GroupMode>("category");
  const [compact, setCompact] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const [deepFindings, setDeepFindings] = useState<Finding[]>([]);
  const [deepChecked, setDeepChecked] = useState(0);
  const [ocrFindings, setOcrFindings] = useState<Finding[]>([]);
  const [linkFindings, setLinkFindings] = useState<Finding[]>([]);
  const [semanticFindings, setSemanticFindings] = useState<Finding[]>([]);
  const [semanticChecked, setSemanticChecked] = useState(0);
  const [liveVersion, setLiveVersion] = useState(EMPTY_OVERLAY.version);

  const images = useMemo(() => rasterImages(raw), [raw]);

  useEffect(() => {
    let alive = true;
    void loadOverlay().then((overlay) => {
      if (alive) setLiveVersion(overlay.version);
    });
    return () => { alive = false; };
  }, []);

  const merged = useMemo<ScanReport>(() => {
    const extra = [...deepFindings, ...ocrFindings, ...linkFindings, ...semanticFindings];
    return extra.length === 0 ? report : { ...report, findings: [...report.findings, ...extra] };
  }, [report, deepFindings, ocrFindings, linkFindings, semanticFindings]);

  const effective = useMemo(() => recompute(merged, dismissed), [merged, dismissed]);

  const visible = useMemo(() => {
    const base = showDismissed ? merged.findings : merged.findings.filter((f) => !dismissed.has(findingKey(f)));
    return filterFindings(base, filters);
  }, [merged.findings, dismissed, showDismissed, filters]);

  const groups = useMemo(() => groupForDisplay(visible, groupBy), [visible, groupBy]);

  useEffect(() => {
    setClosed(new Set(groups.filter((g) => g.topSeverity !== "CRITICAL" && g.topSeverity !== "HIGH").map((g) => g.key)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBy, report]);

  const toggleFinding = (key: string, ruleId: string) =>
    setDismissed((prev) => {
      const next = new Set(prev);
      const marking = !next.has(key);
      if (marking) next.add(key); else next.delete(key);
      recordMark(ruleId, marking);
      return next;
    });

  const toggleSeverity = (s: Severity) =>
    setFilters((f) => ({
      ...f,
      severities: f.severities.includes(s) ? f.severities.filter((x) => x !== s) : [...f.severities, s],
    }));

  const toggleGroup = (key: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const dismissShown = () =>
    setDismissed((prev) => {
      const next = new Set(prev);
      for (const f of visible) {
        const key = findingKey(f);
        if (!next.has(key)) recordMark(f.ruleId, true);
        next.add(key);
      }
      return next;
    });

  const undoDismissed = () =>
    setDismissed((prev) => {
      const visibleRuleIds = new Map(merged.findings.map((finding) => [findingKey(finding), finding.ruleId]));
      for (const key of prev) {
        const ruleId = visibleRuleIds.get(key);
        if (ruleId) recordMark(ruleId, false);
      }
      return new Set();
    });

  const filtersDirty =
    filters.query !== "" || filters.severities.length > 0 || filters.sort !== "severity" || groupBy !== "category";
  const sourceType = sourceTypeFromRaw(raw);
  const titlePath = raw.find((file) => file.path !== "SKILL.md")?.path ?? raw[0]?.path;
  const defaultTitle = titlePath?.split(/[\\/]/).pop() ?? "Scanned skill";
  const staleCatalog = liveVersion > 0 && report.catalogVersion % 1000 < liveVersion;

  return (
    <div className="space-y-3" aria-live="polite">
      {staleCatalog ? (
        <p className="ss-panel border-l-2 border-l-[#ffc53d] p-3 text-xs text-[#ffc53d]">
          The rule catalog moved to overlay v{liveVersion} after this scan ran. Re-scan to apply the latest tuning.
        </p>
      ) : null}
      <Verdict report={effective} mode={mode} dismissedCount={dismissed.size} />
      <SaveReport report={merged} defaultTitle={defaultTitle} sourceType={sourceType} />
      <Artifacts report={report} />
      <DeepScan
        dependencies={report.dependencies ?? []}
        applied={deepFindings.length}
        onResult={(findings, checked) => { setDeepFindings(findings); setDeepChecked(checked); }}
        onClear={() => { setDeepFindings([]); setDeepChecked(0); }}
      />
      <LinkScan
        links={report.links ?? []}
        applied={linkFindings.length}
        onResult={(findings) => setLinkFindings(findings)}
        onClear={() => setLinkFindings([])}
      />
      <OcrScan
        images={images}
        applied={ocrFindings.length}
        onResult={(findings) => setOcrFindings(findings)}
        onClear={() => setOcrFindings([])}
      />
      <SemanticScan
        raw={raw}
        applied={semanticFindings.length}
        onResult={(findings, checked) => { setSemanticFindings(findings); setSemanticChecked(checked); }}
        onClear={() => { setSemanticFindings([]); setSemanticChecked(0); }}
      />
      <RuleHealth />

      <div className="ss-panel ss-rail space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="ss-input ss-focus max-w-[240px] flex-1"
            placeholder="Search findings, files, rules…"
            value={filters.query}
            onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
            aria-label="Search findings"
          />
          <select className="ss-input ss-focus w-auto" value={filters.sort} aria-label="Sort findings"
            onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as SortKey }))}>
            <option value="severity">Sort: severity</option>
            <option value="file">Sort: file</option>
            <option value="rule">Sort: rule id</option>
          </select>
          <select className="ss-input ss-focus w-auto" value={groupBy} aria-label="Group findings"
            onChange={(e) => setGroupBy(e.target.value as GroupMode)}>
            <option value="category">Group: category</option>
            <option value="file">Group: file</option>
            <option value="severity">Group: severity</option>
          </select>
          <button type="button" className={`ss-btn ss-btn-sm ss-focus ${compact ? "ss-btn-on" : ""}`}
            onClick={() => setCompact((v) => !v)} aria-pressed={compact}>
            Compact
          </button>
          <button type="button" className="ss-btn ss-btn-sm ss-focus" onClick={() => setClosed(new Set())}>
            Expand all
          </button>
          <button type="button" className="ss-btn ss-btn-sm ss-focus"
            onClick={() => setClosed(new Set(groups.map((g) => g.key)))}>
            Collapse all
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {ALL_SEVERITIES.map((s) => (
            <button key={s} type="button" onClick={() => toggleSeverity(s)} aria-pressed={filters.severities.includes(s)}
              className={`ss-btn ss-btn-sm ss-focus ${filters.severities.includes(s) ? "ss-btn-on" : ""}`}>
              {s} <span className="text-[#8296b3]">{report.counts[s]}</span>
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-[#24334f]" />
          {FILTER_PRESETS.map((p) => (
            <button key={p.id} type="button" className="ss-btn ss-btn-sm ss-btn-ghost ss-focus"
              onClick={() => setFilters(p.state)}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[#8296b3]">
            {visible.length} shown · {effective.findings.length} active
          </span>
          <div className="ml-auto flex flex-wrap gap-1.5">
            {visible.length > 0 ? (
              <button type="button" className="ss-btn ss-btn-sm ss-focus" onClick={dismissShown}>
                Dismiss shown
              </button>
            ) : null}
            {dismissed.size > 0 ? (
              <>
                <button type="button" className={`ss-btn ss-btn-sm ss-focus ${showDismissed ? "ss-btn-on" : ""}`}
                  onClick={() => setShowDismissed((v) => !v)}>
                  {showDismissed ? "Hide" : "Show"} {dismissed.size} dismissed
                </button>
                <button type="button" className="ss-btn ss-btn-sm ss-focus" onClick={undoDismissed}>
                  Undo all
                </button>
              </>
            ) : null}
            {filtersDirty ? (
              <button type="button" className="ss-btn ss-btn-sm ss-focus"
                onClick={() => { setFilters(DEFAULT_FILTERS); setGroupBy("category"); }}>
                Reset filters
              </button>
            ) : null}
            <button type="button" className="ss-btn ss-btn-sm ss-btn-primary ss-focus"
              onClick={() => downloadJson("skillsafe-report.json", buildExport(merged, dismissed))}>
              Export JSON
            </button>
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="ss-panel p-5 text-sm text-[#8fa3bf]">
          {merged.findings.length === 0
            ? "Nothing matched. Pair a clean report with least-privilege execution — static analysis cannot observe runtime behavior."
            : "No findings match the current filters."}
        </p>
      ) : (
        <div className={`space-y-2.5 ${compact ? "ss-compact" : ""}`}>
          {groups.map((g) => {
            const open = !closed.has(g.key);
            return (
              <section key={g.key} className="ss-panel ss-section overflow-hidden">
                <button type="button" onClick={() => toggleGroup(g.key)} aria-expanded={open}
                  className="ss-focus flex w-full items-center gap-3 px-4 py-3 text-left">
                  <span className="text-[#8296b3]">{open ? "▾" : "▸"}</span>
                  <span className="min-w-0 truncate font-semibold">{g.title}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-2.5">
                    <span className={`ss-pill ss-${g.topSeverity}`}>{g.topSeverity}</span>
                    <span className="text-sm text-[#8fa3bf]">{g.findings.length}</span>
                  </span>
                </button>
                {open ? (
                  <ul className="space-y-2.5 px-3 pb-3">
                    {g.findings.map((f) => {
                      const key = findingKey(f);
                      return (
                        <FindingCard key={key} finding={f} dismissed={dismissed.has(key)}
                          onToggle={() => toggleFinding(key, f.ruleId)} />
                      );
                    })}
                  </ul>
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      <p className="px-1 text-xs leading-relaxed text-[#8296b3]">
        All 45 catalog rules are implemented. 42 run on every scan; advisories, live link reputation, OCR and
        semantic review are opt-in and off until you press them
        {deepChecked > 0 ? ` (${deepChecked} pin(s) checked this session)` : ""}. False-positive marks feed the
        rule-health queue above and are included in the export
        {semanticChecked > 0 ? ` (${semanticChecked} passage(s) checked this session)` : ""}.
      </p>
    </div>
  );
}