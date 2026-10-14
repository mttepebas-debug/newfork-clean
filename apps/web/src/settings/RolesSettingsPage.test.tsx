import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type Permission,
  permissionSchema,
  permissionsForRole,
  workspaceRoleRecordSchema,
} from "@newfork/shared";
import { RequestError } from "../lib/request-error";
import RolesSettingsPage from "./RolesSettingsPage";
import {
  deleteWorkspaceRole,
  loadRoleWorkspace,
  saveWorkspaceRole,
} from "./roles-data";
const { refresh } = vi.hoisted(() => ({
  refresh: vi.fn(async () => undefined),
}));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    context: {
      workspace: { id: "b1051002-0000-4000-8000-000000000001" },
      membership: { role: "owner" },
      permissions: ["roles.read", "roles.manage"],
    },
    refresh,
  }),
}));
vi.mock("./roles-data", () => ({
  loadRoleWorkspace: vi.fn(),
  saveWorkspaceRole: vi.fn(),
  deleteWorkspaceRole: vi.fn(),
}));
const manager = workspaceRoleRecordSchema.parse({
  id: "b1051009-0000-4000-8000-000000000003",
  workspace_id: "b1051002-0000-4000-8000-000000000001",
  name: "Manager",
  description: "Assigned locations",
  system_key: "manager",
  access_class: "manager",
  sort_order: 20,
  created_at: "2026-09-14T09:00:00Z",
  updated_at: "2026-09-14T09:00:00Z",
  permission_keys: permissionsForRole("manager"),
  member_count: 3,
  pending_invite_count: 2,
  editable: true,
});
const owner = {
  ...manager,
  id: "b1051009-0000-4000-8000-000000000001",
  name: "Owner",
  system_key: "owner" as const,
  access_class: "owner" as const,
  permission_keys: [...permissionsForRole("owner")],
  editable: false,
};
const employee = {
  ...manager,
  id: "b1051009-0000-4000-8000-000000000004",
  name: "Employee",
  system_key: "employee" as const,
  access_class: "employee" as const,
  permission_keys: [...permissionsForRole("employee")],
};
const admin = {
  ...manager,
  id: "b1051009-0000-4000-8000-000000000002",
  name: "Admin",
  system_key: "admin" as const,
  access_class: "admin" as const,
  permission_keys: [...permissionsForRole("admin")],
};
// The API's catalog: what the database keeps for owner and admin is not grantable
// to a custom role (permissions.custom_grantable = false; GUVENLIK-A GA-2).
const ownerAndAdminOnly: readonly Permission[] = [
  "documents.manage",
  "employee_access.manage",
  "notifications.broadcast.approve",
  "notifications.delivery_audit.read",
  "notifications.dlq.replay",
  "notifications.settings.write",
  "notifications.test_send",
  "roles.manage",
  "roles.read",
  "schedule.conflict_rules.manage",
  "settings.general.manage",
  "settings.jobs.manage",
  "settings.locations.manage",
  "settings.schedule_rules.manage",
  "settings.shift_catalog.manage",
  "workspace.manage",
];
const catalog = permissionSchema.options.map((key) => ({
  key,
  label: key,
  category: "Test",
  description: "Test",
  custom_grantable: !ownerAndAdminOnly.includes(key),
  sort_order: 0,
}));
function mount(path = "/app/settings/roles") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/app/settings/roles/:roleId?"
            element={<RolesSettingsPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, client };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadRoleWorkspace).mockResolvedValue({
    permissions: catalog,
    roles: [owner, admin, manager, employee],
  });
});
describe("RolesSettingsPage", () => {
  it("offers a manager role the organization reads only; the admin role keeps their Edit (GUVENLIK-A GA-2)", async () => {
    const view = mount(`/app/settings/roles/${manager.id}`);
    fireEvent.click(
      await screen.findByRole("button", { name: /^Organization settings/ }),
    );
    expect(screen.getByRole("checkbox", { name: "Locations Read" })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Locations Edit" })).toBeNull();
    expect(
      screen.queryByRole("checkbox", { name: "Notification settings Edit" }),
    ).toBeNull();
    expect(
      screen.queryByRole("checkbox", { name: "Roles & permissions Read" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Employees/ }));
    expect(
      screen.getByRole("checkbox", { name: "Invitations & access Read" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("checkbox", { name: "Invitations & access Edit" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Schedule/ }));
    expect(
      screen.queryByRole("checkbox", { name: "Manage conflict rules Edit" }),
    ).toBeNull();
    view.unmount();

    mount(`/app/settings/roles/${admin.id}`);
    fireEvent.click(
      await screen.findByRole("button", { name: /^Organization settings/ }),
    );
    expect(screen.getByRole("checkbox", { name: "Locations Edit" })).toBeTruthy();
    expect(
      screen.getByRole("checkbox", { name: "Roles & permissions Read" }),
    ).toBeTruthy();
  });

  it("uses the shared primary Settings header action", async () => {
    mount();
    const action = await screen.findByRole("button", { name: "New role" });
    expect(action.classList.contains("secondary-button")).toBe(false);
    expect(action.closest(".settings-header-action")).not.toBeNull();
    expect(screen.queryByRole("tab", { name: /Owner Built-in/ })).toBeNull();
  });

  it("starts clean, handles mixed categories, and Cancel restores dependencies", async () => {
    mount();
    const save = await screen.findByRole("button", { name: "Save changes" });
    expect(save).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("checkbox", { name: "Employees category Edit" }),
    ).toHaveProperty("indeterminate", true);
    expect(
      screen.queryByRole("checkbox", { name: "Schedule Edit" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Schedule\s/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Schedule Edit" }));
    expect(
      screen.getByRole("checkbox", { name: "Publishing Edit" }),
    ).toHaveProperty("checked", false);
    expect(save).toHaveProperty("disabled", false);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.getByRole("checkbox", { name: "Publishing Edit" }),
    ).toHaveProperty("checked", true);
    expect(save).toHaveProperty("disabled", true);
  });
  it("keeps a failed save draft and forwards the original version", async () => {
    vi.mocked(saveWorkspaceRole).mockRejectedValue(
      new Error("Role changed since you opened it. Reload before saving."),
    );
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: /^Schedule\s/ }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Schedule Edit",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("Role changed"),
    );
    expect(
      screen.getByRole("checkbox", { name: "Schedule Edit" }),
    ).toHaveProperty("checked", false);
    expect(saveWorkspaceRole).toHaveBeenCalledWith(
      manager.workspace_id,
      expect.objectContaining({ expected_updated_at: manager.updated_at }),
      manager.id,
    );
    expect(refresh).not.toHaveBeenCalled();
  });
  // BL-1049: the database says the role was saved meanwhile with its key; the
  // editor drops the edit, loads the saved role and says so.
  it("loads the saved role when somebody changed it meanwhile", async () => {
    const savedMeanwhile = {
      ...manager,
      updated_at: "2026-09-14T10:00:00Z",
      permission_keys: manager.permission_keys.filter(
        (key) => key !== "schedule.publish",
      ),
    };
    vi.mocked(loadRoleWorkspace)
      .mockResolvedValueOnce({
        permissions: catalog,
        roles: [owner, admin, manager, employee],
      })
      .mockResolvedValue({
        permissions: catalog,
        roles: [owner, admin, savedMeanwhile, employee],
      });
    vi.mocked(saveWorkspaceRole)
      .mockRejectedValueOnce(
        new RequestError(
          "Role changed since you opened it. Reload before saving.",
          "role.changed",
          undefined,
          409,
        ),
      )
      .mockResolvedValue(manager.id);
    mount(`/app/settings/roles/${manager.id}`);
    fireEvent.click(
      await screen.findByRole("button", { name: /^Schedule\s/ }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Schedule Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "This role changed since you opened it. The saved version is shown; make your change again.",
    );
    await waitFor(() => expect(loadRoleWorkspace).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: "Publishing Edit" }),
      ).toHaveProperty("checked", false),
    );
    expect(
      screen.getByRole("button", { name: "Save changes" }),
    ).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Publishing Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(saveWorkspaceRole).toHaveBeenLastCalledWith(
        manager.workspace_id,
        expect.objectContaining({
          expected_updated_at: savedMeanwhile.updated_at,
        }),
        manager.id,
      ),
    );
  });
  it("reloads the role's references when the database says it is still in use", async () => {
    const custom = {
      ...manager,
      system_key: null,
      name: "Floor lead",
      blocking_member_count: 0,
      blocking_invite_count: 0,
      deletable: true,
    };
    vi.mocked(loadRoleWorkspace)
      .mockResolvedValueOnce({ permissions: catalog, roles: [custom] })
      .mockResolvedValue({
        permissions: catalog,
        roles: [{ ...custom, blocking_member_count: 1, deletable: false }],
      });
    vi.mocked(deleteWorkspaceRole).mockRejectedValueOnce(
      new RequestError(
        "Role has member or invitation references. Resolve these dependencies before deleting.",
        "role.in_use",
        undefined,
        409,
      ),
    );
    mount(`/app/settings/roles/${custom.id}`);
    fireEvent.click(await screen.findByRole("button", { name: "Delete role" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Resolve these dependencies before deleting.",
    );
    await waitFor(() => expect(loadRoleWorkspace).toHaveBeenCalledTimes(2));
    fireEvent.click(await screen.findByRole("button", { name: "Delete role" }));
    expect(
      await screen.findByText(/1 member references and 0 invitation references/),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Confirm delete" })).toBeNull();
    expect(deleteWorkspaceRole).toHaveBeenCalledTimes(1);
  });
  it("guards role switching", async () => {
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: /^Schedule\s/ }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Schedule Edit",
      }),
    );
    fireEvent.click(screen.getByRole("tab", { name: /Employee Built-in/ }));
    expect(
      await screen.findByRole("heading", { name: "Discard role changes?" }),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Discard and leave" }));
  });
  it("keeps Owner protected without showing it in role navigation", async () => {
    mount(`/app/settings/roles/${owner.id}`);
    expect(screen.queryByRole("tab", { name: /Owner Built-in/ })).toBeNull();
    expect(
      await screen.findByText("Owner is protected and always has full access."),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  });
  it("copies independently and limits Employee experience to personal controls", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Copy role" }));
    expect(await screen.findByRole("textbox", { name: "Name" })).toHaveProperty(
      "value",
      "Manager copy",
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Experience" }), {
      target: { value: "employee" },
    });
    expect(
      screen.queryByRole("checkbox", { name: "Schedule Edit" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Personal access Read only" }),
    );
    expect(
      screen.getByRole("checkbox", { name: "My schedule Read" }),
    ).not.toBeNull();
    expect(manager.permission_keys).toContain("schedule.manage");
  });
  it("arms the delete button and explains blocking references without calling delete", async () => {
    const custom = {
      ...manager,
      system_key: null,
      name: "Floor lead",
      blocking_member_count: 3,
      blocking_invite_count: 2,
      deletable: false,
    };
    vi.mocked(loadRoleWorkspace).mockResolvedValue({
      permissions: catalog,
      roles: [custom],
    });
    mount(`/app/settings/roles/${custom.id}`);
    fireEvent.click(await screen.findByRole("button", { name: "Delete role" }));
    expect(
      screen.getByText(/3 member references and 2 invitation references/),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Role has dependencies" }),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Confirm delete" })).toBeNull();
    expect(deleteWorkspaceRole).not.toHaveBeenCalled();
  });
  it("deletes an unused custom role only after pressing the armed button again", async () => {
    const custom = {
      ...manager,
      system_key: null,
      name: "Floor lead",
      blocking_member_count: 0,
      blocking_invite_count: 0,
      deletable: true,
    };
    vi.mocked(loadRoleWorkspace).mockResolvedValue({
      permissions: catalog,
      roles: [custom],
    });
    vi.mocked(deleteWorkspaceRole).mockResolvedValue(undefined);
    mount(`/app/settings/roles/${custom.id}`);

    fireEvent.click(await screen.findByRole("button", { name: "Delete role" }));
    expect(deleteWorkspaceRole).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm delete" }),
    );

    await waitFor(() =>
      expect(deleteWorkspaceRole).toHaveBeenCalledWith(
        custom.workspace_id,
        custom.id,
      ),
    );
  });
  it("groups custom roles after the third custom role and selects from the menu", async () => {
    const customRoles = Array.from({ length: 4 }, (_, index) => ({
      ...manager,
      id: `b1051009-0000-4000-8000-00000000010${index}`,
      name: `Floor lead ${index + 1}`,
      system_key: null,
      access_class: "manager" as const,
    }));
    vi.mocked(loadRoleWorkspace).mockResolvedValue({
      permissions: catalog,
      roles: [owner, manager, employee, ...customRoles],
    });
    mount(`/app/settings/roles/${customRoles[0]!.id}`);
    expect(
      (await screen.findByRole("tab", { name: "Custom roles +4" }))
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.queryByRole("tab", { name: /Floor lead 4/ })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Custom roles +4" }));
    fireEvent.click(
      within(screen.getByRole("listbox", { name: "Custom roles" })).getByRole(
        "option",
        { name: "Floor lead 2" },
      ),
    );
    expect(await screen.findByRole("textbox", { name: "Name" }))
      .toHaveProperty("value", "Floor lead 2");
  });
  it("refreshes permissions and adopts the saved server version", async () => {
    vi.mocked(saveWorkspaceRole).mockImplementation(async () => {
      vi.mocked(loadRoleWorkspace).mockResolvedValue({
        permissions: catalog,
        roles: [
          owner,
          {
            ...manager,
            updated_at: "2026-09-14T10:00:00Z",
            permission_keys: manager.permission_keys.filter(
              (key) =>
                ![
                  "schedule.manage",
                  "schedule.publish",
                  "schedule.templates.manage",
                ].includes(key),
            ),
          },
          employee,
        ],
      });
      return manager.id;
    });
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: /^Schedule\s/ }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Schedule Edit",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save changes" }),
      ).toHaveProperty("disabled", true),
    );
    expect(
      screen.getByRole("checkbox", { name: "Schedule Edit" }),
    ).toHaveProperty("checked", false);
  });
});

