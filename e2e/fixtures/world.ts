import { readFileSync } from "node:fs";
import { test, type Page } from "@playwright/test";

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

// An access token for a person, straight from the auth server: for a spec
// that calls the API the way a script would, past the screens.
export async function tokenOf(person: Person): Promise<string> {
  const response = await fetch(`${process.env.E2E_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: process.env.E2E_ANON_KEY ?? "", "Content-Type": "application/json" },
    body: JSON.stringify({ email: world.emails[person], password: world.password }),
  });
  const body = (await response.json()) as { access_token?: string };
  if (!response.ok || !body.access_token) throw new Error(`sign-in failed (${response.status})`);
  return body.access_token;
}

// Draft names are unique per workspace and week, and the world is made once
// per run: a fixed name collides when a spec runs twice (--repeat-each, BL-203).
export const draftName = (base: string): string =>
  `${base} ${Math.random().toString(36).slice(2, 7)}`;

// The world is made once per run, so each --repeat-each round of a spec needs
// its own weeks and its own builder labels (BL-203). Round 0 is unchanged.
export const round = (): number => test.info().repeatEachIndex;
export const roundWeek = (n: number): number => n + 10 * round();
export const roundLabel = (label: string): string => (round() ? `${label}-r${round()}` : label);
