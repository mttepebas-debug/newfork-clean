import type { Locator } from "@playwright/test";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "2026-10-23" → "October 23, 2026", a calendar day's name. */
export const dayName = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/**
 * The time off form's days (Mert 2026-10-23): the field opens one calendar and each day is a click; a day in
 * another month is reached through the calendar's year and month pickers. From First day the first click is
 * the first day and the next the last day.
 */
export async function pickDays(form: Locator, field: "First day" | "Last day", ...days: string[]) {
  await form.getByRole("button", { name: new RegExp(`^${field}`) }).click();
  const calendar = form.getByRole("dialog", { name: /^Pick the/ });
  for (const day of days) {
    const cell = calendar.getByRole("gridcell", { name: dayName(day), exact: true });
    if (!(await cell.isVisible())) {
      await calendar.getByRole("button", { name: "Pick year" }).click();
      const year = calendar.getByRole("gridcell", { name: day.slice(0, 4), exact: true });
      for (let page = 0; !(await year.isVisible()); page += 1) {
        if (page > 10) throw new Error(`${day} is not in the calendar`);
        await calendar.getByRole("button", { name: "Next years" }).click();
      }
      await year.click();
      await calendar.getByRole("button", { name: "Pick month" }).click();
      await calendar.getByRole("gridcell", { name: MONTHS[Number(day.slice(5, 7)) - 1]!, exact: true }).click();
    }
    await cell.click();
  }
}
