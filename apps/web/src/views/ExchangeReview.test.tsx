import { configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ExchangeCase, ExchangePreview } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExchangeReview } from "./ExchangeReview";
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
const uptown = "11000000-0000-4000-8000-000000000001";
const emma = "97600000-0000-4000-8000-000000000001";
const sophie = "97600000-0000-4000-8000-000000000002";
const diego = "97600000-0000-4000-8000-000000000003";
const measures = { rest_gap_minutes: 720, travel_gap_minutes: null, rest_rule_minutes: 600, travel_rule_minutes: 30 };
function application(id: string, name: string, eligibility: ExchangeCase["applications"][number]["eligibility"], status = "pending_manager") {
  return { id, employee_id: id.replace("976", "150"), employee_name: name, status, created_at: "2026-10-11T06:56:00Z", reason: "", eligibility };
}
// Noah gives up Sunday's dinner shift at Uptown; Emma, Sophie and Diego asked to take it.
const cover = {
  id: caseId, kind: "cover", audience: "eligible_pool", status: "open", stage: "ready_for_manager", revision: 4,
  created_at: "2026-10-10T21:14:00Z", expires_at: "2026-10-11T20:00:00Z", owner_id: "15000000-0000-4000-8000-000000000009", owner_name: "Noah Garcia",
  shift: {
    id: "22000000-0000-4000-8000-000000000001", source_id: "22000000-0000-4000-8000-000000000001", location_id: uptown,
    location_name: "Harbor & Vine Uptown", timezone: "America/New_York", job_id: null, job_name: "Server", unpaid_break_minutes: 30,
    scheduled_date: "2026-10-11", start_time: "16:00", end_time: "22:00", starts_at: null, ends_at: null,
    employee_id: "15000000-0000-4000-8000-000000000009", employee_name: "Noah Garcia",
  },
  requested_shift: null,
  private_note: "Final exams week.",
  applications: [
    application(emma, "Emma Wilson", { status: "eligible", reasons: [], measures }),
    application(sophie, "Sophie Martin", { status: "eligible", reasons: [], approval_flags: [{ code: "minimum_rest", gap_minutes: 480, rule_minutes: 600 }] }),
    application(diego, "Diego Morales", { status: "ineligible", reasons: ["Approved time off overlaps."], blockers: [{ code: "approved_time_off" }] }),
  ],
  candidate_count: 3, can_manage: true, is_owner: false,
  history: [{ id: "98000000-0000-4000-8000-000000000001", action: "created", created_at: "2026-10-10T21:14:00Z", message: "Noah Garcia asked for cover" }],
} as unknown as ExchangeCase;
// Noah's release nobody has asked for yet (TAKAS-RELEASE: only a release reaches the pool).
const quiet = { ...cover, stage: "seeking_candidates", private_note: undefined, applications: [], candidate_count: 0 } as unknown as ExchangeCase;
function preview(change: Partial<ExchangePreview> = {}): ExchangePreview {
  return {
    allowed: true, fingerprint: "fp-1", reasons: [], requires_other_manager: false, other_applications: 1,
    receiver: { status: "eligible", reasons: [], approval_flags: [], measures }, giver: null, ...change,
  };
}
const onDone = vi.fn();
const onClose = vi.fn();
const onHold = vi.fn();
function renderReview(item: ExchangeCase = cover) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ExchangeReview item={item} workspace={workspace} timeFormat="12h" onClose={onClose} onDone={onDone} onHold={onHold} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const footer = () => document.querySelector(".rd-foot") as HTMLElement;
// The clock range keeps thin spaces around its dash (H2); read them as spaces.
const text = (element: Element) => element.textContent!.replace(/\u2009/g, " ");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getExchangePreview).mockResolvedValue(preview());
  vi.mocked(changeExchange).mockResolvedValue({ case_id: caseId, revision: 5, status: "completed" } as never);
  vi.mocked(refreshExchangeSurfaces).mockResolvedValue(undefined);
});

