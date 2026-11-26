"use client";

import Link from "next/link";
import { useState } from "react";
import { ShareReport } from "@/components/share-report";
import { saveReport } from "@/lib/actions/reports";
import { ACCOUNTS_ENABLED } from "@/lib/env/public";
import { forgetRecords, rememberScan } from "@/lib/history/store";
import { reportToRecord, type HistoryRecord } from "@/lib/history/types";
import type { ScanReport } from "@/lib/scan/types";

export function SaveReport({
  report,
  defaultTitle,
  sourceType,
}: {
  report: ScanReport;
  defaultTitle: string;
  sourceType: HistoryRecord["sourceType"];
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [busy, setBusy] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  const keep = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);

    const record = reportToRecord(report, title.trim() || defaultTitle, sourceType);
    rememberScan(record);

    if (!ACCOUNTS_ENABLED) {
      setNote({ tone: "warn", text: "Kept in this session's history. Configure Supabase to persist it across visits." });
      setBusy(false);
      return;
    }

    try {
      const result = await saveReport({
        title: record.title,
        sourceType,
        verdict: report.verdict,
        label: report.label,
        score100: report.score100,
        rawScore: report.score,
        catalogVersion: report.catalogVersion,
        fileCount: report.filesScanned,
        bundleHash: report.bundleHash,
        findings: report.findings,
      });

      if (result.ok && result.data) {
        forgetRecords([record.id]);
        setSavedId(result.data.id);
        setNote({ tone: "ok", text: "Saved to your history." });
      } else {
        setNote({ tone: "warn", text: `${result.ok ? "Save returned no id." : result.error} Kept in this session instead.` });
      }
    } catch (error) {
      setNote({
        tone: "warn",
        text: `${error instanceof Error ? error.message : "The report could not be saved."} Kept in this session instead.`,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="ss-panel flex flex-wrap items-center gap-2 p-3">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="ss-input ss-focus max-w-[280px] flex-1"
          placeholder="Name this report"
          aria-label="Report name"
        />
        <button type="button" className="ss-btn ss-btn-sm ss-btn-primary ss-focus" onClick={keep} disabled={busy}>
          {busy ? "Saving…" : savedId ? "Save again" : "Save report"}
        </button>
        <Link href="/history" className="ss-btn ss-btn-sm ss-btn-ghost ss-focus">Open history</Link>
        {note ? (
          <p className="w-full text-xs" style={{ color: note.tone === "ok" ? "#3df5c4" : "#ffc53d" }}>
            {note.text}
          </p>
        ) : null}
      </section>

      {savedId ? <ShareReport scanId={savedId} /> : null}
    </>
  );
}
