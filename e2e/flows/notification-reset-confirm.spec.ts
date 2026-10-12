import { expect, test } from "../fixtures/test";
import { signIn } from "../fixtures/world";

// BL-1011: Settings → Notifications wipes saved policies with "Reset all
// policies". It is red, and nothing is reset until a second click confirms.
// Zeynep (admin) writes notification settings.

test("Reset all policies takes a second click before anything is reset", async ({ page }) => {
  await signIn(page, "zeynep");
  await expect(page).not.toHaveURL(/\/sign-in/);

  const resets: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" && /notification/i.test(request.url()) && /reset/i.test(request.url()))
      resets.push(request.url());
  });

  await page.goto("/app/settings/notifications");
  await page.getByLabel("Reset reason").fill("End of season clean-up");
  const resetAll = page.getByRole("button", { name: "Reset all policies", exact: true });
  await expect(resetAll).toBeEnabled();
  await resetAll.click();

  const confirm = page.getByRole("button", { name: "Confirm reset all", exact: true });
  await expect(confirm).toBeVisible();
  expect(resets).toHaveLength(0);

  await confirm.click();
  await expect(page.getByRole("status").filter({ hasText: /notification polic(y|ies) reset\.$/ })).toBeVisible();
  expect(resets).toHaveLength(1);
});
