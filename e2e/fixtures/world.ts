import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

// The people global-setup made for this run (e2e/.world.json).
export type Person = "ayse" | "emre" | "mehmet" | "zeynep";

const world: { readonly password: string; readonly emails: Record<Person, string> } =
  JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8"));

// Signs in through the real sign-in screen.
export async function signIn(page: Page, person: Person) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(world.emails[person]);
  await page.getByLabel("Password").fill(world.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}
