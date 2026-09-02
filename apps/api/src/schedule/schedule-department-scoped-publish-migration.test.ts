import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "../../supabase/migrations/20260901171752_schedule_department_scoped_publish.sql",
  ),
  "utf8",
);

describe("schedule department scoped publish migration", () => {
  it("adds publication scope metadata and the shared department predicate", () => {
    expect(migration).toMatch(/department_ids uuid\[\]/i);
    expect(migration).toMatch(/include_no_department boolean not null default true/i);
    expect(migration).toMatch(
      /create or replace function public\.schedule_shift_in_department_scope_service/i,
    );
    expect(migration).toMatch(/job\.department_id = any\(p_department_ids\)/i);
    expect(migration).toMatch(
      /when p_job_id is null then coalesce\(p_include_no_department, false\)/i,
    );
  });

  it("adds scoped preview and publish RPC overloads", () => {
    expect(migration).toMatch(
      /create or replace function public\.preview_schedule_publication_service\([\s\S]*target_department_ids uuid\[\][\s\S]*include_no_department boolean/i,
    );
    expect(migration).toMatch(
      /create or replace function public\.publish_schedule_draft_service\([\s\S]*target_department_ids uuid\[\][\s\S]*include_no_department boolean/i,
    );
    expect(migration).toMatch(/invalid department publication scope/i);
  });

  it("preserves out-of-scope live shifts when replacing a scoped publication", () => {
    expect(migration).toMatch(
      /previous_publication_id is not null[\s\S]*insert into public\.schedule_published_shifts/i,
    );
    expect(migration).toMatch(
      /not public\.schedule_shift_in_department_scope_service\(/i,
    );
    expect(migration).toMatch(
      /shift\.draft_id = target_draft\.id[\s\S]*public\.schedule_shift_in_department_scope_service\(/i,
    );
  });

  it("keeps the scoped functions executable by the API service role", () => {
    expect(migration).toMatch(
      /grant execute on function public\.preview_schedule_publication_service\(uuid, uuid, uuid, uuid\[\], uuid\[\], boolean\) to authenticated, service_role/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.publish_schedule_draft_service\(uuid, uuid, uuid, uuid\[\], uuid\[\], boolean, integer, text, jsonb\) to authenticated, service_role/i,
    );
  });
});
