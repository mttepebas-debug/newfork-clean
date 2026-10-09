import { readFileSync } from "node:fs";
import { configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ExchangeCase, ExchangePreview } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SwapReview } from "./SwapReview";
import { changeExchange, getExchangePreview, refreshExchangeSurfaces } from "../employee-hub/shift-exchanges/exchange-data";

configure({ asyncUtilTimeout: 5000 });
vi.mock("../employee-hub/shift-exchanges/exchange-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../employee-hub/shift-exchanges/exchange-data")>()),
  getExchangePreview: vi.fn(),
  changeExchange: vi.fn(),
  refreshExchangeSurfaces: vi.fn(),
}));

const workspace = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const caseId = "97500000-0000-4000-8000-000000000001";
const applicationId = "97600000-0000-4000-8000-000000000001";
const kadikoy = "11000000-0000-4000-8000-000000000001";
const besiktas = "11000000-0000-4000-8000-000000000002";
function shift(id: string, location: [string, string], date: string, start: string, end: string, person: string) {
  return {
    id, source_id: id, location_id: location[0], location_name: location[1], timezone: "Europe/Istanbul", job_id: null, job_name: "Cook",
    scheduled_date: date, start_time: start, end_time: end, starts_at: null, ends_at: null,
    employee_id: "15000000-0000-4000-8000-000000000001", employee_name: person,
  };
}
// Ali gives his Wednesday at Kadikoy, Deniz gives her Friday at Besiktas.
const swap = {
  id: caseId, kind: "swap", audience: "direct", status: "open", stage: "ready_for_manager", revision: 4,
  created_at: "2026-10-08T09:00:00Z", expires_at: "2026-10-13T06:00:00Z", owner_id: "15000000-0000-4000-8000-000000000001", owner_name: "Ali Person",
  shift: shift("22000000-0000-4000-8000-000000000001", [kadikoy, "Kadikoy"], "2026-10-14", "15:30", "23:00", "Ali Person"),
  requested_shift: shift("22000000-0000-4000-8000-000000000002", [besiktas, "Besiktas"], "2026-10-16", "07:30", "15:00", "Deniz Person"),
  applications: [{ id: applicationId, employee_id: "15000000-0000-4000-8000-000000000002", employee_name: "Deniz Person", status: "pending_manager",
    created_at: "2026-10-08T10:00:00Z", reason: "", eligibility: null }],
  candidate_count: 1, can_manage: true, is_owner: false, history: [],
} as unknown as ExchangeCase;
const measures = { rest_gap_minutes: 720, travel_gap_minutes: null, rest_rule_minutes: 600, travel_rule_minutes: 45 };
function preview(change: Partial<ExchangePreview> = {}): ExchangePreview {
  return {
    allowed: true, fingerprint: "fp-1", reasons: [], requires_other_manager: false, other_applications: 0,
    receiver: { status: "eligible", reasons: [], approval_flags: [], measures },
    giver: { status: "eligible", reasons: [], approval_flags: [], measures },
    ...change,
  };
}
const onDone = vi.fn();
const onClose = vi.fn();
function renderReview(item: ExchangeCase = swap) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SwapReview item={item} workspace={workspace} timeFormat="12h" onClose={onClose} onDone={onDone} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute("open"); };
  vi.mocked(getExchangePreview).mockResolvedValue(preview());
  vi.mocked(changeExchange).mockResolvedValue({ case_id: caseId, revision: 5, status: "completed" } as never);
  vi.mocked(refreshExchangeSurfaces).mockResolvedValue(undefined);
});

