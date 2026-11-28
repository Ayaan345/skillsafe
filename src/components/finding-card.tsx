"use client";

import { useState } from "react";
import { displayPath } from "@/lib/scan/intake";
import type { Finding } from "@/lib/scan/types";

const EDGE: Record<Finding["severity"], string> = {
  CRITICAL: "#b42332", HIGH: "#b54708", MEDIUM: "#946200", LOW: "#246b96", INFO: "#58656b",
};

export function FindingCard({
  finding, dismissed, onToggle,
}: { finding: Finding; dismissed: boolean; onToggle: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        `${finding.ruleId} · ${finding.file}:${finding.line}\n${finding.snippet}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { setCopied(false); }
  };

  return (
    <li className={`ss-panel ss-card ss-rise ${dismissed ? "ss-dismissed" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`ss-pill ss-${finding.severity}`}>{finding.severity}</span>
        <code className="text-xs font-semibold text-[#08745d]">{finding.ruleId}</code>
        <span className="text-xs text-[#65736d]">
          {displayPath(finding.file)}:{finding.line} · {finding.layer} · {Math.round(finding.confidence * 100)}%
        </span>
        <div className="ml-auto flex gap-1.5">
          <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost ss-focus" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </button>
          <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost ss-focus" onClick={onToggle} aria-pressed={dismissed}>
            {dismissed ? "Restore" : "False positive"}
          </button>
        </div>
      </div>

      <pre dir="ltr" className="ss-evidence mt-2.5" style={{ borderLeftColor: EDGE[finding.severity] }}>
        {finding.snippet}
      </pre>

      <p className="mt-2.5 text-sm leading-relaxed text-[#374541]">
        <span className="ss-label mr-1.5">Why</span>{finding.why}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-[#374541]">
        <span className="ss-label mr-1.5" style={{ color: "#08745d" }}>Fix</span>{finding.fix}
      </p>
    </li>
  );
}