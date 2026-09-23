import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

type World = {
  readonly password: string;
  readonly emails: Record<"ayse" | "emre" | "mehmet", string>;
};

const world: World = JSON.parse(
  readFileSync(new URL("../.world.json", import.meta.url), "utf8"),
);

async function signIn(page: Page, person: keyof World["emails"]) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(world.emails[person]);
  await page.getByLabel("Password").fill(world.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("an employee signs in and lands in Employee Hub", async ({ page }) => {
  await signIn(page, "emre");
  await expect(page).toHaveURL(/\/app\/employee-hub/);
});

test("a manager signs in and lands in the workspace, seeing only their own location", async ({
  page,
}) => {
  await signIn(page, "ayse");
  await expect(page).toHaveURL(/\/app\/workspace/);
  await page.goto("/app/schedule");
  const visible = (text: string) =>
    page.getByText(text, { exact: true }).filter({ visible: true });
  await expect(visible("Kadikoy").first()).toBeVisible();
  await expect(visible("Emre Person").first()).toBeVisible();
  await expect(page.getByText("Besiktas", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Mehmet Person", { exact: true })).toHaveCount(0);
});
