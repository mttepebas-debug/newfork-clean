import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PendingPreferredNameRow } from "./EmployeeDrawer";
import { decidePreferredName, listPendingPreferredNames } from "./employee-data";

vi.mock("./employee-data", () => ({
  decidePreferredName: vi.fn(),
  listPendingPreferredNames: vi.fn(),
  // The drawer imports these at module load; the row does not use them.
  loadEmployeeDetail: vi.fn(),
  loadEmployeeInvitationLink: vi.fn(),
  loadEmployeeReferenceData: vi.fn(),
  saveEmployee: vi.fn(),
  saveOwnEmploymentContact: vi.fn(),
  saveEmployeeRole: vi.fn(),
  archiveEmployee: vi.fn(),
  removeEmployeeAccess: vi.fn(),
  restoreEmployeeAccess: vi.fn(),
  resendEmployeeInvitation: vi.fn(),
  revokeEmployeeInvitation: vi.fn(),
  requestPreferredName: vi.fn(),
  loadPreferredNameApproval: vi.fn(),
  savePreferredNameApproval: vi.fn(),
}));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ context: null }),
}));

const workspaceId = "11111111-1111-4111-8111-111111111111";
const employeeId = "44444444-4444-4444-8444-444444444444";
const requestId = "33333333-3333-4333-8333-333333333333";

function renderRow() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <PendingPreferredNameRow
        workspaceId={workspaceId}
        employeeId={employeeId}
      />
    </QueryClientProvider>,
  );
}

describe("a preferred name waiting for an answer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(decidePreferredName).mockResolvedValue(undefined);
    vi.mocked(listPendingPreferredNames).mockResolvedValue([
      {
        requestId,
        employeeId,
        employeeName: "Alexander Okonkwo",
        requestedName: "Sasha",
        requestedAt: "2026-09-22T10:00:00.000Z",
      },
    ]);
  });

  it("says what this person asked to be called", async () => {
    renderRow();

    expect(await screen.findByText("Sasha")).toBeTruthy();
  });

  it("puts the name on the record when the workspace says so", async () => {
    renderRow();

    fireEvent.click(await screen.findByRole("button", { name: "Use it" }));

    await waitFor(() =>
      expect(decidePreferredName).toHaveBeenCalledWith(
        workspaceId,
        requestId,
        true,
      ),
    );
  });

  // Refusing says nothing to the person. A name that never appears is the whole
  // of it, and a message about it would be a conversation the workspace did not
  // choose to have.
  it("leaves it alone without anything going back", async () => {
    renderRow();

    fireEvent.click(await screen.findByRole("button", { name: "Leave it" }));

    await waitFor(() =>
      expect(decidePreferredName).toHaveBeenCalledWith(
        workspaceId,
        requestId,
        false,
      ),
    );
  });

  it("shows nothing at all for somebody who asked for nothing", async () => {
    vi.mocked(listPendingPreferredNames).mockResolvedValue([]);
    const { container } = renderRow();

    await waitFor(() => expect(listPendingPreferredNames).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("ignores a request belonging to a different record", async () => {
    vi.mocked(listPendingPreferredNames).mockResolvedValue([
      {
        requestId,
        employeeId: "55555555-5555-4555-8555-555555555555",
        employeeName: "Somebody Else",
        requestedName: "Robin",
        requestedAt: "2026-09-22T10:00:00.000Z",
      },
    ]);
    const { container } = renderRow();

    await waitFor(() => expect(listPendingPreferredNames).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
