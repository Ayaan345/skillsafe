import { RULE_BY_ID } from "../rules";
import { buildLineIndex, execBounded, lineAt, snippetAt } from "../text";
import type { Finding, ScanInputFile } from "../types";

const FRONTMATTER = /^---\n([\s\S]{0,4000}?)\n---/;
const NETWORK_SIGNAL = /\b(?:fetch|axios|XMLHttpRequest|requests\.(?:get|post|put)|urllib|httpx|https?\.(?:request|get)|net\.connect|socket|WebSocket|curl|wget|Invoke-RestMethod)\b/i;
const WRITE_SIGNAL = /\b(?:fs\.(?:writeFile|writeFileSync|appendFile|appendFileSync|rm|rmSync|rmdirSync)|writeFile\s{0,3}\(|open\s{0,3}\([^\n]{0,120}["'][wa]["']|shutil\.rmtree|rm\s{1,3}-[rRf]{1,4}|Remove-Item)\b/i;
const BENIGN_DESC = /\b(?:summariz|format|translat|lint|pretty|tidy|outline|extract)\w{0,20}\b/i;
const SECURITY_DESC = /\b(?:security|training|injection|awareness|education)\w{0,20}\b/i;

interface Declaration {
  file: string;
  text: string;
  index: number;
  description: string;
  noNetwork: boolean;
  readOnly: boolean;
}

function make(ruleId: string, file: string, text: string, index: number, why: string): Finding {
  const r = RULE_BY_ID[ruleId];
  const starts = buildLineIndex(text);
  return {
    ruleId: r.id,
    category: r.category,
    categoryName: r.categoryName,
    severity: r.severity,
    layer: r.layer,
    file,
    line: lineAt(starts, index),
    start: index,
    snippet: snippetAt(text, starts, index),
    why,
    fix: r.fix,
    confidence: 0.8,
  };
}

function parseDeclaration(file: ScanInputFile): Declaration | null {
  const lower = file.path.toLowerCase();

  if (lower.endsWith(".json")) {
    try {
      const obj = JSON.parse(file.content) as Record<string, unknown>;
      const description = typeof obj.description === "string" ? obj.description : "";
      const caps = JSON.stringify(obj.capabilities ?? obj.permissions ?? {}).toLowerCase();
      const noNetwork = /no[-_ ]?network|network["']?\s{0,3}:\s{0,3}(?:false|"none")|offline/.test(caps);
      const readOnly = /read[-_ ]?only|filesystem["']?\s{0,3}:\s{0,3}"?read|write["']?\s{0,3}:\s{0,3}false/.test(caps);
      if (!description && !noNetwork && !readOnly) return null;
      return { file: file.path, text: file.content, index: 0, description, noNetwork, readOnly };
    } catch {
      return null;
    }
  }

  const m = file.content.match(FRONTMATTER);
  if (!m) return null;
  const block = m[1];
  const desc = block.match(/description\s{0,3}:\s{0,3}([^\n]{1,300})/i);
  const description = desc ? desc[1].trim().replace(/^["']|["']$/g, "") : "";
  const noNetwork = /no[-_ ]?network|network\s{0,3}:\s{0,3}(?:false|none)|offline/i.test(block);
  const readOnly = /read[-_ ]?only|filesystem\s{0,3}:\s{0,3}read|write\s{0,3}:\s{0,3}false/i.test(block);
  if (!description && !noNetwork && !readOnly) return null;
  return { file: file.path, text: file.content, index: 0, description, noNetwork, readOnly };
}

export function detectManifest(files: ScanInputFile[], findings: Finding[], deadline: number): Finding[] {
  const out: Finding[] = [];
  const declarations = files.map(parseDeclaration).filter((d): d is Declaration => d !== null);
  if (declarations.length === 0) return out;

  for (const decl of declarations) {
    if (decl.noNetwork || decl.readOnly) {
      for (const file of files) {
        if (decl.noNetwork) {
          const net = execBounded(file.content, NETWORK_SIGNAL, deadline, 1)[0];
          if (net) {
            out.push(make(
              "man-001", file.path, file.content, net.index,
              `Manifest declares no-network/offline, but this file contains a network-call signal.`,
            ));
          }
        }
        if (decl.readOnly) {
          const write = execBounded(file.content, WRITE_SIGNAL, deadline, 1)[0];
          if (write) {
            out.push(make(
              "man-001", file.path, file.content, write.index,
              `Manifest declares read-only, but this file contains a filesystem-write/delete signal.`,
            ));
          }
        }
      }
    }

    if (
      decl.description &&
      BENIGN_DESC.test(decl.description) &&
      !SECURITY_DESC.test(decl.description) &&
      findings.some((f) => f.category === 1 || f.category === 4)
    ) {
      out.push(make(
        "man-002", decl.file, decl.text, decl.index,
        `Description claims a bounded task ("${decl.description.slice(0, 120)}"), but the body contains injection or code-risk findings.`,
      ));
    }
  }

  return out;
}