// Loading and error in the "B" look (Mert 2026-10-14).
describe("Roles loading and error", () => {
  it("outlines the list while roles load", async () => {
    vi.mocked(loadRoleWorkspace).mockReturnValueOnce(new Promise(() => {}));
    mount();
    expect((await screen.findByRole("status")).textContent).toBe("Loading roles");
    expect(screen.queryByText("Loading roles...")).toBeNull();
  });

  it("shows the card with Try again, not the server's sentence, when roles fail", async () => {
    vi.mocked(loadRoleWorkspace).mockRejectedValueOnce(new Error("roles service down"));
    mount();
    expect(await screen.findByRole("heading", { name: "We couldn't load roles" })).toBeTruthy();
    expect(screen.queryByText("roles service down")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "We couldn't load roles" })).toBeNull());
    expect(loadRoleWorkspace).toHaveBeenCalledTimes(2);
  });

  it("keeps the last roles and says so when a refresh fails", async () => {
    const { client } = mount();
    expect(await screen.findByRole("button", { name: "New role" })).toBeTruthy();
    await waitFor(() => expect(document.body.textContent).toContain("Manager"));
    vi.mocked(loadRoleWorkspace).mockRejectedValueOnce(new Error("roles service down"));
    await act(async () => {
      await client.refetchQueries();
    });
    const line = await screen.findByRole("alert");
    expect(line.textContent).toContain("Roles didn't refresh. This is the last list that loaded.");
    expect(document.body.textContent).toContain("Manager");
    expect(screen.getByRole("button", { name: "New role" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "We couldn't load roles" })).toBeNull();
    expect(screen.queryByText("roles service down")).toBeNull();
  });
});
