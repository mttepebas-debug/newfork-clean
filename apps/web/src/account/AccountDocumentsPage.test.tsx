import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccountDocumentsPage, { waitingOnYou } from "./AccountDocumentsPage";
import { listDocuments } from "../documents/document-data";
import { listAccountWorkspaces } from "../lib/supabase";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ account: { userId: "user-1" }, context: null }),
}));
vi.mock("../lib/supabase", () => ({
  listAccountWorkspaces: vi.fn(),
  supabaseClient: {},
}));
vi.mock("../documents/document-data", () => ({
  listDocuments: vi.fn(),
  documentQueryKey: (audience: { workspaceId: string }, userId: string) => [
    "documents",
    audience.workspaceId,
    userId,
  ],
}));
// The list itself is covered by its own tests; this page is about which lists
// there are and what each one is still waiting for.
vi.mock("../documents/EmployeeDocumentsList", () => ({
  EmployeeDocumentsList: ({
    audience,
  }: {
    audience: { workspaceId: string };
  }) => <div data-testid={`list-${audience.workspaceId}`} />,
}));

const workspace = (id: string, name: string) =>
  ({ id, name, status: "active", role: "employee" }) as never;

const obligation = (kind: string, status: string) => ({ kind, status });

function renderPage() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={cache}>
      <MemoryRouter>
        <AccountDocumentsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("waitingOnYou", () => {
  it("counts what the person can still act on, of that kind", () => {
    const obligations = [
      obligation("document", "missing"),
      obligation("document", "rejected"),
      obligation("document", "completed"),
      // Sent and waiting on somebody else, so not on them.
      obligation("document", "pending_review"),
      // Closed: exempt, removed and paused are all out of their hands.
      obligation("document", "exempt"),
      obligation("acknowledgement", "missing"),
    ];

    expect(waitingOnYou(obligations, "document")).toBe(2);
    expect(waitingOnYou(obligations, "acknowledgement")).toBe(1);
  });

  it("counts nothing when there is nothing", () => {
    expect(waitingOnYou([], "document")).toBe(0);
  });
});

describe("AccountDocumentsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      workspace("11111111-1111-4111-8111-111111111111", "Meyhouse"),
      workspace("22222222-2222-4222-8222-222222222222", "Ridgeline"),
    ]);
    vi.mocked(listDocuments).mockResolvedValue([
      obligation("document", "missing"),
      obligation("document", "completed"),
    ] as never);
  });

  it("shows every workspace at once instead of one behind a dropdown", async () => {
    renderPage();

    expect(await screen.findByText("Meyhouse")).toBeTruthy();
    expect(screen.getByText("Ridgeline")).toBeTruthy();
    // Somebody in three workspaces had to find the right one before they could
    // see what any of them were asking for.
    expect(screen.queryByLabelText("Organization")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("says what each workspace is still waiting for", async () => {
    renderPage();

    await screen.findByText("Meyhouse");
    await waitFor(() =>
      expect(screen.getAllByText("1 waiting on you").length).toBe(2),
    );
  });

  it("says so when a workspace is waiting for nothing", async () => {
    vi.mocked(listDocuments).mockResolvedValue([
      obligation("document", "completed"),
    ] as never);
    renderPage();

    await screen.findByText("Meyhouse");
    await waitFor(() =>
      expect(screen.getAllByText("Nothing waiting").length).toBe(2),
    );
  });

  it("never says organization", async () => {
    renderPage();

    await screen.findByText("Meyhouse");
    expect(document.body.textContent).not.toMatch(/organi[sz]ation/i);
  });
});
