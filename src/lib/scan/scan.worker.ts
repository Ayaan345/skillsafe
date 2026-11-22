import { scanRawFiles } from "./engine";
import type { ScanRequest, ScanResponse } from "./worker-protocol";

// Minimal local typing so this compiles under the app's DOM lib without
// pulling in the conflicting webworker lib.
const ctx = self as unknown as {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (ev: MessageEvent) => void): void;
};

ctx.addEventListener("message", (ev: MessageEvent) => {
  const msg = ev.data as ScanRequest;
  if (!msg) return;

  if (msg.type === "ping") {
    ctx.postMessage({ type: "pong", id: msg.id } satisfies ScanResponse);
    return;
  }
  if (msg.type !== "scan") return;

  let response: ScanResponse;
  void (async () => {
    try {
      response = { type: "result", id: msg.id, report: await scanRawFiles(msg.raw, msg.deadlineMs) };
    } catch (err) {
      response = {
        type: "error",
        id: msg.id,
        message: err instanceof Error ? err.message : "Unknown worker error",
      };
    }
    ctx.postMessage(response);
  })();
});
