import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { signIn, type Person } from "../fixtures/world";
import { ownJob, personWithPassword, publishedDocument, signInAs, tag } from "../fixtures/documents";

// One's own documents, a page of its own (MY-DOCUMENTS, Mert 2026-10-19):
// "mobil'de employee arayüzünde Documents sayfasını account'ın alt sayfası
// olmaktan çıkaralım ayrı bir parent sayfa olsun ve appde more un altında
// konumlansın". The employee interface has Documents (More on a phone, the
// menu on a desktop); management has My documents, only when the workspace
// asks the person for any. Account has no Documents; its old address leads on.

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

async function open(browser: Browser, size: typeof PHONE, who: Person | string): Promise<Page> {
  const phone = size.width < 700;
  const page = await (await browser.newContext({ viewport: size, hasTouch: phone, isMobile: phone })).newPage();
  if (who.includes("@")) await signInAs(page, who);
  else await signIn(page, who as Person);
  await expect(page).not.toHaveURL(/\/sign-in/);
  return page;
}

const more = (page: Page, nav: "Employee navigation" | "Main navigation") =>
  page.getByRole("navigation", { name: nav }).getByRole("button", { name: "More" });

test("phone: the employee's Documents opens from More as a page of her own interface", async ({ browser }) => {
  const emre = await open(browser, PHONE, "emre");
  await emre.goto("/app/employee-hub");
  await more(emre, "Employee navigation").tap();
  const sheet = emre.getByRole("dialog", { name: "More" });
  await sheet.getByRole("link", { name: /^Documents/ }).tap();
  await expect(emre).toHaveURL(/\/app\/employee-hub\/documents$/);
  await expect(sheet).toBeHidden();
  await expect(emre.getByRole("heading", { level: 1, name: /^Documents/ })).toBeVisible();
  // Her own frame: her bottom bar, More holding the open page.
  await expect(more(emre, "Employee navigation")).toHaveClass(/active/);
  await expect(emre.getByRole("tab", { name: "Policies & Agreements" })).toBeVisible();

  // My account has no Documents any more.
  await emre.goto("/account/profile");
  await expect(emre.getByRole("navigation", { name: "Account" }).getByRole("link", { name: /^Profile/ })).toBeVisible();
  await expect(emre.getByRole("navigation", { name: "Account" }).getByRole("link", { name: /^Documents/ })).toHaveCount(0);

  // The old address, still in notifications, opens the page with its query.
  await emre.goto("/account/documents?kind=acknowledgement");
  await expect(emre).toHaveURL(/\/app\/employee-hub\/documents\?kind=acknowledgement$/);
  await expect(emre.getByRole("tab", { name: "Policies & Agreements" })).toHaveAttribute("aria-selected", "true");
});

test("desktop: the employee's menu has Documents", async ({ browser }) => {
  const emre = await open(browser, DESKTOP, "emre");
  await emre.goto("/app/employee-hub");
  await emre.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: /^Documents/ }).click();
  await expect(emre).toHaveURL(/\/app\/employee-hub\/documents$/);
  await expect(emre.getByRole("heading", { level: 1, name: /^Documents/ })).toBeVisible();
});

test("management: My documents only for somebody the workspace asks, on a phone and a desktop", async ({ browser }) => {
  // Ayse manages and is asked for nothing: no My documents anywhere.
  const ayse = await open(browser, PHONE, "ayse");
  await ayse.goto("/app/workspace");
  await more(ayse, "Main navigation").tap();
  await expect(ayse.getByRole("dialog", { name: "More" }).getByRole("link", { name: /^My documents/ })).toHaveCount(0);

  // A manager whose job a required card is published for.
  const key = `mydoc${tag()}`;
  const jobId = ownJob(key, `Floor lead ${key}`);
  const manager = personWithPassword(`${key}-mgr`, "manager", ["K"], key);
  publishedDocument(`Food protection manager ${key}`, [jobId]);

  const phone = await open(browser, PHONE, manager);
  await phone.goto("/app/workspace");
  await more(phone, "Main navigation").tap();
  const sheet = phone.getByRole("dialog", { name: "More" });
  const row = sheet.getByRole("link", { name: "My documents, 1 waiting on you" });
  await expect(row).toBeVisible();
  // Just above Account.
  const labels = await sheet.locator("nav a .phone-more-label").allTextContents();
  expect(labels.indexOf("My documents")).toBe(labels.indexOf("Account") - 1);
  await row.tap();
  await expect(phone).toHaveURL(/\/app\/my-documents$/);
  await expect(phone.getByRole("heading", { level: 1, name: /^My documents/ })).toBeVisible();
  await expect(phone.getByRole("row", { name: new RegExp(`Food protection manager ${key}`) })).toBeVisible();
  // Management's own frame stays: its bottom bar.
  await expect(phone.getByRole("navigation", { name: "Main navigation" })).toBeVisible();

  const desktop = await open(browser, DESKTOP, manager);
  await desktop.goto("/app/workspace");
  await desktop.getByRole("link", { name: "My documents, 1 waiting on you" }).click();
  await expect(desktop).toHaveURL(/\/app\/my-documents$/);
  // The old address takes somebody who manages to My documents.
  await desktop.goto("/account/documents");
  await expect(desktop).toHaveURL(/\/app\/my-documents$/);
});
