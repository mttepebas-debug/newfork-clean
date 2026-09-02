import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "../../supabase/migrations/20260908100000_employee_invitation_role_selection.sql",
  ),
  "utf8",
);

describe("employee invitation role selection migration", () => {
  it("adds the selected role to the service invitation contract", () => {
    expect(migration).toMatch(/target_role_id uuid/i);
    expect(migration).toMatch(
      /where workspace_id = target_workspace_id and id = target_role_id/i,
    );
    expect(migration).toMatch(/employee_email, invite_role\.id/i);
  });

  it("keeps owner and admin role assignment protected", () => {
    expect(migration).toMatch(/invite_role\.access_class = 'owner'/i);
    expect(migration).toMatch(/owner role cannot be assigned by invitation/i);
    expect(migration).toMatch(
      /actor_role <> 'owner' and invite_role\.access_class = 'admin'/i,
    );
    expect(migration).toMatch(/admin role assignment requires owner access/i);
  });

  it("returns pending invitation role ids to the drawer detail payload", () => {
    expect(migration).toMatch(
      /create or replace function public\.get_employee_detail/i,
    );
    expect(migration).toMatch(/'role_id', invitation\.role_id/i);
  });
});
