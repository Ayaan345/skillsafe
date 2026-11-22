import { RULE_BY_ID } from "../rules";
import { buildLineIndex, execBounded, lineAt, snippetAt } from "../text";
import type { Finding, ScanInputFile, Severity } from "../types";
import { detectIndirection } from "./indirection";
import { detectLexical } from "./lexical";

const NPM_POPULAR = new Set([
  "react", "react-dom", "lodash", "express", "axios", "chalk", "commander", "inquirer",
  "webpack", "babel-core", "eslint", "prettier", "jest", "mocha", "chai", "typescript",
  "ts-node", "nodemon", "dotenv", "cors", "moment", "dayjs", "uuid", "rxjs", "vue",
  "angular", "svelte", "next", "nuxt", "vite", "rollup", "parcel", "tailwindcss",
  "postcss", "autoprefixer", "sass", "less", "jquery", "bootstrap", "three", "d3",
]);

const PY_POPULAR = new Set([
  "requests", "numpy", "pandas", "flask", "django", "fastapi", "pytest", "setuptools",
  "pip", "wheel", "sqlalchemy", "celery", "redis", "boto3", "botocore", "aiohttp",
  "httpx", "beautifulsoup4", "lxml", "pillow", "matplotlib", "scipy", "scikit-learn",
  "tensorflow", "torch", "transformers", "pydantic", "click", "typer", "rich",
  "cryptography", "pyyaml", "jinja2", "gunicorn", "uvicorn", "black", "ruff", "mypy",
]);

const REQ_LINE = /^\s{0,3}([A-Za-z0-9_.-]{1,100})\s{0,3}(?:[=<>!~]=?\s{0,3}[A-Za-z0-9_.+-]{1,50})?/gm;
const HOOK_KEYS = new Set(["preinstall", "install", "postinstall", "prepare"]);

function editDistance2(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3;
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const val = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      curr[j] = val;
      if (val < rowMin) rowMin = val;
    }
    if (rowMin > 2) return 3;
    prev = curr;
  }
  return prev[n];
}

function nearestPopular(name: string, popular: Set<string>): string | null {
  const bare = name.startsWith("@") ? name.split("/").pop() ?? name : name;
  if (popular.has(bare)) return null;
  for (const p of popular) {
    const d = editDistance2(bare, p);
    if (d === 1 || d === 2) return p;
  }
  return null;
}

function make(ruleId: string, file: string, text: string, index: number, why: string, severity?: Severity): Finding {
  const r = RULE_BY_ID[ruleId];
  const starts = buildLineIndex(text);
  return {
    ruleId: r.id,
    category: r.category,
    categoryName: r.categoryName,
    severity: severity ?? r.severity,
    layer: r.layer,
    file,
    line: lineAt(starts, index),
    start: index,
    snippet: snippetAt(text, starts, index),
    why,
    fix: r.fix,
    confidence: 0.75,
  };
}

function codeRiskFindings(script: string, path: string, deadline: number): Finding[] {
  const file: ScanInputFile = { path, content: script };
  const ctx = { starts: buildLineIndex(script), deadline };
  const lexical = detectLexical(file, script, ctx).filter((x) => x.category === 4);
  const indirect = detectIndirection(file, script, ctx);
  return [...lexical, ...indirect];
}

export function detectSupply(files: ScanInputFile[], deadline: number): Finding[] {
  const out: Finding[] = [];

  for (const file of files) {
    const lower = file.path.toLowerCase();

    if (lower.endsWith("package.json")) {
      let pkg: unknown;
      try {
        pkg = JSON.parse(file.content);
      } catch {
        continue;
      }
      if (!pkg || typeof pkg !== "object") continue;
      const record = pkg as Record<string, unknown>;

      const depGroups = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
      for (const group of depGroups) {
        const deps = record[group];
        if (!deps || typeof deps !== "object") continue;
        for (const name of Object.keys(deps as Record<string, unknown>)) {
          const near = nearestPopular(name, NPM_POPULAR);
          if (!near) continue;
          const index = file.content.indexOf(`"${name}"`);
          out.push(make(
            "sup-001", file.path, file.content, Math.max(0, index),
            `Dependency "${name}" is within edit-distance 2 of popular package "${near}".`,
          ));
        }
      }

      const scripts = record.scripts;
      if (scripts && typeof scripts === "object") {
        for (const [key, value] of Object.entries(scripts as Record<string, unknown>)) {
          if (!HOOK_KEYS.has(key) || typeof value !== "string") continue;
          const risks = codeRiskFindings(value, `${file.path}:scripts.${key}`, deadline);
          for (const risk of risks) {
            const severity: Severity = risk.severity === "CRITICAL" ? "CRITICAL" : "HIGH";
            out.push(make(
              "sup-002", file.path, file.content, Math.max(0, file.content.indexOf(value)),
              `Lifecycle hook "${key}" trips ${risk.ruleId}: ${risk.why}`,
              severity,
            ));
          }
        }
      }
    }

    if (lower.endsWith("requirements.txt")) {
      for (const hit of execBounded(file.content, REQ_LINE, deadline)) {
        const m = new RegExp(REQ_LINE.source, REQ_LINE.flags.replace("g", "")).exec(hit.text);
        if (!m) continue;
        const name = m[1].split("[")[0];
        const near = nearestPopular(name, PY_POPULAR);
        if (!near) continue;
        out.push(make(
          "sup-001", file.path, file.content, hit.index,
          `Dependency "${name}" is within edit-distance 2 of popular package "${near}".`,
        ));
      }
    }
  }

  return out;
}
