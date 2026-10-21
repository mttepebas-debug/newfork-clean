// Cards are coloured by the time of day they work, not by the job colour:
// in this workspace every job wears the same colour, and for a restaurant
// "lunch or dinner" is the first thing a manager reads.
import type { Shift, Week } from "../engine/model";
import { minutesOf } from "../engine/model";

export type Tone = "morning" | "day" | "evening" | "late" | "none";

export function toneOf(week: Week, shift: Pick<Shift, "start" | "shiftTypeId">): Tone {
  const start = minutesOf(shift.start) ?? minutesOf(week.shiftTypes.find((t) => t.id === shift.shiftTypeId)?.start ?? null);
  if (start === null) return "none";
  if (start < 10 * 60) return "morning";
  if (start < 15 * 60) return "day";
  if (start < 20 * 60) return "evening";
  return "late";
}

export const toneLabel: Record<Tone, string> = {
  morning: "Morning",
  day: "Daytime",
  evening: "Evening",
  late: "Late",
  none: "No time",
};

export function hueOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}
