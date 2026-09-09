import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LineupQueue } from "./LineupQueue";
import { actOnLineupProposal, getLineupProposals } from "../lineup-data";
const toast = vi.hoisted(() => ({ warning: vi.fn() }));
vi.mock("@newfork/ui", () => ({ useToast: () => toast }));

vi.mock("../lineup-data", () => ({
  actOnLineupProposal: vi.fn(),
  getLineupProposals: vi.fn(),
  getLineup: vi.fn(),
}));
Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
  configurable: true,
  value: function () {
    this.setAttribute("open", "");
  },
});
Object.defineProperty(HTMLDialogElement.prototype, "close", {
  configurable: true,
  value: function () {
    this.removeAttribute("open");
  },
});
const proposal = {
  id: "10000000-0000-4000-8000-000000000001",
  kind: "offer" as const,
  status: "accepted",
  description: "Cover lunch service",
  source_name: "Dining",
  target_name: "Dining",
  employee_name: "Alex Morgan",
  start_time: "09:00",
  end_time: "12:00",
  can_confirm: true,
};
const preview = {
  fingerprint: "a".repeat(64),
  allowed: true,
  requires_approval: false,
  effects: ["Alex will cover Dining, 09:00–12:00"],
  blockers: [],
};
const refresh = vi.fn().mockResolvedValue(undefined);
function show() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <LineupQueue
        workspaceId="workspace"
        date="2030-01-07"
        locationId="location"
        refresh={refresh}
      />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getLineupProposals).mockResolvedValue([proposal]);
  vi.mocked(actOnLineupProposal).mockResolvedValue(preview);
});
afterEach(cleanup);

describe("staffing manager final approval", () => {
  it("uses one explicit approval for a transfer availability conflict", async () => {
    vi.mocked(getLineupProposals).mockResolvedValue([
      { ...proposal, kind: "transfer", status: "pending" },
    ]);
    vi.mocked(actOnLineupProposal).mockResolvedValueOnce({
      ...preview,
      availability_warning: { fingerprint: "b".repeat(64), policy: "confirm" },
    });
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: "Review & approve" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Review impact" }));
    const approve = await screen.findByRole("button", {
      name: "Approve anyway",
    });
    expect(screen.getByText("Availability conflict")).toBeTruthy();
    expect(actOnLineupProposal).toHaveBeenCalledTimes(1);
    fireEvent.click(approve);
    await waitFor(() =>
      expect(actOnLineupProposal).toHaveBeenLastCalledWith(
        "workspace",
        proposal.id,
        "confirm",
        { fingerprint: preview.fingerprint, confirm_availability: true },
      ),
    );
    expect(toast.warning).not.toHaveBeenCalled();
  });
  it("shows one warn toast after the transfer is saved", async () => {
    vi.mocked(getLineupProposals).mockResolvedValue([
      { ...proposal, kind: "transfer", status: "pending" },
    ]);
    vi.mocked(actOnLineupProposal).mockResolvedValueOnce({
      ...preview,
      availability_warning: { fingerprint: "b".repeat(64), policy: "warn" },
    });
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: "Review & approve" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Review impact" }));
    await screen.findByRole("button", { name: "Approve & apply" });
    expect(toast.warning).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Approve & apply" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(actOnLineupProposal).toHaveBeenLastCalledWith(
      "workspace",
      proposal.id,
      "confirm",
      { fingerprint: preview.fingerprint },
    );
  });
  it("does not toast or reuse the decision after a rejected transfer preview", async () => {
    vi.mocked(actOnLineupProposal)
      .mockResolvedValueOnce({
        ...preview,
        availability_warning: { fingerprint: "b".repeat(64), policy: "warn" },
      })
      .mockRejectedValueOnce(
        new Error("stale approval preview; review both assignments again"),
      );
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: "Review & approve" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Review impact" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Approve & apply" }),
    );
    await screen.findByRole("button", { name: "Review impact" });
    expect(toast.warning).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(actOnLineupProposal).toHaveBeenCalledTimes(2);
  });
  it("focuses the fresh impact before allowing approval with that fingerprint", async () => {
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: "Review & approve" }),
    );
    const review = screen.getByRole("button", { name: "Review impact" });
    review.focus();
    fireEvent.click(review);
    const heading = await screen.findByRole("heading", {
      name: "Review before approval",
    });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(actOnLineupProposal).toHaveBeenCalledWith(
      "workspace",
      proposal.id,
      "preview",
      {},
    );
    fireEvent.click(screen.getByRole("button", { name: "Approve & apply" }));
    await waitFor(() =>
      expect(actOnLineupProposal).toHaveBeenLastCalledWith(
        "workspace",
        proposal.id,
        "confirm",
        { fingerprint: preview.fingerprint },
      ),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });
  it("does not steal focus when the manager moves to Cancel while checking", async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(actOnLineupProposal).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: "Review & approve" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Review impact" }));
    const cancel = screen.getByRole("button", { name: "Cancel" });
    cancel.focus();
    finish(preview);
    await screen.findByRole("heading", { name: "Review before approval" });
    expect(document.activeElement).toBe(cancel);
  });
  it("explains a newly ineligible employee and prevents the final action", async () => {
    vi.mocked(actOnLineupProposal).mockResolvedValueOnce({
      ...preview,
      allowed: false,
      blockers: ["Employee is no longer available for this interval"],
    });
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: "Review & approve" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Review impact" }));
    await screen.findByText(
      "Employee is no longer available for this interval",
    );
    const approve = screen.getByRole("button", {
      name: "Approve & apply",
    }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    fireEvent.click(approve);
    expect(actOnLineupProposal).toHaveBeenCalledTimes(1);
  });
  it("requires employee acceptance before exposing the manager approval", async () => {
    vi.mocked(getLineupProposals).mockResolvedValueOnce([
      { ...proposal, status: "pending" },
    ]);
    show();
    await screen.findByText("Alex Morgan");
    expect(
      screen.queryByRole("button", { name: "Review & approve" }),
    ).toBeNull();
    expect(actOnLineupProposal).not.toHaveBeenCalled();
  });
});
