import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { psql } from "../global-setup";

// Shared by the onboarding (flow 3) and documents (flow 4) specs (FB-6.6 A3).
// Each spec makes its own job and its own people in this run's world, so a
// required document it publishes reaches nobody another spec signs in as.

const world: { readonly run: string; readonly password: string } = JSON.parse(
  readFileSync(new URL("../.world.json", import.meta.url), "utf8"),
);
export const run = world.run;

export function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

/** The last line psql printed: the value of the statement that ran last. */
export const lastLine = (printed: string): string => printed.split(/\r?\n/).at(-1)!;

export const tag = (): string => Math.random().toString(36).slice(2, 7);

/** A job of its own under a department of its own; tests.person files people on it by `key`. */
export function ownJob(key: string, name: string): string {
  return lastLine(
    sql(`
    select tests.remember('${run}:job:${key}', ((public.create_department_with_jobs_service(
      tests.user('${run}:owner'), tests.id('${run}'),
      jsonb_build_object('name', '${name} team', 'color', '#3C7A68'),
      jsonb_build_array(jsonb_build_object('name', '${name}', 'color', '#D39A36'))
    ) -> 'jobs' -> 0) ->> 'id')::uuid);`),
  );
}

/** Somebody from the builder who can sign in; returns their email. */
export function personWithPassword(
  label: string,
  // A system role (admin, manager, employee); the built-in Manager decides documents (BL-560).
  access: string,
  locations: readonly ("K" | "B")[],
  jobKey: string,
): string {
  return lastLine(
    sql(`
    select tests.person('${run}', '${label}', '${access}',
      array[${locations.map((location) => `'${location}'`).join(", ")}]::text[], array['${jobKey}']);
    select tests.password('${run}:${label}', '${world.password}');`),
  );
}

/** The owner of this run's world, with a password; returns their email. */
export const ownerWithPassword = (): string =>
  lastLine(sql(`select tests.password('${run}:owner', '${world.password}');`));

/**
 * A required document the owner published, reviewed by a manager, restricting
 * access a week after it is assigned, for whoever holds one of `jobIds`.
 */
export function publishedDocument(title: string, jobIds: readonly string[]): string {
  return lastLine(
    sql(`
    create temporary table published (id uuid, preview jsonb);
    insert into published (id)
    select public.save_document_type_lifecycle_service(tests.user('${run}:owner'), tests.id('${run}'), null, null,
      jsonb_build_object('title', '${title}', 'description', 'A photo of the card', 'requires_review', true,
        'accepted_formats', array['pdf'], 'tracks_expiry', false, 'expiry_warning_days', 30,
        'lifecycle_settings', jsonb_build_object('mode', 'required', 'assignment_scope', 'all_active',
          'target', jsonb_build_object('operator', 'and', 'location_ids', '[]'::jsonb,
            'department_ids', '[]'::jsonb,
            'job_ids', jsonb_build_array(${jobIds.map((id) => `'${id}'::text`).join(", ")}), 'employee_ids', '[]'::jsonb),
          'period_days', 7, 'suspend_on_overdue', true, 'extra_fields', '[]'::jsonb)));
    update published set preview = public.preview_document_publication_service(
      tests.user('${run}:owner'), tests.id('${run}'), id);
    select public.set_document_publication_service(tests.user('${run}:owner'), tests.id('${run}'), id,
      (preview ->> 'revision')::integer, (preview ->> 'publication_revision')::integer,
      preview ->> 'preview_token', 'Publish', 'published')
    from published;
    select tests.settle();
    select id from published;`),
  );
}

/** The emails of everybody a document has an open requirement on. */
export const assignedTo = (documentId: string): string[] =>
  sql(`
    select u.email from public.employee_onboarding_requirements r
    join auth.users u on u.id = r.lifecycle_user_id
    where r.source_id = '${documentId}' and r.lifecycle_closed_at is null
    order by u.email;`)
    .split(/\r?\n/)
    .filter(Boolean);

