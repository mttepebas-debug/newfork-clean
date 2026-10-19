import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import SettingsLayout from "./SettingsLayout";

const auth = vi.hoisted(() => ({
  permissions: [] as string[],
  actions: [] as string[],
}));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    context: {
      permissions: auth.permissions,
      actions: auth.actions,
      membership: { access: { employee: false, management: "admin" }, status: "active" },
    },
  }),
}));

function mount() {
  render(
    <MemoryRouter initialEntries={["/app/settings/documents"]}>
      <Routes>
        <Route path="/app/settings" element={<SettingsLayout />}>
          <Route path="documents" element={<p>Documents route</p>} />
        </Route>
        <Route path="/app" element={<p>App home</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.permissions = [];
  auth.actions = [];
});

// FB-6.6: document settings open Settings by the core's answer, not the keys.
it.each(["settings.documents.read", "documents.read", "settings.signature_templates.read"])(
  "lets somebody the core opens %s to enter Settings",
  (action) => {
    auth.actions = [action];
    mount();
    expect(screen.getByText("Documents route")).toBeTruthy();
  },
);

it("keeps out somebody the core holds back, whatever their role lists", () => {
  // An admin whose required document is overdue.
  auth.permissions = ["documents.read", "employee_documents.read"];
  mount();
  // The card in place of Settings, not a silent trip home (Mert 2026-10-14).
  expect(
    screen.getByRole("heading", { name: "You don't have access to Settings" }),
  ).toBeTruthy();
  expect(screen.queryByText("App home")).toBeNull();
  expect(screen.queryByText("Documents route")).toBeNull();
  expect(screen.queryByRole("navigation", { name: "Workspace settings" })).toBeNull();
});
