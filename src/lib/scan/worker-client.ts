import { scanRawFiles } from "./engine";
import type { RawScanFile, ScanReport } from "./types";
import { ENGINE_DEADLINE_MS, HARD_KILL_MS, type ScanRequest, type ScanResponse } from "./worker-protocol";

export type ScanMode = "worker" | "main-thread";

export interface RunResult {
  report: ScanReport;
  mode: ScanMode;
}

export class ScanTimeoutError extends Error {
  constructor() {
    super("Scan exceeded the hard 2000ms deadline and was terminated.");
    this.name = "ScanTimeoutError";
  }
}

async function onMainThread(raw: RawScanFile[]): Promise<RunResult> {
  return { report: await scanRawFiles(raw, ENGINE_DEADLINE_MS), mode: "main-thread" };
}

export function runScan(raw: RawScanFile[]): Promise<RunResult> {
  return new Promise<RunResult>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./scan.worker.ts", import.meta.url), { type: "module" });
    } catch {
      void onMainThread(raw).then(resolve, reject);
      return;
    }

    const id = crypto.randomUUID();
    let settled = false;

    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      worker.terminate();
      action();
    };

    const killTimer = setTimeout(() => finish(() => reject(new ScanTimeoutError())), HARD_KILL_MS);

    worker.onmessage = (ev: MessageEvent<ScanResponse>) => {
      const msg = ev.data;
      if (!msg || msg.id !== id) return;
      if (msg.type === "result") finish(() => resolve({ report: msg.report, mode: "worker" }));
      else finish(() => reject(new Error(msg.message)));
    };

    worker.onerror = () => {
      finish(() => { void onMainThread(raw).then(resolve, reject); });
    };

    const request: ScanRequest = { type: "scan", id, raw, deadlineMs: ENGINE_DEADLINE_MS };
    worker.postMessage(request);
  });
}
