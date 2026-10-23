// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestError } from "../lib/request-error";
import { listDocuments } from "./document-data";
import { EmployeeDocumentsList } from "./EmployeeDocumentsList";
import EmployeeDocumentsPage from "./EmployeeDocumentsPage";

const auth = vi.hoisted(() => ({ context: null as unknown }));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context: auth.context }) }));
vi.mock("./document-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./document-data")>()),
  listDocuments: vi.fn(),
}));

describe("no access (FB-6.1.9)", () => {
  afterEach(() => {
    auth.context = null;
  });
  it("shows the no-access card, not the raw error, when the API refuses these documents (FB-6.1.9)", async () => {
    vi.mocked(listDocuments).mockRejectedValue(
      new RequestError("Forbidden", "authz.missing_permission", undefined, 403),
    );
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <EmployeeDocumentsList
            audience={{ workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd", selfOnly: false }}
            userId="d9f43e62-e099-48e1-bc6f-a5aabe8e87d5"
            canReview={false}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { name: "You don't have access to these documents" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Home" }).getAttribute("href")).toBe("/workspaces");
    expect(screen.queryByText("Forbidden")).toBeNull();
    // The card alone: no status tabs, filters or empty table (Mert 2026-10-14).
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("drops the Employees → Documents page title too, and names the page", async () => {
    vi.mocked(listDocuments).mockRejectedValue(
      new RequestError("Forbidden", "authz.missing_permission", undefined, 403),
    );
    auth.context = {
      userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
      workspace: { id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd", name: "Meyhouse" },
      membership: { access: { employee: false, management: "manager" } },
      actions: ["workspace.read"],
    };
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/app/employees/documents"]}>
          <EmployeeDocumentsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { name: "You don't have access to Documents" })).toBeTruthy();
    expect(screen.getAllByRole("heading")).toHaveLength(1);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("personal list (Account › Documents)", () => {
  const obligation = {
    id: "9b1c7a52-4f0e-4b5c-8d1e-2f3a4b5c6d7e",
    kind: "document",
    status: "missing",
    title: "Food handler card",
    employee_name: "Casey Rivera",
    employee_id: "c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f",
    location_ids: ["a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"],
    location_names: ["Downtown"],
    source_id: null,
    suspended: false,
  };
  const renderList = (personal: boolean, selfOnly = true) =>
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <EmployeeDocumentsList
            audience={{ workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd", selfOnly }}
            userId="d9f43e62-e099-48e1-bc6f-a5aabe8e87d5"
            canReview={false}
            personal={personal}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

  it("drops the employee column, location filter and employee search for one person", async () => {
    vi.mocked(listDocuments).mockResolvedValue([obligation] as never);
    renderList(true);
    expect(await screen.findByRole("cell", { name: /Food handler card/ })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: /Employee/ })).toBeNull();
    expect(screen.queryByText("Casey Rivera")).toBeNull();
    expect(screen.queryByLabelText("Location")).toBeNull();
    expect(screen.queryByLabelText("Search employee documents")).toBeNull();
    expect(screen.getByLabelText("Document type")).toBeTruthy();
    expect(screen.getByText("Downtown")).toBeTruthy();
  });

  it("says in one line when nothing is asked of the person, with no table", async () => {
    vi.mocked(listDocuments).mockResolvedValue([] as never);
    renderList(true);
    expect(await screen.findByText("Nothing has been asked of you here.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByLabelText("Document type")).toBeNull();
  });

  it("shows the owner's excused document as on file once a copy is accepted (BL-118)", async () => {
    const excused = { ...obligation, status: "exempt", exemption_locked: true };
    vi.mocked(listDocuments).mockResolvedValue([
      { ...excused, approved_id: "copy" },
      { ...excused, id: "0f1e2d3c-4b5a-4968-8776-655443322110", title: "ServSafe", approved_id: null },
    ] as never);
    renderList(true);
    // Exempt reads as done: it sits under Completed (KARARLAR S-255).
    fireEvent.click(await screen.findByRole("button", { name: /^Completed/ }));
    expect(await screen.findByRole("cell", { name: "On file" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "Exempt" })).toBeTruthy();
  });

  it("keeps the full table everywhere else", async () => {
    vi.mocked(listDocuments).mockResolvedValue([obligation] as never);
    renderList(false);
    expect(await screen.findByText("Casey Rivera")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: /Employee/ })).toBeTruthy();
    expect(screen.getByLabelText("Location")).toBeTruthy();
    expect(screen.getByLabelText("Search employee documents")).toBeTruthy();
    // The status reads as a chip coloured by its weight (DOC-TABLE).
    const chip = document.querySelector(".list-chip");
    expect([chip?.textContent, chip?.getAttribute("data-tone")]).toEqual(["Missing", "red"]);
  });

  it("keeps the heading row over an empty filter result with its two lines", async () => {
    vi.mocked(listDocuments).mockResolvedValue([obligation] as never);
    renderList(false);
    await screen.findByText("Casey Rivera");
    fireEvent.change(screen.getByLabelText("Search employee documents"), {
      target: { value: "nobody" },
    });
    expect(
      screen.getByRole("heading", { name: "No documents match these filters." }),
    ).toBeTruthy();
    expect(screen.getByText("Try another status or clear your search.")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: /Employee/ })).toBeTruthy();
  });

  // BL-834: a new workspace with no documents yet is not a filter miss.
  it("says no documents yet when there are none and nothing is filtered", async () => {
    vi.mocked(listDocuments).mockResolvedValue([] as never);
    renderList(false);
    expect(await screen.findByRole("heading", { name: "No documents yet" })).toBeTruthy();
    expect(screen.getByText("Documents your team submits show up here.")).toBeTruthy();
    expect(screen.queryByText("No documents match these filters.")).toBeNull();
    fireEvent.change(screen.getByLabelText("Search employee documents"), {
      target: { value: "nobody" },
    });
    expect(
      screen.getByRole("heading", { name: "No documents match these filters." }),
    ).toBeTruthy();
  });

  // BL-831: Status sorts by weight (Needs review first, Completed last), not
  // by the stored code.
  it("sorts Status by weight, not alphabetically by code", async () => {
    const row = (id: string, status: string, employee_name: string) => ({
      ...obligation,
      id,
      status,
      employee_name,
    });
    vi.mocked(listDocuments).mockResolvedValue([
      row("1", "completed", "Avery"),
      row("2", "paused", "Blake"),
      row("3", "rejected", "Casey"),
      row("4", "expired", "Drew"),
      row("5", "missing", "Emery"),
      row("6", "pending_review", "Finley"),
    ] as never);
    renderList(false, false);
    await screen.findByText("Finley");
    fireEvent.click(screen.getByRole("button", { name: /^To do/ }));
    fireEvent.click(screen.getByRole("button", { name: /Status/ }));
    const chips = () =>
      Array.from(document.querySelectorAll("tbody .list-chip")).map((c) => c.textContent);
    expect(chips()).toEqual(["Missing", "Expired", "Rejected"]);
    fireEvent.click(screen.getByRole("button", { name: /Status/ }));
    expect(chips()).toEqual(["Rejected", "Expired", "Missing"]);
    fireEvent.click(screen.getByRole("button", { name: /^Completed/ }));
    expect(chips()).toEqual(["Completed", "Paused"]);
  });

  // BL-855: loading and a failed load sit where the rows go, not under the
  // empty table at the bottom of the screen.
  it("shows loading and a failed load in the table's place", async () => {
    vi.mocked(listDocuments).mockReturnValueOnce(new Promise(() => {}) as never);
    const { unmount } = renderList(false, false);
    expect(
      screen.getByText("Loading documents").closest(".employee-table-wrap"),
    ).toBeTruthy();
    expect(screen.queryByText("Loading documents…")).toBeNull();
    unmount();
    vi.mocked(listDocuments).mockRejectedValueOnce(new Error("Documents unavailable"));
    renderList(false, false);
    const card = await screen.findByRole("alert");
    expect(card.closest(".employee-table-wrap")).toBeTruthy();
    expect(within(card).getByRole("heading", { name: "We couldn't load documents" })).toBeTruthy();
    expect(screen.queryByText("Documents unavailable")).toBeNull();
    vi.mocked(listDocuments).mockResolvedValueOnce([obligation] as never);
    fireEvent.click(within(card).getByRole("button", { name: "Try again" }));
    expect((await screen.findAllByText("Food handler card")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { name: "We couldn't load documents" })).toBeNull();
  });

  it("keeps the last list and says so when a refresh fails", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(listDocuments).mockReset().mockResolvedValueOnce([obligation] as never);
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <EmployeeDocumentsList
            audience={{ workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd", selfOnly: false }}
            userId="d9f43e62-e099-48e1-bc6f-a5aabe8e87d5"
            canReview={false}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect((await screen.findAllByText("Food handler card")).length).toBeGreaterThan(0);
    vi.mocked(listDocuments)
      .mockRejectedValueOnce(new Error("Gateway timeout"))
      .mockResolvedValue([obligation] as never);
    await act(async () => {
      await client.refetchQueries();
    });
    const line = await screen.findByRole("alert");
    expect(line.textContent).toContain("Documents didn't refresh. This is the last list that loaded.");
    expect(screen.queryByRole("heading", { name: "We couldn't load documents" })).toBeNull();
    expect(screen.getAllByText("Food handler card").length).toBeGreaterThan(0);
    expect(screen.queryByText("Gateway timeout")).toBeNull();
    fireEvent.click(within(line).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(listDocuments).toHaveBeenCalledTimes(3);
  });

  it("still says the last list was empty when a refresh fails", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(listDocuments).mockReset().mockResolvedValueOnce([] as never);
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <EmployeeDocumentsList
            audience={{ workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd", selfOnly: false }}
            userId="d9f43e62-e099-48e1-bc6f-a5aabe8e87d5"
            canReview={false}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const empty = await screen.findByRole("heading", { name: /No documents/ });
    vi.mocked(listDocuments).mockRejectedValue(new Error("Gateway timeout"));
    await act(async () => {
      await client.refetchQueries();
    });
    expect((await screen.findByRole("alert")).textContent).toContain("Documents didn't refresh.");
    expect(screen.getByRole("heading", { name: empty.textContent ?? "" })).toBeTruthy();
  });

  it("keeps saying nothing is asked of the person when a refresh fails", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(listDocuments).mockReset().mockResolvedValueOnce([] as never);
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <EmployeeDocumentsList
            audience={{ workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd", selfOnly: true }}
            userId="d9f43e62-e099-48e1-bc6f-a5aabe8e87d5"
            canReview={false}
            personal
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Nothing has been asked of you here.")).toBeTruthy();
    vi.mocked(listDocuments).mockRejectedValue(new Error("Gateway timeout"));
    await act(async () => {
      await client.refetchQueries();
    });
    expect((await screen.findByRole("alert")).textContent).toContain("Documents didn't refresh.");
    expect(screen.getByText("Nothing has been asked of you here.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("heading", { name: /No documents/ })).toBeNull();
    expect(screen.queryByText("Gateway timeout")).toBeNull();
  });

  it("puts the failed-load card one level under the workspace heading on the personal page", async () => {
    vi.mocked(listDocuments).mockReset().mockRejectedValue(new Error("Documents unavailable"));
    renderList(true);
    const card = await screen.findByRole("alert");
    expect(within(card).getByRole("heading", { name: "We couldn't load documents" }).tagName).toBe("H3");
    expect(screen.queryByText("Nothing has been asked of you here.")).toBeNull();
  });
});

// KARARLAR S-255: Needs review · To do · Completed, no All.
describe("status tabs", () => {
  const row = (n: number, status: string, employee_name: string) => ({
    id: `10000000-0000-4000-8000-00000000000${n}`,
    kind: "document",
    status,
    title: "Food handler card",
    employee_name,
    employee_id: "c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f",
    location_ids: ["a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"],
    location_names: ["Downtown"],
    source_id: null,
    suspended: false,
  });
  const rows = [
    row(0, "pending_review", "Avery"),
    row(1, "timezone_required", "Blake"),
    row(2, "missing", "Casey"),
    row(3, "grace", "Drew"),
    row(4, "rejected", "Emery"),
    row(5, "expired", "Finley"),
    row(6, "completed", "Gray"),
    row(7, "exempt", "Harper"),
    row(8, "paused", "Indy"),
    row(9, "removed", "Jules"),
  ];
  const renderList = (selfOnly: boolean, extra: { initialRequirementId?: string; personal?: boolean } = {}) =>
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <EmployeeDocumentsList
            audience={{ workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd", selfOnly }}
            userId="d9f43e62-e099-48e1-bc6f-a5aabe8e87d5"
            canReview={false}
            {...extra}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  const tabs = () =>
    Array.from(document.querySelectorAll(".catalog-status-tabs button")).map((b) => b.textContent);
  const pressed = () =>
    document.querySelector(".catalog-status-tabs button[aria-pressed='true']")?.textContent;
  const names = () =>
    Array.from(document.querySelectorAll(".document-table tbody tr")).map((r) =>
      (r.querySelector("td")?.textContent ?? "").replace("Downtown", ""),
    );

  it("counts each tab by its group and never shows a removed one", async () => {
    vi.mocked(listDocuments).mockReset().mockResolvedValue(rows as never);
    renderList(false);
    await screen.findByText("Avery");
    expect(tabs()).toEqual(["Needs review2", "To do4", "Completed3"]);
    expect(names()).toEqual(["Avery", "Blake"]);
    fireEvent.click(screen.getByRole("button", { name: /^To do/ }));
    expect(names()).toEqual(["Casey", "Drew", "Emery", "Finley"]);
    fireEvent.click(screen.getByRole("button", { name: /^Completed/ }));
    expect(names()).toEqual(["Gray", "Harper", "Indy"]);
    expect(screen.queryByText("Jules")).toBeNull();
  });

  it("opens a manager's list on Needs review and the person's own on To do", async () => {
    vi.mocked(listDocuments).mockReset().mockResolvedValue(rows as never);
    const manager = renderList(false);
    await screen.findByText("Avery");
    expect(pressed()).toBe("Needs review2");
    manager.unmount();
    renderList(true);
    await screen.findByText("Casey");
    expect(pressed()).toBe("To do4");
  });

  it("opens on the tab of the document a link opens", async () => {
    vi.mocked(listDocuments).mockReset().mockResolvedValue(rows as never);
    renderList(false, { initialRequirementId: "10000000-0000-4000-8000-000000000006" });
    await screen.findByText("Gray");
    expect(pressed()).toBe("Completed3");
  });

  it("tells an empty tab apart from a list with no documents at all", async () => {
    vi.mocked(listDocuments).mockReset().mockResolvedValue([rows[6]] as never);
    renderList(false);
    expect(await screen.findByRole("heading", { name: "Nothing to review" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "No documents yet" })).toBeNull();
    expect(screen.queryByText("No documents match these filters.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^To do/ }));
    expect(screen.getByRole("heading", { name: "Nothing to do" })).toBeTruthy();
  });

  it("says no documents yet on whichever tab is open when there are none", async () => {
    vi.mocked(listDocuments).mockReset().mockResolvedValue([] as never);
    renderList(false);
    expect(await screen.findByRole("heading", { name: "No documents yet" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Completed/ }));
    expect(screen.getByRole("heading", { name: "No documents yet" })).toBeTruthy();
  });

  it("says the person's own tab is clear in one line", async () => {
    vi.mocked(listDocuments).mockReset().mockResolvedValue([rows[6]] as never);
    renderList(true, { personal: true });
    expect(await screen.findByText("Nothing to do.")).toBeTruthy();
    expect(screen.queryByText("No documents match these filters.")).toBeNull();
  });
});

// Needs you links (Mert 2026-10-22): Home opens Documents at the location and
// status of what it said, and one person's line opens that document.
describe("a link from Home's Needs you", () => {
  const downtown = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
  const harbor = "b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
  const row = (id: string, employee_name: string, status: string, location: string) => ({
    id,
    kind: "document",
    status,
    title: "Food handler card",
    employee_name,
    employee_id: "c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f",
    location_ids: [location],
    location_names: [location === downtown ? "Downtown" : "Harbor"],
    source_id: null,
    suspended: false,
  });
  afterEach(() => {
    auth.context = null;
  });
  const openAt = (url: string) => {
    auth.context = {
      userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
      workspace: { id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd", name: "Meyhouse" },
      membership: { access: { employee: false, management: "manager" } },
      actions: ["workspace.read", "documents.read"],
    };
    vi.mocked(listDocuments).mockReset().mockResolvedValue([
      row("1", "Avery", "expired", downtown),
      row("2", "Blake", "missing", downtown),
      row("3", "Casey", "expired", harbor),
    ] as never);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[url]}>
          <EmployeeDocumentsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };
  const names = () =>
    Array.from(document.querySelectorAll(".document-table tbody tr")).map((r) => r.querySelector("td")?.textContent ?? "");

  it("filters to the location and the tab it names", async () => {
    openAt(`/app/employees/documents?location=${downtown}&status=to_do`);
    await screen.findByText("Avery");
    expect(names().map((n) => n.replace("Downtown", ""))).toEqual(["Avery", "Blake"]);
    expect(screen.getByRole("button", { name: /^To do/ }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText("Location") as HTMLSelectElement).value).toBe(downtown);
  });

  // KARARLAR S-255: links made before the three tabs still land.
  it.each(["missing", "expired"])("opens an old %s link on To do", async (status) => {
    openAt(`/app/employees/documents?location=${downtown}&status=${status}`);
    await screen.findByText("Avery");
    expect(screen.getByRole("button", { name: /^To do/ }).getAttribute("aria-pressed")).toBe("true");
    expect(names()).toHaveLength(2);
  });

  it.each(["all", "nonsense"])("opens a %s link on the opening tab", async (status) => {
    openAt(`/app/employees/documents?location=${downtown}&status=${status}`);
    // The link's location narrows the list, so the empty tab reads as a filter miss.
    await screen.findByRole("heading", { name: "No documents match these filters." });
    expect(screen.getByRole("button", { name: /^Needs review/ }).getAttribute("aria-pressed")).toBe("true");
  });
});
