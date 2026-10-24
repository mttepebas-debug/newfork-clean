import type { Locator } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { emailOf } from "../fixtures/world";
import {
  ownJob,
  personWithPassword,
  publishedDocument,
  sentWithFiles,
  signInAs,
  standing,
  tag,
} from "../fixtures/documents";

// K1 (A2 Tur 6, Mert 23 Oct: "Görsel olarak herşey harika … direk implement edebilirsin"): on a phone the manager
// reviews a document in the bottom card. Each file is approved or rejected on its own; a rejected one takes a quick
// reason; Save sends the document back, which the manager reads as Missing; the one green then goes on to the next
// person still waiting. The rules are today's: one rejected file sends the document back, the kept one carries over
// to the person's next version.
//
// The two versions are sent past the screens (sentWithFiles): their files are not in storage, so no file is opened.

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** A finger lifts and comes back: taps closer than 400 ms in one spot are one gesture to the drawer (mockup-spec 17). */
async function tap(control: Locator) {
  await control.page().waitForTimeout(450);
  await control.tap();
}

test("phone: the manager rejects a file with a quick reason in the bottom card, saves, reads Missing and goes on", async ({
  page,
}) => {
  // Two people, a published document and two versions sent are built in SQL first: 45 s once on a busy local DB.
  test.slow();
  const key = `doc${tag()}`;
  const title = `Food handler card ${key}`;
  const jobId = ownJob(key, `Barista ${key}`);
  const ada = personWithPassword(`${key}-ada`, "employee", ["K"], key);
  const bo = personWithPassword(`${key}-bo`, "employee", ["K"], key);
  const documentId = publishedDocument(title, [jobId]);
  sentWithFiles(documentId, ada, ["card-front.pdf", "card-back.pdf"]);
  sentWithFiles(documentId, bo, ["card.pdf"]);
  expect(standing(documentId, ada)).toBe("awaiting_review pending_review");
  expect(standing(documentId, bo)).toBe("awaiting_review pending_review");

  // Employees > Documents opens on Needs review; the search keeps this test's two rows.
  await signInAs(page, emailOf("zeynep"));
  await page.goto("/app/employees/documents");
  await page.getByLabel("Search employee documents").fill(key);
  const rows = page.getByRole("table", { name: "Employee documents" }).getByRole("row", { name: new RegExp(title) });
  await expect(rows).toHaveCount(2);
  await tap(rows.filter({ hasText: new RegExp(`${key}-ada`, "i") }));

  // The bottom card: the whole width, one fixed height (92dvh), its Files tab reached from Details.
  const review = page.getByRole("dialog", { name: new RegExp(`${key}-ada.* · ${title}`, "i") });
  await expect(review).toBeVisible();
  // It slides up as it opens; settled, it sits on the screen's bottom edge.
  const card = async () => (await review.boundingBox())!;
  await expect
    .poll(async () => {
      const box = await card();
      return Math.round(box.y + box.height);
    })
    .toBe(844);
  expect((await card()).width).toBe(390);
  expect(Math.abs((await card()).height - 844 * 0.92)).toBeLessThan(1);
  await tap(review.getByRole("button", { name: /^2 files to review/ }));
  await expect(review.getByRole("tab", { name: "Files, 2 files" })).toHaveAttribute("aria-selected", "true");

  // Nothing is chosen at first; Save waits until every file is decided and each rejected one has a reason.
  const save = review.getByRole("button", { name: "Save", exact: true });
  await expect(save).toHaveAttribute("aria-disabled", "true");
  const front = review.getByRole("group", { name: "Approve or reject card-front.pdf" });
  const back = review.getByRole("group", { name: "Approve or reject card-back.pdf" });
  await tap(front.getByRole("button", { name: "Approve", exact: true }));
  await tap(back.getByRole("button", { name: "Reject", exact: true }));
  await expect(back.getByRole("button", { name: "Reject", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(save).toHaveAttribute("aria-disabled", "true");
  await tap(review.getByRole("group", { name: "Common reasons for card-back.pdf" }).getByRole("button", { name: "Blurry photo" }));
  await expect(review.getByLabel(/^Why reject card-back\.pdf\?/)).toHaveValue("Blurry photo.");
  await expect(review.locator(".docr-note")).toHaveText("Save sends it back · 1 of 2 files rejected");
  // Every control the finger reaches is 44 px or more (a ::before reach counts).
  const short = await review.evaluate((dialog) =>
    [...dialog.querySelectorAll<HTMLElement>("button, input, [role=tab]")]
      .filter((control) => control.getClientRects().length)
      .map((control) => {
        const before = getComputedStyle(control, "::before");
        const reach =
          before.content !== "none" && before.position === "absolute"
            ? -parseFloat(before.top || "0") - parseFloat(before.bottom || "0")
            : 0;
        return { name: control.getAttribute("aria-label") ?? control.textContent, h: control.getBoundingClientRect().height + reach };
      })
      .filter((control) => control.h < 44),
  );
  expect(short).toEqual([]);

  // Save sends it back: the server keeps the approved file for the next version, the person owes it again.
  await tap(save);
  await expect(save).toHaveCount(0);
  await expect.poll(() => standing(documentId, ada)).toBe("rejected draft");
  await expect(review.locator(".rd-head .rd-chip")).toHaveText("Missing");
  await expect(review.locator(".docr-note")).toHaveText(/^Sent back · .+ has a new 7 days\.$/);
  await expect(review.getByRole("button", { name: "Open card-back.pdf · Rejected" })).toBeVisible();
  await expect(review.getByRole("button", { name: "Open card-front.pdf · Kept" })).toBeVisible();
  await expect(review.getByRole("group", { name: /^Approve or reject/ })).toHaveCount(0);

  // Next: the other person still waiting, in the same card.
  const next = review.locator(".docr-green");
  await expect(next).toHaveText(new RegExp(`^Next: ${key}-bo`, "i"));
  await tap(next);
  const following = page.getByRole("dialog", { name: new RegExp(`${key}-bo.* · ${title}`, "i") });
  await expect(following).toBeVisible();
  await expect(following.locator(".rd-head .rd-chip")).toHaveText("Needs review");
  await expect(following.getByRole("button", { name: /^1 file to review/ })).toBeVisible();
  expect(standing(documentId, bo)).toBe("awaiting_review pending_review");
});
