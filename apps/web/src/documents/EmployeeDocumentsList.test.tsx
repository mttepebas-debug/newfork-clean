// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { defaultDocumentLifecycleSettings } from "@newfork/shared";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { RequestError } from "../lib/request-error";
import { getDocument, listDocuments, reviewDocument } from "./document-data";
import { EmployeeDocumentsList } from "./EmployeeDocumentsList";
import EmployeeDocumentsPage from "./EmployeeDocumentsPage";

const auth = vi.hoisted(() => ({ context: null as unknown }));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context: auth.context }) }));
vi.mock("./document-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./document-data")>()),
  listDocuments: vi.fn(),
  getDocument: vi.fn(),
  reviewDocument: vi.fn(),
}));
// A drawer opened from the list waits for its document unless a test hands one over.
beforeEach(() => {
  vi.mocked(getDocument).mockReset().mockReturnValue(new Promise(() => {}));
});

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

  // K1 decision 4: only the manager reads a sent-back document as Missing; the person keeps Rejected.
  it("keeps the person's own words for a document sent back", async () => {
    vi.mocked(listDocuments).mockResolvedValue([{ ...obligation, status: "rejected" }] as never);
    renderList(true);
    expect(await screen.findByRole("cell", { name: "Rejected" })).toBeTruthy();
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
    const names = () =>
      Array.from(document.querySelectorAll("tbody tr")).map((r) =>
        (r.querySelector("td")?.textContent ?? "").replace("Downtown", ""),
      );
    // A manager reads a document sent back as Missing (K1 decision 4) and sorts it with the other Missing ones;
    // rows of one weight keep the list's order.
    expect(names()).toEqual(["Casey", "Emery", "Drew"]);
    expect(chips()).toEqual(["Missing", "Missing", "Expired"]);
    fireEvent.click(screen.getByRole("button", { name: /Status/ }));
    expect(names()).toEqual(["Drew", "Casey", "Emery"]);
    expect(chips()).toEqual(["Expired", "Missing", "Missing"]);
    fireEvent.click(screen.getByRole("button", { name: /^Completed/ }));
    expect(chips()).toEqual(["Completed", "Paused"]);
  });
  // The person's own list keeps today's words and order: Rejected after Expired.
  it("sorts the person's own Status by today's weights", async () => {
    const row = (id: string, status: string, title: string) => ({ ...obligation, id, status, title });
    vi.mocked(listDocuments).mockResolvedValue([
      row("3", "rejected", "C card"),
      row("4", "expired", "D card"),
      row("5", "missing", "E card"),
    ] as never);
    renderList(true);
    await screen.findByRole("cell", { name: /C card/ });
    fireEvent.click(screen.getByRole("button", { name: /Status/ }));
    const cells = () =>
      Array.from(document.querySelectorAll("tbody tr")).map((r) => r.querySelectorAll("td")[1]?.textContent);
    expect(cells()).toEqual(["Missing", "Expired", "Rejected"]);
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
    await screen.findByRole("row", { name: /^Gray/ });
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

  // K1 decision 4: only a manager's tabs speak the manager's words; the person's keep today's.
  it("words the person's empty tabs in today's words", async () => {
    vi.mocked(listDocuments).mockReset().mockResolvedValue([rows[0]] as never);
    renderList(true);
    fireEvent.click(await screen.findByRole("button", { name: /^Needs review/ }));
    await screen.findByText("Avery");
    fireEvent.click(screen.getByRole("button", { name: /^To do/ }));
    expect(screen.getByText("Missing, rejected and expired documents show up here.")).toBeTruthy();
    expect(screen.queryByText("Missing and expired documents show up here.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Completed/ }));
    expect(screen.getByText("Approved and exempt documents show up here.")).toBeTruthy();
    expect(screen.queryByText("Approved and excused documents show up here.")).toBeNull();
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

// K1 (A2 Tur 6, Mert 23 Oct): the manager's list and the drawer it opens.
describe("the manager's review drawer from the list", () => {
  const person = (n: number) => `c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6${n}`;
  const row = (n: number, status: string, employee_name: string, title = "Food handler card") => ({
    ...detailOf(n).obligation,
    status,
    employee_name,
    employee_id: person(n),
    title,
  });
  function detailOf(n: number) {
    return {
      obligation: {
        id: `20000000-0000-4000-8000-00000000000${n}`,
        workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
        employee_id: person(n),
        employee_name: "Avery",
        title: "Food handler card",
        source_id: null,
        kind: "document",
        mode: "required",
        status: "pending_review",
        revision: 1,
        requires_review: true,
        deadline_at: null,
        remaining_seconds: 0,
        rejection_reason: null,
        suspended: false,
        submitted_id: `30000000-0000-4000-8000-00000000000${n}`,
        approved_id: null,
        location_ids: [],
        location_names: [],
        timezone: "America/Los_Angeles",
        settings: { ...defaultDocumentLifecycleSettings, mode: "required" },
        accepted_formats: ["pdf"],
        tracks_expiry: false,
      },
      submissions: [
        {
          id: `30000000-0000-4000-8000-00000000000${n}`,
          version: 1,
          state: "pending_review",
          submitted_at: "2026-10-21T23:12:00Z",
          reviewed_at: null,
          expiry_date: null,
          metadata: {},
          rejection_reason: null,
          files: [
            {
              id: `40000000-0000-4000-8000-00000000000${n}`,
              filename: "card.pdf",
              media_type: "application/pdf",
              size_bytes: 100,
              decision: "keep",
              note: "",
            },
          ],
        },
      ],
      history: [],
    };
  }
  const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const renderManager = (
    cache: QueryClient,
    extra: { initialRequirementId?: string; initialStatus?: "needs_review" | "to_do" | "completed" } = {},
  ) =>
    render(
      <QueryClientProvider client={cache}>
        <MemoryRouter>
          <EmployeeDocumentsList
            audience={{ workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd", selfOnly: false }}
            userId="d9f43e62-e099-48e1-bc6f-a5aabe8e87d5"
            canReview
            {...extra}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  const strip = () => screen.getByRole("navigation", { name: "Documents in this list" });
  const stripNames = () => within(strip()).getAllByRole("button").map((b) => b.getAttribute("aria-label"));

  // K1 decision 4.
  it("says Missing for a document sent back and Excused for an exempt one, coloured as such", async () => {
    vi.mocked(listDocuments).mockReset().mockResolvedValue([
      row(1, "rejected", "Avery"),
      row(2, "exempt", "Blake"),
    ] as never);
    renderManager(client(), { initialStatus: "to_do" });
    await screen.findByText("Avery");
    const chip = () => document.querySelector("tbody .list-chip");
    expect([chip()?.textContent, chip()?.getAttribute("data-tone")]).toEqual(["Missing", "red"]);
    fireEvent.click(screen.getByRole("button", { name: /^Completed/ }));
    expect([chip()?.textContent, chip()?.getAttribute("data-tone")]).toEqual(["Excused", "gray"]);
  });
  it("words its empty tabs in the same words", async () => {
    vi.mocked(listDocuments).mockReset().mockResolvedValue([row(1, "pending_review", "Avery")] as never);
    renderManager(client());
    await screen.findByText("Avery");
    fireEvent.click(screen.getByRole("button", { name: /^To do/ }));
    expect(screen.getByText("Missing and expired documents show up here.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Completed/ }));
    expect(screen.getByText("Approved and excused documents show up here.")).toBeTruthy();
  });

  // K1 decision 6: the rows the open tab showed, in their order, taken when the drawer opened.
  it("walks the rows the open tab showed when it opened, whatever the list does after", async () => {
    const cache = client();
    vi.mocked(listDocuments)
      .mockReset()
      .mockResolvedValue([
        row(1, "pending_review", "Avery"),
        row(2, "pending_review", "Blake"),
        row(3, "pending_review", "Casey"),
      ] as never);
    renderManager(cache);
    fireEvent.click(await screen.findByRole("row", { name: /^Blake/ }));
    await screen.findByRole("dialog", { name: "Blake · Food handler card" });
    expect(stripNames()).toEqual(["Previous: Avery", "Next: Casey"]);
    // Casey's document is decided elsewhere and leaves Needs review; the drawer still walks what it was shown.
    vi.mocked(listDocuments).mockResolvedValue([
      row(1, "pending_review", "Avery"),
      row(2, "pending_review", "Blake"),
      row(3, "completed", "Casey"),
    ] as never);
    await act(async () => {
      await cache.refetchQueries({
        queryKey: ["document-lifecycle", "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5", "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd", "manager"],
        exact: true,
      });
    });
    await waitFor(() => expect(screen.queryByRole("row", { name: /^Casey/ })).toBeNull());
    expect(stripNames()).toEqual(["Previous: Avery", "Next: Casey"]);
    fireEvent.click(within(strip()).getByRole("button", { name: "Next: Casey" }));
    expect(await screen.findByRole("dialog", { name: "Casey · Food handler card" })).toBeTruthy();
    expect(stripNames()).toEqual(["Previous: Blake", "Next"]);
  });
  it("takes the rows after a link has switched the tab", async () => {
    vi.mocked(listDocuments)
      .mockReset()
      .mockResolvedValue([
        row(1, "pending_review", "Avery"),
        row(2, "completed", "Blake"),
        row(3, "completed", "Casey"),
      ] as never);
    renderManager(client(), { initialRequirementId: detailOf(2).obligation.id });
    await screen.findByRole("dialog", { name: "Blake · Food handler card" });
    expect(stripNames()).toEqual(["Previous", "Next: Casey"]);
  });
  it("keeps a linked row the tab does not show, at its place in the order", async () => {
    vi.mocked(listDocuments)
      .mockReset()
      .mockResolvedValue([
        row(1, "missing", "Avery"),
        row(2, "pending_review", "Blake"),
        row(3, "missing", "Casey"),
      ] as never);
    renderManager(client(), { initialRequirementId: detailOf(2).obligation.id, initialStatus: "to_do" });
    await screen.findByRole("dialog", { name: "Blake · Food handler card" });
    expect(stripNames()).toEqual(["Previous: Avery", "Next: Casey"]);
  });
  it("names the same person's other document by its title", async () => {
    vi.mocked(listDocuments)
      .mockReset()
      .mockResolvedValue([
        row(1, "pending_review", "Avery", "Food handler card"),
        { ...row(2, "pending_review", "Avery", "I-9"), employee_id: person(1) },
      ] as never);
    renderManager(client());
    fireEvent.click(await screen.findByRole("row", { name: /Food handler card/ }));
    await screen.findByRole("dialog", { name: "Avery · Food handler card" });
    expect(stripNames()).toEqual(["Previous", "Next: I-9"]);
  });
  // K1 decision 5: a draft waits with its document while the page is open.
  it("keeps what was typed for a document when the drawer is closed and opened again", async () => {
    vi.mocked(getDocument).mockImplementation(async () => detailOf(1) as never);
    vi.mocked(listDocuments).mockReset().mockResolvedValue([row(1, "pending_review", "Avery")] as never);
    renderManager(client());
    fireEvent.click(await screen.findByRole("row", { name: /^Avery/ }));
    const pair = await screen.findByRole("group", { name: "Approve or reject card.pdf" });
    fireEvent.click(within(pair).getByRole("button", { name: "Reject" }));
    fireEvent.change(screen.getByLabelText("Why reject card.pdf? Avery sees this"), { target: { value: "Blurry" } });
    fireEvent.click(screen.getByRole("button", { name: "Close details" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("row", { name: /^Avery/ }));
    expect(
      ((await screen.findByLabelText("Why reject card.pdf? Avery sees this")) as HTMLInputElement).value,
    ).toBe("Blurry");
  });
  // A decision in the drawer reaches the list behind it: the row moves to its new tab and the tabs count again.
  it("moves a decided row out of Needs review and counts the tabs again", async () => {
    vi.mocked(getDocument).mockImplementation(async () => detailOf(1) as never);
    vi.mocked(reviewDocument).mockReset().mockResolvedValue({});
    vi.mocked(listDocuments)
      .mockReset()
      .mockResolvedValueOnce([row(1, "pending_review", "Avery"), row(2, "pending_review", "Blake")] as never)
      .mockResolvedValue([row(1, "completed", "Avery"), row(2, "pending_review", "Blake")] as never);
    renderManager(client());
    const count = (tab: RegExp) =>
      within(screen.getByLabelText("Document status")).getByRole("button", { name: tab }).querySelector("span")
        ?.textContent ?? null;
    fireEvent.click(await screen.findByRole("row", { name: /^Avery/ }));
    expect([count(/^Needs review/), count(/^Completed/)]).toEqual(["2", null]);
    const pair = await screen.findByRole("group", { name: "Approve or reject card.pdf" });
    fireEvent.click(within(pair).getByRole("button", { name: "Approve" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("row", { name: /^Avery/ })).toBeNull());
    expect([count(/^Needs review/), count(/^Completed/)]).toEqual(["1", "1"]);
    expect(screen.getByRole("row", { name: /^Blake/ })).toBeTruthy();
    expect(reviewDocument).toHaveBeenCalledOnce();
  });
  // K1 decision 6, through the list: the green's "Next" reads each row as the list has it now (a row decided
  // elsewhere no longer waits) and skips what was answered in this sitting (even while the list still shows it).
  it("sends the green to the next row still waiting by the list's latest data, skipping what was answered here", async () => {
    const cache = client();
    const id = (n: number) => detailOf(n).obligation.id;
    vi.mocked(getDocument).mockImplementation(async (_audience, requirementId) => {
      const n = [1, 2, 3].find((k) => id(k) === requirementId) ?? 1;
      return { ...detailOf(n), obligation: { ...detailOf(n).obligation, employee_name: ["", "Avery", "Blake", "Casey"][n]! } } as never;
    });
    vi.mocked(reviewDocument).mockReset().mockResolvedValue({});
    vi.mocked(listDocuments)
      .mockReset()
      .mockResolvedValueOnce([
        row(1, "pending_review", "Avery"),
        row(2, "pending_review", "Blake"),
        row(3, "pending_review", "Casey"),
      ] as never)
      // Casey is decided elsewhere; the list keeps showing Avery as waiting until it refreshes.
      .mockResolvedValue([
        row(1, "pending_review", "Avery"),
        row(2, "pending_review", "Blake"),
        row(3, "completed", "Casey"),
      ] as never);
    // The green holds for 400 ms after its meaning changes (a move to another document is one).
    let at = 10_000;
    const now = vi.spyOn(performance, "now").mockImplementation(() => at);
    onTestFinished(() => now.mockRestore());
    renderManager(cache);
    fireEvent.click(await screen.findByRole("row", { name: /^Avery/ }));
    await act(async () => {
      await cache.refetchQueries({
        queryKey: ["document-lifecycle", "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5", "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd", "manager"],
        exact: true,
      });
    });
    const green = () => document.querySelector<HTMLElement>(".rd-foot .docr-green");
    const approve = async () => {
      const pair = await screen.findByRole("group", { name: "Approve or reject card.pdf" });
      fireEvent.click(within(pair).getByRole("button", { name: "Approve" }));
      at += 450;
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    };
    await approve();
    await waitFor(() => expect(green()?.textContent).toBe("Next: Blake"));
    // The strip waits for the refresh after a Save.
    await waitFor(() => expect(within(strip()).getByRole("button", { name: "Next: Blake" })).toHaveProperty("disabled", false));
    fireEvent.click(within(strip()).getByRole("button", { name: "Next: Blake" }));
    await screen.findByRole("dialog", { name: "Blake · Food handler card" });
    await approve();
    await waitFor(() => expect(green()?.textContent).toBe("Close"));
    expect(reviewDocument).toHaveBeenCalledTimes(2);
  });
  // "All caught up" is said only when nothing in the whole list waits, whichever tab the drawer was opened from.
  it("says all caught up only when no tab has anything waiting", async () => {
    const approved = () => {
      const doc = detailOf(7);
      return {
        ...doc,
        obligation: { ...doc.obligation, status: "completed", employee_name: "Gray", approved_id: doc.obligation.submitted_id },
        submissions: [{ ...doc.submissions[0]!, state: "accepted" }],
      };
    };
    vi.mocked(getDocument).mockImplementation(async () => approved() as never);
    vi.mocked(reviewDocument).mockReset().mockResolvedValue({});
    vi.mocked(listDocuments)
      .mockReset()
      .mockResolvedValue([row(1, "pending_review", "Avery"), row(7, "completed", "Gray")] as never);
    // The green holds for 400 ms once Review again turns it into Save.
    let at = 10_000;
    const now = vi.spyOn(performance, "now").mockImplementation(() => at);
    try {
      renderManager(client(), { initialStatus: "completed" });
      fireEvent.click(await screen.findByRole("row", { name: /^Gray/ }));
      fireEvent.click(await screen.findByRole("button", { name: "Review again" }));
      const pair = await screen.findByRole("group", { name: "Approve or reject card.pdf" });
      fireEvent.click(within(pair).getByRole("button", { name: "Approve" }));
      at += 450;
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      const line = () => document.querySelector(".rd-foot .docr-note")?.textContent;
      await waitFor(() => expect(line()).toBe("Approved · Gray is told."));
      expect(document.querySelector(".rd-foot .docr-green")?.textContent).toBe("Close");
    } finally {
      now.mockRestore();
    }
  });
  // K1 fix pass: the row that opened the drawer can leave the tab once it is decided; closing then puts focus on
  // the row now in its place, never on the page itself.
  it("puts focus back on the list when the drawer closes after its row left the tab", async () => {
    vi.mocked(getDocument).mockImplementation(async () => detailOf(1) as never);
    vi.mocked(reviewDocument).mockReset().mockResolvedValue({});
    vi.mocked(listDocuments)
      .mockReset()
      .mockResolvedValueOnce([row(1, "pending_review", "Avery"), row(2, "pending_review", "Blake")] as never)
      .mockResolvedValue([row(1, "completed", "Avery"), row(2, "pending_review", "Blake")] as never);
    renderManager(client());
    const avery = await screen.findByRole("row", { name: /^Avery/ });
    avery.focus();
    fireEvent.keyDown(avery, { key: "Enter" });
    const pair = await screen.findByRole("group", { name: "Approve or reject card.pdf" });
    fireEvent.click(within(pair).getByRole("button", { name: "Approve" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("row", { name: /^Avery/ })).toBeNull());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("row", { name: /^Blake/ })));
  });
  it("puts focus on the open tab when the drawer closes on a tab left empty", async () => {
    vi.mocked(getDocument).mockImplementation(async () => detailOf(1) as never);
    vi.mocked(reviewDocument).mockReset().mockResolvedValue({});
    vi.mocked(listDocuments)
      .mockReset()
      .mockResolvedValueOnce([row(1, "pending_review", "Avery")] as never)
      .mockResolvedValue([row(1, "completed", "Avery")] as never);
    renderManager(client());
    fireEvent.click(await screen.findByRole("row", { name: /^Avery/ }));
    const pair = await screen.findByRole("group", { name: "Approve or reject card.pdf" });
    fireEvent.click(within(pair).getByRole("button", { name: "Approve" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("row", { name: /^Avery/ })).toBeNull());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: /^Needs review/ })));
  });
});