// Mert, 2026-10-11: pickup and cover requests open a drawer in the Important
// Dates drawer's language; the manager gives the shift in one step. TAKAS-RELEASE
// (plan 2026-10-13/14): the plan's shift card, the owner in the header, optional reasons.
describe("ExchangeReview", () => {
  it("heads the drawer with the kind, the status, the owner and when it expires", () => {
    renderReview();
    expect(text(screen.getByRole("heading", { level: 2 }))).toBe("Shift pickup Needs decision");
    expect(document.querySelector(".rd-sub")!.textContent).toContain(
      "Shift owner: Noah Garcia · Harbor & Vine Uptown · Expires Oct 11, 4:00 PM Eastern Time");
    expect(screen.getByRole("link", { name: /Open in Schedule/ }).getAttribute("href"))
      .toBe(`/app/schedule?date=2026-10-11&view=day&locations=${uptown}`);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Details", "Activity"]);
  });

  it("draws the shift card, who keeps it until the decision, and the owner's private note", () => {
    renderReview();
    const card = screen.getByRole("group", { name: /Sunday, October 11/ });
    expect(text(card)).toBe("SUN11OCT4:00 PM – 10:00 PMServer5.5 hHarbor & Vine UptownNoah → ?Today".replace("SUN", "Sun").replace("OCT", "Oct").replace("Today", card.querySelector(".sx-tk-foot span:last-child")!.textContent!));
    expect(screen.getByText("Noah stays on this shift until you approve.")).toBeTruthy();
    expect(screen.getByText("Private note from Noah").parentElement!.textContent).toContain("Final exams week.Only managers see this.");
  });

  it("lists who asked with their checks; a person on time off cannot be picked", () => {
    renderReview();
    expect(screen.getByText("3 want it")).toBeTruthy();
    const people = within(screen.getByRole("radiogroup", { name: "Who wants it" })).getAllByRole("radio") as HTMLInputElement[];
    expect(people.map((radio) => radio.closest("label")!.textContent)).toEqual([
      expect.stringMatching(/^EWEmma Wilson.*Available12 h of rest$/),
      expect.stringMatching(/^SMSophie Martin.*8 h of rest · 10 h needed$/),
      expect.stringMatching(/^DMDiego Morales.*On time off$/),
    ]);
    expect(people.map((radio) => radio.disabled)).toEqual([false, false, true]);
    expect((screen.getByRole("button", { name: "Pick someone" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("gives the shift to the picked person in one step", async () => {
    renderReview();
    fireEvent.click(screen.getByRole("radio", { name: /Emma Wilson/ }));
    const give = await screen.findByRole("button", { name: "Give to Emma" });
    await waitFor(() => expect((give as HTMLButtonElement).disabled).toBe(false));
    expect(getExchangePreview).toHaveBeenCalledWith(workspace, caseId, emma);
    expect(text(screen.getByRole("group", { name: /Sunday, October 11/ }))).toContain("Noah → Emma");
    fireEvent.click(give);
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Emma has the shift now. Noah is off it."));
    expect(vi.mocked(changeExchange).mock.calls[0]![1]).toEqual({
      action: "approve", case_id: caseId, application_id: emma, expected_revision: 4, fingerprint: "fp-1", reason: "", private_note: "",
    });
  });

  it("says anyway on the button when the picked person carries a warning", async () => {
    renderReview();
    fireEvent.click(screen.getByRole("radio", { name: /Sophie Martin/ }));
    expect(await screen.findByRole("button", { name: "Give to Sophie anyway" })).toBeTruthy();
  });

  it("names the button plainly when the picked person only chose to work unavailable hours", async () => {
    const consenting = { ...cover, applications: [application(sophie, "Sophie Martin", { status: "eligible", reasons: [], approval_flags: [{ code: "availability_consent" }] })] } as unknown as ExchangeCase;
    renderReview(consenting);
    expect(await screen.findByRole("button", { name: "Give to Sophie" })).toBeTruthy();
    expect(screen.getByText("Unavailable · chose to take it")).toBeTruthy();
  });

  it("keeps the button off and says why when the core refuses the transfer", async () => {
    vi.mocked(getExchangePreview).mockResolvedValue(preview({ allowed: false, reasons: ["Overlaps another shift."] }));
    renderReview();
    fireEvent.click(screen.getByRole("radio", { name: /Emma Wilson/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("Overlaps another shift.");
    expect((screen.getByRole("button", { name: "Give to Emma" }) as HTMLButtonElement).disabled).toBe(true);
  });

  // Covered in the old manager Shift Hub until it went (BL-1024): a failed
  // eligibility check keeps the give off and says so.
  it("keeps the button off and says so when eligibility could not be checked", async () => {
    vi.mocked(getExchangePreview).mockRejectedValue(new Error("Network down"));
    renderReview();
    fireEvent.click(screen.getByRole("radio", { name: /Emma Wilson/ }));
    expect((await screen.findByRole("alert")).textContent).toBe("Eligibility could not be checked. Close and try again.");
    expect((screen.getByRole("button", { name: "Give to Emma" }) as HTMLButtonElement).disabled).toBe(true);
    expect(changeExchange).not.toHaveBeenCalled();
  });
  // The person picked withdraws while the drawer is open: the give goes off
  // rather than sending a decision for someone who is no longer asking.
  it("turns the give off when the picked person withdraws during the review", async () => {
    const { rerender } = renderReview();
    fireEvent.click(screen.getByRole("radio", { name: /Emma Wilson/ }));
    const give = await screen.findByRole("button", { name: "Give to Emma" });
    await waitFor(() => expect((give as HTMLButtonElement).disabled).toBe(false));
    const withdrawn = {
      ...cover, revision: 5,
      applications: cover.applications.map((one) => (one.id === emma ? { ...one, status: "withdrawn" } : one)),
    } as unknown as ExchangeCase;
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <ExchangeReview item={withdrawn} workspace={workspace} timeFormat="12h" onClose={onClose} onDone={onDone} onHold={onHold} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.queryByRole("radio", { name: /Emma Wilson/ })).toBeNull();
    expect((screen.getByRole("button", { name: "Pick someone" }) as HTMLButtonElement).disabled).toBe(true);
    expect(changeExchange).not.toHaveBeenCalled();
  });
  it("closes the request with a reason the people involved read", async () => {
    vi.mocked(changeExchange).mockResolvedValue({ case_id: caseId, revision: 5, status: "cancelled" } as never);
    renderReview();
    fireEvent.click(within(footer()).getByRole("button", { name: "Close request" }));
    const reason = screen.getByLabelText(/Reason for Noah and the people who asked/);
    const send = within(footer()).getByRole("button", { name: "Close request" }) as HTMLButtonElement;
    // The reason is optional (plan 05:03).
    expect(send.disabled).toBe(false);
    // BILDIRIM-05 (KARARLAR S-96): no notification goes out, so none is promised.
    expect(screen.getByText("Noah keeps the shift.")).toBeTruthy();
    expect(screen.queryByText(/told/)).toBeNull();
    fireEvent.change(reason, { target: { value: "We are closed Sunday" } });
    // Red, two clicks (CLAUDE.md §3.A.7).
    fireEvent.click(send);
    expect(changeExchange).not.toHaveBeenCalled();
    fireEvent.click(within(footer()).getByRole("button", { name: "Confirm close" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Request closed. Noah keeps the shift."));
    expect(vi.mocked(changeExchange).mock.calls[0]![1]).toEqual({
      action: "close", case_id: caseId, expected_revision: 4, reason: "We are closed Sunday", private_note: "",
    });
  });

  it("says a release nobody asked for stays with its owner", () => {
    renderReview(quiet);
    expect(text(screen.getByRole("heading", { level: 2 }))).toBe("Shift pickup Open");
    expect(screen.getByText("Noah stays on this shift until you approve.")).toBeTruthy();
    expect(screen.getByText("Nobody has asked yet. Noah keeps the shift until you approve someone.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Nobody to approve" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("calls a direct cover a cover request, with who accepted", () => {
    renderReview({ ...cover, audience: "direct" } as ExchangeCase);
    expect(text(screen.getByRole("heading", { level: 2 }))).toBe("Cover request Needs decision");
    expect(screen.getByRole("radiogroup", { name: "Who accepted" })).toBeTruthy();
    expect(screen.getByText("3 accepted")).toBeTruthy();
  });

  it("reads the owner's note for teammates on the card", () => {
    renderReview({ ...cover, teammate_note: "Family dinner came up." } as ExchangeCase);
    expect(screen.getByText(/Family dinner came up\./).closest(".sx-q")!.textContent).toBe("Noah“Family dinner came up.”");
  });

  it("preselects the only person who can take it", async () => {
    renderReview({ ...quiet, applications: [cover.applications[0]!], candidate_count: 1 } as ExchangeCase);
    expect((screen.getByRole("radio", { name: /Emma Wilson/ }) as HTMLInputElement).checked).toBe(true);
    expect(await screen.findByRole("button", { name: "Give to Emma" })).toBeTruthy();
  });

  it("shows a manager who cannot decide the buttons faded, with who decides under them (KARARLAR G1)", () => {
    renderReview({ ...cover, can_manage: false } as ExchangeCase);
    expect(within(footer()).getByRole("note").textContent).toBe("Another Harbor & Vine Uptown manager, the owner or an admin decides this request.");
    expect((within(footer()).getByRole("button", { name: "Close request" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(footer()).getByRole("button", { name: "Pick someone" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getAllByRole("radio") as HTMLInputElement[]).every((radio) => radio.disabled)).toBe(true);
    expect(screen.queryByRole("button", { name: /^Decline / })).toBeNull();
  });

  it("declines one person's request with a reason only they read; the others stay", async () => {
    vi.mocked(changeExchange).mockResolvedValue({ case_id: caseId, revision: 5, status: "open" } as never);
    renderReview();
    fireEvent.click(screen.getByRole("button", { name: "Decline Diego Morales" }));
    const reason = screen.getByLabelText(/Reason for Diego/);
    expect(reason.getAttribute("placeholder")).toBe("Only Diego reads this.");
    const send = within(footer()).getByRole("button", { name: "Decline Diego" }) as HTMLButtonElement;
    // The reason is optional (plan 05:03; Mert, 2026-10-16).
    expect(send.disabled).toBe(false);
    fireEvent.change(reason, { target: { value: "You are off that day" } });
    fireEvent.click(send);
    fireEvent.click(within(footer()).getByRole("button", { name: "Confirm decline" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Diego's request is declined. The others can still take the shift."));
    expect(vi.mocked(changeExchange).mock.calls[0]![1]).toEqual({
      action: "reject", case_id: caseId, application_id: diego, expected_revision: 4, reason: "You are off that day", private_note: "",
    });
  });

  // Train CI 38147392878: the live refresh reached the drawer before the save
  // answered and no longer listed Diego; the message still names him.
  it("names the declined person when a refresh drops them before the save answers", async () => {
    let answer!: (value: unknown) => void;
    vi.mocked(changeExchange).mockReturnValue(new Promise((resolve) => { answer = resolve; }) as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = (item: ExchangeCase) => (
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ExchangeReview item={item} workspace={workspace} timeFormat="12h" onClose={onClose} onDone={onDone} onHold={onHold} />
        </MemoryRouter>
      </QueryClientProvider>
    );
    // Emma and Diego asked; once Diego is declined only Emma is left (train CI 38148426482).
    const two = { ...cover, applications: cover.applications.filter((item) => item.id !== sophie) } as ExchangeCase;
    const { rerender } = render(view(two));
    fireEvent.click(screen.getByRole("button", { name: "Decline Diego Morales" }));
    fireEvent.change(screen.getByLabelText(/Reason for Diego/), { target: { value: "You are off that day" } });
    fireEvent.click(within(footer()).getByRole("button", { name: "Decline Diego" }));
    fireEvent.click(within(footer()).getByRole("button", { name: "Confirm decline" }));
    rerender(view({ ...two, revision: 5, applications: two.applications.filter((item) => item.id !== diego) } as ExchangeCase));
    answer({ case_id: caseId, revision: 5, status: "open" });
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Diego's request is declined. The others can still take the shift."));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("goes back from a reason on Escape and keeps what was typed", () => {
    renderReview();
    fireEvent.click(within(footer()).getByRole("button", { name: "Close request" }));
    const reason = screen.getByLabelText(/Reason for Noah and the people who asked/);
    fireEvent.change(reason, { target: { value: "We are closed Sunday" } });
    expect(onHold).toHaveBeenLastCalledWith(true);
    fireEvent.keyDown(reason, { key: "Escape" });
    expect(screen.queryByLabelText(/Reason for Noah and the people who asked/)).toBeNull();
    expect(onHold).toHaveBeenLastCalledWith(false);
    fireEvent.click(within(footer()).getByRole("button", { name: "Close request" }));
    expect((screen.getByLabelText(/Reason for Noah and the people who asked/) as HTMLTextAreaElement).value).toBe("We are closed Sunday");
  });

  it("does not carry a failed give into the close step", async () => {
    vi.mocked(changeExchange).mockRejectedValue(new Error("This request changed. Review the latest details"));
    renderReview();
    fireEvent.click(screen.getByRole("radio", { name: /Emma Wilson/ }));
    const give = await screen.findByRole("button", { name: "Give to Emma" });
    await waitFor(() => expect((give as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(give);
    // Said over the body's bottom edge, right above the footer (UI-FIELDMSG).
    const band = () => footer().previousElementSibling as HTMLElement;
    expect((await within(band()).findByRole("alert")).textContent).toBe("This request changed. Review the latest details");
    fireEvent.click(within(footer()).getByRole("button", { name: "Close request" }));
    expect(within(band()).queryByRole("alert")).toBeNull();
  });

  // UI-FIELDMSG-2 (Mert 2026-10-18): two messages that hold at once are both said, none dropped.
  it("says both the failed give and the failed eligibility check", async () => {
    vi.mocked(changeExchange).mockRejectedValue(new Error("This request changed. Review the latest details"));
    vi.mocked(getExchangePreview).mockResolvedValueOnce(preview()).mockRejectedValue(new Error("Network down"));
    renderReview();
    fireEvent.click(screen.getByRole("radio", { name: /Emma Wilson/ }));
    const give = await screen.findByRole("button", { name: "Give to Emma" });
    await waitFor(() => expect((give as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(give);
    const band = () => footer().previousElementSibling as HTMLElement;
    await waitFor(() =>
      expect(within(band()).getByRole("alert").textContent).toBe("This request changed. Review the latest details"),
    );
    fireEvent.click(screen.getByRole("radio", { name: /Sophie Martin/ }));
    await waitFor(() =>
      expect(within(band()).getByRole("alert").textContent).toBe(
        "This request changed. Review the latest details Eligibility could not be checked. Close and try again.",
      ),
    );
  });

  it("says why the core refuses the person", async () => {
    vi.mocked(getExchangePreview).mockResolvedValue(preview({ allowed: false,
      reasons: ["The receiving employee is not eligible for the full shift"],
      receiver: { status: "ineligible", reasons: ["Required document is expired."], approval_flags: [], measures } }));
    renderReview({ ...quiet, applications: [cover.applications[0]!], candidate_count: 1 } as ExchangeCase);
    expect((await screen.findByRole("alert")).textContent).toContain("Required document is expired.");
  });

  it("says how a closed request ended", () => {
    renderReview({ ...cover, status: "completed", stage: "closed",
      applications: [{ ...cover.applications[0]!, status: "approved" }] } as ExchangeCase);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("Approved");
    expect(footer().textContent).toBe("Approved. The shift is Emma Wilson's now.");
  });

  it("shows the request's history on the Activity tab", () => {
    renderReview();
    fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
    expect(screen.getByRole("tabpanel").textContent).toContain("Noah Garcia asked for cover");
  });
});
