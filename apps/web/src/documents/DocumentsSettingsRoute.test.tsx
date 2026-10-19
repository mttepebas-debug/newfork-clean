import { Suspense } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { DocumentsSettingsRoute } from "./DocumentsSettingsRoute";
import { ActionRoute } from "../auth/ActionRoute";
const auth = vi.hoisted(() => ({
  permissions: ["workspace.read", "documents.read"],
  // The gates read the core's answer (can()), never the permission keys.
  actions: ["workspace.read", "settings.documents.read"],
}));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    // Where a refused route lands is the core's answer (resolveLanding).
    context: {
      permissions: auth.permissions,
      actions: auth.actions,
      membership: { access: { employee: false, management: "manager" } },
    },
  }),
}));
vi.mock("../settings/DocumentsSettingsPage", () => ({
  default: () => <div>Definitions page</div>,
}));
function EmployeePage() {
  const location = useLocation();
  return (
    <div>
      Employee documents {location.search}
      {location.hash}
    </div>
  );
}
function mount(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Suspense>
        <Routes>
          <Route
            path="/app/settings/documents"
            element={<DocumentsSettingsRoute />}
          />
          <Route
            path="/app/employees/documents"
            element={
              <ActionRoute action="documents.read">
                <EmployeePage />
              </ActionRoute>
            }
          />
          <Route
            path="/app/workspace"
            element={<div>Workspace fallback</div>}
          />
        </Routes>
      </Suspense>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  auth.permissions = ["workspace.read", "documents.read"];
  auth.actions = ["workspace.read", "settings.documents.read"];
});
it("opens only definitions at Settings", async () => {
  mount("/app/settings/documents");
  expect(await screen.findByText("Definitions page")).toBeTruthy();
});
it("preserves legacy requirement, workspace and other query values on redirect", async () => {
  auth.permissions.push("employee_documents.read");
  auth.actions.push("documents.read");
  mount(
    "/app/settings/documents?requirement=abc&workspace=xyz&filter=missing#review",
  );
  expect(
    await screen.findByText(
      "Employee documents ?requirement=abc&workspace=xyz&filter=missing#review",
    ),
  ).toBeTruthy();
});
it("supports old employee-only settings bookmarks without granting definition access", async () => {
  auth.permissions = ["workspace.read", "employee_documents.read"];
  auth.actions = ["workspace.read", "documents.read"];
  mount("/app/settings/documents");
  expect(await screen.findByText("Employee documents")).toBeTruthy();
});
// A refused address shows the no-access card in place, never a silent trip
// elsewhere (Mert 2026-10-14).
async function expectRefused() {
  expect(
    await screen.findByRole("heading", { name: "You don't have access to Documents" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Back to Home" }).getAttribute("href"),
  ).toBe("/app/workspace");
  expect(screen.queryByText("Workspace fallback")).toBeNull();
  expect(screen.queryByText("Definitions page")).toBeNull();
  expect(screen.queryByText(/Employee documents/)).toBeNull();
}
it("denies the employee route when the core does not open documents.read", async () => {
  mount("/app/employees/documents");
  await expectRefused();
});
it("does not turn a legacy employee deep link into definition permission", async () => {
  mount("/app/settings/documents?requirement=abc");
  await expectRefused();
});
it("does not open definitions to somebody the core holds back, whatever their role grants", async () => {
  // An admin whose required document is overdue: the role still lists the
  // keys, the core (and the API) refuse.
  auth.permissions = ["workspace.read", "documents.read", "employee_documents.read"];
  auth.actions = ["workspace.read"];
  mount("/app/settings/documents");
  await expectRefused();
});
