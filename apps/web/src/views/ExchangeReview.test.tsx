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
const open = { ...cover, kind: "open_pickup", owner_id: null, owner_name: null, private_note: undefined,
  shift: { ...cover.shift, employee_id: null, employee_name: null }, applications: [], candidate_count: 0 } as unknown as ExchangeCase;
function preview(change: Partial<ExchangePreview> = {}): ExchangePreview {
  return {
    allowed: true, fingerprint: "fp-1", reasons: [], requires_other_manager: false, other_applications: 1,
    receiver: { status: "eligible", reasons: [], approval_flags: [], measures }, giver: null, ...change,
  };
}
const onDone = vi.fn();
const onClose = vi.fn();
function renderReview(item: ExchangeCase = cover) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ExchangeReview item={item} workspace={workspace} timeFormat="12h" onClose={onClose} onDone={onDone} />
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

// Mert, 2026-10-11: cover and open shift requests open a drawer in the
// Important Dates drawer's language; the manager gives the shift in one step.
describe("ExchangeReview", () => {
  it("heads the drawer with the shift, the type, the status and the deadline", () => {
    renderReview();
    expect(text(screen.getByRole("heading", { level: 2 }))).toBe("Sun, Oct 11 · 4:00 PM – 10:00 PM Cover Needs review");
    expect(document.querySelector(".rd-sub")!.textContent).toContain("Decide by Oct 11, 4:00 PM New York time");
    expect(screen.getByRole("link", { name: /Open in Schedule/ }).getAttribute("href"))
      .toBe(`/app/schedule?date=2026-10-11&view=day&locations=${uptown}`);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Details", "Activity"]);
  });

  it("draws the shift, who keeps it until the decision, and the owner's private note", () => {
    renderReview();
    const card = screen.getByRole("group", { name: "Shift" });
    expect(text(card)).toBe("Sun, Oct 114:00 PM – 10:00 PMHarbor & Vine Uptown · Server · 5.5 h, 30 min unpaid break");
    expect(screen.getByText("Noah stays on this shift until you approve.")).toBeTruthy();
    expect(screen.getByText("Private note from Noah").parentElement!.textContent).toContain("Final exams week.Only managers see this.");
  });

  it("lists who asked with their checks; a person on time off cannot be picked", () => {
    renderReview();
    const people = within(screen.getByRole("radiogroup", { name: "Who can take it" })).getAllByRole("radio") as HTMLInputElement[];
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
    const give = await screen.findByRole("button", { name: "Give shift to Emma" });
    await waitFor(() => expect((give as HTMLButtonElement).disabled).toBe(false));
    expect(getExchangePreview).toHaveBeenCalledWith(workspace, caseId, emma);
    fireEvent.click(give);
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Emma has the shift now. Noah is off it."));
    expect(vi.mocked(changeExchange).mock.calls[0]![1]).toEqual({
      action: "approve", case_id: caseId, application_id: emma, expected_revision: 4, fingerprint: "fp-1", reason: "", private_note: "",
    });
  });

  it("says anyway on the button when the picked person carries a warning", async () => {
    renderReview();
    fireEvent.click(screen.getByRole("radio", { name: /Sophie Martin/ }));
    expect(await screen.findByRole("button", { name: "Give shift to Sophie anyway" })).toBeTruthy();
  });

  it("keeps the button off and says why when the core refuses the transfer", async () => {
    vi.mocked(getExchangePreview).mockResolvedValue(preview({ allowed: false, reasons: ["Overlaps another shift."] }));
    renderReview();
    fireEvent.click(screen.getByRole("radio", { name: /Emma Wilson/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("Overlaps another shift.");
    expect((screen.getByRole("button", { name: "Give shift to Emma" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("closes the request with a reason the people involved read", async () => {
    vi.mocked(changeExchange).mockResolvedValue({ case_id: caseId, revision: 5, status: "cancelled" } as never);
    renderReview();
    fireEvent.click(within(footer()).getByRole("button", { name: "Close request" }));
    const reason = screen.getByLabelText("Reason for Noah and the people who asked");
    const send = within(footer()).getByRole("button", { name: "Close request" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(reason, { target: { value: "We are closed Sunday" } });
    fireEvent.click(send);
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Request closed. Noah keeps the shift."));
    expect(vi.mocked(changeExchange).mock.calls[0]![1]).toEqual({
      action: "close", case_id: caseId, expected_revision: 4, reason: "We are closed Sunday", private_note: "",
    });
  });

  it("says an open shift with nobody asking stays open", () => {
    renderReview(open);
    expect(text(screen.getByRole("heading", { level: 2 }))).toBe("Sun, Oct 11 · 4:00 PM – 10:00 PM Open shift Open");
    expect(screen.getByText("Nobody is on this shift yet. It stays open until you approve someone.")).toBeTruthy();
    expect(screen.getByText("Nobody has asked yet. The shift stays open on the Schedule.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Nobody to approve" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("preselects the only person who can take it", async () => {
    renderReview({ ...open, applications: [cover.applications[0]!], candidate_count: 1 } as ExchangeCase);
    expect((screen.getByRole("radio", { name: /Emma Wilson/ }) as HTMLInputElement).checked).toBe(true);
    expect(await screen.findByRole("button", { name: "Give shift to Emma" })).toBeTruthy();
  });

  it("tells a manager of another location who decides", () => {
    renderReview({ ...cover, can_manage: false } as ExchangeCase);
    expect(footer().textContent).toBe("Another Harbor & Vine Uptown manager, the owner or an admin decides this request.");
    expect((screen.getAllByRole("radio") as HTMLInputElement[]).every((radio) => radio.disabled)).toBe(true);
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
