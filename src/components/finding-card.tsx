"use client";

import { useState } from "react";
import { displayPath } from "@/lib/scan/intake";
import type { Finding } from "@/lib/scan/types";

const EDGE: Record<Finding["severity"], string> = {
  CRITICAL: "#ff3b5c",
  HIGH: "#ff8a3d",
  MEDIUM: "#ffc53d",
  LOW: "#4da3ff",
  INFO: "#a78bfa",
};

export function FindingCard({
  finding,
  dismissed,
  onToggle,
}: {
  finding: Finding;
  dismissed: boolean;
  onToggle: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const text = `${finding.ruleId} · ${finding.file}:${finding.line}\n${finding.snippet}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <li className={`ss-panel ss-rise p-3.5 ${dismissed ? "ss-dismissed" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`ss-pill ss-${finding.severity}`}>{finding.severity}</span>
        <code className="text-xs font-semibold text-[#3df5c4]">{finding.ruleId}</code>
        <span className="text-xs text-[#8296b3]">
          {displayPath(finding.file)}:{finding.line} · {finding.layer} · {Math.round(finding.confidence * 100)}%
        </span>
        <div className="ml-auto flex gap-1.5">
          <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost ss-focus" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            className="ss-btn ss-btn-sm ss-btn-ghost ss-focus"
            onClick={onToggle}
            aria-pressed={dismissed}
          >
            {dismissed ? "Restore" : "False positive"}
          </button>
        </div>
      </div>

      <pre dir="ltr" className="ss-evidence mt-2.5" style={{ borderLeftColor: EDGE[finding.severity] }}>
        {finding.snippet}
      </pre>

      <p className="mt-2.5 text-sm leading-relaxed text-[#c3d2e6]">
        <span className="ss-label mr-1.5">Why</span>
        {finding.why}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-[#c3d2e6]">
        <span className="ss-label mr-1.5" style={{ color: "#3df5c4" }}>Fix</span>
        {finding.fix}
      </p>
    </li>
  );
}
