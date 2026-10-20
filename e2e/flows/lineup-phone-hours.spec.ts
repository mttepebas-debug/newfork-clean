import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { roundLabel, roundWeek, signIn } from "../fixtures/world";

// The phone Lineup's card says Shift · People · Hours on one line (E, 2026-10-17). On a 390 phone the hours were
// cut ("10:00 AM – 10:00 |", 2026-10-20): the hours never shorten now, a long shift name gives way instead.

const run: string = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8")).run;
const sql = (query: string) => execSync(psql, { input: query, encoding: "utf8" }).trim();

test("phone 390: the Lineup card shows the whole hours, the longest a day can have", async ({ browser }) => {
  // A week no other flow publishes.
  const week = roundWeek(760);
  sql(`select tests.publish_week('${run}', ${week}, '[
    {"label": "${roundLabel("emre-k-phone-hours")}", "person": "emre", "loc": "K", "job": "cook", "day": 1, "start": "10:00", "end": "22:00"}
  ]');`);
  const day = sql(`select tests.week(${week}) + 1;`);

  const page = await (
    await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  ).newPage();
  await signIn(page, "zeynep");
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto(`/app/schedule/lineup?date=${day}`);

  const hours = page.locator(".lineup-card-facts dt", { hasText: "Hours" }).first().locator("xpath=following-sibling::dd");
  await expect(hours).toHaveText("10:00 AM – 10:00 PM");
  // Whole on screen: nothing of it is clipped by its own box.
  const fit = await hours.evaluate((dd) => dd.scrollWidth <= dd.clientWidth);
  expect(fit).toBe(true);
});
