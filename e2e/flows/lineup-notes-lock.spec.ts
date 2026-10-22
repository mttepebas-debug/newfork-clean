import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Locator } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { roundLabel, roundWeek, signIn, tokenOf } from "../fixtures/world";

// S-238 (Mert 2026-10-21): on the phone, a tap on Notes opens a draft lineup's notes to edit, no pencil step. Once
// the lineup is published, its notes open read only with nothing to edit them, and the server refuses a note
// written past the screen until Edit takes the lineup back.

// The pane slides in when its tab changes: a picture waits for it to land.
const settled = (pane: Locator) =>
  pane.evaluate((node) => Promise.all(node.getAnimations({ subtree: true }).map((animation) => animation.finished)));

const run: string = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8")).run;

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

test("a phone's Notes opens a draft's notes to edit and a published one's read only", async ({ browser }) => {
  const week = roundWeek(680);
  const label = roundLabel("emre-k-lineup-notes");
  sql(`select tests.publish_week('${run}', ${week}, '[
    {"label": "${label}", "person": "emre", "loc": "K", "job": "cook", "day": 4, "start": "16:00", "end": "22:00"}
  ]');`);
  const day = sql(`select tests.week(${week}) + 4;`);
  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await signIn(phone, "ayse");
  await expect(phone).not.toHaveURL(/\/sign-in/);
  await phone.goto(`/app/schedule/lineup?date=${day}&location=${sql(`select tests.id('${run}:K');`)}`);
  const card = phone.getByRole("region", { name: /^Kadikoy, / });
  await expect(card.getByText("Draft", { exact: true })).toBeVisible();

  // The draft: a tap on Notes and the notes are there to type in, no Edit notes on the way.
  await card.getByRole("tab", { name: "Notes" }).tap();
  const pane = phone.getByRole("tabpanel");
  const specials = pane.getByPlaceholder("Tonight's specials");
  await expect(specials).toBeVisible();
  await expect(phone.getByRole("button", { name: "Edit notes" })).toHaveCount(0);
  await expect(pane.getByText("Staff see the notes when you publish.")).toBeVisible();
  await settled(pane);
  await phone.screenshot({ path: test.info().outputPath("lineup-notes-390-draft.png") });
  await specials.fill("Halibut, $34");
  const saved = phone.waitForRequest((request) => request.url().endsWith("/lineups/edit") && request.method() === "POST");
  await pane.getByRole("button", { name: "Save", exact: true }).tap();
  const edit = await saved;
  await expect(pane.getByRole("region", { name: "Notes" })).toContainText("Halibut, $34");

  // Published from the phone's Publish.
  await phone.getByRole("button", { name: /^Publish, \d+ lineups? waiting$/ }).tap();
  const window = phone.getByRole("dialog", { name: "Publish lineups" });
  await window.getByRole("button", { name: /^Publish \d+$/ }).tap();
  await expect(window).toHaveCount(0);
  await expect(card.getByText("Live", { exact: true })).toBeVisible();

  // Its notes open read only: no box, no button, no pencil.
  await card.getByRole("tab", { name: /^Notes/ }).tap();
  await expect(pane.getByRole("region", { name: "Notes" })).toContainText("Halibut, $34");
  await expect(pane.getByRole("textbox")).toHaveCount(0);
  await expect(pane.getByRole("button")).toHaveCount(0);
  await expect(pane.locator("svg.lucide-pencil")).toHaveCount(0);
  await settled(pane);
  await phone.screenshot({ path: test.info().outputPath("lineup-notes-390-published.png") });

  // The server holds it too: a note sent past the screen is refused until Edit takes the lineup back.
  const body = { ...edit.postDataJSON(), command_id: crypto.randomUUID(), notes: { specials: "Sneaked in" } };
  const response = await fetch(edit.url(), {
    method: "POST",
    headers: { Authorization: `Bearer ${await tokenOf("ayse")}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(400);
  expect(((await response.json()) as { reason?: string }).reason).toBe("lineup.live");
});
