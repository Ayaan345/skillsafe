import type { RawScanFile, ScanReport } from "./types";

/** Engine cooperatively truncates here, leaving headroom before the hard kill. */
export const ENGINE_DEADLINE_MS = 1800;
/** Spec §6: the worker is forcibly terminated at 2000ms. */
export const HARD_KILL_MS = 2000;

export interface ScanRequest {
  type: "scan";
  id: string;
  raw: RawScanFile[];
  deadlineMs: number;
}

export type ScanResponse =
  | { type: "result"; id: string; report: ScanReport }
  | { type: "error"; id: string; message: string };
