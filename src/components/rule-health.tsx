"use client";

import { useEffect, useState } from "react";
import { clearFeedback, exportFeedback, ruleHealth, subscribeFeedback, type RuleHealthRow } from "@/lib/feedback/store";
import { downloadJson } from "@/lib/ui/report-tools";

export function RuleHealth() {
  const [rows, setRows] = useState<RuleHealthRow[]>(() => ruleHealth());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    return subscribeFeedback(() => setRows(ruleHealth()));
  }, []);

  if (rows.length === 0) return null;
  const total = rows.reduce((n, r) => n + r.net, 0);

  return (
    <section className="ss-panel overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="ss-focus flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="text-[#65736d]">{open ? "▾" : "▸"}</span>
        <span className="font-semibold">Rule health · feedback queue</span>
        <span className="ml-auto text-sm text-[#58655f]">{total} mark(s) · {rows.length} rule(s)</span>
      </button>

      {open ? (
        <div className="space-y-3 px-4 pb-4">
          <p className="text-xs leading-relaxed text-[#58655f]">
            Every false-positive mark you make this session accumulates here. This is the loop that retunes the
            catalog: a pattern that proves reliably noisy gets its confidence lowered or gets retired through{" "}
            <span className="font-mono text-[#374541]">rule-catalog.json</span> — no redeploy. Export carries counts
            only, never content.
          </p>

          <ul className="space-y-1">
            {rows.map((row) => (
              <li key={row.ruleId} className="flex items-center gap-3 text-xs">
                <code className="font-semibold text-[#08745d]">{row.ruleId}</code>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e4e9e5]">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(100, (row.net / Math.max(1, total)) * 100)}%`, background: "#946200" }}
                  />
                </div>
                <span className="w-16 text-right text-[#58655f]">{row.net} net</span>
              </li>
            ))}
          </ul>

          <div className="flex gap-1.5">
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-focus"
              onClick={() => downloadJson("skillsafe-feedback.json", exportFeedback())}
            >
              Export feedback
            </button>
            <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost ss-focus" onClick={clearFeedback}>
              Clear queue
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
