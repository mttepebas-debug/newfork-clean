// The saved templates by id (name, revision, last change): the top bar, the edit
// strip and the save button tell a template on the grid from a schedule with it,
// and ./preview-source lets the page lay a template on the grid like a draft.
// Filled from the template list (on load, and whenever the window lists templates).
import { useSyncExternalStore } from "react";
import { call } from "./common";

export interface TemplateEntry {
  readonly name: string;
  readonly revision: number;
  readonly updated_at: string;
  readonly open_slot_count: number;
}
interface Listed extends TemplateEntry {
  readonly id: string;
}

let entries: ReadonlyMap<string, TemplateEntry> = new Map();
const listeners = new Set<() => void>();

function set(list: readonly Listed[]): void {
  const same = list.length === entries.size && list.every((item) => {
    const known = entries.get(item.id);
    return known?.name === item.name && known.revision === item.revision && known.updated_at === item.updated_at
      && known.open_slot_count === item.open_slot_count;
  });
  if (same) return;
  entries = new Map(list.map(({ id, name, revision, updated_at, open_slot_count }) => [id, { name, revision, updated_at, open_slot_count }]));
  listeners.forEach((listener) => listener());
}

export const templateNames = {
  set,
  get: (id: string | null | undefined): TemplateEntry | undefined => (id ? entries.get(id) : undefined),
  refresh(): void {
    void call<{ templates: Listed[] }>("/schedule/templates").then((data) => set(data.templates), () => undefined);
  },
  use(): ReadonlyMap<string, TemplateEntry> {
    return useSyncExternalStore(
      (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      () => entries,
    );
  },
};

templateNames.refresh();
