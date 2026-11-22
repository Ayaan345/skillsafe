import { scanRawFiles } from "./engine";
import type { RawScanFile, ScanReport } from "./types";
import {
  ENGINE_DEADLINE_MS,
  HANDSHAKE_MS,
  HARD_KILL_MS,
  type ScanRequest,
  type ScanResponse,
} from "./worker-protocol";

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

function uid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

const yieldToPaint = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function mainThread(raw: RawScanFile[]): Promise<RunResult> {
  await yieldToPaint();
  return { report: await scanRawFiles(raw, ENGINE_DEADLINE_MS), mode: "main-thread" };
}

/**
 * The worker must answer a handshake before it is trusted. A chunk that 404s or
 * is blocked by CSP can fail without firing onerror, so silence is treated as
 * failure and we fall back rather than hanging.
 */
function attemptWorker(raw: RawScanFile[]): Promise<RunResult | null> {
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./scan.worker.ts", import.meta.url), { type: "module" });
    } catch {
      resolve(null);
      return;
    }

    const id = uid();
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const settle = (value: RunResult | null) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      try { worker.terminate(); } catch { /* already gone */ }
      resolve(value);
    };

    worker.onmessage = (ev: MessageEvent<ScanResponse>) => {
      const msg = ev.data;
      if (!msg || msg.id !== id) return;

      if (msg.type === "pong") {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => settle(null), HARD_KILL_MS);
        const request: ScanRequest = { type: "scan", id, raw, deadlineMs: ENGINE_DEADLINE_MS };
        try {
          worker.postMessage(request);
        } catch {
          settle(null);
        }
        return;
      }
      if (msg.type === "result") settle({ report: msg.report, mode: "worker" });
      else settle(null);
    };

    worker.onerror = () => settle(null);
    worker.onmessageerror = () => settle(null);

    timer = setTimeout(() => settle(null), HANDSHAKE_MS);
    try {
      worker.postMessage({ type: "ping", id } satisfies ScanRequest);
    } catch {
      settle(null);
    }
  });
}

export async function runScan(raw: RawScanFile[]): Promise<RunResult> {
  const viaWorker = await attemptWorker(raw);
  if (viaWorker) return viaWorker;
  return mainThread(raw);
}
