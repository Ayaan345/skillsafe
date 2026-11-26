import { buildLineIndex, lineAt } from "../text";
import type { DependencyRef, ScanInputFile } from "../types";

export const MAX_DEPENDENCIES = 200;

const EXACT = /^\d{1,20}(?:\.\d{1,20}){0,3}(?:[-+][0-9A-Za-z.-]{1,40})?$/;
const NPM_NAME = /^(?:@[A-Za-z0-9._-]{1,60}\/)?[A-Za-z0-9._-]{1,100}$/;
const PY_NAME = /^[A-Za-z0-9._-]{1,100}$/;
const REQ_LINE = /^\s{0,3}([A-Za-z0-9_.-]{1,100})\s{0,3}(?:\[[^\]\n]{0,60}\])?\s{0,3}==\s{0,3}([0-9A-Za-z.+-]{1,60})\s{0,3}$/gm;

/** Only exact pins are queryable against advisories; ranges are deliberately skipped. */
export function exactVersion(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 60) return null;
  if (/[\^~><*|]|\s/.test(trimmed)) return null;
  if (/x{1,3}\./i.test(trimmed)) return null;
  if (/^(?:workspace|file|link|portal|git|https?|npm|github):/i.test(trimmed)) return null;
  const v = trimmed.replace(/^={1,2}/, "").replace(/^v/i, "");
  return EXACT.test(v) ? v : null;
}

const DEP_GROUPS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

export function collectDependencies(files: ScanInputFile[], deadline: number): DependencyRef[] {
  const out: DependencyRef[] = [];

  for (const file of files) {
    if (out.length >= MAX_DEPENDENCIES || Date.now() > deadline) break;
    const lower = file.path.toLowerCase();
    const starts = buildLineIndex(file.content);

    const push = (name: string, version: string, ecosystem: DependencyRef["ecosystem"]) => {
      if (out.length >= MAX_DEPENDENCIES) return;
      const quoted = file.content.indexOf(`"${name}"`);
      const at = Math.max(0, quoted >= 0 ? quoted : file.content.indexOf(name));
      out.push({ name, version, ecosystem, file: file.path, line: lineAt(starts, at), start: at });
    };

    if (lower.endsWith("package.json")) {
      let pkg: unknown;
      try { pkg = JSON.parse(file.content); } catch { continue; }
      if (!pkg || typeof pkg !== "object") continue;
      const record = pkg as Record<string, unknown>;
      for (const group of DEP_GROUPS) {
        const deps = record[group];
        if (!deps || typeof deps !== "object") continue;
        for (const [name, range] of Object.entries(deps as Record<string, unknown>)) {
          if (!NPM_NAME.test(name) || typeof range !== "string") continue;
          const version = exactVersion(range);
          if (version) push(name, version, "npm");
        }
      }
      continue;
    }

    if (lower.endsWith("package-lock.json")) {
      let lock: unknown;
      try { lock = JSON.parse(file.content); } catch { continue; }
      if (!lock || typeof lock !== "object") continue;
      const packages = (lock as Record<string, unknown>).packages;
      if (!packages || typeof packages !== "object") continue;
      for (const [key, entry] of Object.entries(packages as Record<string, unknown>)) {
        if (out.length >= MAX_DEPENDENCIES) break;
        if (!entry || typeof entry !== "object") continue;
        const version = exactVersion(String((entry as Record<string, unknown>).version ?? ""));
        if (!version) continue;
        const marker = key.lastIndexOf("node_modules/");
        const name = marker >= 0 ? key.slice(marker + 13) : key;
        if (!NPM_NAME.test(name)) continue;
        push(name, version, "npm");
      }
      continue;
    }

    if (lower.endsWith("requirements.txt")) {
      const re = new RegExp(REQ_LINE.source, REQ_LINE.flags);
      let m: RegExpExecArray | null;
      let guard = 0;
      while ((m = re.exec(file.content)) !== null && out.length < MAX_DEPENDENCIES) {
        const name = m[1];
        const version = exactVersion(m[2]);
        if (PY_NAME.test(name) && version) push(name, version, "PyPI");
        if (++guard % 32 === 0 && Date.now() > deadline) break;
      }
    }
  }

  return out;
}
