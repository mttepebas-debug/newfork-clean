import type { DocumentObligationStatus } from "@newfork/shared";
import type { ReviewProgress } from "./review-decision";

// The dock of the manager's review drawer (A2 Tur 6, mockup-spec 15): one line, then one green button. The line says
// what the files still need, what Save will do, or what was just done; the green saves, goes to the next document
// still waiting, or closes. Real data only: no pronouns (the first name instead), no "is told" for an extension,
// which sends no notice (K1 decision 15).

/** What a Save did, kept with its document while the page is open. */
export type ReviewResult =
  | { kind: "approved"; at: string; expires: string | null }
  | {
      kind: "sent_back";
      at: string;
      /** The time the person has now: a new period, what was left, or none (no period). */
      time: { kind: "new"; days: number } | { kind: "left"; left: string } | null;
    }
  | { kind: "extended"; at: string; days: number }
  /** More options: an excuse (K1 decision 1), or an excuse taken back (K1 decision 3). */
  | { kind: "excused"; at: string }
  | { kind: "asked"; at: string };

export type ResultTone = "ok" | "red" | "warn" | "muted";
export type ResultLine = { tone: ResultTone; word: string; text: string; title: string };

function days(count: number): string {
  return `${count} ${count === 1 ? "day" : "days"}`;
}

/** What the files still need, or what Save will do with them. */
export function filesNote(
  progress: ReviewProgress,
  { phone, first, expires }: { phone: boolean; first: string; expires: string | null },
): string {
  if (progress.open) return `Approve or reject each file · ${progress.open} left`;
  if (progress.missingReason) return "Add a reason for each rejected file";
  if (!progress.rejected) return expires ? `Save approves it · On file until ${expires}` : "Save approves it";
  const how =
    progress.total === 1 ? "the file is rejected" : `${progress.rejected} of ${progress.total} files rejected`;
  return phone ? `Save sends it back · ${how}` : `Save sends it back to ${first} · ${how}`;
}

/** A document that waits on the person, with nothing to review: what can be done below, if anything. */
export function waitingNote({
  phone,
  first,
  label,
  extend,
  excuse,
}: {
  phone: boolean;
  first: string;
  /** The status in the manager's words, for a document with nothing to do. */
  label: string;
  extend: boolean;
  excuse: boolean;
}): string {
  if (extend && excuse)
    return phone
      ? "Nothing to review · Extend or excuse below"
      : `Nothing to review · Extend the deadline or excuse ${first} below`;
  if (excuse) return phone ? "Nothing to review · Excuse below" : `Nothing to review · Excuse ${first} below`;
  if (extend) return phone ? "Nothing to review · Extend below" : "Nothing to review · Extend the deadline below";
  return doneNote(label);
}

/** Nothing for the manager to do on this document. */
export function doneNote(label: string): string {
  return `${label} · Nothing to decide here.`;
}

/** K1 decision 12: an approved copy with an expiration date waits for the person's document time zone. */
export function timezoneNote(canManage: boolean): string {
  return canManage
    ? "Time zone needed · Choose the document time zone above and save it"
    : "Time zone needed · An administrator needs to set the document time zone";
}

/**
 * The line that says what a Save did: a bold word, then one sentence; " All caught up." when nothing else waits.
 * A phone says it in its short words, so the line fits; the title always holds the full sentence.
 */
export function resultLine(
  result: ReviewResult,
  {
    first,
    phone,
    end,
    now,
  }: {
    first: string;
    phone: boolean;
    /** Nobody else waits: the green closes. */
    end: boolean;
    /** The document as it reads now (refreshed): its status, its approved copy's expiry and its due date. */
    now: { status: DocumentObligationStatus; expiry: string | null; due: string | null };
  },
): ResultLine {
  const tail = end ? " All caught up." : "";
  let line: { tone: ResultTone; word: string; text: string; phoneWord?: string; phoneText?: string; phoneEnd?: string };
  switch (result.kind) {
    case "approved":
      line = {
        tone: "ok",
        word: "Approved",
        text: result.expires ? `On file until ${result.expires}. ${first} is told.` : `${first} is told.`,
        phoneEnd: result.expires ? `On file until ${result.expires}.` : `${first} is told.`,
      };
      break;
    case "sent_back": {
      // K1 decision 11: a renewal sent back while the old copy is still valid stays Completed.
      if (now.status === "completed") {
        const kept = `The approved copy stays on file${now.expiry ? ` until ${now.expiry}` : ""}.`;
        line = {
          tone: "red",
          word: "Sent back",
          text: `${first} is told why. ${kept}`,
          phoneText: `${first} is told why. The approved copy stays.`,
          phoneEnd: "The approved copy stays on file.",
        };
        break;
      }
      const time = result.time;
      line = {
        tone: "red",
        word: "Sent back",
        text: !time
          ? `${first} is told why.`
          : time.kind === "new"
            ? `${first} is told why and has a new ${days(time.days)}.`
            : `${first} is told why and has ${time.left} left.`,
        phoneEnd: !time
          ? `${first} is told why.`
          : time.kind === "new"
            ? `${first} has a new ${days(time.days)}.`
            : `${first} has ${time.left} left.`,
      };
      break;
    }
    case "extended":
      line = {
        tone: "warn",
        word: `Deadline extended ${days(result.days)}`,
        text: now.due ? `New due date ${now.due}.` : "The due date moved.",
        phoneWord: `Extended ${days(result.days)}`,
        phoneText: now.due ? `Due ${now.due}.` : "The due date moved.",
      };
      break;
    case "excused":
      line = { tone: "muted", word: "Excused", text: `${first} won't be asked for it.` };
      break;
    case "asked":
      // The server asks nothing while a valid approved copy is on file, and closes a document the person no longer
      // matches; the line follows the refreshed status.
      line = {
        tone: "muted",
        word: "Asked again",
        text:
          now.status === "completed"
            ? "The approved copy still counts. Nothing new is asked."
            : now.status === "removed"
              ? `${first} no longer needs this document.`
              : now.due
                ? `${first} needs to send it by ${now.due}.`
                : `${first} needs to send it again.`,
      };
      break;
  }
  const word = (phone && line.phoneWord) || line.word;
  const text = phone ? (end && line.phoneEnd) || line.phoneText || line.text : line.text;
  return { tone: line.tone, word, text: `${text}${tail}`, title: `${line.word} · ${line.text}${tail}` };
}

/**
 * What the drawer's polite region says once a Save went through (mockup-spec 19.1): what was done, then who waits
 * next, or that nothing waits anywhere.
 */
export function doneSaid(word: string, next: string | null, end: boolean): string {
  return `${word}.${next ? ` Next waiting: ${next}.` : end ? " All caught up." : ""}`;
}

export type Green = { act: "save"; off: boolean } | { act: "next"; id: string; label: string } | { act: "close" };

/** Save while something can be saved (on once it is ready); then the next document still waiting, or Close. */
export function greenFor({
  saving,
  ready,
  next,
}: {
  saving: boolean;
  ready: boolean;
  next: { id: string; label: string } | null;
}): Green {
  if (saving) return { act: "save", off: !ready };
  return next ? { act: "next", id: next.id, label: `Next: ${next.label}` } : { act: "close" };
}

/**
 * The green's meaning: for which document, what it does, where it goes, and for Save the panel it saves (mockup-spec
 * 17.1). Turning on is the same meaning.
 */
export function greenKey(documentId: string, green: Green, panel?: string | null): string {
  return `${documentId}|${green.act}|${green.act === "next" ? green.id : ""}${panel && green.act === "save" ? `|${panel}` : ""}`;
}
