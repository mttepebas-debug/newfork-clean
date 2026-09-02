export const SCHEDULE_SIDEBAR_CALENDAR_COLLAPSE_EVENT =
  "organizer:schedule-sidebar-calendar-collapse";

export function requestScheduleSidebarCalendarCollapse(): boolean {
  if (typeof window === "undefined") return false;

  return !window.dispatchEvent(
    new CustomEvent(SCHEDULE_SIDEBAR_CALENDAR_COLLAPSE_EVENT, {
      cancelable: true,
    }),
  );
}