/** Moves one person's delivery deadline into the past: nothing in the product moves the clock. */
export function deadlinePassed(documentId: string, email: string): void {
  sql(`
    update public.employee_onboarding_requirements r
    set deadline_at = now() - interval '1 day'
    from auth.users u
    where u.id = r.lifecycle_user_id and u.email = '${email}' and r.source_id = '${documentId}';`);
}

/** Signs in through the real sign-in screen, for somebody a spec made itself. */
export async function signInAs(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(world.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

export async function tokenFor(email: string): Promise<string> {
  const response = await fetch(`${process.env.E2E_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: process.env.E2E_ANON_KEY ?? "", "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: world.password }),
  });
  const body = (await response.json()) as { access_token?: string };
  if (!response.ok || !body.access_token) throw new Error(`sign-in failed (${response.status})`);
  return body.access_token;
}

/** A one-page PDF, enough for an upload that accepts PDF. */
export const card = {
  name: "food-handler-card.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  ),
};

/**
 * One's own documents (Documents, or My documents for somebody who manages):
 * the person opens their own request, uploads the card and sends it. The old
 * Account address still leads there, in the person's own interface
 * (MY-DOCUMENTS). Returns once the drawer has nothing left to send.
 */
export async function sendOwnDocument(page: Page, title: string, tab?: "Completed") {
  await page.goto("/account/documents");
  await expect(page).toHaveURL(/\/app\/(employee-hub\/documents|my-documents)/);
  // The person's own list opens on To do; an excused card sits under Completed (KARARLAR S-255).
  if (tab) await page.getByLabel("Document status").getByRole("button", { name: new RegExp(`^${tab}`) }).click();
  await page
    .getByRole("table", { name: "Employee documents" })
    .getByRole("row", { name: new RegExp(title) })
    .click();
  const drawer = page.getByRole("dialog", { name: title });
  await drawer.getByLabel("Upload document").setInputFiles(card);
  await drawer.getByRole("button", { name: "Submit document", exact: true }).click();
  await expect(drawer.getByRole("button", { name: "Submit document", exact: true })).toHaveCount(0);
}

/**
 * Approves somebody's sent document the way a script would, past the screens.
 * The API's status is the answer: 200 yes, 403 the core's "no" (authz.*).
 */
export async function approveAs(reviewerEmail: string, documentId: string, holderEmail: string): Promise<number> {
  const target: {
    readonly workspace: string;
    readonly requirement: string;
    readonly revision: number;
    readonly submission: string;
    readonly files: readonly string[];
  } = JSON.parse(
    lastLine(
      sql(`
      select json_build_object(
        'workspace', r.workspace_id, 'requirement', r.id, 'revision', r.lifecycle_revision,
        'submission', s.id,
        'files', (select json_agg(f.file_id) from public.employee_document_submission_files f
                  where f.submission_id = s.id))::text
      from public.employee_onboarding_requirements r
      join auth.users u on u.id = r.lifecycle_user_id
      join public.employee_document_submissions s on s.requirement_id = r.id and s.state = 'pending_review'
      where r.source_id = '${documentId}' and u.email = '${holderEmail}';`),
    ),
  );
  const response = await fetch(
    `${process.env.E2E_API_URL}/v1/workspaces/${target.workspace}/employee-documents/${target.requirement}/review`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${await tokenFor(reviewerEmail)}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        revision: target.revision,
        submission_id: target.submission,
        decision: "approve",
        reason: "",
        correction_period: "full",
        files: target.files.map((id) => ({ id, decision: "keep", note: "" })),
      }),
    },
  );
  return response.status;
}

/** "<requirement status> <last submission state>" for one person's copy of a document. */
export const standing = (documentId: string, email: string): string =>
  lastLine(
    sql(`
    select r.status || ' ' || coalesce((select s.state from public.employee_document_submissions s
      where s.requirement_id = r.id order by s.version desc limit 1), 'none')
    from public.employee_onboarding_requirements r
    join auth.users u on u.id = r.lifecycle_user_id
    where r.source_id = '${documentId}' and u.email = '${email}';`),
  );
