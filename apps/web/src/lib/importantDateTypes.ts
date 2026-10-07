import type { ImportantDateType } from "@newfork/shared";

/** How each important date type reads on screen; Settings and Schedule share it (BL-611). */
export const importantDateTypeLabels: Record<ImportantDateType, string> = {
  holiday: "Holiday",
  event: "Event",
  blackout: "Blackout",
  closed_day: "Closed day",
};
