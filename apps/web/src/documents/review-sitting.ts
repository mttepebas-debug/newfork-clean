import type { DocumentReviewCommand } from "@newfork/shared";

// K1 decision 5 (Mert 23 Oct): what a manager typed or picked in the review drawer stays with its document while
// the page is open: across Previous / Next, a new revision, and closing and opening it again. Nothing is sent until
// its own command. Each value carries what it was typed for (the version under review, the document), so a value
// typed for a version that is gone gives way to what is saved.

export type ManagerTypedValues = {
  reason: string;
  correction: "full" | "remaining";
  files: DocumentReviewCommand["files"];
  extensionDays: number;
  extensionReason: string;
  timezone: string;
};
export type ManagerDraft = {
  [K in keyof ManagerTypedValues]?: { for: string; value: ManagerTypedValues[K] };
};

/** One page's sitting: a draft per document and the documents answered since the page opened. */
export type ReviewSitting = {
  subscribe(listener: () => void): () => void;
  /** The same object until it changes, so a reader can hold it. */
  draft(id: string): ManagerDraft;
  setDraft(id: string, next: (draft: ManagerDraft) => ManagerDraft): void;
  answered(id: string): boolean;
  answer(id: string): void;
};

const empty: ManagerDraft = Object.freeze({});

export function createReviewSitting(): ReviewSitting {
  const drafts = new Map<string, ManagerDraft>();
  const done = new Set<string>();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    draft: (id) => drafts.get(id) ?? empty,
    setDraft(id, next) {
      const was = drafts.get(id) ?? empty;
      const now = next(was);
      if (now === was) return;
      if (Object.keys(now).length) drafts.set(id, now);
      else drafts.delete(id);
      emit();
    },
    answered: (id) => done.has(id),
    answer(id) {
      if (done.has(id)) return;
      done.add(id);
      emit();
    },
  };
}
