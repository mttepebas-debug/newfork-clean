import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

// The people global-setup made for this run (e2e/.world.json).
export type Person = "ali" | "ayse" | "deniz" | "emre" | "mehmet" | "zeynep";

const world: { readonly password: string; readonly emails: Record<Person, string> } =
  JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8"));

export const emailOf = (person: Person): string => world.emails[person];

// Signs in through the real sign-in screen.
export async function signIn(page: Page, person: Person) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(world.emails[person]);
  await page.getByLabel("Password").fill(world.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

// Draft names are unique per workspace and week, and the world is made once
// per run: a fixed name collides when a spec runs twice (--repeat-each, BL-203).
export const draftName = (base: string): string =>
  `${base} ${Math.random().toString(36).slice(2, 7)}`;
