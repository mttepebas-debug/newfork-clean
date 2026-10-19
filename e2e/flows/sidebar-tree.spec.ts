import { expect, test } from "../fixtures/test";
import { signIn } from "../fixtures/world";

// The desktop left menu as a tree (SIDEBAR-TREE, S-175): Lineup hangs under
// Schedule, Requests has its own row, the group closes even on the Lineup page
// and the parent then stands for it, and the narrow rail keeps every group open.
test("a manager closes and opens Schedule's group from the Lineup page, wide and narrow", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "ayse");
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto("/app/schedule/lineup");

  const sidebar = page.getByRole("complementary", { name: "Application sidebar" });
  const primary = sidebar.getByRole("navigation", { name: "Primary" });
  const schedule = primary.getByRole("link", { name: "Schedule", exact: true });
  const lineup = primary.getByRole("link", { name: "Lineup", exact: true });
  const requests = primary.getByRole("link", { name: "Requests", exact: true });

  await expect(lineup).toHaveAttribute("aria-current", "page");
  await expect(lineup).toBeVisible();
  // Requests is no longer inside Schedule's group.
  await expect(page.locator(".nav-children").filter({ has: requests })).toHaveCount(0);

  await primary.getByRole("button", { name: "Collapse Schedule" }).click();
  await expect(lineup).toBeHidden();
  await expect(schedule).toHaveAttribute("aria-current", "location");
  await expect(page).toHaveURL(/\/app\/schedule\/lineup$/);

  // Narrow rail: no toggle there, so the group shows its page again.
  await sidebar.getByRole("button", { name: "Collapse menu" }).click();
  await expect(primary.getByRole("link", { name: "Lineup" })).toBeVisible();
  await sidebar.getByRole("button", { name: "Expand menu" }).click();
  await expect(lineup).toBeHidden();

  await primary.getByRole("button", { name: "Expand Schedule" }).click();
  await expect(lineup).toBeVisible();
  await expect(lineup).toHaveAttribute("aria-current", "page");
  await expect(schedule).not.toHaveAttribute("aria-current", /.+/);

  await requests.click();
  await expect(page).toHaveURL(/\/app\/schedule\/requests$/);
  await expect(requests).toHaveAttribute("aria-current", "page");
});

test("with reduced motion an opened group drops its clip at once, so the focus ring shows whole", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page, "ayse");
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto("/app/schedule");

  const primary = page.getByRole("navigation", { name: "Primary" });
  await primary.getByRole("button", { name: "Collapse Schedule" }).click();
  await primary.getByRole("button", { name: "Expand Schedule" }).click();
  const overflow = await page
    .locator(".nav-children[data-open='true'] > .nav-children-inner")
    .first()
    .evaluate((element) => getComputedStyle(element).overflow);
  expect(overflow).toBe("visible");
});
