"use client";

import { useCallback, useRef, useState } from "react";
import { runScan, type ScanMode } from "@/lib/scan/worker-client";
import type { RawScanFile, ScanReport } from "@/lib/scan/types";

const WATCHDOG_MS = 12_000;

export type ScannerState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; report: ScanReport; mode: ScanMode; raw: RawScanFile[] }
  | { status: "error"; message: string };

export function useScanner() {
  const [state, setState] = useState<ScannerState>({ status: "idle" });
  const busy = useRef(false);

  const scan = useCallback(async (raw: RawScanFile[]) => {
    if (busy.current) return;
    busy.current = true;
    setState({ status: "running" });

    let finished = false;
    const release = () => { finished = true; busy.current = false; };

    // Nothing may leave the controls permanently locked, whatever happens below.
    const watchdog = setTimeout(() => {
      if (finished) return;
      release();
      setState({
        status: "error",
        message: "The scan did not return in time and was released. Try again, or use a smaller input.",
      });
    }, WATCHDOG_MS);

    try {
      const { report, mode } = await runScan(raw);
      if (finished) return;
      clearTimeout(watchdog);
      release();
      setState({ status: "done", report, mode, raw });
    } catch (err) {
      if (finished) return;
      clearTimeout(watchdog);
      release();
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Scan failed.",
      });
    }
  }, []);

  const reset = useCallback(() => {
    busy.current = false;
    setState({ status: "idle" });
  }, []);

  return { state, scan, reset };
}
