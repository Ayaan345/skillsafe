"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[SkillSafe] route error:", error);
  }, [error]);

  return (
    <main className="min-h-screen bg-[#070b14] px-4 py-20 text-[#e6edf7]">
      <div className="mx-auto max-w-xl ss-panel border-l-2 border-l-[#ff3b5c] p-6">
        <h1 className="text-xl font-bold text-[#ff3b5c]">The scanner hit an error</h1>
        <p className="mt-2 text-sm text-[#8fa3bf]">
          Nothing was uploaded — the failure happened locally in your browser.
        </p>
        <pre dir="ltr" className="ss-evidence mt-4" style={{ borderLeftColor: "#ff3b5c" }}>
          {error.message || "Unknown error"}
          {error.digest ? `\ndigest: ${error.digest}` : ""}
        </pre>
        <button type="button" className="ss-btn ss-btn-primary ss-focus mt-4" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
