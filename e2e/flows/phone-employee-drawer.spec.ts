import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { signIn } from "../fixtures/world";

// EMP-MOBIL (Mert 2026-10-20): on a phone, Employees → Add. The footer's Cancel, Invite, Next and Select a role
// ran off the bottom of the screen; on Employment the red band lay over Back and Invite, and after Save the green
// "Employee saved." band over the buttons too; the Employment body moved every way when pulled; the Documents
// table was wider than its box. The footer holds its controls, nothing lies over them, the body stays put, the
// table fits.

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

async function phone(page: Page, path: string) {
  await signIn(page, "zeynep");
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto(path);
}

/** Every control inside the footer and on screen, the buttons on one row, the role picker on its own row above them. */
async function footerHolds(drawer: Locator) {
  const footer = drawer.locator(".employee-drawer-footer");
  await expect(footer).toBeVisible();
  const at = await footer.evaluate((element) => {
    const box = (node: Element) => node.getBoundingClientRect();
    const own = box(element);
    const buttons = [...element.querySelectorAll(".employee-drawer-actions .nf-button")].map((node) => ({
      name: node.textContent?.trim(),
      ...box(node).toJSON(),
    }));
    const role = element.querySelector("select");
    return { footer: own.toJSON(), buttons, role: role ? box(role).toJSON() : null, screen: innerHeight };
  });
  expect(at.buttons.length).toBeGreaterThan(1);
  expect(at.footer.bottom, "the footer ends on screen").toBeLessThanOrEqual(at.screen + 0.5);
  for (const button of at.buttons) {
    expect(button.top, `${button.name} starts inside the footer`).toBeGreaterThanOrEqual(at.footer.top - 0.5);
    expect(button.bottom, `${button.name} ends inside the footer`).toBeLessThanOrEqual(at.footer.bottom + 0.5);
    expect(Math.abs(button.top - at.buttons[0]!.top), `${button.name} on the buttons' row`).toBeLessThan(1);
  }
  if (at.role) {
    expect(at.role.top).toBeGreaterThanOrEqual(at.footer.top - 0.5);
    expect(at.role.bottom, "the role picker sits above the buttons").toBeLessThanOrEqual(at.buttons[0]!.top);
  }
}

/** Nothing lies over it: a tap at its middle lands on it. */
async function onTop(control: Locator) {
  await expect(control).toBeInViewport({ ratio: 1 });
  const hit = await control.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const at = (y: number) => {
      const node = document.elementFromPoint(box.left + box.width / 2, y);
      return node !== null && (node === element || element.contains(node));
    };
    // Its top edge too: a band over the footer's top cut the buttons' upper half.
    return at(box.top + 3) && at(box.top + box.height / 2);
  });
  expect(hit, "nothing lies over it").toBe(true);
}

test.describe("phone", () => {
  test.use(PHONE);

  test("Employees → Add: the footer holds its buttons, nothing lies over them, the body stays put", async ({ page }) => {
    await phone(page, "/app/employees?mode=create&section=profile");
    const drawer = page.locator(".employee-drawer");
    await drawer.getByLabel("First name", { exact: true }).fill("Phone");
    await drawer.getByLabel("Last name", { exact: true }).fill(`Footer ${Date.now().toString(36)}`);
    await drawer.getByLabel("E-mail", { exact: true }).fill(`phone.footer.${Date.now()}@example.test`);
    await footerHolds(drawer);
    for (const name of ["Cancel", "Invite", "Next"]) await onTop(drawer.getByRole("button", { name, exact: true }));

    await drawer.getByRole("button", { name: "Next", exact: true }).click();
    const body = drawer.locator(".employee-section-scroll");
    await expect(body).toHaveAttribute("data-section", "employment");
    // The red band says what is missing; Back and Invite stay whole under it.
    await expect(drawer.locator(".window-alert[role='status']")).toBeVisible();
    await footerHolds(drawer);
    for (const name of ["Back", "Invite", "Save"]) await onTop(drawer.getByRole("button", { name, exact: true }));

    // Pulled past its ends, the body holds still and never goes sideways; nothing in it is wider than it.
    const scroll = await body.evaluate((element) => {
      const style = getComputedStyle(element);
      const right = element.getBoundingClientRect().right;
      return {
        overscroll: [style.overscrollBehaviorX, style.overscrollBehaviorY],
        overflowX: style.overflowX,
        wider: [...element.querySelectorAll("input, select, label, fieldset")]
          .filter((node) => node.getBoundingClientRect().right > right + 0.5)
          .map((node) => node.outerHTML.slice(0, 80)),
      };
    });
    expect(scroll.overscroll).toEqual(["none", "none"]);
    expect(scroll.overflowX).toBe("hidden");
    expect(scroll.wider).toEqual([]);

    // Saved without an invitation: the green band and the drawer's buttons both whole.
    await drawer.locator(".employee-assignment-picker").first().getByRole("checkbox").first().check();
    await drawer.locator(".employee-assignment-picker").nth(1).getByRole("checkbox", { disabled: false }).first().check();
    await drawer.getByRole("button", { name: "Save", exact: true }).click();
    const saved = drawer.locator(".employee-drawer-notice[role='status']");
    await expect(saved).toContainText("Employee saved.");
    await footerHolds(drawer);
    for (const button of await drawer.locator(".employee-drawer-actions .nf-button").all()) await onTop(button);
    const [band, footer] = [await saved.boundingBox(), await drawer.locator(".employee-drawer-footer").boundingBox()];
    expect(band!.y + band!.height, "the green band ends where the footer starts").toBeLessThanOrEqual(footer!.y + 0.5);
  });

  test("Employees → Documents: the table fits its box, Status on screen", async ({ page }) => {
    await phone(page, "/app/employees/documents");
    const wrap = page.locator(".employee-table-wrap");
    await expect(wrap.getByRole("table", { name: "Employee documents" })).toBeVisible();
    const fit = await wrap.evaluate((element) => ({ scroll: element.scrollWidth, box: element.clientWidth }));
    expect(fit.scroll, "no sideways scroll in the table's box").toBeLessThanOrEqual(fit.box);
    await expect(wrap.getByRole("columnheader", { name: /Status/ })).toBeInViewport({ ratio: 1 });
  });
});