// EKRAN-02 C2 (KARARLAR "Takas inceleme penceresi H2", 2026-10-07).
describe("SwapReview", () => {
  it("names the swap and draws both shifts, each with who hands it to whom", async () => {
    renderReview();
    const dialog = await screen.findByRole("dialog", { name: "Swap request" });
    expect(within(dialog).getByText("Ali Person ⇄ Deniz Person")).toBeTruthy();
    const cards = within(dialog).getAllByRole("group");
    expect(cards.map((card) => card.getAttribute("aria-label"))).toEqual(["Wed, Oct 14, Kadikoy, Ali to Deniz", "Fri, Oct 16, Besiktas, Deniz to Ali"]);
    expect(within(cards[0]!).getByText("3:30 PM – 11:00 PM")).toBeTruthy();
    expect(within(cards[1]!).getByText("7:30 AM – 3:00 PM")).toBeTruthy();
    expect(within(dialog).getByText("Decide by Oct 13, 9:00 AM")).toBeTruthy();
  });

  it("shows no box while every rule holds", async () => {
    renderReview();
    await screen.findByRole("button", { name: "Approve" });
    await waitFor(() => expect(getExchangePreview).toHaveBeenCalledWith(workspace, caseId, applicationId));
    expect(document.querySelector(".swap-review-box")).toBeNull();
  });

  it("puts the failing rule in orange on its card and the holding one in green on the other", async () => {
    vi.mocked(getExchangePreview).mockResolvedValue(preview({
      receiver: { status: "eligible", reasons: [], approval_flags: [{ code: "minimum_travel", gap_minutes: 30, rule_minutes: 45 }], measures },
    }));
    renderReview();
    const cards = await screen.findAllByRole("group");
    await waitFor(() => expect(cards[0]!.querySelector(".swap-review-box")).not.toBeNull());
    expect(cards[0]!.querySelector(".swap-review-box")!.getAttribute("data-tone")).toBe("warn");
    expect(cards[0]!.querySelector(".swap-review-box")!.textContent).toBe("30 min to travel45 min needed");
    expect(cards[1]!.querySelector(".swap-review-box")!.getAttribute("data-tone")).toBe("ok");
    expect(cards[1]!.querySelector(".swap-review-box")!.textContent).toBe("Travel time OK45 min needed");
  });

  // KARARLAR §1.1 (Mert, 2026-10-09): a swap onto approved time off is never approved.
  it("keeps Approve off and says why when the swap lands on approved time off", async () => {
    vi.mocked(getExchangePreview).mockResolvedValue(preview({
      receiver: { status: "eligible", reasons: [], approval_flags: [], measures, shortens_time_off: true },
    }));
    renderReview();
    const cards = await screen.findAllByRole("group");
    await waitFor(() => expect(cards[0]!.querySelector(".swap-review-box")).not.toBeNull());
    expect(cards[0]!.querySelector(".swap-review-box")!.textContent).toBe("On time offcan't take this shift");
    expect(within(screen.getByRole("alert")).getByText("Deniz has approved time off then. Their time off must be shortened before this swap.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Approve" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Decline" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("approves with the preview's fingerprint and reports it", async () => {
    renderReview();
    const approve = await screen.findByRole("button", { name: "Approve" });
    await waitFor(() => expect((approve as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(approve);
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Swap approved."));
    expect(vi.mocked(changeExchange).mock.calls[0]![1]).toMatchObject({
      action: "approve", case_id: caseId, application_id: applicationId, expected_revision: 4, fingerprint: "fp-1",
    });
  });

  // The decision is saved; a list refresh that fails afterwards does not turn it into an error.
  it("reports a saved decision even when the refresh after it fails", async () => {
    vi.mocked(refreshExchangeSurfaces).mockRejectedValue(new Error("offline"));
    renderReview();
    const approve = await screen.findByRole("button", { name: "Approve" });
    await waitFor(() => expect((approve as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(approve);
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Swap approved."));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(changeExchange).toHaveBeenCalledTimes(1);
  });

  // Kadikoy and Besiktas: Ayse's approval is one of two; nothing moves yet.
  it("says the approval is recorded when the other location's manager still decides", async () => {
    vi.mocked(getExchangePreview).mockResolvedValue(preview({ requires_other_manager: true }));
    vi.mocked(changeExchange).mockResolvedValue({ case_id: caseId, revision: 5, status: "open" } as never);
    renderReview();
    const approve = await screen.findByRole("button", { name: "Approve" });
    await waitFor(() => expect((approve as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(approve);
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Your approval is recorded. The other location's manager decides next."));
  });

  it("keeps the reason when Esc leaves the decline step, and stays open", async () => {
    renderReview();
    fireEvent.click(await screen.findByRole("button", { name: "Decline" }));
    fireEvent.change(screen.getByLabelText("Reason for Deniz"), { target: { value: "We need you on Friday" } });
    fireEvent(screen.getByRole("dialog", { name: "Swap request" }), new Event("cancel", { cancelable: true }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Reason for Deniz")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect((screen.getByLabelText("Reason for Deniz") as HTMLTextAreaElement).value).toBe("We need you on Friday");
  });

  it("declines only with a reason for the employee, on a second click", async () => {
    renderReview();
    fireEvent.click(await screen.findByRole("button", { name: "Decline" }));
    const reason = screen.getByLabelText("Reason for Deniz");
    const decline = screen.getByRole("button", { name: "Decline swap" }) as HTMLButtonElement;
    expect(decline.disabled).toBe(true);
    fireEvent.change(reason, { target: { value: "We need you on Friday" } });
    fireEvent.click(decline);
    expect(changeExchange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm decline" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Swap declined."));
    expect(vi.mocked(changeExchange).mock.calls[0]![1]).toMatchObject({ action: "reject", application_id: applicationId, reason: "We need you on Friday" });
  });

  // G1 (KARARLAR 2026-10-06): who cannot decide sees the buttons off and why.
  it("keeps the buttons off for a manager who does not decide, and says who does", async () => {
    renderReview({ ...swap, can_manage: false });
    const dialog = await screen.findByRole("dialog", { name: "Swap request" });
    expect((within(dialog).getByRole("button", { name: "Approve" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(dialog).getByRole("button", { name: "Decline" }) as HTMLButtonElement).disabled).toBe(true);
    expect(dialog.textContent).toContain("Another Kadikoy or Besiktas manager, the owner or an admin decides this request.");
    expect(getExchangePreview).not.toHaveBeenCalled();
  });

  // A closed swap from the list's closed rows: its outcome, not a decision.
  it("shows an approved swap's outcome and who swapped, without decision buttons", async () => {
    renderReview({
      ...swap, status: "completed", stage: "closed",
      // After the swap the requested shift is Ali's: the names come from the request, not the live holder.
      requested_shift: { ...swap.requested_shift!, employee_name: "Ali Person" },
      applications: [{ ...swap.applications[0]!, status: "approved" }],
    });
    const dialog = await screen.findByRole("dialog", { name: "Swap request" });
    expect(within(dialog).getByText("Ali Person ⇄ Deniz Person")).toBeTruthy();
    expect(within(dialog).getAllByRole("group").map((card) => card.getAttribute("aria-label"))).toEqual([
      "Wed, Oct 14, Kadikoy, Ali to Deniz", "Fri, Oct 16, Besiktas, Deniz to Ali",
    ]);
    expect(dialog.textContent).toContain("Swap approved.");
    expect(dialog.textContent).not.toContain("Decide by");
    expect(within(dialog).queryByRole("button", { name: "Approve" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Decline" })).toBeNull();
    expect(getExchangePreview).not.toHaveBeenCalled();
  });

  it("says a swap ended when its deadline passed", async () => {
    renderReview({ ...swap, status: "expired", stage: "closed", applications: [{ ...swap.applications[0]!, status: "expired" }] });
    const dialog = await screen.findByRole("dialog", { name: "Swap request" });
    expect(dialog.textContent).toContain("The decision deadline passed. No shifts changed.");
    expect(within(dialog).getByText("Ali Person ⇄ Deniz Person")).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("says who it waits for while the other employee has not accepted", async () => {
    renderReview({ ...swap, stage: "awaiting_peer", applications: [{ ...swap.applications[0]!, status: "invited" }] });
    const dialog = await screen.findByRole("dialog", { name: "Swap request" });
    expect(dialog.textContent).toContain("Waiting for Deniz to accept.");
    expect(within(dialog).queryByRole("button", { name: "Approve" })).toBeNull();
  });

  // EKRAN-02 recovery: a long location name stays inside its card and can still be read in full.
  it("cuts a long location name inside its card and keeps the full name readable", async () => {
    const long = "Kadikoy Moda Waterfront Garden Terrace and Rooftop Bar";
    renderReview({ ...swap, shift: { ...swap.shift, location_name: long } } as ExchangeCase);
    const dialog = await screen.findByRole("dialog", { name: "Swap request" });
    const place = within(dialog).getByTitle(long);
    expect(place.className).toContain("swap-review-place");
    const css = readFileSync("src/views/swap-review.css", "utf8");
    const rule = /\.swap-review-place\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/max-width:\s*100%/);
    expect(rule).toMatch(/overflow:\s*hidden/);
    const text = /\.swap-review-place-name\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(text).toMatch(/text-overflow:\s*ellipsis/);
  });

  // EKRAN-02 recovery: a swap the system finds ineligible says which rule stops whom.
  it("names the rule that stops a person instead of only saying they are not eligible", async () => {
    vi.mocked(getExchangePreview).mockResolvedValue(preview({
      allowed: false,
      reasons: ["The other employee is not eligible for the exchanged shift"],
      giver: { status: "ineligible", reasons: ["Not eligible for this position"], approval_flags: [], measures },
    }));
    renderReview();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Ali can't take Deniz's shift: Not eligible for this position.");
    expect(alert.textContent).not.toContain("The other employee is not eligible");
  });
});
