"use client";

import { useEffect, useMemo, useState } from "react";
import { EMPTY_OVERLAY, loadOverlay, type CatalogOverlay } from "@/lib/scan/catalog";
import { RULES } from "@/lib/scan/rules";
import { CATEGORY_NAMES, type Layer, type Severity } from "@/lib/scan/types";

const SEVERITIES: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
const LAYERS: Layer[] = ["L0", "L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8", "L9"];

const SEV_COLOR: Record<Severity, string> = {
  CRITICAL: "#ff3b5c", HIGH: "#ff8a3d", MEDIUM: "#ffc53d", LOW: "#4da3ff", INFO: "#a78bfa",
};

const STATUS_LABEL = { active: "runs every scan", deep: "opt-in deep scan", pending: "not implemented" } as const;
const STATUS_COLOR = { active: "#3df5c4", deep: "#a78bfa", pending: "#8296b3" } as const;

export function CatalogBrowser() {
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<Severity | "">("");
  const [layer, setLayer] = useState<Layer | "">("");
  const [category, setCategory] = useState<number | "">("");
  const [overlay, setOverlay] = useState<CatalogOverlay>(EMPTY_OVERLAY);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadOverlay().then((value) => { if (alive) setOverlay(value); });
    return () => { alive = false; };
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return RULES.filter((rule) => {
      if (severity && rule.severity !== severity) return false;
      if (layer && rule.layer !== layer) return false;
      if (category !== "" && rule.category !== category) return false;
      if (!q) return true;
      return (
        rule.id.includes(q) ||
        rule.title.toLowerCase().includes(q) ||
        rule.why.toLowerCase().includes(q) ||
        rule.categoryName.toLowerCase().includes(q)
      );
    });
  }, [query, severity, layer, category]);

  const counts = useMemo(() => ({
    active: RULES.filter((r) => r.status === "active").length,
    deep: RULES.filter((r) => r.status === "deep").length,
    pending: RULES.filter((r) => r.status === "pending").length,
  }), []);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Total rules", RULES.length, "#3df5c4"],
          ["Every scan", counts.active, "#4da3ff"],
          ["Opt-in deep", counts.deep, "#a78bfa"],
          ["Catalog overlay", `v${overlay.version}`, "#ffc53d"],
        ].map(([label, value, color]) => (
          <div key={String(label)} className="ss-panel p-3 text-center">
            <div className="text-2xl font-bold" style={{ color: String(color) }}>{value}</div>
            <div className="ss-label mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      <div className="ss-panel flex flex-wrap items-center gap-2 p-3">
        <input
          className="ss-input ss-focus max-w-[280px] flex-1"
          placeholder="Search rules, signals, explanations…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search rule catalog"
        />
        <select className="ss-input ss-focus w-auto" value={category} onChange={(e) => setCategory(e.target.value === "" ? "" : Number(e.target.value))} aria-label="Filter by category">
          <option value="">All categories</option>
          {Object.entries(CATEGORY_NAMES).map(([id, name]) => (
            <option key={id} value={id}>{id}. {name}</option>
          ))}
        </select>
        <select className="ss-input ss-focus w-auto" value={severity} onChange={(e) => setSeverity(e.target.value as Severity | "")} aria-label="Filter by severity">
          <option value="">All severities</option>
          {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="ss-input ss-focus w-auto" value={layer} onChange={(e) => setLayer(e.target.value as Layer | "")} aria-label="Filter by layer">
          <option value="">All layers</option>
          {LAYERS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <span className="ml-auto text-xs text-[#8fa3bf]">{rows.length} shown</span>
      </div>

      {rows.length === 0 ? (
        <p className="ss-panel p-5 text-sm text-[#8fa3bf]">No rule matches those filters.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((rule) => {
            const override = overlay.overrides[rule.id];
            const retired = overlay.retired.includes(rule.id);
            const open = expanded === rule.id;
            return (
              <li key={rule.id} className="ss-panel overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : rule.id)}
                  aria-expanded={open}
                  className="ss-focus flex w-full flex-wrap items-center gap-2.5 px-4 py-3 text-left"
                >
                  <span className="text-[#8296b3]">{open ? "▾" : "▸"}</span>
                  <code className="text-xs font-bold text-[#3df5c4]">{rule.id}</code>
                  <span className={`ss-pill ss-${override?.severity ?? rule.severity}`}>{override?.severity ?? rule.severity}</span>
                  <span className="text-sm font-medium">{rule.title}</span>
                  {retired ? <span className="ss-pill" style={{ background: "#ff3b5c", color: "#2a0009" }}>RETIRED</span> : null}
                  {override && !retired ? <span className="ss-pill" style={{ background: "#ffc53d", color: "#2b2000" }}>TUNED</span> : null}
                  <span className="ml-auto flex items-center gap-2 text-[11px]">
                    <span className="text-[#8296b3]">{rule.layer}</span>
                    <span style={{ color: STATUS_COLOR[rule.status] }}>{STATUS_LABEL[rule.status]}</span>
                  </span>
                </button>

                {open ? (
                  <div className="space-y-2.5 px-4 pb-4">
                    <div className="text-[11px] text-[#8296b3]">
                      Category {rule.category} · {rule.categoryName}
                    </div>
                    <p className="text-sm leading-relaxed text-[#c3d2e6]">
                      <span className="ss-label mr-1.5">Why</span>{rule.why}
                    </p>
                    <p className="text-sm leading-relaxed text-[#c3d2e6]">
                      <span className="ss-label mr-1.5" style={{ color: "#3df5c4" }}>Fix</span>{rule.fix}
                    </p>
                    {rule.pattern ? (
                      <div>
                        <div className="ss-label">Bounded pattern</div>
                        <pre dir="ltr" className="ss-evidence mt-1.5" style={{ borderLeftColor: SEV_COLOR[rule.severity] }}>
                          {rule.pattern.source}
                        </pre>
                      </div>
                    ) : (
                      <p className="text-xs text-[#8296b3]">
                        Detected structurally rather than by a single regular expression.
                      </p>
                    )}
                    {override ? (
                      <p className="text-xs text-[#ffc53d]">
                        Overlay v{overlay.version}: {JSON.stringify(override)}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <p className="px-1 text-xs leading-relaxed text-[#8296b3]">
        Rule IDs are stable and never renumbered, so historical reports stay accurate as the catalog grows.
        Severity, confidence and retirement are applied live from{" "}
        <span className="font-mono text-[#c3d2e6]">rule-catalog.json</span> without a redeploy.
      </p>
    </div>
  );
}
