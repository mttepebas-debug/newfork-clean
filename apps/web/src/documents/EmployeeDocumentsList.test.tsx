// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { RequestError } from "../lib/request-error";
import { listDocuments } from "./document-data";
import { EmployeeDocumentsList } from "./EmployeeDocumentsList";

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context: null }) }));
vi.mock("./document-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./document-data")>()),
  listDocuments: vi.fn(),
}));

describe("no access (FB-6.1.9)", () => {
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
    // A manager's list: the person's own list puts what they must do first.
    renderList(false, false);
    await screen.findByText("Avery");
    fireEvent.click(screen.getByRole("button", { name: /Status/ }));
    const chips = () =>
      Array.from(document.querySelectorAll("tbody .list-chip")).map((c) => c.textContent);
    expect(chips()).toEqual([
      "Needs review",
      "Missing",
      "Expired",
      "Rejected",
      "Paused",
      "Completed",
    ]);
    fireEvent.click(screen.getByRole("button", { name: /Status/ }));
    expect(chips()).toEqual([
      "Completed",
      "Paused",
      "Rejected",
      "Expired",
      "Missing",
      "Needs review",
    ]);
  });

  // BL-855: loading and a failed load sit where the rows go, not under the
  // empty table at the bottom of the screen.
  it("shows loading and a failed load in the table's place", async () => {
    vi.mocked(listDocuments).mockReturnValueOnce(new Promise(() => {}) as never);
    const { unmount } = renderList(false, false);
    expect(
      screen.getByText("Loading documents…").closest(".employee-table-wrap"),
    ).toBeTruthy();
    unmount();
    vi.mocked(listDocuments).mockRejectedValueOnce(new Error("Documents unavailable"));
    renderList(false, false);
    expect(
      (await screen.findByRole("alert")).closest(".employee-table-wrap"),
    ).toBeTruthy();
  });
});
