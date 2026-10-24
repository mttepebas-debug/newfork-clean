import type { Locator } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { emailOf } from "../fixtures/world";
import {
  lastLine,
  ownJob,
  personWithPassword,
  publishedDocument,
  sentWithFiles,
  signInAs,
  sql,
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

/**
 * Every control the finger reaches is 44 px or more. An absolute ::before counts as its reach: measured on the box
 * it is laid out in (the control, or the nearest positioned box around it, as for `inset: 0`).
 */
async function shortControls(scope: Locator) {
  return scope.evaluate((root) => {
    const laidIn = (control: HTMLElement): HTMLElement => {
      let box: HTMLElement | null = control;
      while (box && getComputedStyle(box).position === "static") box = box.parentElement;
      return box ?? document.documentElement;
    };
    return [...root.querySelectorAll<HTMLElement>("button, input, select, textarea, [role=tab]")]
      .filter((control) => control.getClientRects().length)
      .map((control) => {
        const own = control.getBoundingClientRect().height;
        const before = getComputedStyle(control, "::before");
        const reach =
          before.content !== "none" && before.position === "absolute"
            ? laidIn(control).getBoundingClientRect().height -
              (parseFloat(before.top) || 0) -
              (parseFloat(before.bottom) || 0)
            : 0;
        return { name: control.getAttribute("aria-label") ?? control.textContent, h: Math.max(own, reach) };
      })
      .filter((control) => control.h < 44);
  });
}

/** What the server stored for the person's version sent back: the document's reason, and each file's decision. */
const sentBackAs = (documentId: string, email: string): string =>
  lastLine(
    sql(`
    select r.rejection_reason || ' | ' || string_agg(f.decision || ':' || f.note, ', ' order by f.decision)
    from public.employee_onboarding_requirements r
    join auth.users u on u.id = r.lifecycle_user_id
    join public.employee_document_submissions s on s.requirement_id = r.id and s.state = 'rejected'
    join public.employee_document_submission_files f on f.submission_id = s.id
    where r.source_id = '${documentId}' and u.email = '${email}'
    group by r.rejection_reason;`),
  );

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
  expect(await shortControls(review)).toEqual([]);

  // Save sends it back: the server keeps the approved file for the next version, the person owes it again.
  await tap(save);
  await expect(save).toHaveCount(0);
  await expect.poll(() => standing(documentId, ada)).toBe("rejected draft");
  // K1 decision 10 at the server: the document's reason is made of the rejected file's reason, which is its note.
  expect(sentBackAs(documentId, ada)).toBe("card-back.pdf: Blurry photo. | discard:Blurry photo., keep:");
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

  // More options and History are as reachable: an open Excuse panel, then the timeline (its kept file opens from
  // its whole 44 px row, a ::before with inset 0).
  await tap(following.getByRole("button", { name: /^Excuse / }));
  await expect(following.getByRole("group", { name: /^Excuse / })).toBeVisible();
  expect(await shortControls(following)).toEqual([]);
  await tap(following.getByRole("button", { name: "Cancel", exact: true }).first());
  await tap(following.getByRole("tab", { name: "History" }));
  await expect(following.getByRole("list", { name: "History" })).toBeVisible();
  expect(await shortControls(following)).toEqual([]);
  expect(standing(documentId, bo)).toBe("awaiting_review pending_review");

  // Behind the card, the list reads the document sent back in the manager's word, under To do.
  await tap(following.getByRole("button", { name: "Close details" }));
  await expect(following).toHaveCount(0);
  await tap(page.getByLabel("Document status").getByRole("button", { name: /^To do/ }));
  await expect(
    rows.filter({ hasText: new RegExp(`${key}-ada`, "i") }).locator(".list-chip"),
  ).toHaveText("Missing");
});
