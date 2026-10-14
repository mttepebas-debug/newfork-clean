// @vitest-environment jsdom
import type { ActiveWorkspaceContext } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestError } from "../lib/request-error";
import DocumentsSettingsPage from "./DocumentsSettingsPage";
import JobsSettingsPage from "./JobsSettingsPage";
import LocationsSettingsPage from "./LocationsSettingsPage";
import RolesSettingsPage from "./RolesSettingsPage";
import ShiftLabelsSettingsPage from "./ShiftLabelsSettingsPage";
import ShiftTypesSettingsPage from "./ShiftTypesSettingsPage";
import SignatureTemplatesSettingsPage from "./SignatureTemplatesSettingsPage";

const refused = () => new RequestError("Forbidden", "authz.missing_permission", "settings", 403);
const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const context = {
  userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
  workspace: { id: workspaceId, name: "Meyhouse" },
  membership: { role: "manager", status: "active", allLocations: false },
  // Enough to open every page, so only the API's answer decides.
  permissions: [
    "settings.locations.read", "settings.jobs.read", "settings.shift_catalog.read",
    "roles.read", "documents.read", "employees.read",
  ],
  // Pages gated by can() read the core's answer instead.
  actions: ["settings.documents.read"],
  onboarding: { status: "complete", currentStep: 4 },
  documentAccess: { restricted: false },
  locationScope: { allLocations: false, locationIds: [] },
} as unknown as ActiveWorkspaceContext;

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context }) }));
vi.mock("./organization-data", async (original) => ({
  ...(await original<typeof import("./organization-data")>()),
  listLocations: vi.fn(async () => { throw refused(); }),
  listDepartments: vi.fn(async () => { throw refused(); }),
  listJobs: vi.fn(async () => { throw refused(); }),
  loadDepartmentsAndJobs: vi.fn(async () => { throw refused(); }),
  listShiftTypes: vi.fn(async () => { throw refused(); }),
  listShiftLabels: vi.fn(async () => { throw refused(); }),
}));
vi.mock("./roles-data", async (original) => ({
  ...(await original<typeof import("./roles-data")>()),
  loadRoleWorkspace: vi.fn(async () => { throw refused(); }),
}));
vi.mock("./documents-data", async (original) => ({
  ...(await original<typeof import("./documents-data")>()),
  listDocumentTypes: vi.fn(async () => { throw refused(); }),
}));
vi.mock("./signature-templates-data", async (original) => ({
  ...(await original<typeof import("./signature-templates-data")>()),
  listSignatureSettings: vi.fn(async () => { throw refused(); }),
}));

const pages: Array<[string, ComponentType, string]> = [
  ["Locations", LocationsSettingsPage, "/app/settings/locations"],
  ["Jobs", JobsSettingsPage, "/app/settings/jobs"],
  ["Shift types", ShiftTypesSettingsPage, "/app/settings/scheduling/shift-types"],
  ["Shift labels", ShiftLabelsSettingsPage, "/app/settings/scheduling/shift-labels"],
  ["Roles & permissions", RolesSettingsPage, "/app/settings/roles"],
  ["Documents", DocumentsSettingsPage, "/app/settings/documents"],
  ["Acknowledgements", SignatureTemplatesSettingsPage, "/app/settings/acknowledgements"],
];

describe("Settings pages show the no-access card when the API refuses their read (FB-6.1.9)", () => {
  afterEach(cleanup);

  // The card alone, named after the page's menu entry: no title, tabs or
  // toolbar of the page around it (Mert 2026-10-14).
  it.each(pages)("%s", async (name, Page, path) => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[path]}>
          <Page />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { name: `You don't have access to ${name}` })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Home" })).toBeTruthy();
    expect(screen.queryByText("Forbidden")).toBeNull();
    expect(screen.getAllByRole("heading")).toHaveLength(1);
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(container.querySelector(".catalog-page-header, .catalog-toolbar")).toBeNull();
  });
});
