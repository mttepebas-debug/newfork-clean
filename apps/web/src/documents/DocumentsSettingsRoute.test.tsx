import { Suspense } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { DocumentsSettingsRoute } from "./DocumentsSettingsRoute";
import { PermissionRoute } from "../auth/PermissionRoute";
const auth = vi.hoisted(() => ({
  permissions: ["workspace.read", "documents.read"],
}));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    context: { permissions: auth.permissions, membership: { role: "manager" } },
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
              <PermissionRoute anyOf={["employee_documents.read"]}>
                <EmployeePage />
              </PermissionRoute>
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
});
it("opens only definitions at Settings", async () => {
  mount("/app/settings/documents");
  expect(await screen.findByText("Definitions page")).toBeTruthy();
});
it("preserves legacy requirement, workspace and other query values on redirect", async () => {
  auth.permissions.push("employee_documents.read");
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
  mount("/app/settings/documents");
  expect(await screen.findByText("Employee documents")).toBeTruthy();
});
it("denies the employee route without employee_documents.read", async () => {
  mount("/app/employees/documents");
  expect(await screen.findByText("Workspace fallback")).toBeTruthy();
});
it("does not turn a legacy employee deep link into definition permission", async () => {
  mount("/app/settings/documents?requirement=abc");
  expect(await screen.findByText("Workspace fallback")).toBeTruthy();
});
