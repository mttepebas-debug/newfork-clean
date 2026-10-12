import { render, screen } from "@testing-library/react";
import type { ActiveWorkspaceContext } from "@newfork/shared";
import {
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router";
import { describe, expect, it, vi } from "vitest";
import SettingsHomeRedirect from "./SettingsHomeRedirect";
import SettingsLayout from "./SettingsLayout";
import { SettingsPageRoute } from "./SettingsPageRoute";

let permissions: ActiveWorkspaceContext["permissions"] = [
  "notifications.settings.read",
];
// What the core answers this admin for those permissions (context.actions).
let actions: ActiveWorkspaceContext["actions"] = ["settings.notifications.read"];

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    context: {
      permissions,
      actions,
      membership: { role: "admin", status: "active" },
    },
  }),
}));

describe("notification settings navigation", () => {
  it("lets a notification settings reader enter Settings from the left rail", () => {
    permissions = ["notifications.settings.read"];
    actions = ["settings.notifications.read"];
    render(
      <MemoryRouter initialEntries={["/app/settings/general"]}>
        <Routes>
          <Route path="/app/settings" element={<SettingsLayout />}>
            <Route path="general" element={<p>General route</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Notifications" })).toHaveProperty(
      "href",
      expect.stringContaining("/app/settings/notifications"),
    );
  });

  it("uses notification settings as the settings landing page for a reader", async () => {
    permissions = ["notifications.settings.read"];
    actions = ["settings.notifications.read"];
    render(
      <MemoryRouter initialEntries={["/app/settings"]}>
        <Routes>
          <Route path="/app/settings" element={<SettingsLayout />}>
            <Route index element={<SettingsHomeRedirect />} />
            <Route
              path="notifications"
              element={<p>Notification settings route</p>}
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Notification settings route")).toBeTruthy();
  });

  it("shows independently granted settings without other organization links", () => {
    permissions = ["settings.locations.read"];
    actions = ["settings.locations.read"];
    render(
      <MemoryRouter initialEntries={["/app/settings"]}>
        <Routes>
          <Route path="/app/settings" element={<SettingsLayout />}>
            <Route index element={<SettingsHomeRedirect />} />
            <Route path="locations" element={<p>Locations only</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Locations" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "General" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Jobs" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Notifications" })).toBeNull();
  });
  it("keeps Scheduling child links from activating Schedule rules", () => {
    permissions = [
      "settings.schedule_rules.read",
      "settings.shift_catalog.read",
    ];
    actions = ["settings.shift_catalog.read"];
    render(
      <MemoryRouter initialEntries={["/app/settings/scheduling/shift-types"]}>
        <Routes>
          <Route path="/app/settings" element={<SettingsLayout />}>
            <Route
              path="scheduling/shift-types"
              element={<p>Shift types route</p>}
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("link", { name: "Schedule rules" }).className,
    ).not.toContain("active");
    expect(
      screen.getByRole("link", { name: "Shift catalog" }).className,
    ).toContain("active");
  });

  it("lets the conflict permission alone enter Settings and load its direct route", async () => {
    permissions = ["schedule.conflict_rules.manage"];
    actions = ["settings.conflict_rules.write"];
    render(
      <MemoryRouter
        initialEntries={["/app/settings/scheduling/conflicts"]}
      >
        <Routes>
          <Route path="/app/settings" element={<SettingsLayout />}>
            <Route
              path="scheduling/conflicts"
              element={
                <SettingsPageRoute page="conflicts">
                  <p>Conflict handling route</p>
                </SettingsPageRoute>
              }
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Conflict handling route")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Conflict handling" }).className,
    ).toContain("active");
    expect(screen.queryByRole("link", { name: "Schedule rules" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Shift catalog" })).toBeNull();
  });

  it("uses Conflict handling as the Settings landing page for its permission alone", async () => {
    permissions = ["schedule.conflict_rules.manage"];
    actions = ["settings.conflict_rules.write"];
    render(
      <MemoryRouter initialEntries={["/app/settings"]}>
        <Routes>
          <Route path="/app/settings" element={<SettingsLayout />}>
            <Route index element={<SettingsHomeRedirect />} />
            <Route
              path="scheduling/conflicts"
              element={<p>Conflict handling landing</p>}
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Conflict handling landing")).toBeTruthy();
  });

  it("keeps Shift labels active without activating Schedule rules", () => {
    permissions = [
      "settings.schedule_rules.read",
      "settings.shift_catalog.read",
    ];
    actions = ["settings.shift_catalog.read"];
    render(
      <MemoryRouter initialEntries={["/app/settings/scheduling/shift-labels"]}>
        <Routes>
          <Route path="/app/settings" element={<SettingsLayout />}>
            <Route
              path="scheduling/shift-labels"
              element={<p>Shift labels route</p>}
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("link", { name: "Schedule rules" }).className,
    ).not.toContain("active");
    expect(
      screen.getByRole("link", { name: "Shift catalog" }).className,
    ).toContain("active");
  });

  it("removes Important Dates from the Settings rail", () => {
    permissions = ["settings.general.read", "important_dates.read"];
    actions = ["settings.important_dates.read"];
    render(
      <MemoryRouter initialEntries={["/app/settings/general"]}>
        <Routes>
          <Route path="/app/settings" element={<SettingsLayout />}>
            <Route path="general" element={<p>General route</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByRole("link", { name: "Important dates" })).toBeNull();
  });

  it("redirects legacy Settings Important Dates routes to the top-level app surface", async () => {
    permissions = ["settings.general.read", "important_dates.read"];
    actions = ["settings.important_dates.read"];
    render(
      <MemoryRouter initialEntries={["/app/settings/important-dates"]}>
        <Routes>
          <Route path="/app/settings" element={<SettingsLayout />}>
            <Route
              path="important-dates"
              element={<Navigate to="/app/important-dates" replace />}
            />
            <Route
              path="closed-days"
              element={<Navigate to="/app/important-dates" replace />}
            />
            <Route
              path="important-dates/closed-days"
              element={<Navigate to="/app/important-dates" replace />}
            />
          </Route>
          <Route path="/app/important-dates" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect((await screen.findByLabelText("Current path")).textContent).toBe(
      "/app/important-dates",
    );
  });
});

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Current path">{location.pathname}</output>;
}
