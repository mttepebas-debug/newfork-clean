import { expect, test } from "../fixtures/test";
import { signIn } from "../fixtures/world";

// The narrow rail's name boxes (RAIL-FLYOUT-FADE, Mert 2026-10-19): narrowing
// or widening the menu shows none of them; one fades in only as the pointer
// reaches an icon.
const flyoutMotions = (page: import("@playwright/test").Page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((animation) => {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        // The box under the pointer may fade in; it is the hover's, not the menu's.
        return target instanceof Element && target.matches(".rail-flyout") && !target.closest(":hover");
      }).length,
  );

test("narrowing and widening the menu shows no name boxes; hovering an icon fades one in", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "ayse");
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto("/app/workspace");
  const sidebar = page.getByRole("complementary", { name: "Application sidebar" });

  await sidebar.getByRole("button", { name: "Collapse menu" }).click();
  expect(await flyoutMotions(page)).toBe(0);
  await expect(sidebar.locator(".rail-flyout").filter({ hasText: "Workspace" })).toHaveCSS("opacity", "0");

  await sidebar.getByRole("link", { name: "Workspace" }).hover();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter((animation) => {
              const target = (animation.effect as KeyframeEffect | null)?.target;
              return target instanceof Element && target.matches(".rail-flyout") && target.textContent === "Workspace";
            }).length,
      ),
    )
    .toBeGreaterThan(0);
  await expect(sidebar.locator(".rail-flyout").filter({ hasText: "Workspace" })).toHaveCSS("opacity", "1");

  await page.mouse.move(900, 450);
  await sidebar.getByRole("button", { name: "Expand menu" }).click();
  expect(await flyoutMotions(page)).toBe(0);
});
