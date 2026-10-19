import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MyDocumentsPage from "./MyDocumentsPage";
import { ownDocumentsPath, waitingOnYou } from "./own-documents";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    account: { userId: "user-1" },
    context: { workspace: { id: "11111111-1111-4111-8111-111111111111", name: "Meyhouse" } },
  }),
}));
// The list itself is covered by its own tests; this page is about whose list it is.
const listed = vi.fn();
vi.mock("./EmployeeDocumentsList", () => ({
  EmployeeDocumentsList: (props: {
    audience: { workspaceId: string; selfOnly: boolean };
    kind: string;
    initialRequirementId: string | null;
  }) => {
    listed(props);
    return <div data-testid={`list-${props.audience.workspaceId}-${props.kind}`} />;
  },
}));

const obligation = (kind: string, status: string) => ({ kind, status });

function renderPage(address = "/app/employee-hub/documents", title: "Documents" | "My documents" = "Documents") {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={[address]}>
        <MyDocumentsPage title={title} />
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

describe("ownDocumentsPath", () => {
  const membership = (employee: boolean, management: string | null) => ({ access: { employee, management } }) as never;
  it("opens in the management interface for anybody who manages, else in the employee's", () => {
    expect(ownDocumentsPath(membership(true, null))).toBe("/app/employee-hub/documents");
    expect(ownDocumentsPath(membership(false, "manager"))).toBe("/app/my-documents");
    expect(ownDocumentsPath(membership(true, "owner"))).toBe("/app/my-documents");
  });
});

describe("MyDocumentsPage", () => {
  beforeEach(() => listed.mockClear());

  it("is a page of its own, titled as the menu calls it, with the open workspace's documents only", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: /^Documents/ })).toBeTruthy();
    expect(screen.getByTestId("list-11111111-1111-4111-8111-111111111111-document")).toBeTruthy();
    expect(listed).toHaveBeenLastCalledWith(
      expect.objectContaining({ audience: { workspaceId: "11111111-1111-4111-8111-111111111111", selfOnly: true } }),
    );
    // One workspace: no list per workspace, no workspace headings.
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("goes by My documents in the management interface", () => {
    renderPage("/app/my-documents", "My documents");
    expect(screen.getByRole("heading", { level: 1, name: /^My documents/ })).toBeTruthy();
  });

  it("switches to Policies & Agreements, and opens on it when the address asks", () => {
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "Policies & Agreements" }));
    expect(screen.getByTestId("list-11111111-1111-4111-8111-111111111111-acknowledgement")).toBeTruthy();
    renderPage("/app/employee-hub/documents?kind=acknowledgement");
    expect(screen.getAllByRole("tab", { name: "Policies & Agreements" }).at(-1)!.getAttribute("aria-selected")).toBe("true");
  });

  it("opens the request a link names, in the open workspace", () => {
    renderPage("/app/employee-hub/documents?kind=document&requirement=req-1");
    expect(listed).toHaveBeenLastCalledWith(expect.objectContaining({ initialRequirementId: "req-1" }));
  });

  it("does not open a request a link names for another workspace", () => {
    renderPage("/app/employee-hub/documents?workspace=22222222-2222-4222-8222-222222222222&requirement=req-1");
    expect(listed).toHaveBeenLastCalledWith(expect.objectContaining({ initialRequirementId: null }));
  });

  it("never says organization", () => {
    renderPage();
    expect(document.body.textContent).not.toMatch(/organi[sz]ation/i);
  });
});
