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
  CRITICAL: "#ff3b5c", HIGH: "#ff8a3d", MEDIUM: "#ffc53d", LOW: "#4da3ff", INFO: "#a78bfa",
};
const LABEL_COLOR: Record<string, string> = {
  "Critical risk": "#ff3b5c", "High risk": "#ff8a3d", "Needs review": "#ffc53d",
  "Minor notes": "#4da3ff", "No findings": "#3df5c4",
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
          ["Reports", all.length, "#3df5c4"],
          ["Findings", totalFindings, "#4da3ff"],
          ["Critical", all.filter((r) => r.counts.CRITICAL > 0).length, "#ff3b5c"],
          ["Storage", connected ? "Supabase" : "Session", "#a78bfa"],
        ].map(([label, value, color]) => (
          <div key={String(label)} className="ss-panel p-3 text-center">
            <div className="text-2xl font-bold" style={{ color: String(color) }}>{value}</div>
            <div className="ss-label mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      <div className="ss-panel flex flex-wrap items-center gap-2 p-3">
        <input
          className="ss-input ss-focus max-w-[240px] flex-1"
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
        <div className="ml-auto flex gap-1.5">
          <input className="ss-input ss-focus w-[130px]" placeholder="Save view as…" value={viewName} onChange={(e) => setViewName(e.target.value)} aria-label="Saved view name" />
          <button type="button" className="ss-btn ss-btn-sm ss-focus" onClick={keepView}>Save view</button>
        </div>
      </div>

      {views.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {views.map((view) => (
            <span key={view.id} className="ss-chip">
              <button type="button" className="ss-focus text-[#c3d2e6]" onClick={() => applyView(view)}>{view.name}</button>
              <button type="button" className="ss-focus text-[#8296b3] hover:text-[#ff3b5c]" onClick={() => dropView(view.id)} aria-label={`Delete view ${view.name}`}>✕</button>
            </span>
          ))}
        </div>
      ) : null}

      {selected.size > 0 ? (
        <div className="ss-panel flex flex-wrap items-center gap-2 border-l-2 border-l-[#4da3ff] p-3">
          <span className="text-sm text-[#c3d2e6]">{selected.size} selected</span>
          <button type="button" className="ss-btn ss-btn-sm ss-focus" onClick={() => doArchive([...selected], !showArchived)}>
            {showArchived ? "Restore" : "Archive"}
          </button>
          <button type="button" className="ss-btn ss-btn-sm ss-focus" onClick={() => doDelete([...selected])}>Delete</button>
          <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost ss-focus" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      ) : null}

      {undo ? (
        <div className="ss-panel flex items-center gap-3 border-l-2 border-l-[#ffc53d] p-3">
          <span className="text-sm text-[#ffc53d]">{undo.label}</span>
          <button type="button" className="ss-btn ss-btn-sm ss-btn-primary ss-focus ml-auto" onClick={doUndo}>Undo</button>
        </div>
      ) : null}

      {toast ? <p className="text-xs text-[#3df5c4]">{toast}</p> : null}

      {rows.length === 0 ? (
        <p className="ss-panel p-6 text-sm text-[#8fa3bf]">
          {all.length === 0
            ? "No reports yet. Run a scan and press Save report — it lands here with full findings, search, and sharing."
            : "Nothing matches these filters."}
        </p>
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
                className="ss-panel flex flex-wrap items-center gap-3 p-3"
              >
                <input
                  type="checkbox"
                  checked={selected.has(record.id)}
                  onChange={() => toggleSelect(record.id)}
                  className="ss-focus h-3.5 w-3.5 accent-[#4da3ff]"
                  aria-label={`Select ${record.title}`}
                />
                <span className="h-8 w-1 rounded-full" style={{ background: LABEL_COLOR[record.label] ?? "#4da3ff" }} />
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
                  <div className="text-[11px] text-[#8296b3]">
                    {new Date(record.createdAt).toLocaleString()} · {record.fileCount} file(s) · score {record.rawScore} · catalog v{record.catalogVersion}
                  </div>
                </div>
                {top ? <span className={`ss-pill ss-${top}`}>{top}</span> : null}
                <span className="text-xs text-[#8fa3bf]">{record.findings.length} finding(s)</span>
                <div className="flex gap-1.5">
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
        <div className="fixed inset-0 z-[60] flex justify-end bg-[#04070ecc]" onClick={() => setOpenId(null)}>
          <aside
            className="ss-rise h-full w-full max-w-[560px] overflow-y-auto border-l border-[#18233c] bg-[#0b1120] p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={`Report ${open.title}`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="ss-label">Report</div>
                <h2 className="mt-1 text-xl font-bold">{open.title}</h2>
                <p className="mt-1 text-xs text-[#8296b3]">
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

            <div className="mt-4 grid grid-cols-5 gap-px overflow-hidden rounded-md bg-[#18233c]">
              {SEVERITIES.map((s) => (
                <div key={s} className="bg-[#0b1120] px-2 py-2 text-center">
                  <div className="text-lg font-bold" style={{ color: open.counts[s] > 0 ? SEV_COLOR[s] : "#24334f" }}>{open.counts[s]}</div>
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
                      <li key={`${f.ruleId}-${f.start}-${i}`} className="rounded-md border border-[#18233c] p-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`ss-pill ss-${f.severity}`}>{f.severity}</span>
                          <code className="text-xs text-[#3df5c4]">{f.ruleId}</code>
                          <span className="text-[11px] text-[#8296b3]">{f.file}:{f.line}</span>
                        </div>
                        <pre dir="ltr" className="ss-evidence mt-2" style={{ borderLeftColor: SEV_COLOR[f.severity] }}>{f.snippet}</pre>
                        <p className="mt-2 text-xs leading-relaxed text-[#c3d2e6]">{f.why}</p>
                        <p className="mt-1 text-xs leading-relaxed text-[#8fa3bf]">{f.fix}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {open.findings.length === 0 ? (
                <p className="text-sm text-[#8fa3bf]">No findings were recorded for this scan.</p>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
