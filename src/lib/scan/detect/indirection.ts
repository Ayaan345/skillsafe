import { RULE_BY_ID } from "../rules";
import { execBounded, lineAt, snippetAt } from "../text";
import type { Finding, ScanInputFile } from "../types";

interface Ctx {
  starts: number[];
  deadline: number;
}

const CODE_EXT = new Set(["py", "js", "mjs", "cjs", "ts", "jsx", "tsx"]);

const SINKS = new Set([
  "eval", "exec", "Function",
  "window.eval", "window.exec", "window.Function",
  "globalThis.eval", "globalThis.exec", "globalThis.Function",
  "self.eval", "self.exec", "self.Function",
  "global.eval", "global.exec", "global.Function",
  "builtins.eval", "builtins.exec", "__builtins__.eval", "__builtins__.exec",
  "os.system", "os.popen",
  "subprocess.run", "subprocess.call", "subprocess.Popen", "subprocess.check_output",
  "child_process.exec", "child_process.execSync", "child_process.spawn", "child_process.spawnSync",
  "socket.socket", "shutil.rmtree",
  "fs.rm", "fs.rmSync", "fs.rmdirSync",
]);

const KNOWN_BASES = new Set([
  "window", "globalThis", "self", "global", "builtins", "__builtins__",
  "os", "subprocess", "child_process", "fs", "shutil", "socket",
]);

const DANGEROUS_PROPS = new Set([
  "eval", "exec", "Function", "system", "popen", "spawn", "execSync", "rmtree", "socket",
]);

