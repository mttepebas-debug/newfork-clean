import { fireEvent, within } from "@testing-library/react";

/** "2035-01-12" → "January 12, 2035", a calendar day's name. */
export const dayName = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Opens the days' calendar from a field and clicks each day, a month on at a time until it shows. */
export function pickDays(form: HTMLElement, field: "First day" | "Last day", ...days: string[]) {
  fireEvent.click(within(form).getByRole("button", { name: new RegExp(`^${field}`) }));
  for (const day of days) {
    const calendar = within(form).getByRole("dialog", { name: /^Pick the/ });
    while (!within(calendar).queryByRole("gridcell", { name: dayName(day) })) {
      fireEvent.click(within(calendar).getByRole("button", { name: "Next month" }));
    }
    fireEvent.click(within(calendar).getByRole("gridcell", { name: dayName(day) }));
  }
}
