import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { documentTypeSchema } from "@newfork/shared";
import DocumentsSettingsPage from "./DocumentsSettingsPage";
import {
  listDocumentTypes,
  saveDocumentType,
  setDocumentTypeArchived,
} from "./documents-data";
const auth = vi.hoisted(() => ({
  permissions: ["documents.read", "documents.manage"],
}));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    context: {
      workspace: { id: "00000000-0000-4000-8000-000000000001" },
      permissions: auth.permissions,
    },
  }),
}));
vi.mock("./documents-data", () => ({
  listDocumentTypes: vi.fn(),
  saveDocumentType: vi.fn(),
  reorderDocumentTypes: vi.fn(),
  setDocumentTypeArchived: vi.fn(),
}));
vi.mock("../documents/EmployeeDocumentsList", () => ({
  EmployeeDocumentsList: () => null,
}));
vi.mock("./DocumentSettingsEditor", () => ({
  DocumentSettingsEditor: ({ onClose }: { onClose: () => void }) => (
    <button onClick={onClose}>Close test editor</button>
  ),
}));
const record = documentTypeSchema.parse({
  id: "00000000-0000-4000-8000-000000000002",
  workspace_id: "00000000-0000-4000-8000-000000000001",
  title: "Safety certificate",
  description: "Current certification",
  required_at_onboarding: false,
  requires_review: true,
  accepted_formats: ["pdf"],
  tracks_expiry: false,
  expiry_warning_days: 30,
  sort_order: 0,
  archived_at: null,
  publication_status: "draft",
  publication_revision: 1,
});
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DocumentsSettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  auth.permissions = ["documents.read", "documents.manage"];
  vi.mocked(listDocumentTypes).mockResolvedValue([record]);
});
it("opens from row cells and blank space without swallowing menu actions", async () => {
  mount();
  const row = (await screen.findByTitle("Safety certificate")).closest(
    ".job-catalog-row",
  ) as HTMLElement;
  fireEvent.click(within(row).getByText("Current certification"));
  expect(
    screen.getByRole("dialog", { name: "Edit Safety certificate" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close test editor" }));
  fireEvent.click(row);
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close test editor" }));
  fireEvent.click(
    within(row).getByRole("button", { name: "Actions for Safety certificate" }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(saveDocumentType).not.toHaveBeenCalled();
  expect(setDocumentTypeArchived).not.toHaveBeenCalled();
  fireEvent.click(
    within(row).getByRole("button", { name: "Edit document type" }),
  );
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
});
it("keeps read-only rows closed and retains a native keyboard edit button", async () => {
  auth.permissions = ["documents.read"];
  mount();
  const row = (await screen.findByTitle("Safety certificate")).closest(
    ".job-catalog-row",
  ) as HTMLElement;
  expect(within(row).getByRole("button")).toHaveProperty("disabled", true);
  fireEvent.click(row);
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("composes exclusive status, requirement and search filters and keeps published rows open", async () => {
  const published = {
    ...record,
    id: "00000000-0000-4000-8000-000000000003",
    title: "Published safety",
    publication_status: "published" as const,
    published_at: "2026-09-17T15:04:00.000Z",
  };
  const archived = {
    ...record,
    id: "00000000-0000-4000-8000-000000000004",
    title: "Archived safety",
    archived_at: "2026-09-15T00:00:00Z",
  };
  vi.mocked(listDocumentTypes).mockResolvedValue([record, published, archived]);
  mount();
  await screen.findByTitle("Safety certificate");
  expect(screen.queryByTitle("Archived safety")).toBeNull();
  expect(screen.queryByRole("tab", { name: "Employee documents" })).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: "Published" }));
  expect(screen.queryByTitle("Safety certificate")).toBeNull();
  const row = screen
    .getByTitle("Published safety")
    .closest(".job-catalog-row") as HTMLElement;
  expect(within(row).getByText("Published")).toBeTruthy();
  expect(within(row).getByRole("time")).toHaveProperty(
    "dateTime",
    "2026-09-17T15:04:00.000Z",
  );
  fireEvent.click(row);
  expect(
    screen.getByRole("dialog", { name: "Edit Published safety" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close test editor" }));
  fireEvent.click(
    within(row).getByRole("button", { name: "Actions for Published safety" }),
  );
  expect(
    within(row).getByRole("button", { name: "View document type" }),
  ).toHaveProperty("disabled", false);
  expect(within(row).getByRole("button", { name: "Unpublish" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Search document types"), {
    target: { value: "no match" },
  });
  expect(screen.queryByTitle("Published safety")).toBeNull();
  fireEvent.change(screen.getByLabelText("Search document types"), {
    target: { value: "safety" },
  });
  fireEvent.click(screen.getByRole("tab", { name: "Archived" }));
  expect(screen.getByTitle("Archived safety")).toBeTruthy();
  expect(screen.queryByTitle("Published safety")).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: "Draft" }));
  fireEvent.change(screen.getByLabelText("Filter by requirement"), {
    target: { value: "optional" },
  });
  expect(screen.getByTitle("Safety certificate")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Filter by requirement"), {
    target: { value: "required" },
  });
  expect(screen.queryByTitle("Safety certificate")).toBeNull();
});

it("shows unavailable state and disables creation when publication storage is unavailable", async () => {
  vi.mocked(listDocumentTypes).mockRejectedValue(
    new Error(
      "Document publishing is temporarily unavailable. A workspace update is required.",
    ),
  );
  mount();
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Document publishing is temporarily unavailable. A workspace update is required.",
  );
  expect(
    screen.getByRole("button", { name: "Add document type" }),
  ).toHaveProperty("disabled", true);
  expect(screen.queryByText("No document types")).toBeNull();
  expect(saveDocumentType).not.toHaveBeenCalled();
});