const ASSIGN_JS = /\b(?:const|let|var)\s{1,3}([A-Za-z_$][\w$]{0,60})\s{0,3}=\s{0,3}([^;\n]{1,200})/g;
const ASSIGN_PY = /^\s{0,3}([A-Za-z_][\w]{0,60})\s{0,3}=\s{0,3}([^\n]{1,200})/gm;
const CALL_ID = /\b([A-Za-z_$][\w$]{0,60})\s{0,3}\(/g;
const CALL_MEMBER = /\b([A-Za-z_$][\w$]{0,60}(?:\.[A-Za-z_$][\w$]{0,60}){1,3})\s{0,3}\(/g;
const CALL_COMPUTED = /\b([A-Za-z_$][\w$]{0,60}(?:\.[A-Za-z_$][\w$]{0,60}){0,3})\s{0,3}\[\s{0,3}([^\]\n]{1,120})\s{0,3}\]\s{0,3}\(/g;
const CALL_NEW = /\bnew\s{1,3}([A-Za-z_$][\w$]{0,60})\s{0,3}\(/g;
const CALL_GETATTR = /\bgetattr\s{0,3}\(\s{0,3}([A-Za-z_][\w]{0,60})\s{0,3},\s{0,3}["']([^"'\n]{1,60})["']\s{0,3}\)\s{0,3}\(/g;

function extensionOf(path: string): string {
  const i = path.lastIndexOf(".");
  return i < 0 ? "" : path.slice(i + 1).toLowerCase();
}

function captures(pattern: RegExp, text: string): RegExpExecArray | null {
  return new RegExp(pattern.source, pattern.flags.replace("g", "")).exec(text);
}

function resolveString(expr: string, env: Map<string, string>, depth = 0): string | null {
  if (depth > 4) return null;
  const s = expr.trim();

  const str = s.match(/^["']([^"'\n]{0,200})["']$/);
  if (str) return str[1];

  const parts = s.split(/\s{0,3}\+\s{0,3}/);
  if (parts.length > 1 && parts.length <= 6) {
    const resolved = parts.map((p) => resolveString(p, env, depth + 1));
    if (resolved.every((r): r is string => r !== null)) return resolved.join("");
    return null;
  }

  const member = s.match(/^([A-Za-z_$][\w$]{0,60})\.([A-Za-z_$][\w$]{0,60})$/);
  if (member) {
    const base = KNOWN_BASES.has(member[1]) ? member[1] : resolveString(member[1], env, depth + 1);
    if (!base) return null;
    const full = `${base}.${member[2]}`;
    return SINKS.has(full) || KNOWN_BASES.has(base) ? full : null;
  }

  const computed = s.match(/^([A-Za-z_$][\w$]{0,60})\s{0,3}\[\s{0,3}([^\]\n]{1,120})\s{0,3}\]$/);
  if (computed) {
    const base = KNOWN_BASES.has(computed[1]) ? computed[1] : resolveString(computed[1], env, depth + 1);
    const prop = resolveString(computed[2], env, depth + 1);
    if (!base || !prop) return null;
    const full = `${base}.${prop}`;
    return SINKS.has(full) || DANGEROUS_PROPS.has(prop) ? full : null;
  }

  const getattr = s.match(/^getattr\s{0,3}\(\s{0,3}([A-Za-z_][\w]{0,60})\s{0,3},\s{0,3}["']([^"'\n]{1,60})["']\s{0,3}\)$/);
  if (getattr) {
    const full = `${getattr[1]}.${getattr[2]}`;
    return SINKS.has(full) ? full : null;
  }

  const id = s.match(/^[A-Za-z_$][\w$]{0,60}$/);
  if (id) return env.get(s) ?? (SINKS.has(s) ? s : null);

  return null;
}

function f(file: string, text: string, ctx: Ctx, index: number, resolved: string): Finding {
  const r = RULE_BY_ID["code-005"];
  return {
    ruleId: r.id,
    category: r.category,
    categoryName: r.categoryName,
    severity: r.severity,
    layer: "L2",
    file,
    line: lineAt(ctx.starts, index),
    start: index,
    snippet: snippetAt(text, ctx.starts, index),
    why: `A sensitive call resolves through indirection to "${resolved}", which plain text search cannot see.`,
    fix: r.fix,
    confidence: 0.8,
  };
}

export function detectIndirection(file: ScanInputFile, text: string, ctx: Ctx): Finding[] {
  if (!CODE_EXT.has(extensionOf(file.path))) return [];
  const out: Finding[] = [];
  const env = new Map<string, string>();

  for (const hit of execBounded(text, ASSIGN_JS, ctx.deadline)) {
    const m = captures(ASSIGN_JS, hit.text);
    if (!m) continue;
    const resolved = resolveString(m[2], env);
    if (resolved) env.set(m[1], resolved);
  }
  for (const hit of execBounded(text, ASSIGN_PY, ctx.deadline)) {
    const m = captures(ASSIGN_PY, hit.text);
    if (!m) continue;
    const resolved = resolveString(m[2], env);
    if (resolved) env.set(m[1], resolved);
  }

  for (const hit of execBounded(text, CALL_ID, ctx.deadline)) {
    const m = captures(CALL_ID, hit.text);
    if (!m) continue;
    const name = m[1];
    const resolved = env.get(name);
    if (resolved && SINKS.has(resolved)) out.push(f(file.path, text, ctx, hit.index, resolved));
  }

  for (const hit of execBounded(text, CALL_MEMBER, ctx.deadline)) {
    const m = captures(CALL_MEMBER, hit.text);
    if (!m) continue;
    const callee = m[1];
    if (SINKS.has(callee)) continue;
    const resolved = resolveString(callee, env);
    if (resolved && SINKS.has(resolved)) out.push(f(file.path, text, ctx, hit.index, resolved));
  }

  for (const hit of execBounded(text, CALL_COMPUTED, ctx.deadline)) {
    const m = captures(CALL_COMPUTED, hit.text);
    if (!m) continue;
    const base = m[1];
    const prop = resolveString(m[2], env);
    if (!prop) continue;
    const baseResolved = KNOWN_BASES.has(base) ? base : resolveString(base, env);
    if (!baseResolved) continue;
    const full = `${baseResolved}.${prop}`;
    if (SINKS.has(full) || (KNOWN_BASES.has(base) && DANGEROUS_PROPS.has(prop))) {
      out.push(f(file.path, text, ctx, hit.index, full));
    }
  }

  for (const hit of execBounded(text, CALL_NEW, ctx.deadline)) {
    const m = captures(CALL_NEW, hit.text);
    if (!m) continue;
    const name = m[1];
    const resolved = env.get(name);
    if (resolved === "Function") out.push(f(file.path, text, ctx, hit.index, "Function"));
  }

  for (const hit of execBounded(text, CALL_GETATTR, ctx.deadline)) {
    const m = captures(CALL_GETATTR, hit.text);
    if (!m) continue;
    const full = `${m[1]}.${m[2]}`;
    if (SINKS.has(full)) out.push(f(file.path, text, ctx, hit.index, full));
  }

  return out;
}
