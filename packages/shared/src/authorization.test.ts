import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  authzActionKeys,
  expected,
  targetedAuthzActions,
  type AuthzActor,
  type AuthzTarget,
  type TargetedAuthzAction,
} from "./authorization";
import { matrixRuleSections, sha256 } from "./authorization-matrix-source";
import dump from "./authorization-matrix.expected.json";
import type { WorkspaceRole } from "./index";

// The SQL matrix (supabase/tests/authorization_matrix.test.sql) is the source;
// authorization-matrix.expected.json is its answers, dumped by
// `pnpm.cmd --filter @newfork/shared dump:authz-matrix`; expected() is the twin.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

type Persona = (typeof dump.personas)[number];
type MatrixTarget = (typeof dump.targets)[number];

const personas = new Map(dump.personas.map((p) => [p.label, p]));
const targets = new Map(dump.targets.map((t) => [t.label, t]));
const actions = new Map(dump.actions.map((a) => [a.key, a]));

// The matrix walks every action with whatever target the cell has; the types
// that stop a screen from leaving out a person are not the point here.
const ask = expected as (
  actor: AuthzActor,
  action: TargetedAuthzAction,
  target?: AuthzTarget,
) => boolean;

const everyPermission = [
  ...new Set(
    Object.values(targetedAuthzActions).flatMap((rule) =>
      rule.permission ? [rule.permission] : [],
    ),
  ),
];

// Every cell is asked in workspace m; a persona from another workspace is not
// a member there.
const asked = "m";

function actorOf(p: Persona): AuthzActor {
  return {
    workspaceId: asked,
    role: p.class as WorkspaceRole,
    status: p.tenant === asked ? (p.status as AuthzActor["status"]) : "none",
    locationIds: p.locs,
    permissions: everyPermission.filter((key) => !p.permissionsRemoved.includes(key)),
  };
}

function targetOf(
  p: Persona,
  label: string,
  blank: string,
): AuthzTarget | undefined {
  if (label === "self") {
    return {
      workspaceId: asked,
      locations: p.locs,
      person: { role: p.class as WorkspaceRole, isSelf: true },
    };
  }
  const t = targets.get(label) as MatrixTarget;
  if (t.kind === "workspace") return { workspaceId: t.tenant };
  const locations =
    t.locs ?? (blank === "org" ? ("organization" as const) : []);
  return {
    workspaceId: t.tenant,
    locations,
    person: t.holder
      ? { role: t.class as WorkspaceRole, isSelf: t.holder === p.label }
      : undefined,
  };
}

describe("authorization matrix twin", () => {
  it("the dump was taken from today's rules in the SQL matrix", () => {
    const sql = readFileSync(
      resolve(repositoryRoot, "supabase/tests/authorization_matrix.test.sql"),
      "utf8",
    );
    expect(
      sha256(matrixRuleSections(sql)),
      "the matrix rules changed; run pnpm.cmd --filter @newfork/shared dump:authz-matrix",
    ).toBe(dump.sourceSha256);
  });

  it("the catalog names exactly the actions the authorization core knows", () => {
    expect([...authzActionKeys].sort()).toEqual([...dump.coreActionKeys].sort());
  });

  it("every action expected() answers for has cells in the matrix, with the same permission", () => {
    for (const key of Object.keys(targetedAuthzActions) as TargetedAuthzAction[]) {
      const rows = dump.actions.filter((a) => a.coreKey === key);
      expect(rows.length, `${key} has no matrix cell`).toBeGreaterThan(0);
      for (const row of rows) {
        if (row.permission !== null) {
          expect(targetedAuthzActions[key].permission, row.key).toBe(row.permission);
        }
      }
    }
    for (const row of dump.actions) {
      expect(Object.keys(targetedAuthzActions), row.key).toContain(row.coreKey);
    }
  });

  it("answers every matrix cell as the SQL matrix does", () => {
    const decided = dump.cells.filter(([, , , answer]) => answer === "allow" || answer === "deny");
    expect(decided.length).toBe(dump.cells.length);

    const mismatches = decided.flatMap(([actionKey, actorLabel, targetLabel, answer]) => {
      const p = personas.get(actorLabel as string) as Persona;
      const a = actions.get(actionKey as string);
      if (!a) return [`${actionKey}: not in the dump's actions`];
      const got = ask(
        actorOf(p),
        a.coreKey as TargetedAuthzAction,
        targetOf(p, targetLabel as string, a.blank),
      )
        ? "allow"
        : "deny";
      return got === answer ? [] : [`${actionKey} | ${actorLabel} | ${targetLabel}: SQL ${answer}, TS ${got}`];
    });
    expect(mismatches).toEqual([]);
  });
});

describe("expected() outside the matrix", () => {
  const manager: AuthzActor = {
    workspaceId: "w",
    role: "manager",
    status: "active",
    locationIds: ["K"],
    permissions: ["schedule.manage", "schedule.publish"],
  };

  it("never reads a blank location as everywhere", () => {
    expect(expected({ ...manager, role: "owner" }, "schedule.publish", { locations: [] })).toBe(false);
  });

  it("refuses a target in another workspace", () => {
    expect(expected(manager, "schedule.edit", { workspaceId: "other", locations: ["K"] })).toBe(false);
  });

  const owner: AuthzActor = { ...manager, role: "owner", locationIds: ["K", "B"], permissions: everyPermission };
  const admin: AuthzActor = { ...owner, role: "admin" };
  const boss: AuthzActor = { ...manager, permissions: everyPermission };
  const employee: AuthzActor = { ...boss, role: "employee" };

  it.each([
    ["manager", boss, "employee.save"],
    ["admin", admin, "employee.save"],
    ["admin", admin, "employee.terminate"],
    ["admin", admin, "employee.archive"],
    ["admin", admin, "employee.remove_access"],
    ["owner", owner, "employee.make_admin"],
    ["admin", admin, "employee.change_role"],
    ["admin", admin, "time_off.decide"],
    ["manager", boss, "exchange.approve"],
    ["employee", employee, "exchange.offer_own"],
    ["admin", admin, "employee.read"],
    ["admin", admin, "membership.read"],
  ] as const)("says no to %s asking %s with nobody named", (_label, actor, action) => {
    expect(ask(actor, action, { locations: ["K"] })).toBe(false);
    expect(ask(actor, action)).toBe(false);
  });

  it("says no to an action it does not know", () => {
    expect(ask(owner, "account.self" as TargetedAuthzAction)).toBe(false);
    expect(ask(owner, "toString" as TargetedAuthzAction)).toBe(false);
  });

  it("gives the whole organization to admin and owner only", () => {
    const org = { locations: "organization" } as const;
    expect(expected(owner, "announcement.write", org)).toBe(true);
    expect(expected(admin, "important_date.write", org)).toBe(true);
    expect(expected(admin, "employee.create", org)).toBe(true);
    expect(expected(boss, "announcement.write", org)).toBe(false);
    expect(expected(boss, "employee.create", org)).toBe(false);
    expect(expected(boss, "important_date.write", org)).toBe(false);
  });
});
