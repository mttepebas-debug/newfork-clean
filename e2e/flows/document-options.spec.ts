import { expect, test } from "../fixtures/test";
import { emailOf } from "../fixtures/world";
import {
  lastLine,
  ownJob,
  personWithPassword,
  publishedDocument,
  signInAs,
  sql,
  tag,
} from "../fixtures/documents";

// K1 (A2 Tur 6, Mert 23 Oct): on a desktop the manager's More options are cards, one open at a time, each saved by
// the dock's one Save. The rules are today's (K1 decisions 1 and 3): Extend moves the deadline by the days picked,
// Excuse stops asking for the document, Ask for it again starts asking again with a new full period. Each is
// checked at the server, not only on the screen.

/** The person's deadline (seconds since 1970, or none) and whether they are excused, as the server holds them. */
const lifecycle = (documentId: string, email: string): { deadline: number | null; exempt: boolean } => {
  const [deadline, exempt] = lastLine(
    sql(`
    select coalesce(extract(epoch from r.deadline_at)::bigint::text, 'none') || ' ' || r.lifecycle_exempt
    from public.employee_onboarding_requirements r
    join auth.users u on u.id = r.lifecycle_user_id
    where r.source_id = '${documentId}' and u.email = '${email}';`),
  ).split(" ");
  return { deadline: deadline === "none" ? null : Number(deadline), exempt: exempt === "true" };
};

test("desktop: the manager extends a deadline, excuses the person, then asks for the document again", async ({
  page,
}) => {
  test.slow();
  const key = `doc${tag()}`;
  const title = `Food handler card ${key}`;
  const jobId = ownJob(key, `Barista ${key}`);
  const ada = personWithPassword(`${key}-ada`, "employee", ["K"], key);
  const documentId = publishedDocument(title, [jobId]);
  const owed = lifecycle(documentId, ada);
  expect(owed.exempt).toBe(false);
  expect(owed.deadline).not.toBeNull();

  await signInAs(page, emailOf("zeynep"));
  await page.goto("/app/employees/documents");
  await page.getByLabel("Search employee documents").fill(key);
  // Nothing sent yet: the row sits under To do.
  await page.getByLabel("Document status").getByRole("button", { name: /^To do/ }).click();
  await page.getByRole("table", { name: "Employee documents" }).getByRole("row", { name: new RegExp(title) }).click();
  const review = page.getByRole("dialog", { name: new RegExp(`${key}-ada.* · ${title}`, "i") });
  await expect(review).toBeVisible();
  const options = review.getByRole("region", { name: "More options" });
  const save = review.getByRole("button", { name: "Save", exact: true });
  const line = review.locator(".rd-foot .docr-note");
  // The green holds for 400 ms after its meaning changes (an open panel is one): a person's pace, not a script's.
  const press = async () => {
    await page.waitForTimeout(450);
    await save.click();
  };

  // Extend deadline by 7 days, with a reason.
  await options.getByRole("button", { name: /^Extend deadline/ }).click();
  const extend = review.getByRole("group", { name: "Extend deadline" });
  await extend.getByRole("button", { name: "+7 days" }).click();
  await extend.getByLabel("Reason").fill("Clinic closed this week");
  await press();
  await expect(save).toHaveCount(0);
  await expect(line).toHaveText(/^Deadline extended 7 days · New due date /);
  await expect.poll(() => lifecycle(documentId, ada).deadline).toBe(owed.deadline! + 7 * 86_400);

  // Excuse the person, with a reason: the server stops asking.
  await options.getByRole("button", { name: /^Excuse / }).click();
  await review.getByRole("group", { name: /^Excuse / }).getByLabel("Reason").fill("Role exception");
  await press();
  await expect(save).toHaveCount(0);
  await expect(line).toHaveText(/^Excused · .+ won't be asked for it\./);
  await expect.poll(() => lifecycle(documentId, ada).exempt).toBe(true);
  await expect(review.locator(".rd-head .rd-chip")).toHaveText("Excused");

  // Excused, the one card asks for it again: a new full period starts.
  await options.getByRole("button", { name: /^Ask for it again/ }).click();
  await review.getByRole("group", { name: "Ask for it again" }).getByLabel("Reason").fill("Back on the line");
  await press();
  await expect(save).toHaveCount(0);
  await expect(line).toHaveText(/^Asked again · .+ needs to send it by /);
  await expect.poll(() => lifecycle(documentId, ada).exempt).toBe(false);
  expect(lifecycle(documentId, ada).deadline).not.toBeNull();
  await expect(review.locator(".rd-head .rd-chip")).toHaveText("Missing");
});
