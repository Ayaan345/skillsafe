"use client";

import { useCallback, useRef, useState } from "react";
import { runScan, ScanTimeoutError, type ScanMode } from "@/lib/scan/worker-client";
import type { RawScanFile, ScanReport } from "@/lib/scan/types";

export type ScannerState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; report: ScanReport; mode: ScanMode }
  | { status: "error"; message: string };

export function useScanner() {
  const [state, setState] = useState<ScannerState>({ status: "idle" });
  const busy = useRef(false);

  const scan = useCallback(async (raw: RawScanFile[]) => {
    if (busy.current) return;
    busy.current = true;
    setState({ status: "running" });
    try {
      const { report, mode } = await runScan(raw);
      setState({ status: "done", report, mode });
    } catch (err) {
      const message =
        err instanceof ScanTimeoutError
          ? "Scan exceeded the 2000ms safety limit and was terminated. Try a smaller input."
          : err instanceof Error
            ? err.message
            : "Scan failed.";
      setState({ status: "error", message });
    } finally {
      busy.current = false;
    }
  }, []);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, scan, reset };
}
