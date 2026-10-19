import type { ActiveWorkspaceContext, WorkspaceSummary } from "@newfork/shared";
import { describe, expect, it } from "vitest";
import {
  appLandingPath,
  hubPath,
  invitationsPath,
  noAccessHomePath,
  resolveLanding,
} from "./resolveLanding";

function workspace(
  overrides: Partial<WorkspaceSummary> & Pick<WorkspaceSummary, "id" | "name">,
): WorkspaceSummary {
  return {
    role: "owner",
    status: "active",
    isActive: false,
    onboarding: { status: "complete", currentStep: 4, revision: 1 },
    ...overrides,
  } as WorkspaceSummary;
}

const ready = workspace({ id: "11111111-1111-4111-8111-111111111111", name: "Meyhouse" });
const second = workspace({
  id: "22222222-2222-4222-8222-222222222222",
  name: "Ridgeline",
  role: "manager",
});
const unfinished = workspace({
  id: "33333333-3333-4333-8333-333333333333",
  name: "Palo Alto",
  onboarding: { status: "incomplete", currentStep: 2, revision: 1 },
});

const employeeContext = {
  workspace: { id: ready.id, name: ready.name },
  membership: { access: { employee: true, management: null } },
  permissions: [],
} as unknown as ActiveWorkspaceContext;

describe("resolveLanding", () => {
  // KARARLAR "Girişten sonra yönlendirme": a waiting invitation is the first
  // screen of every app open, even with a workspace to land in (BL-624).
  it("puts a waiting invitation first, before a workspace it could land in", () => {
    expect(
      resolveLanding({ pendingInvitationCount: 2, workspaces: [ready, second] }),
    ).toEqual({ kind: "invitations", path: invitationsPath });
  });

  it("puts a waiting invitation first for an account with nowhere to work", () => {
    expect(
      resolveLanding({ pendingInvitationCount: 1, workspaces: [] }),
    ).toEqual({ kind: "invitations", path: invitationsPath });
  });

  it("lands as usual once the invitation was answered with Not now in this open", () => {
    expect(
      resolveLanding({
        pendingInvitationCount: 1,
        invitationAnswered: true,
        workspaces: [ready],
      }),
    ).toMatchObject({ kind: "workspace", workspaceId: ready.id });
  });

  it("sends an unfinished setup with nowhere to work to the hub (R3)", () => {
    expect(resolveLanding({ workspaces: [unfinished] })).toEqual({
      kind: "hub",
      path: hubPath,
    });
  });

  it("lands straight in the only workspace there is (R4)", () => {
    expect(resolveLanding({ workspaces: [ready] })).toMatchObject({
      kind: "workspace",
      workspaceId: ready.id,
      path: "/app/workspace",
    });
  });

  it("picks the most recently used of several (R5)", () => {
    const older = workspace({
      ...ready,
      lastUsedAt: "2026-09-01T00:00:00.000Z",
    });
    const newer = workspace({
      ...second,
      lastUsedAt: "2026-09-20T00:00:00.000Z",
    });

    expect(resolveLanding({ workspaces: [older, newer] })).toMatchObject({
      kind: "workspace",
      workspaceId: newer.id,
    });
  });

  it("falls back to the saved default while nothing has been used yet (R5)", () => {
    expect(
      resolveLanding({
        workspaces: [ready, workspace({ ...second, isActive: true })],
      }),
    ).toMatchObject({ kind: "workspace", workspaceId: second.id });
  });

  it("orders by name rather than arbitrarily when nothing distinguishes them (R5)", () => {
    expect(
      resolveLanding({ workspaces: [second, ready] }),
    ).toMatchObject({ kind: "workspace", workspaceId: ready.id });
  });

  it("sends an account that belongs nowhere to the hub (R6)", () => {
    expect(
      resolveLanding({ workspaces: [], pendingInvitationCount: 0 }),
    ).toEqual({ kind: "hub", path: hubPath });
  });

  it("does not pull an account with somewhere to work into the hub (R7)", () => {
    expect(
      resolveLanding({
        pendingInvitationCount: 3,
        invitationAnswered: true,
        workspaces: [ready, unfinished],
      }),
    ).toMatchObject({ kind: "workspace", workspaceId: ready.id });
  });

  it("names the page the role can open, not the one it cannot", () => {
    expect(
      resolveLanding({ workspaces: [ready], context: employeeContext }),
    ).toMatchObject({ path: "/app/employee-hub" });
  });

  it("does not use a context that belongs to a different workspace", () => {
    const elsewhere = {
      ...employeeContext,
      workspace: { id: second.id, name: second.name },
    } as ActiveWorkspaceContext;

    expect(
      resolveLanding({ workspaces: [ready], context: elsewhere }),
    ).toMatchObject({ path: "/app/workspace" });
  });

  it("treats a suspended workspace as nowhere to work", () => {
    expect(
      resolveLanding({
        workspaces: [workspace({ ...ready, status: "suspended" })],
      }),
    ).toEqual({ kind: "hub", path: hubPath });
  });
});

