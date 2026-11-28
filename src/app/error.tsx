"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[SkillSafe] route error:", error);
  }, [error]);

  return (
    <AppShell active="scanner">
      <main className="app-page">
        <div className="mx-auto max-w-2xl ss-panel border-l-2 border-l-[#b42332] p-6">
          <h1 className="text-xl font-bold text-[#b42332]">The scanner hit an error</h1>
          <p className="mt-2 text-sm text-[#58655f]">
            Nothing was uploaded — the failure happened locally in your browser.
          </p>
          <pre dir="ltr" className="ss-evidence mt-4" style={{ borderLeftColor: "#b42332" }}>
            {error.message || "Unknown error"}
            {error.digest ? `\ndigest: ${error.digest}` : ""}
          </pre>
          <button type="button" className="ss-btn ss-btn-primary ss-focus mt-4" onClick={reset}>
            Try again
          </button>
        </div>
      </main>
    </AppShell>
  );
}
