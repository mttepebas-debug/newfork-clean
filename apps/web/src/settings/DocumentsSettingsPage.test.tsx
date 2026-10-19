import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { documentTypeSchema } from "@newfork/shared";
import DocumentsSettingsPage from "./DocumentsSettingsPage";
import { stubPhoneWidth } from "../lib/phone-width.test-util";
import {
  listDocumentTypes,
  previewDocumentPublication,
  saveDocumentType,
  setDocumentTypeArchived,
} from "./documents-data";
const auth = vi.hoisted(() => ({
  permissions: ["documents.read", "documents.manage"],
  actions: ["settings.documents.read", "settings.documents.write"],
}));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    context: {
      workspace: { id: "00000000-0000-4000-8000-000000000001" },
      permissions: auth.permissions,
      actions: auth.actions,
    },
  }),
}));
vi.mock("./documents-data", () => ({
  listDocumentTypes: vi.fn(),
  saveDocumentType: vi.fn(),
  reorderDocumentTypes: vi.fn(),
  setDocumentTypeArchived: vi.fn(),
  previewDocumentPublication: vi.fn(),
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
  return client;
}
beforeEach(() => {
  vi.clearAllMocks();
  auth.permissions = ["documents.read", "documents.manage"];
  auth.actions = ["settings.documents.read", "settings.documents.write"];
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
  // The role still lists documents.manage; the core does not open writing.
  auth.actions = ["settings.documents.read"];
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
  // BL-856: the narrow column cuts the time; hovering reads it whole.
  expect(within(row).getByRole("time").title).toBe(
    within(row).getByRole("time").textContent,
  );
  expect(within(row).getByRole("time").title).toMatch(/2026, \d+:\d\d [AP]M$/);
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
  // A filter that empties the list says so, with no add button.
  expect(screen.getByText("No document types match these filters.")).toBeTruthy();
  expect(screen.getByText("Try another status or clear your search.")).toBeTruthy();
  expect(screen.queryByText("No document types")).toBeNull();
  expect(screen.getAllByRole("button", { name: "New document" })).toHaveLength(1);
});

it("shows the load error and disables creation when document types cannot be read", async () => {
  vi.mocked(listDocumentTypes).mockRejectedValue(
    new Error(
      "Document types could not be loaded.",
    ),
  );
  mount();
  // The "B" card (Mert 2026-10-14): a heading and Try again, never the server's sentence.
  const card = await screen.findByRole("alert");
  expect(within(card).getByRole("heading", { name: "We couldn't load document types" })).toBeTruthy();
  expect(within(card).getByRole("button", { name: "Try again" })).toBeTruthy();
  expect(screen.queryByText("Document types could not be loaded.")).toBeNull();
  expect(
    screen.getByRole("button", { name: "New document" }),
  ).toHaveProperty("disabled", true);
  expect(screen.queryByText("No document types")).toBeNull();
  expect(saveDocumentType).not.toHaveBeenCalled();
});
it("keeps the heading row over an empty catalog and adds from the table", async () => {
  vi.mocked(listDocumentTypes).mockResolvedValue([]);
  mount();
  expect(await screen.findByText("No document types")).toBeTruthy();
  const catalog = screen.getByLabelText("Document types");
  expect(
    within(catalog)
      .getAllByRole("columnheader")
      .map((header) => header.textContent),
  ).toEqual(["Document name", "Description", "Status", "Published"]);
  expect(
    within(catalog).getByText(
      "Add the first document requirement to get started.",
    ),
  ).toBeTruthy();
  // One add button at the right end of the filter row, none in the heading.
  // A computer shows General's heading, not the list eyebrow (Mert 2026-10-18).
  expect(document.querySelector(".settings-page-header .settings-heading-icon")).toBeTruthy();
  expect(screen.queryByText("SETTINGS")).toBeNull();
  expect(
    screen.getAllByRole("button", { name: "New document" }).map((button) =>
      Boolean(button.closest(".catalog-toolbar-filter-row, .catalog-table-empty")),
    ),
  ).toEqual([true, true]);
  fireEvent.click(
    within(catalog).getByRole("button", { name: "New document" }),
  );
  expect(screen.getByRole("dialog")).toBeTruthy();
});
it("offers no add button in an empty catalog the person cannot write", async () => {
  auth.actions = ["settings.documents.read"];
  vi.mocked(listDocumentTypes).mockResolvedValue([]);
  mount();
  const catalog = await screen.findByLabelText("Document types");
  expect(within(catalog).getByText("No document types")).toBeTruthy();
  expect(within(catalog).queryByRole("button", { name: "New document" })).toBeNull();
});
it("sorts rows from the heading and clears back to the saved order", async () => {
  vi.mocked(listDocumentTypes).mockResolvedValue([
    { ...record, id: "00000000-0000-4000-8000-000000000005", title: "Beta", sort_order: 0 },
    { ...record, id: "00000000-0000-4000-8000-000000000006", title: "Alpha", sort_order: 1 },
  ]);
  mount();
  await screen.findByTitle("Beta");
  const names = () =>
    Array.from(document.querySelectorAll(".job-catalog-row .job-row-name")).map(
      (name) => name.textContent,
    );
  expect(names()).toEqual(["Beta", "Alpha"]);
  const header = screen
    .getByRole("button", { name: "Document name" })
    .closest("[role='columnheader']") as HTMLElement;
  fireEvent.click(screen.getByRole("button", { name: "Document name" }));
  expect(names()).toEqual(["Alpha", "Beta"]);
  expect(header.getAttribute("aria-sort")).toBe("ascending");
  fireEvent.click(screen.getByRole("button", { name: "Document name" }));
  expect(names()).toEqual(["Beta", "Alpha"]);
  expect(header.getAttribute("aria-sort")).toBe("descending");
  expect(screen.queryByRole("button", { name: "Clear column sorting" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Document name" }));
  expect(header.getAttribute("aria-sort")).toBe("none");
});
it("does not read definitions the core does not open", () => {
  auth.actions = [];
  mount();
  expect(listDocumentTypes).not.toHaveBeenCalled();
});

// Mert 2026-10-14: on a phone "+ Add" sits at the right end of the tab row.
it("keeps New document in the filter row on a computer", async () => {
  mount();
  await screen.findByTitle("Safety certificate");
  expect(
    screen.getByRole("button", { name: "New document" }).closest(".catalog-toolbar-filter-row"),
  ).toBeTruthy();
});
it("puts New document at the right end of the tab row on a phone", async () => {
  stubPhoneWidth();
  mount();
  await screen.findByTitle("Safety certificate");
  const add = screen.getByRole("button", { name: "New document" });
  expect(add.closest(".catalog-toolbar-status-row .catalog-tab-add")).toBeTruthy();
  expect(add.closest(".catalog-toolbar-filter-row")).toBeNull();
});
afterEach(() => vi.unstubAllGlobals());
it("outlines document types while they load", () => {
  vi.mocked(listDocumentTypes).mockReturnValueOnce(new Promise(() => {}));
  mount();
  expect(screen.getByRole("status").textContent).toContain("Loading document types");
  expect(screen.queryByText("Loading document types...")).toBeNull();
});
it("loads the list again from the card's Try again", async () => {
  vi.mocked(listDocumentTypes).mockRejectedValueOnce(new Error("catalog down"));
  mount();
  const card = await screen.findByRole("alert");
  fireEvent.click(within(card).getByRole("button", { name: "Try again" }));
  expect(await screen.findByLabelText("Document types")).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "We couldn't load document types" })).toBeNull();
});
it("keeps the last list and says so when a refresh fails", async () => {
  const client = mount();
  const catalog = await screen.findByLabelText("Document types");
  vi.mocked(listDocumentTypes).mockRejectedValueOnce(new Error("catalog down"));
  await act(async () => {
    await client.refetchQueries();
  });
  expect(
    await screen.findByText("Document types didn't refresh. This is the last list that loaded."),
  ).toBeTruthy();
  expect(catalog.isConnected).toBe(true);
  expect(screen.queryByText("catalog down")).toBeNull();
});
// BL-821: archiving a published document stops it for the people asked; the
// confirming click says how many before it goes.
it("says how many people archiving a published document stops it for", async () => {
  const published = { ...record, publication_status: "published" as const };
  vi.mocked(listDocumentTypes).mockResolvedValue([published]);
  vi.mocked(previewDocumentPublication).mockResolvedValue({
    employees: [{ action: "pause" }, { action: "pause" }, { action: "unchanged" }],
  } as unknown as Awaited<ReturnType<typeof previewDocumentPublication>>);
  vi.mocked(setDocumentTypeArchived).mockResolvedValue();
  mount();
  const row = (await screen.findByTitle("Safety certificate")).closest(
    ".job-catalog-row",
  ) as HTMLElement;
  fireEvent.click(within(row).getByRole("button", { name: "Archive" }));
  expect(
    await within(row).findByRole("button", {
      name: "Confirm archive: stops it for 2 people",
    }),
  ).toBeTruthy();
  expect(previewDocumentPublication).toHaveBeenCalledWith(
    "00000000-0000-4000-8000-000000000001",
    published.id,
  );
  fireEvent.click(
    within(row).getByRole("button", { name: "Confirm archive: stops it for 2 people" }),
  );
  await vi.waitFor(() =>
    expect(setDocumentTypeArchived).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      published.id,
      true,
    ),
  );
});
it("archives a draft document without asking who it stops for", async () => {
  mount();
  const row = (await screen.findByTitle("Safety certificate")).closest(
    ".job-catalog-row",
  ) as HTMLElement;
  fireEvent.click(within(row).getByRole("button", { name: "Archive" }));
  expect(within(row).getByRole("button", { name: "Confirm archive" })).toBeTruthy();
  expect(previewDocumentPublication).not.toHaveBeenCalled();
});
