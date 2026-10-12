import type { AnnouncementCategory } from "@newfork/shared";

/** How each announcement category reads on screen; Announcements, Important Dates and Schedule share it (EKRAN-08). */
export const announcementCategoryLabels: Record<AnnouncementCategory, string> = {
  general: "General",
  holiday: "Holiday",
  event: "Event",
  busy_day: "Busy day",
  celebration: "Celebration",
  inspection: "Inspection",
  staff_meeting: "Staff meeting",
  other: "Other",
};

/** Other reads as the name it was given. */
export function announcementCategoryLabel(
  category: AnnouncementCategory,
  other?: string | null,
): string {
  return category === "other" && other?.trim()
    ? other.trim()
    : announcementCategoryLabels[category];
}
