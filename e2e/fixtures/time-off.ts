import { expect, type Locator } from "@playwright/test";

/** "2026-10-23" → "October 23, 2026", a calendar day's name. */
export const dayName = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/**
 * The time off form's days (Mert 2026-10-23): the field opens one calendar and each day is a click, a month on
 * until it shows. From First day the first click is the first day and the next the last day.
 */
export async function pickDays(form: Locator, field: "First day" | "Last day", ...days: string[]) {
  await form.getByRole("button", { name: new RegExp(`^${field}`) }).click();
  const calendar = form.getByRole("dialog", { name: /^Pick the/ });
  for (const day of days) {
    const cell = calendar.getByRole("gridcell", { name: dayName(day), exact: true });
    for (let month = 0; !(await cell.isVisible()); month += 1) {
      if (month > 24) throw new Error(`${day} is not in the calendar`);
      const shown = await calendar.getByRole("grid").getAttribute("aria-label");
      await calendar.getByRole("button", { name: "Next month" }).click();
      await expect(calendar.getByRole("grid")).not.toHaveAttribute("aria-label", shown!);
    }
    await cell.click();
  }
}
