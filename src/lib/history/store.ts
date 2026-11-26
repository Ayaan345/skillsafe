import type { HistoryRecord, SavedView } from "./types";

const records = new Map<string, HistoryRecord>();
const views = new Map<string, SavedView>();
const listeners = new Set<() => void>();

function emit() { for (const l of listeners) l(); }

export function subscribeHistory(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function sessionRecords(): HistoryRecord[] {
  return [...records.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function sessionViews(): SavedView[] {
  return [...views.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function rememberScan(record: HistoryRecord): void {
  records.set(record.id, record);
  emit();
}

export function renameRecord(id: string, title: string): void {
  const found = records.get(id);
  if (!found) return;
  records.set(id, { ...found, title: title.slice(0, 120) });
  emit();
}

export function archiveRecords(ids: string[], archived: boolean): HistoryRecord[] {
  const previous: HistoryRecord[] = [];
  for (const id of ids) {
    const found = records.get(id);
    if (!found) continue;
    previous.push(found);
    records.set(id, { ...found, archivedAt: archived ? new Date().toISOString() : null });
  }
  emit();
  return previous;
}

export function restoreRecords(previous: HistoryRecord[]): void {
  for (const record of previous) records.set(record.id, record);
  emit();
}

export function forgetRecords(ids: string[]): HistoryRecord[] {
  const removed: HistoryRecord[] = [];
  for (const id of ids) {
    const found = records.get(id);
    if (found) { removed.push(found); records.delete(id); }
  }
  emit();
  return removed;
}

export function reorderRecords(orderedIds: string[]): void {
  const entries = orderedIds.map((id) => records.get(id)).filter((r): r is HistoryRecord => Boolean(r));
  const base = Date.now();
  entries.forEach((record, index) => {
    records.set(record.id, { ...record, createdAt: new Date(base - index * 1000).toISOString() });
  });
  emit();
}

export function saveView(view: SavedView): void { views.set(view.id, view); emit(); }
export function dropView(id: string): void { views.delete(id); emit(); }
export function clearHistory(): void { records.clear(); emit(); }
