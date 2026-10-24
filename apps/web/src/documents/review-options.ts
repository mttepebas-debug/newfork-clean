// More options at the end of the manager's Details (A2 Tur 6, mockup-spec 8-10; Mert 23 Oct): selectable cards, one
// open at a time, each with its own panel and one change per Save. The rules are today's (K1 decisions 1 and 3):
// Extend only where today's drawer offers it (the server refuses the rest), Excuse on a document not excused, and
// on an excused one Ask for it again, today's Remove exemption.

export type OptionPanel = "extend" | "excuse" | "again";
export type ExtendPick = "3" | "7" | "14" | "other";

/** Add time's choices, in their order. */
export const extendPicks: readonly { value: ExtendPick; label: string }[] = [
  { value: "3", label: "+3 days" },
  { value: "7", label: "+7 days" },
  { value: "14", label: "+14 days" },
  { value: "other", label: "Other" },
];

/** The cards this document has, in their order. */
export function optionCards(can: { extend: boolean; excuse: boolean; again: boolean }): OptionPanel[] {
  const cards: OptionPanel[] = [];
  if (can.extend) cards.push("extend");
  if (can.excuse) cards.push("excuse");
  if (can.again) cards.push("again");
  return cards;
}

/** A panel by its card's label, for the line under the files while it is open. */
export function panelName(panel: OptionPanel, first: string): string {
  return panel === "extend" ? "Extend deadline" : panel === "excuse" ? `Excuse ${first}` : "Ask for it again";
}

/** Other's days: whole days from 1 to 3,650, as the server takes them; anything else is none. */
export function otherDays(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,4}$/.test(trimmed)) return null;
  const days = Number(trimmed);
  return days >= 1 && days <= 3650 ? days : null;
}

/** The days a pick adds: its own, or Other's typed ones; none without a pick or with a bad number. */
export function extendDays(pick: ExtendPick | null, other: string): number | null {
  if (!pick) return null;
  return pick === "other" ? otherDays(other) : Number(pick);
}

/** The new deadline: the old one plus whole days, as the server moves it. */
export function extendedDeadline(deadline: string, days: number): string {
  return new Date(Date.parse(deadline) + days * 86_400_000).toISOString();
}

export type PanelNeed = "pick" | "days" | "reason" | null;
export type PanelState = { need: PanelNeed; ready: boolean };

/** Excuse and Ask for it again need a reason that is more than spaces. */
export function reasonState(reason: string): PanelState {
  return reason.trim() ? { need: null, ready: true } : { need: "reason", ready: false };
}

/** What Extend still needs (a pick, good days, a reason), with the days and the new deadline once known. */
export function extendState(
  typed: { pick: ExtendPick | null; other: string; reason: string },
  deadline: string,
): PanelState & { days: number | null; due: string | null } {
  const days = extendDays(typed.pick, typed.other);
  const due = days === null ? null : extendedDeadline(deadline, days);
  const need: PanelNeed = !typed.pick ? "pick" : days === null ? "days" : !typed.reason.trim() ? "reason" : null;
  return { need, ready: need === null, days, due };
}

/** The dock's line while a panel is open: what it still needs, then what Save will do. */
export function panelNote(
  panel: OptionPanel,
  state: PanelState,
  { first, due }: { first: string; due: string | null },
): string {
  if (panel === "extend") {
    if (state.need === "pick") return "Choose how much time to add";
    if (state.need === "days") return "Enter 1 to 3,650 days";
    if (state.need === "reason") return `Add a reason ${first} will see`;
    return due ? `Save moves the due date to ${due}` : "Save moves the due date";
  }
  if (panel === "excuse")
    return state.ready ? `Save excuses ${first} from this document` : `Add a reason to excuse ${first}`;
  return state.ready ? `Save asks ${first} for this document again` : `Add a reason to ask ${first} again`;
}
