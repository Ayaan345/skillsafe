export interface RuleHealthRow {
  ruleId: string;
  marked: number;
  restored: number;
  net: number;
}

const marks = new Map<string, { marked: number; restored: number }>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function recordMark(ruleId: string, dismissed: boolean): void {
  const entry = marks.get(ruleId) ?? { marked: 0, restored: 0 };
  if (dismissed) entry.marked += 1;
  else entry.restored += 1;
  marks.set(ruleId, entry);
  emit();
}

export function ruleHealth(): RuleHealthRow[] {
  return [...marks.entries()]
    .map(([ruleId, value]) => ({ ruleId, ...value, net: value.marked - value.restored }))
    .filter((row) => row.net > 0)
    .sort((a, b) => b.net - a.net || a.ruleId.localeCompare(b.ruleId));
}

export function clearFeedback(): void {
  marks.clear();
  emit();
}

export function subscribeFeedback(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function exportFeedback(): string {
  return JSON.stringify(
    {
      tool: "SkillSafe",
      kind: "false-positive-feedback",
      generatedAt: new Date().toISOString(),
      scope: "this browser session only",
      rows: ruleHealth(),
      note: "Counts only. No scan content, filenames, snippets, or hashes are included. Send this to the rule maintainer to retune confidence weights.",
    },
    null,
    2,
  );
}
