import type { DocumentObligation, DocumentReviewCommand } from "@newfork/shared";

// The manager's per-file review (A2 Tur 6, file buttons design a; Mert 23 Oct). Each file of the version under review
// is approved or rejected on its own; nothing is chosen at first, whatever the file stores (K1 decision 13). Save
// approves the document when every file is approved, and sends it back when one is rejected: the document's reason is
// made of the rejected files' reasons (K1 decision 10), each file's own reason is its note. The server's rules are
// today's: decide every file once, a reason of 500 characters at most, keep a file to approve.

export type FileChoice = "approve" | "reject";
export type FileChoices = Readonly<Record<string, FileChoice>>;
export type FileReasons = Readonly<Record<string, string>>;
export type Period = "full" | "remaining";
type ReviewFile = { id: string; filename: string };

/** The server takes a reason (and a file note) of 500 characters at most. */
export const reasonLimit = 500;

export type ReviewProgress = {
  total: number;
  /** Files with no choice yet. */
  open: number;
  rejected: number;
  /** Rejected files with no reason yet. */
  missingReason: number;
  /** Save can send it. */
  ready: boolean;
};

export function reviewProgress(
  files: readonly ReviewFile[],
  choices: FileChoices,
  reasons: FileReasons,
): ReviewProgress {
  let open = 0,
    rejected = 0,
    missingReason = 0;
  for (const file of files) {
    const choice = choices[file.id];
    if (!choice) open++;
    else if (choice === "reject") {
      rejected++;
      if (!(reasons[file.id] ?? "").trim()) missingReason++;
    }
  }
  return { total: files.length, open, rejected, missingReason, ready: open === 0 && missingReason === 0 };
}

function asSentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * The document's reason: each rejected file's reason as a sentence, named by its file when the version holds more
 * than one, joined; 500 characters at most, cut with an ellipsis (K1 decision 10).
 */
export function composeReason(files: readonly ReviewFile[], choices: FileChoices, reasons: FileReasons): string {
  const many = files.length > 1;
  const text = files
    .filter((file) => choices[file.id] === "reject")
    .map((file) => `${many ? `${file.filename}: ` : ""}${asSentence(reasons[file.id] ?? "")}`)
    .join(" ");
  return text.length <= reasonLimit ? text : `${text.slice(0, reasonLimit - 1).trimEnd()}…`;
}

/** What Save sends for the version under review; call it only when the review is ready. */
export function reviewCommand(input: {
  revision: number;
  submissionId: string;
  files: readonly ReviewFile[];
  choices: FileChoices;
  reasons: FileReasons;
  period: Period;
}): DocumentReviewCommand {
  const reject = input.files.some((file) => input.choices[file.id] === "reject");
  return {
    revision: input.revision,
    submission_id: input.submissionId,
    decision: reject ? "reject" : "approve",
    // BL-832: a reason typed for a file that was then approved is not the approval's.
    reason: reject ? composeReason(input.files, input.choices, input.reasons) : "",
    correction_period: reject ? input.period : "full",
    files: input.files.map((file) =>
      input.choices[file.id] === "reject"
        ? { id: file.id, decision: "discard", note: (input.reasons[file.id] ?? "").trim().slice(0, reasonLimit) }
        : { id: file.id, decision: "keep", note: "" },
    ),
  };
}

function days(count: number): string {
  return `${count} ${count === 1 ? "day" : "days"}`;
}

/** Whole days left, rounded down; under a day "less than a day". */
export function daysLeftLabel(seconds: number | null): string {
  if (!seconds || seconds <= 0) return days(0);
  const whole = Math.floor(seconds / 86_400);
  return whole === 0 ? "less than a day" : days(whole);
}

/**
 * "Time to send a new one" (K1 decision 9): a new period of the document's own length, or today's words when it has
 * none (the server then clears the deadline); what is left, only while some is (the server refuses it at none).
 */
export function periodChoices(obligation: Pick<DocumentObligation, "settings" | "remaining_seconds">): {
  full: string;
  remaining: { label: string; open: boolean };
} {
  const period = obligation.settings.period_days;
  return {
    full: period ? `A new ${days(period)}` : "Full correction period",
    remaining: {
      label: `What's left (${daysLeftLabel(obligation.remaining_seconds)})`,
      open: (obligation.remaining_seconds ?? 0) > 0,
    },
  };
}