describe("noAccessHomePath", () => {
  const managerWith = (actions: string[]) =>
    ({
      workspace: { id: ready.id, name: ready.name },
      membership: { access: { employee: false, management: "manager" } },
      // The permission key alone must not decide it: can() reads actions.
      permissions: ["workspace.read", "schedule.read"],
      actions,
    }) as unknown as ActiveWorkspaceContext;

  it("sends a person who can read the workspace to Workspace", () => {
    expect(
      noAccessHomePath(managerWith(["workspace.read", "schedule.read"]), "/app/schedule"),
    ).toBe("/app/workspace");
  });

  it("sends a schedule-only person to the hub, not back to Schedule where /app lands them", () => {
    const scheduleOnly = managerWith(["schedule.read"]);
    expect(noAccessHomePath(scheduleOnly, "/app/schedule")).toBe(hubPath);
  });

  it("never points back at the page that refused", () => {
    expect(
      noAccessHomePath(managerWith(["workspace.read"]), "/app/workspace"),
    ).toBe(hubPath);
  });

  // Workspace is a management page: an employee refused anywhere goes to
  // Employee Hub, not to a Workspace card that refuses them again.
  it("sends an employee to Employee Hub, whatever the core opens", () => {
    const employee = {
      ...managerWith(["workspace.read", "employee_hub.read"]),
      membership: { access: { employee: true, management: null } },
    } as unknown as ActiveWorkspaceContext;
    expect(noAccessHomePath(employee, "/app/employees")).toBe("/app/employee-hub");
    expect(noAccessHomePath(employee, "/app/employee-hub")).toBe(hubPath);
    expect(noAccessHomePath(employee, "/app/employee-hub/")).toBe(hubPath);
  });

  it("sends an employee the core holds out of Employee Hub straight to the hub", () => {
    const employee = {
      ...managerWith(["workspace.read"]),
      membership: { access: { employee: true, management: null } },
    } as unknown as ActiveWorkspaceContext;
    expect(noAccessHomePath(employee, "/app/employees")).toBe(hubPath);
  });

  it("sends a person with no workspace loaded to the hub", () => {
    expect(noAccessHomePath(null, "/app/schedule")).toBe(hubPath);
  });
});

// BL-176: the page a workspace opens on is the core's answer (context.actions),
// not the permission list.
describe("the page inside the workspace", () => {
  const managerDoing = (actions: string[]) =>
    ({
      workspace: { id: ready.id, name: ready.name },
      membership: { access: { employee: false, management: "manager" } },
      permissions: ["workspace.read", "schedule.read"],
      actions,
    }) as unknown as ActiveWorkspaceContext;
  const managerWorkspace = workspace({ ...ready, role: "manager" });

  it("opens Workspace when the core lets them read it", () => {
    expect(
      resolveLanding({
        workspaces: [managerWorkspace],
        context: managerDoing(["workspace.read", "schedule.read"]),
      }).path,
    ).toBe("/app/workspace");
  });

  it("opens Schedule when the core lets them read only that", () => {
    expect(
      resolveLanding({
        workspaces: [managerWorkspace],
        context: managerDoing(["schedule.read"]),
      }).path,
    ).toBe("/app/schedule");
  });

  it("opens the hub when the core lets them read neither, whatever the permissions", () => {
    expect(
      resolveLanding({ workspaces: [managerWorkspace], context: managerDoing([]) }).path,
    ).toBe(hubPath);
  });
});

// ROL-CIFT 6.2 (design §4.1, §4.10): the accesses name the landing page. Only
// managing: Workspace. Only the employee access: Employee Hub. Both: Workspace,
// with the Employee view a click away.
describe("the landing page by access", () => {
  const holding = (access: { employee: boolean; management: string | null }, actions: string[]) =>
    ({
      workspace: { id: ready.id, name: ready.name },
      membership: { access },
      permissions: [],
      actions,
    }) as unknown as ActiveWorkspaceContext;

  it.each([
    ["only manages", { employee: false, management: "manager" }, ["workspace.read", "schedule.read"], "/app/workspace"],
    ["only works shifts", { employee: true, management: null }, ["workspace.read", "employee_hub.read"], "/app/employee-hub"],
    ["does both", { employee: true, management: "admin" }, ["workspace.read", "employee_hub.read"], "/app/workspace"],
  ] as const)("lands somebody who %s on %s", (_who, access, actions, path) => {
    expect(appLandingPath(holding(access, [...actions]))).toBe(path);
  });

  it("lands an owner who also works shifts on Workspace, not on Employee Hub", () => {
    expect(
      resolveLanding({
        workspaces: [ready],
        context: holding({ employee: true, management: "owner" }, ["workspace.read", "employee_hub.read"]),
      }).path,
    ).toBe("/app/workspace");
  });
});
