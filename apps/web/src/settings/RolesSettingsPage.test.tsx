import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
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
  return render(
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
