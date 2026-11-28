"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { archiveReports, deleteReports, persistView, renameReport } from "@/lib/actions/reports";
import {
  archiveRecords, dropView, forgetRecords, renameRecord,
  reorderRecords, restoreRecords, saveView, sessionRecords, sessionViews, subscribeHistory,
} from "@/lib/history/store";
import type { HistoryRecord, SavedView } from "@/lib/history/types";
import { groupByCategory } from "@/lib/scan/group";
import type { Severity } from "@/lib/scan/types";
import { downloadJson } from "@/lib/ui/report-tools";

const SEVERITIES: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
const SEV_COLOR: Record<Severity, string> = {
  CRITICAL: "#b42332", HIGH: "#b54708", MEDIUM: "#946200", LOW: "#246b96", INFO: "#58656b",
};
const LABEL_COLOR: Record<string, string> = {
  "Critical risk": "#b42332", "High risk": "#b54708", "Needs review": "#946200",
  "Minor notes": "#246b96", "No findings": "#08745d",
};

type SortKey = SavedView["sort"];

export function HistoryView({ initial, connected }: { initial: HistoryRecord[]; connected: boolean }) {
  const [local, setLocal] = useState<HistoryRecord[]>(() => sessionRecords());
  const [views, setViews] = useState<SavedView[]>(() => sessionViews());
  const [remote, setRemote] = useState<HistoryRecord[]>(initial);
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<Severity | "">("");
  const [sort, setSort] = useState<SortKey>("date");
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [undo, setUndo] = useState<{ label: string; records: HistoryRecord[] } | null>(null);
  const [viewName, setViewName] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);

  useEffect(() => {
    return subscribeHistory(() => { setLocal(sessionRecords()); setViews(sessionViews()); });
  }, []);

  useEffect(() => {
    // Keep optimistic updates aligned with refreshed server data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRemote(initial);
  }, [initial]);

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), 9000);
    return () => clearTimeout(timer);
  }, [undo]);

  const all = useMemo(() => {
    const map = new Map<string, HistoryRecord>();
    for (const r of remote) map.set(r.id, r);
    for (const r of local) if (!map.has(r.id)) map.set(r.id, r);
    return [...map.values()];
  }, [remote, local]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = all.filter((r) => {
      if (!showArchived && r.archivedAt) return false;
      if (showArchived && !r.archivedAt) return false;
      if (severity) {
        const top = SEVERITIES.find((s) => r.counts[s] > 0);
        if (top !== severity) return false;
      }
      if (!q) return true;
      return r.title.toLowerCase().includes(q)
        || r.label.toLowerCase().includes(q)
        || r.findings.some((f) => f.ruleId.includes(q) || f.file.toLowerCase().includes(q));
    });
    const sorted = [...filtered];
    if (sort === "date") sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (sort === "score") sorted.sort((a, b) => b.rawScore - a.rawScore);
    if (sort === "title") sorted.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "severity") {
      const rank = (r: HistoryRecord) => SEVERITIES.findIndex((s) => r.counts[s] > 0);
      sorted.sort((a, b) => rank(a) - rank(b) || b.rawScore - a.rawScore);
    }
    return sorted;
  }, [all, query, severity, sort, showArchived]);

  const open = rows.find((r) => r.id === openId) ?? all.find((r) => r.id === openId) ?? null;

  const flash = (text: string) => { setToast(text); setTimeout(() => setToast(null), 2600); };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const doRename = async (id: string) => {
    const clean = draftTitle.trim();
    setRenaming(null);
    if (!clean) return;
    if (id.startsWith("local-")) renameRecord(id, clean);
    else {
      setRemote((prev) => prev.map((r) => (r.id === id ? { ...r, title: clean } : r)));
      const result = await renameReport(id, clean);
      if (!result.ok) flash(result.error);
    }
  };

  const doArchive = async (ids: string[], archived: boolean) => {
    const localIds = ids.filter((i) => i.startsWith("local-"));
    const remoteIds = ids.filter((i) => !i.startsWith("local-"));
    const previous = archiveRecords(localIds, archived);
    const snapshot = remote.filter((r) => remoteIds.includes(r.id));
    setRemote((prev) => prev.map((r) => (remoteIds.includes(r.id) ? { ...r, archivedAt: archived ? new Date().toISOString() : null } : r)));
    setUndo({ label: `${ids.length} report(s) ${archived ? "archived" : "restored"}`, records: [...previous, ...snapshot] });
    setSelected(new Set());
    if (remoteIds.length > 0) {
      const result = await archiveReports(remoteIds, archived);
      if (!result.ok) flash(result.error);
    }
  };

  const doDelete = async (ids: string[]) => {
    const removedLocal = forgetRecords(ids.filter((i) => i.startsWith("local-")));
    const remoteIds = ids.filter((i) => !i.startsWith("local-"));
    const removedRemote = remote.filter((r) => remoteIds.includes(r.id));
    setRemote((prev) => prev.filter((r) => !remoteIds.includes(r.id)));
    setUndo({ label: `${ids.length} report(s) deleted`, records: [...removedLocal, ...removedRemote] });
    setSelected(new Set());
    setOpenId(null);
    if (remoteIds.length > 0) {
      const result = await deleteReports(remoteIds);
      if (!result.ok) flash(result.error);
    }
  };

  const doUndo = () => {
    if (!undo) return;
    restoreRecords(undo.records.filter((record) => record.id.startsWith("local-")));
    setRemote((prev) => {
      const map = new Map(prev.map((r) => [r.id, r]));
      for (const record of undo.records) if (!record.id.startsWith("local-")) map.set(record.id, record);
      return [...map.values()];
    });
    setUndo(null);
    flash("Restored.");
  };

  const keepView = async () => {
    const name = viewName.trim();
    if (!name) return;
    const view: SavedView = { id: `v-${Date.now().toString(36)}`, name, query, severity, sort };
    saveView(view);
    setViewName("");
    if (connected) {
      const result = await persistView(name, query, severity, sort);
      if (!result.ok) flash(result.error);
    }
  };

  const applyView = (view: SavedView) => {
    setQuery(view.query);
    setSeverity(view.severity);
    setSort(view.sort);
  };

  const onDrop = (targetId: string) => {
    const source = dragId.current;
    dragId.current = null;
    if (!source || source === targetId) return;
    const order = rows.map((r) => r.id);
    const from = order.indexOf(source);
    const to = order.indexOf(targetId);
    if (from < 0 || to < 0) return;
    order.splice(to, 0, ...order.splice(from, 1));
    reorderRecords(order.filter((id) => id.startsWith("local-")));
    flash("Order updated for this session.");
  };

  const totalFindings = all.reduce((n, r) => n + r.findings.length, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Reports", all.length],
          ["Findings", totalFindings],
          ["Critical reports", all.filter((r) => r.counts.CRITICAL > 0).length],
          ["Storage", connected ? "Supabase" : "Session"],
        ].map(([label, value]) => (
          <div key={String(label)} className="ss-panel ss-stat-card">
            <div className="ss-stat-card__value">{value}</div>
            <div className="ss-stat-card__label">{label}</div>
          </div>
        ))}
      </div>

      <div className="ss-panel flex flex-wrap items-center gap-2 p-4">
        <input
          className="ss-input ss-focus min-w-[220px] max-w-[360px] flex-1"
          placeholder="Search reports, rules, files…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search history"
        />
        <select className="ss-input ss-focus w-auto" value={severity} onChange={(e) => setSeverity(e.target.value as Severity | "")} aria-label="Filter by top severity">
          <option value="">Any severity</option>
          {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="ss-input ss-focus w-auto" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort reports">
          <option value="date">Newest</option>
          <option value="severity">Severity</option>
          <option value="score">Score</option>
          <option value="title">Name</option>
        </select>
        <button type="button" className={`ss-btn ss-btn-sm ss-focus ${showArchived ? "ss-btn-primary" : ""}`} onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? "Viewing archive" : "Viewing active"}
        </button>
        <div className="ml-auto flex min-w-[220px] gap-1.5">
          <input className="ss-input ss-focus w-[130px]" placeholder="Save view as…" value={viewName} onChange={(e) => setViewName(e.target.value)} aria-label="Saved view name" />
          <button type="button" className="ss-btn ss-btn-sm ss-focus" onClick={keepView}>Save view</button>
        </div>
      </div>

      {views.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {views.map((view) => (
            <span key={view.id} className="ss-chip">
              <button type="button" className="ss-focus text-[#374541]" onClick={() => applyView(view)}>{view.name}</button>
              <button type="button" className="ss-focus text-[#65736d] hover:text-[#b42332]" onClick={() => dropView(view.id)} aria-label={`Delete view ${view.name}`}>✕</button>
            </span>
          ))}
        </div>
      ) : null}

      {selected.size > 0 ? (
        <div className="ss-panel flex flex-wrap items-center gap-2 border-l-2 border-l-[#246b96] p-3">
          <span className="text-sm text-[#374541]">{selected.size} selected</span>
          <button type="button" className="ss-btn ss-btn-sm ss-focus" onClick={() => doArchive([...selected], !showArchived)}>
            {showArchived ? "Restore" : "Archive"}
          </button>
          <button type="button" className="ss-btn ss-btn-sm ss-focus" onClick={() => doDelete([...selected])}>Delete</button>
          <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost ss-focus" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      ) : null}

      {undo ? (
        <div className="ss-panel flex items-center gap-3 border-l-2 border-l-[#946200] p-3">
          <span className="text-sm text-[#946200]">{undo.label}</span>
          <button type="button" className="ss-btn ss-btn-sm ss-btn-primary ss-focus ml-auto" onClick={doUndo}>Undo</button>
        </div>
      ) : null}

      {toast ? <p className="text-xs text-[#08745d]">{toast}</p> : null}

      {rows.length === 0 ? (
        <div className="ss-panel ss-empty-state text-sm text-[#58655f]">
          {all.length === 0
            ? <p>No reports yet. Run a scan, then save its findings here.</p>
            : <p>Nothing matches these filters. Adjust the search or filters to see more reports.</p>}
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((record) => {
            const top = SEVERITIES.find((s) => record.counts[s] > 0);
            return (
              <li
                key={record.id}
                draggable={record.id.startsWith("local-")}
                onDragStart={() => { dragId.current = record.id; }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(record.id)}
                className="ss-panel ss-history-record flex flex-wrap items-center"
              >
                <input
                  type="checkbox"
                  checked={selected.has(record.id)}
                  onChange={() => toggleSelect(record.id)}
                  className="ss-focus h-3.5 w-3.5 accent-[#246b96]"
                  aria-label={`Select ${record.title}`}
                />
                <span className="h-8 w-1 rounded-full" style={{ background: LABEL_COLOR[record.label] ?? "#246b96" }} />
                <div className="min-w-[160px] flex-1">
                  {renaming === record.id ? (
                    <input
                      autoFocus
                      className="ss-input ss-focus"
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      onBlur={() => doRename(record.id)}
                      onKeyDown={(e) => { if (e.key === "Enter") doRename(record.id); if (e.key === "Escape") setRenaming(null); }}
                      aria-label="New report name"
                    />
                  ) : (
                    <button type="button" className="ss-focus text-left text-sm font-semibold" onClick={() => setOpenId(record.id)}>
                      {record.title}
                    </button>
                  )}
                  <div className="text-[11px] text-[#65736d]">
                    {new Date(record.createdAt).toLocaleString()} · {record.fileCount} file(s) · score {record.rawScore} · catalog v{record.catalogVersion}
                  </div>
                </div>
                {top ? <span className={`ss-pill ss-${top}`}>{top}</span> : null}
                <span className="text-xs text-[#58655f]">{record.findings.length} finding(s)</span>
                <div className="ss-history-record__actions flex gap-1.5">
                  <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost ss-focus" onClick={() => { setRenaming(record.id); setDraftTitle(record.title); }}>Rename</button>
                  <button type="button" className="ss-btn ss-btn-sm ss-focus" onClick={() => setOpenId(record.id)}>Open</button>
                  <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost ss-focus" onClick={() => doDelete([record.id])}>Delete</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {open ? (
        <div className="fixed inset-0 z-[60] flex justify-end bg-[#1b2724cc]" onClick={() => setOpenId(null)}>
          <aside
            className="ss-rise h-full w-full max-w-[560px] overflow-y-auto border-l border-[#e4e9e5] bg-[#ffffff] p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="history-report-title"
          >
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="ss-label">Report</div>
                <h2 id="history-report-title" className="mt-1 text-xl font-bold">{open.title}</h2>
                <p className="mt-1 text-xs text-[#65736d]">
                  {new Date(open.createdAt).toLocaleString()} · {open.label} · score {open.rawScore}
                </p>
              </div>
              <button type="button" className="ss-btn ss-btn-sm ss-focus" onClick={() => setOpenId(null)}>Close</button>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              <button type="button" className="ss-btn ss-btn-sm ss-focus"
                onClick={() => downloadJson(`${open.title.replace(/[^\w.-]{1,40}/g, "-")}.json`, JSON.stringify(open, null, 2))}>
                Export JSON
              </button>
              <button type="button" className="ss-btn ss-btn-sm ss-focus" onClick={() => doArchive([open.id], !open.archivedAt)}>
                {open.archivedAt ? "Restore" : "Archive"}
              </button>
              <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost ss-focus" onClick={() => doDelete([open.id])}>Delete</button>
            </div>

            <div className="mt-4 grid grid-cols-5 gap-px overflow-hidden rounded-md bg-[#e4e9e5]">
              {SEVERITIES.map((s) => (
                <div key={s} className="bg-[#ffffff] px-2 py-2 text-center">
                  <div className="text-lg font-bold" style={{ color: open.counts[s] > 0 ? SEV_COLOR[s] : "#d3ddd7" }}>{open.counts[s]}</div>
                  <div className="ss-label">{s.slice(0, 4)}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-3">
              {groupByCategory(open.findings).map((group) => (
                <section key={group.category}>
                  <div className="ss-label">{group.category}. {group.categoryName}</div>
                  <ul className="mt-1.5 space-y-2">
                    {group.findings.map((f, i) => (
                      <li key={`${f.ruleId}-${f.start}-${i}`} className="rounded-md border border-[#e4e9e5] p-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`ss-pill ss-${f.severity}`}>{f.severity}</span>
                          <code className="text-xs text-[#08745d]">{f.ruleId}</code>
                          <span className="text-[11px] text-[#65736d]">{f.file}:{f.line}</span>
                        </div>
                        <pre dir="ltr" className="ss-evidence mt-2" style={{ borderLeftColor: SEV_COLOR[f.severity] }}>{f.snippet}</pre>
                        <p className="mt-2 text-xs leading-relaxed text-[#374541]">{f.why}</p>
                        <p className="mt-1 text-xs leading-relaxed text-[#58655f]">{f.fix}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {open.findings.length === 0 ? (
                <p className="text-sm text-[#58655f]">No findings were recorded for this scan.</p>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
