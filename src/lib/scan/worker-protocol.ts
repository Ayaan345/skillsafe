import type { RawScanFile, ScanReport } from "./types";

export const HANDSHAKE_MS = 600;
export const ENGINE_DEADLINE_MS = 1800;
export const HARD_KILL_MS = 2000;

export type ScanRequest =
  | { type: "ping"; id: string }
  | { type: "scan"; id: string; raw: RawScanFile[]; deadlineMs: number };

export type ScanResponse =
  | { type: "pong"; id: string }
  | { type: "result"; id: string; report: ScanReport }
  | { type: "error"; id: string; message: string };
