export const MAX_FILES = 250;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

export interface FileMeta {
  name: string;
  size: number;
}

export interface IntakeDecision {
  status: "scan" | "rejected";
  reason?: string;
}

export interface IntakePlan {
  accepted: number[];
  skipped: { name: string; reason: string }[];
  totalBytes: number;
}

export function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

export function classifyFile(name: string, size: number): IntakeDecision {
  if (size > MAX_FILE_BYTES) {
    return { status: "rejected", reason: "Over the 10MB per-file limit." };
  }
  return { status: "scan" };
}

export function planIntake(files: readonly FileMeta[]): IntakePlan {
  const accepted: number[] = [];
  const skipped: { name: string; reason: string }[] = [];
  let totalBytes = 0;

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (accepted.length >= MAX_FILES) {
      skipped.push({ name: f.name, reason: `File-count limit (${MAX_FILES}) reached.` });
      continue;
    }
    const decision = classifyFile(f.name, f.size);
    if (decision.status !== "scan") {
      skipped.push({ name: f.name, reason: decision.reason ?? "Skipped." });
      continue;
    }
    if (totalBytes + f.size > MAX_TOTAL_BYTES) {
      skipped.push({ name: f.name, reason: "Total-size limit (50MB) reached." });
      continue;
    }
    accepted.push(i);
    totalBytes += f.size;
  }

  return { accepted, skipped, totalBytes };
}

/** Filenames are UI chrome, not evidence: strip controls and invisible/bidi characters. */
export function displayPath(name: string): string {
  return name
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .slice(0, 300);
}
