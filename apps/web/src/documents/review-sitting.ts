import type { FileChoices, FileReasons, Period } from "./review-decision";
import type { ReviewResult } from "./review-dock";
import type { ExtendPick, OptionPanel } from "./review-options";

// K1 decision 5 (Mert 23 Oct): what a manager typed or picked in the review drawer stays with its document while
// the page is open: across Previous / Next, a new revision, and closing and opening it again. Nothing is sent until
// its own command. Each value carries what it was typed for (the version under review, the document), so a value
// typed for a version that is gone gives way to what is saved.

export type ManagerTypedValues = {
  /** Each file's Approve or Reject; none at first (K1 decision 13). */
  choices: FileChoices;
  /** Each file's reason, kept when its file is approved again, so Reject brings it back. */
  reasons: FileReasons;
  /** The time to send a new one, when a file is rejected. */
  period: Period;
  /** An approved version opened for review again (K1 decision 2). */
  reviewAgain: boolean;
  /** The More options card open, with what was picked and typed in it (A2 Tur 6, mockup-spec 23). */
  panel: OptionPanel | null;
  extendPick: ExtendPick | null;
  /** Other's days, as typed. */
  extendOther: string;
  extensionReason: string;
  excuseReason: string;
  againReason: string;
  timezone: string;
};
export type ManagerDraft = {
  [K in keyof ManagerTypedValues]?: { for: string; value: ManagerTypedValues[K] };
};

/** One page's sitting: a draft per document, and the documents answered since the page opened with what was done. */
export type ReviewSitting = {
  subscribe(listener: () => void): () => void;
  /** The same object until it changes, so a reader can hold it. */
  draft(id: string): ManagerDraft;
  setDraft(id: string, next: (draft: ManagerDraft) => ManagerDraft): void;
  answered(id: string): boolean;
  /** What the Save that answered it did, for its dock. */
  result(id: string): ReviewResult | undefined;
  answer(id: string, result?: ReviewResult): void;
  /** A new change on an answered document: it is open again, and its result line gives way. */
  reopen(id: string): void;
};

const empty: ManagerDraft = Object.freeze({});

export function createReviewSitting(): ReviewSitting {
  const drafts = new Map<string, ManagerDraft>();
  const done = new Map<string, ReviewResult | undefined>();
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
    result: (id) => done.get(id),
    answer(id, result) {
      if (done.has(id) && done.get(id) === result) return;
      done.set(id, result);
      emit();
    },
    reopen(id) {
      if (!done.delete(id)) return;
      emit();
    },
  };
}
