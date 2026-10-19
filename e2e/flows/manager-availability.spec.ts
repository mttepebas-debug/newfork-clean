import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { signIn } from "../fixtures/world";
import { psql } from "../global-setup";

// The manager reads availability (KARARLAR "Müsaitlik giriş ekranı = 4 · Gün
// gün": "çekmecede salt okunur gün kutuları; Availability sayfasında kişi
// listesi ve seçilen kişinin haftası"; M2: only the employee changes it).
// Ayşe manages location K. Each test has its own employee there, whose week
// says Tuesday 6 PM – 10 PM.

const world: { readonly run: string } = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8"));
const sql = (query: string) => execSync(psql, { input: query, encoding: "utf8" }).trim();

function freshEmployee(tag: string) {
  const label = `${tag}${Math.random().toString(36).slice(2, 7)}`;
  sql(`select tests.person('${world.run}', '${label}', 'employee', array['K'], array['cook']);
    select tests.availability('${world.run}', '${label}', 2, '18:00', '22:00');`);
  const first = label.charAt(0).toUpperCase() + label.slice(1);
  return { label, first, name: `${first} Person` };
}
const managerNotes = (label: string) =>
  JSON.parse(
    sql(`select to_jsonb(r.notes)::text from public.manager_weekly_reminders r where r.employee_id = tests.id('${world.run}:${label}');`) || "null",
  ) as string[] | null;

async function open(browser: Browser, size: { width: number; height: number }, query: string): Promise<Page> {
  const phone = size.width < 700;
  const page = await (await browser.newContext({ viewport: size, hasTouch: phone, isMobile: phone })).newPage();
  await signIn(page, "ayse");
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto(`/app/availability?q=${encodeURIComponent(query)}`);
  return page;
}

test("desktop: Availability lists the person, shows their week, and the drawer reads it and keeps a note", async ({ browser }) => {
  const person = freshEmployee("mgrread");
  const page = await open(browser, { width: 1440, height: 900 }, person.name);
  const people = page.getByRole("navigation", { name: "Employees" });
  await expect(people.getByRole("button", { name: new RegExp(person.name) })).toBeVisible();
  const week = page.getByRole("region", { name: `Availability of ${person.name}` });
  await expect(week.getByText(/· Updated /)).toBeVisible();
  await expect(week.locator(".avr-sum")).toHaveText(`${person.first} prefers not to work Tue 6 PM – 10 PM.`);
  await expect(week.getByRole("listitem")).toHaveCount(7);
  await expect(week.getByRole("listitem").nth(1)).toContainText("Unavailable 6:00 PM – 10:00 PM");

  await week.getByRole("button", { name: "Open profile" }).click();
  const drawer = page.getByRole("tabpanel");
  await expect(drawer.getByText(`Read only. Only ${person.first} can change this.`)).toBeVisible();
  // M2: nothing in the employee's week to press.
  await expect(drawer.getByRole("radio")).toHaveCount(0);

  await page.getByRole("tab", { name: "Manager notes" }).click();
  await expect(page.getByText(`Only managers see these notes. ${person.first} doesn't.`)).toBeVisible();
  // One Mon–Sun list (S-185): the day's note sits under its hours, no second list.
  await expect(page.getByRole("heading", { name: "Hours and notes" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Day notes" })).toHaveCount(0);
  const days = page.getByRole("navigation", { name: "Days" });
  await days.getByRole("button", { name: /^Tuesday/ }).click();
  await page.getByRole("textbox", { name: "Tuesday note" }).fill("Leaves early for class");
  await expect(days.getByRole("button", { name: /^Tuesday/ })).toContainText("Leaves early for class");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  expect(managerNotes(person.label)?.[2]).toBe("Leaves early for class");
});

test("phone: a tap opens the person's page with the week, and a day's sheet keeps its note", async ({ browser }) => {
  const person = freshEmployee("mgrphone");
  const page = await open(browser, { width: 390, height: 844 }, person.name);
  // No status tabs on a phone (Mert, 2026-10-17): the list is everyone.
  await expect(page.getByRole("group", { name: "Submission status" })).toHaveCount(0);
  await page.getByRole("navigation", { name: "Employees" }).getByRole("button", { name: new RegExp(person.name) }).tap();
  await expect(page.getByRole("heading", { name: person.name })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Availability" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".avr-tile").nth(1)).toContainText("Unavailable 6:00 PM – 10:00 PM");
  // The boxes start right under the tabs (Mert, 2026-10-17): no lock line, no week sentence.
  await expect(page.getByText(`Read only. Only ${person.first} can change this.`)).toHaveCount(0);
  await expect(page.locator(".avr-sum")).toHaveCount(0);
  await page.getByRole("tab", { name: "Manager notes" }).tap();
  // One Mon–Sun list (S-185): a day opens in a sheet with its hours and its note.
  await expect(page.getByRole("list", { name: "Day notes" })).toHaveCount(0);
  await expect(page.locator(".avm-week .dav-row")).toHaveCount(7);
  await page.locator('.avm-week [data-weekday="2"]').tap();
  const sheet = page.getByRole("dialog", { name: "Tuesday" });
  await sheet.getByRole("textbox", { name: "Tuesday note" }).fill("Closes on Tuesdays");
  await sheet.getByRole("button", { name: "Done" }).tap();
  await expect(page.locator('.avm-week [data-weekday="2"]')).toContainText("Closes on Tuesdays");
  await page.getByRole("button", { name: "Save", exact: true }).tap();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  expect(managerNotes(person.label)?.[2]).toBe("Closes on Tuesdays");
  await page.getByRole("button", { name: "Availability" }).tap();
  await expect(page.getByRole("navigation", { name: "Employees" })).toBeVisible();
});
