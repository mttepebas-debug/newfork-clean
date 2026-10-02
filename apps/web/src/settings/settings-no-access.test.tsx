// @vitest-environment jsdom
import type { ActiveWorkspaceContext } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestError } from "../lib/request-error";
import DocumentsSettingsPage from "./DocumentsSettingsPage";
import ImportantDatesSettingsPage from "./ImportantDatesSettingsPage";
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
    "settings.locations.read", "settings.jobs.read", "settings.shift_catalog.read", "important_dates.read",
    "roles.read", "documents.read", "signature_templates.read", "employees.read",
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
  listImportantDates: vi.fn(async () => { throw refused(); }),
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
  ["Locations", LocationsSettingsPage, "locations"],
  ["Jobs", JobsSettingsPage, "positions"],
  ["Shift types", ShiftTypesSettingsPage, "shift types"],
  ["Shift labels", ShiftLabelsSettingsPage, "shift labels"],
  ["Important dates", ImportantDatesSettingsPage, "important dates"],
  ["Roles", RolesSettingsPage, "roles"],
  ["Documents", DocumentsSettingsPage, "document settings"],
  ["Acknowledgements", SignatureTemplatesSettingsPage, "acknowledgements"],
];

describe("Settings pages show the no-access card when the API refuses their read (FB-6.1.9)", () => {
  afterEach(cleanup);

  it.each(pages)("%s", async (_page, Page, subject) => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <Page />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { name: `You don't have access to ${subject}` })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Home" })).toBeTruthy();
    expect(screen.queryByText("Forbidden")).toBeNull();
  });

  // The card sits in the shift catalog's tab panel: the page title and the
  // Shift types | Shift labels switch stay, so the other tab is still reachable.
  it.each([
    ["Shift types", ShiftTypesSettingsPage, "shift types"],
    ["Shift labels", ShiftLabelsSettingsPage, "shift labels"],
  ] as Array<[string, ComponentType, string]>)("%s keeps its title and tabs around the card", async (title, Page, subject) => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <Page />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { name: `You don't have access to ${subject}` })).toBeTruthy();
    expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Shift types" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Shift labels" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Add shift/ })).toBeNull();
  });
});
