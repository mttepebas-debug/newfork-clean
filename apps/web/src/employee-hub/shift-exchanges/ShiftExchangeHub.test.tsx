import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ExchangeCase,
  ExchangeReadModel,
  ExchangeShift,
} from "@newfork/shared";
import { ShiftExchangeHub } from "./ShiftExchangeHub";
import { ReleaseCard } from "./Release";
import {
  changeExchange,
  getExchangeCandidates,
  getExchanges,
} from "./exchange-data";

vi.mock("../../auth/AuthContext", () => ({
  useAuth: () => ({ context: { userId: "user" } }),
}));
vi.mock("./exchange-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./exchange-data")>()),
  getExchanges: vi.fn(),
  getExchangeCandidates: vi.fn(),
  getExchangePreview: vi.fn(),
  changeExchange: vi.fn(),
  refreshExchangeSurfaces: vi.fn(),
}));
const shift: ExchangeShift = {
  id: "shift",
  source_id: "source",
  location_id: "location",
  location_name: "Palo Alto",
  timezone: "America/Los_Angeles",
  job_id: "job",
  job_name: "Server",
  scheduled_date: "2030-01-10",
  start_time: "18:00",
  end_time: "23:00",
  starts_at: "2030-01-11T02:00:00Z",
  ends_at: "2030-01-11T07:00:00Z",
  employee_id: "alex",
  employee_name: "Alex Morgan",
};
const item: ExchangeCase = {
  id: "case",
  kind: "cover",
  audience: "eligible_pool",
  status: "open",
  stage: "ready_for_manager",
  revision: 4,
  created_at: "2030-01-01T00:00:00Z",
  expires_at: shift.starts_at!,
  owner_id: "alex",
  owner_name: "Alex Morgan",
  shift,
  requested_shift: null,
  current_published: true,
  candidate_count: 3,
  can_manage: true,
  is_owner: true,
  teammate_note: "",
  history: [],
  applications: ["Blake", "Casey", "Drew"].map((name) => ({
    id: name,
    employee_id: name.toLowerCase(),
    employee_name: name,
    status: "pending_manager",
    created_at: "2030-01-01T00:00:00Z",
    reason: "",
    eligibility: {
      status: "eligible",
      reasons: ["Available for the full shift"],
    },
  })),
};
let model: ExchangeReadModel;
function mount(route = "/app/employee-hub/shift-hub") {
  const entry = new URL(route, "https://example.test");
  // The fixture is in January 2030; date-filter tests override this explicitly.
  if (!entry.searchParams.has("from"))
    entry.searchParams.set("from", "2030-01-01");
  if (!entry.searchParams.has("to")) entry.searchParams.set("to", "2030-01-31");
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry.pathname + entry.search]}>
        <ShiftExchangeHub workspaceId="workspace" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, client };
}
beforeEach(() => {
  vi.clearAllMocks();
  model = {
    employee_id: "alex",
    cases: [structuredClone(item)],
    opportunities: [],
    own_shifts: [{ ...shift, decision_tier: "location_manager" }],
  };
  vi.mocked(getExchanges).mockImplementation(async () => model);
  vi.mocked(getExchangeCandidates).mockResolvedValue({
    employees: [
      {
        id: "blake",
        name: "Blake",
        eligibility: { status: "eligible", reasons: [] },
      },
    ],
    shifts: [
      {
        ...shift,
        id: "target",
        source_id: "target-source",
        employee_id: "blake",
        employee_name: "Blake",
      },
    ],
  });
  vi.mocked(changeExchange).mockResolvedValue({
    case_id: "case",
    revision: 5,
    status: "open",
  });
});
describe("Shift Hub outcome contracts", () => {
  it("shows an own-availability warning and sends its token only on Take it anyway", async () => {
    const fingerprint = "a".repeat(64);
    model.employee_id = "blake";
    model.cases = [];
    model.opportunities = [
      {
        case_id: "released",
        shift,
        note: "",
        eligibility: {
          status: "eligible",
          reasons: [],
          availability_warning: { fingerprint },
        },
      },
    ];
    mount("/app/employee-hub/shift-hub?hub_view=available");
    const take = await screen.findByRole("button", {
      name: "Take it anyway",
    });
    expect(screen.getByText("Outside your availability")).toBeTruthy();
    expect(changeExchange).not.toHaveBeenCalled();
    fireEvent.click(take);
    await waitFor(() =>
      expect(changeExchange).toHaveBeenCalledWith(
        "workspace",
        {
          action: "apply",
          shift_id: "shift",
          case_id: "released",
          availability_fingerprint: fingerprint,
        },
        expect.any(String),
      ),
    );
  });

  it("shows a shift their approved time off blocks as not open, and where to ask for the hours (BL-995)", async () => {
    model.employee_id = "blake";
    model.cases = [];
    model.opportunities = [
      {
        case_id: "released",
        shift,
        note: "",
        eligibility: {
          status: "ineligible",
          reasons: ["Approved time off overlaps this shift"],
          blockers: [{ code: "approved_time_off", message: "Approved time off overlaps this shift" }],
        },
      },
    ];
    mount("/app/employee-hub/shift-hub?hub_view=available");
    expect(await screen.findByText("On time off")).toBeTruthy();
    expect(screen.getByText(/To take it, ask to cancel those hours first/)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Ask to cancel time off/ }).getAttribute("href"),
    ).toBe("/app/employee-hub/my-availability");
    expect(screen.queryByRole("button", { name: /Request/ })).toBeNull();
    expect(screen.queryByText("No eligible shifts right now")).toBeNull();
  });
  it("requires an explicit Accept anyway action for an invited employee own conflict", async () => {
    const fingerprint = "b".repeat(64);
    const request = model.cases[0]!;
    model.employee_id = "blake";
    request.is_owner = false;
    request.audience = "direct";
    request.stage = "awaiting_peer";
    request.applications = [
      {
        ...request.applications[0]!,
        status: "invited",
        eligibility: {
          status: "eligible",
          reasons: [],
          availability_warning: { fingerprint },
        },
      },
    ];
    mount("/app/employee-hub/shift-hub?case=case");
    const accept = await screen.findByRole("button", { name: "Accept anyway" });
    expect(screen.queryByRole("button", { name: "Accept request" })).toBeNull();
    expect(changeExchange).not.toHaveBeenCalled();
    fireEvent.click(accept);
    await waitFor(() =>
      expect(changeExchange).toHaveBeenCalledWith(
        "workspace",
        {
          action: "accept",
          case_id: "case",
          application_id: "Blake",
          expected_revision: 4,
          availability_fingerprint: fingerprint,
        },
        expect.any(String),
      ),
    );
  });

  it("uses the selected incoming shift token for Request swap anyway", async () => {
    const fingerprint = "c".repeat(64);
    model.cases = [];
    vi.mocked(getExchangeCandidates).mockResolvedValue({
      employees: [],
      shifts: [
        {
          ...shift,
          id: "target",
          source_id: "target-source",
          employee_id: "blake",
          employee_name: "Blake",
          availability_warning: { fingerprint },
        },
      ],
    });
    mount("/app/employee-hub/shift-hub?offer=shift&mode=swap");
    await screen.findByText(
      "You remain responsible until a manager approves the transfer.",
    );
    const select = (await screen.findByLabelText(
      "Eligible teammate shift",
    )) as HTMLSelectElement;
    await waitFor(() => expect(select.disabled).toBe(false));
    fireEvent.change(select, { target: { value: "target" } });
    const send = screen.getByRole("button", {
      name: "Request swap anyway",
      hidden: true,
    });
    expect(changeExchange).not.toHaveBeenCalled();
    fireEvent.click(send);
    await waitFor(() =>
      expect(changeExchange).toHaveBeenCalledWith(
        "workspace",
        {
          action: "create",
          kind: "swap",
          shift_id: "shift",
          requested_shift_id: "target",
          note: "",
          availability_fingerprint: fingerprint,
        },
        expect.any(String),
      ),
    );
  });

  it.each(["completed", "cancelled"] as const)(
    "removes the acceptance confirmation when a remote decision makes the request %s",
    async (status) => {
      const request = model.cases[0]!;
      model.employee_id = "blake";
      request.is_owner = false;
      request.audience = "direct";
      request.stage = "awaiting_peer";
      request.applications = [
        { ...request.applications[0]!, status: "invited" },
      ];
      const { client } = mount("/app/employee-hub/shift-hub?case=case");
      fireEvent.click(
        await screen.findByRole("button", { name: "Accept request" }),
      );
      await waitFor(() => expect(changeExchange).toHaveBeenCalled());
      const accepted = structuredClone(model);
      accepted.cases[0]!.revision = 5;
      accepted.cases[0]!.stage = "ready_for_manager";
      accepted.cases[0]!.applications[0]!.status = "pending_manager";
      act(() =>
        client.setQueriesData(
          { queryKey: ["shift-exchanges", "workspace", "user"] },
          accepted,
        ),
      );
      await screen.findByText(
        "Request accepted. Waiting for final manager approval.",
      );
      // Unrelated case activity must not hide a still-current confirmation.
      const unrelated = structuredClone(accepted);
      unrelated.cases.push({
        ...structuredClone(item),
        id: "another-case",
        revision: 12,
      });
      act(() =>
        client.setQueriesData(
          { queryKey: ["shift-exchanges", "workspace", "user"] },
          unrelated,
        ),
      );
      expect(
        screen.getByText(
          "Request accepted. Waiting for final manager approval.",
        ),
      ).toBeTruthy();
      const finalized = structuredClone(unrelated);
      finalized.cases[0]!.revision = 6;
      finalized.cases[0]!.status = status;
      finalized.cases[0]!.stage = "closed";
      finalized.cases[0]!.applications[0]!.status =
        status === "completed" ? "approved" : "rejected_by_manager";
      if (status === "completed")
        finalized.cases[0]!.shift = {
          ...shift,
          employee_id: "blake",
          employee_name: "Blake",
        };
      act(() =>
        client.setQueriesData(
          { queryKey: ["shift-exchanges", "workspace", "user"] },
          finalized,
        ),
      );
      await waitFor(() =>
        expect(
          screen.queryByText(
            "Request accepted. Waiting for final manager approval.",
          ),
        ).toBeNull(),
      );
      const detail = screen.getByRole("complementary", {
        name: "Request details",
      });
      expect(
        within(detail).getByText(
          status === "completed"
            ? "Transfer approved"
            : "Current owner: Alex Morgan",
        ),
      ).toBeTruthy();
    },
  );

  it("confirms a declined direct invitation as closed without promising another approval", async () => {
    model.employee_id = "blake";
    model.cases[0]!.is_owner = false;
    model.cases[0]!.audience = "direct";
    model.cases[0]!.applications = [
      { ...model.cases[0]!.applications[0]!, status: "invited" },
    ];
    vi.mocked(changeExchange).mockResolvedValue({
      case_id: "case",
      status: "cancelled",
      revision: 5,
    });
    const { client } = mount("/app/employee-hub/shift-hub?case=case");
    fireEvent.click(await screen.findByRole("button", { name: "Decline" }));
    await waitFor(() => expect(changeExchange).toHaveBeenCalled());
    const updated = structuredClone(model);
    updated.cases[0]!.revision = 5;
    updated.cases[0]!.status = "cancelled";
    updated.cases[0]!.stage = "closed";
    updated.cases[0]!.applications[0]!.status = "declined_by_employee";
    act(() =>
      client.setQueriesData(
        { queryKey: ["shift-exchanges", "workspace", "user"] },
        updated,
      ),
    );
    await screen.findByText(
      "Request closed. No transfer was made. Check your current schedule for your assignment.",
    );
    expect(
      screen.queryByText(
        "Request updated. Assignment changes require final manager approval.",
      ),
    ).toBeNull();
  });

  it("keeps a focused request outside the date range accessible without listing or counting it", async () => {
    mount(
      "/app/employee-hub/shift-hub?case=case&from=2030-02-01&to=2030-02-02",
    );
    const detail = await screen.findByRole("complementary", {
      name: "Request details",
    });
    expect(within(detail).getByText(/outside your list filters/)).toBeTruthy();
    expect(within(detail).getByText("Alex Morgan")).toBeTruthy();
    expect(document.querySelectorAll(".sx-case-row")).toHaveLength(0);
    expect(
      screen.getByText(
        "No cover searches, applications or swap invitations match these filters.",
      ),
    ).toBeTruthy();
    expect(getExchanges).toHaveBeenCalledWith("workspace", false, {
      from: "2030-02-01",
      to: "2030-02-02",
      caseId: "case",
    });
  });

  it.each(["open", "invalidated", "completed"] as const)(
    "filters %s requests by inclusive dates while keeping both boundary days",
    async (status) => {
      model.cases = [
        "2030-01-09",
        "2030-01-10",
        "2030-01-11",
        "2030-01-12",
      ].map((date) => ({
        ...structuredClone(item),
        id: date,
        status,
        shift: { ...shift, scheduled_date: date },
      }));
      mount(
        `/app/employee-hub/shift-hub?from=2030-01-10&to=2030-01-11&hub_view=${status === "open" ? "requests" : "history"}`,
      );
      await screen.findByRole("navigation", { name: "Shift Hub views" });
      expect(document.querySelectorAll(".sx-case-row")).toHaveLength(2);
      expect(document.querySelector(".sx-list")?.textContent).toContain(
        "Thu, Jan 10",
      );
      expect(document.querySelector(".sx-list")?.textContent).toContain(
        "Fri, Jan 11",
      );
      expect(document.querySelector(".sx-list")?.textContent).not.toContain(
        "Wed, Jan 9",
      );
      expect(document.querySelector(".sx-list")?.textContent).not.toContain(
        "Sat, Jan 12",
      );
    },
  );

  it("finds the return shift by its date, location and name without combining opposite sides", async () => {
    model.cases[0] = {
      ...structuredClone(item),
      kind: "swap",
      status: "completed",
      requested_shift: {
        ...shift,
        id: "return",
        source_id: "return-source",
        scheduled_date: "2030-01-20",
        location_id: "patio",
        location_name: "Patio",
        employee_id: "blake",
        employee_name: "Blake",
      },
    };
    mount(
      "/app/employee-hub/shift-hub?from=2030-01-20&to=2030-01-20&location=patio&q=Blake&hub_view=history",
    );
    await screen.findByText("Requested in return");
    expect(document.querySelectorAll(".sx-case-row")).toHaveLength(1);
    expect(document.querySelector(".sx-case-row")?.textContent).toContain(
      "Sun, Jan 20",
    );
    expect(screen.getByRole("option", { name: "Patio" })).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Alex" },
    });
    await waitFor(() =>
      expect(document.querySelectorAll(".sx-case-row")).toHaveLength(0),
    );
    expect(
      screen.getByText(/No past requests match these filters/),
    ).toBeTruthy();
  });

  it("uses the selected dates for available opportunities too", async () => {
    model.employee_id = "blake";
    model.opportunities = ["2030-01-09", "2030-01-10", "2030-01-11"].map(
      (date) => ({
        case_id: `case-${date}`,
        shift: {
          ...shift,
          id: date,
          source_id: date,
          scheduled_date: date,
        },
        note: "",
        eligibility: { status: "eligible", reasons: [] },
      }),
    );
    mount("/app/employee-hub/shift-hub?from=2030-01-10&to=2030-01-10");
    await screen.findByRole("navigation", { name: "Shift Hub views" });
    const cards = [...document.querySelectorAll(".sx-dcard .sx-tk")].map((card) => card.getAttribute("aria-label"));
    expect(cards).toEqual([expect.stringContaining("Thursday, January 10")]);
  });

  it("names the first view Available Shifts and marks the open view", async () => {
    mount("/app/employee-hub/shift-hub");
    const views = await screen.findByRole("navigation", {
      name: "Shift Hub views",
    });
    const tabs = within(views).getAllByRole("button");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Available Shifts",
      "My requests",
      "History",
    ]);
    expect(tabs[0]!.getAttribute("aria-current")).toBe("page");
    fireEvent.click(tabs[2]!);
    await waitFor(() =>
      expect(tabs[2]!.getAttribute("aria-current")).toBe("page"),
    );
    expect(tabs[0]!.getAttribute("aria-current")).toBeNull();
  });

  it("counts the requests waiting for my answer on the My requests tab", async () => {
    model.employee_id = "blake";
    model.cases[0]!.is_owner = false;
    model.cases[0]!.applications[0]!.status = "invited";
    const closed = structuredClone(model.cases[0]!);
    closed.id = "closed";
    closed.status = "expired";
    model.cases.push(closed);
    mount("/app/employee-hub/shift-hub");
    const views = await screen.findByRole("navigation", {
      name: "Shift Hub views",
    });
    const mine = within(views).getByRole("button", {
      name: "My requests, 1 needs your answer",
    });
    expect(mine.querySelector(".sx-tab-count")?.textContent).toBe("1");
    expect(mine.querySelector(".sx-tab-count")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(
      within(views)
        .getByRole("button", { name: "Available Shifts" })
        .querySelector(".sx-tab-count"),
    ).toBeNull();
  });
  it("counts the open shifts I can take on the Available Shifts tab", async () => {
    model.employee_id = "blake";
    model.cases[0]!.is_owner = false;
    const open = (id: string, date: string, caseId = `case-${id}`) => ({
      case_id: caseId,
      shift: { ...shift, id, scheduled_date: date },
      note: "",
      eligibility: { status: "eligible" as const, reasons: [] },
    });
    model.opportunities = [
      open("takeable", "2030-01-09"),
      // Outside the selected dates: still one I can take.
      open("later", "2030-03-02"),
      // Already asked for: it waits on a manager, not on me.
      open("applied", "2030-01-10", "case"),
      {
        ...open("time-off", "2030-01-11"),
        eligibility: {
          status: "ineligible",
          reasons: ["Approved time off overlaps this shift"],
          blockers: [{ code: "approved_time_off" }],
        },
      },
    ];
    mount("/app/employee-hub/shift-hub?hub_view=history");
    const views = await screen.findByRole("navigation", {
      name: "Shift Hub views",
    });
    const available = within(views).getByRole("button", {
      name: "Available Shifts, 2 you can take",
    });
    expect(available.querySelector(".sx-tab-count")?.textContent).toBe("2");
    expect(
      available.querySelector(".sx-tab-count")?.getAttribute("aria-hidden"),
    ).toBe("true");
  });
  it("shows no count when nothing waits for my answer", async () => {
    mount("/app/employee-hub/shift-hub");
    const views = await screen.findByRole("navigation", {
      name: "Shift Hub views",
    });
    expect(views.querySelector(".sx-tab-count")).toBeNull();
  });

  it.each(["cover", "swap"] as const)(
    "keeps the note and blocks a %s request when the selected match disappears",
    async (mode) => {
      model.cases = [];
      const { client } = mount(`/app/employee-hub/shift-hub?offer=shift&mode=${mode}`);
      await screen.findByText(
        "You remain responsible until a manager approves the transfer.",
      );
      await waitFor(() => expect(getExchangeCandidates).toHaveBeenCalled());
      const select = screen.getByLabelText(
        mode === "swap" ? "Eligible teammate shift" : "Eligible teammate",
      ) as HTMLSelectElement;
      await waitFor(() => expect(select.disabled).toBe(false));
      fireEvent.change(select, {
        target: { value: mode === "swap" ? "target" : "blake" },
      });
      const note = screen.getByRole("textbox", {
        hidden: true,
      }) as HTMLTextAreaElement;
      fireEvent.change(note, {
        target: { value: "Keep this private explanation" },
      });
      const send = screen.getByRole("button", {
        name: mode === "swap" ? "Send swap request" : "Send cover request",
        hidden: true,
      }) as HTMLButtonElement;
      expect(send.disabled).toBe(false);
      act(() => {
        client.setQueryData(
          ["shift-exchanges", "workspace", "candidates", "shift"],
          { employees: [], shifts: [] },
        );
      });
      await screen.findByText(/This match is no longer available/);
      expect(send.disabled).toBe(true);
      expect(select.value).toBe("");
      expect(note.value).toBe("Keep this private explanation");
      fireEvent.submit(send.closest("form")!);
      expect(changeExchange).not.toHaveBeenCalled();
    },
  );
  it.each(["cover", "swap"] as const)(
    "offers an in-place retry and preserves %s selections after eligibility lookup fails",
    async (mode) => {
      model.cases = [];
      const { client } = mount(`/app/employee-hub/shift-hub?offer=shift&mode=${mode}`);
      await screen.findByText(
        "You remain responsible until a manager approves the transfer.",
      );
      const select = screen.getByLabelText(
        mode === "swap" ? "Eligible teammate shift" : "Eligible teammate",
      ) as HTMLSelectElement;
      await waitFor(() => expect(select.disabled).toBe(false));
      fireEvent.change(select, {
        target: { value: mode === "swap" ? "target" : "blake" },
      });
      fireEvent.change(screen.getByRole("textbox", { hidden: true }), {
        target: { value: "Keep my note" },
      });
      vi.mocked(getExchangeCandidates).mockRejectedValueOnce(
        new Error("Lookup temporarily unavailable"),
      );
      await act(async () => {
        await client.invalidateQueries({
          queryKey: ["shift-exchanges", "workspace", "candidates"],
        });
      });
      await screen.findByText(/We couldn’t check eligible matches/);
      const send = screen.getByRole("button", {
        name: mode === "swap" ? "Send swap request" : "Send cover request",
        hidden: true,
      }) as HTMLButtonElement;
      expect(send.disabled).toBe(true);
      expect(select.disabled).toBe(true);
      const retry = screen.getByRole("button", {
        name: "Retry eligibility check",
        hidden: true,
      });
      retry.focus();
      fireEvent.click(retry);
      await waitFor(() => expect(send.disabled).toBe(false));
      expect(document.activeElement).toBe(select);
      expect(select.value).toBe(mode === "swap" ? "target" : "blake");
      expect(
        (screen.getByRole("textbox", { hidden: true }) as HTMLTextAreaElement)
          .value,
      ).toBe("Keep my note");
      expect(changeExchange).not.toHaveBeenCalled();
    },
  );
  it("offers to release the shift to everyone when no swap fits", async () => {
    model.cases = [];
    vi.mocked(getExchangeCandidates).mockResolvedValue({
      employees: [],
      shifts: [],
    });
    mount("/app/employee-hub/shift-hub?offer=shift&mode=swap");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Release it to everyone instead",
        hidden: true,
      }),
    );
    expect(await screen.findByText(/Note for teammates/)).toBeTruthy();
    expect(changeExchange).not.toHaveBeenCalled();
  });
  it("does not move focus away from a note edited while eligibility retries", async () => {
    model.cases = [];
    vi.mocked(getExchangeCandidates).mockRejectedValueOnce(
      new Error("Offline"),
    );
    mount("/app/employee-hub/shift-hub?offer=shift&mode=cover");
    await screen.findByText(
      "You remain responsible until a manager approves the transfer.",
    );
    await screen.findByText(/We couldn’t check eligible matches/);
    let resolve!: (
      value: Awaited<ReturnType<typeof getExchangeCandidates>>,
    ) => void;
    vi.mocked(getExchangeCandidates).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const retry = screen.getByRole("button", {
      name: "Retry eligibility check",
      hidden: true,
    });
    retry.focus();
    fireEvent.click(retry);
    await screen.findByText(/Checking current eligibility/);
    const note = screen.getByRole("textbox", { hidden: true });
    note.focus();
    fireEvent.change(note, { target: { value: "Continuing my explanation" } });
    await act(async () => {
      resolve({ employees: [], shifts: [] });
    });
    await screen.findByText(/No eligible matches for this shift/);
    expect(document.activeElement).toBe(note);
    expect((note as HTMLTextAreaElement).value).toBe(
      "Continuing my explanation",
    );
  });
  it("shows a manager's result and keeps the owner's draft reason in an open close review", async () => {
    model.cases[0]!.audience = "direct";
    const { client } = mount("/app/employee-hub/shift-hub?case=case");
    const trigger = await screen.findByRole("button", {
      name: "Close cover search",
    });
    trigger.focus();
    fireEvent.click(trigger);
    const note = screen.getByLabelText(/Reason shared with affected employees/);
    note.focus();
    fireEvent.change(note, { target: { value: "My unfinished review" } });
    const updated = structuredClone(model);
    const result = updated.cases[0]!;
    result.status = "completed";
    result.stage = "closed";
    result.revision += 1;
    result.candidate_count = 0;
    result.shift = {
      ...result.shift,
      employee_id: "blake",
      employee_name: "Blake",
    };
    result.applications.forEach((application) => {
      application.status =
        application.id === "Blake" ? "approved" : "closed_other_selected";
    });
    act(() =>
      client.setQueriesData(
        { queryKey: ["shift-exchanges", "workspace", "user"] },
        updated,
      ),
    );
    await screen.findByText("Request updated");
    const dialog = screen.getByText("Request updated").closest("dialog")!;
    expect(
      within(dialog).getByRole("alert", { hidden: true }).textContent,
    ).toContain("This transfer has already been approved.");
    expect(within(dialog).getByText("Blake")).toBeTruthy();
    expect(
      within(dialog).queryByText(/current owner remains responsible/),
    ).toBeNull();
    expect((note as HTMLTextAreaElement).value).toBe("My unfinished review");
    expect(document.activeElement).toBe(note);
    expect(within(dialog).getByText(/It has not been sent/)).toBeTruthy();
    expect(
      within(dialog).queryByRole("button", {
        name: "Close search",
        hidden: true,
      }),
    ).toBeNull();
    expect(changeExchange).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "View latest result",
        hidden: true,
      }),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { name: "Cover for Alex Morgan" }),
      ),
    );
  });
  it("closes the owner's cover search with the reason it shares", async () => {
    model.cases[0]!.audience = "direct";
    mount("/app/employee-hub/shift-hub?case=case");
    fireEvent.click(
      await screen.findByRole("button", { name: "Close cover search" }),
    );
    const dialog = screen
      .getByText("Close this search", { selector: "h2" })
      .closest("dialog")!;
    expect(
      within(dialog).getByText(/All 3 active applications will close/),
    ).toBeTruthy();
    expect(within(dialog).queryByLabelText(/Private manager note/)).toBeNull();
    const close = within(dialog).getByRole("button", {
      name: "Close search",
      hidden: true,
    }) as HTMLButtonElement;
    // TAKAS-RELEASE: the reason is optional.
    expect(close.disabled).toBe(false);
    fireEvent.change(
      within(dialog).getByLabelText(/Reason shared with affected employees/),
      { target: { value: "Shift covered internally" } },
    );
    // BL-748: closing takes the search away, so it is red and asks twice.
    expect(close.className).toBe("sx-danger");
    fireEvent.click(close);
    expect(changeExchange).not.toHaveBeenCalled();
    expect(close.textContent).toBe("Confirm close");
    // Escape on the armed button only disarms: its default is prevented, so
    // the browser sends the window no cancel (jsdom never sends one).
    expect(fireEvent.keyDown(close, { key: "Escape" })).toBe(false);
    expect(close.textContent).toBe("Close search");
    fireEvent.click(close);
    fireEvent.click(close);
    await waitFor(() =>
      expect(changeExchange).toHaveBeenCalledWith(
        "workspace",
        {
          action: "close",
          case_id: "case",
          expected_revision: 4,
          reason: "Shift covered internally",
          private_note: "",
        },
        expect.any(String),
      ),
    );
    expect(changeExchange).toHaveBeenCalledTimes(1);
  });

  // A swap is cancelled, not a search closed: the window says what ends and
  // who keeps which shift.
  it("cancels the owner's swap request in a swap's own words", async () => {
    model.cases[0] = {
      ...model.cases[0]!,
      kind: "swap",
      audience: "direct",
      requested_current_published: true,
      requested_shift: {
        ...shift,
        id: "other",
        source_id: "other-source",
        employee_id: "blake",
        employee_name: "Blake",
      },
    };
    mount("/app/employee-hub/shift-hub?case=case");
    fireEvent.click(
      await screen.findByRole("button", { name: "Cancel swap request" }),
    );
    const dialog = screen
      .getByText("Cancel this swap request", { selector: "h2" })
      .closest("dialog")!;
    expect(
      within(dialog).getByText(
        "Your swap request with Blake ends. You both keep your own shifts.",
      ),
    ).toBeTruthy();
    expect(within(dialog).queryByText(/search|applications/)).toBeNull();
    fireEvent.change(
      within(dialog).getByLabelText(/Reason shared with affected employees/),
      { target: { value: "Plans changed" } },
    );
    const cancel = within(dialog).getByRole("button", {
      name: "Cancel request",
      hidden: true,
    });
    expect(cancel.className).toBe("sx-danger");
    fireEvent.click(cancel);
    expect(cancel.textContent).toBe("Confirm cancel");
    expect(changeExchange).not.toHaveBeenCalled();
    fireEvent.click(cancel);
    await waitFor(() =>
      expect(changeExchange).toHaveBeenCalledWith(
        "workspace",
        expect.objectContaining({ action: "close", case_id: "case", reason: "Plans changed" }),
        expect.any(String),
      ),
    );
  });
  it.each([
    [0, "Nobody has applied yet. The current owner remains responsible."],
    [1, "The 1 active application will close. The current owner remains responsible."],
    [2, "All 2 active applications will close. The current owner remains responsible."],
  ])("counts %i application(s) in a sentence that reads right", async (count, sentence) => {
    model.cases[0]!.audience = "direct";
    model.cases[0]!.candidate_count = count;
    mount("/app/employee-hub/shift-hub?case=case");
    fireEvent.click(
      await screen.findByRole("button", { name: "Close cover search" }),
    );
    const dialog = screen
      .getByText("Close this search", { selector: "h2" })
      .closest("dialog")!;
    expect(within(dialog).getByText(sentence)).toBeTruthy();
  });
  it.each(["cancelled", "expired", "invalidated"] as const)(
    "explains a %s request without claiming a transfer or inferring an unpublished owner",
    async (status) => {
      model.cases[0]!.audience = "direct";
      const { client } = mount("/app/employee-hub/shift-hub?case=case");
      fireEvent.click(
        await screen.findByRole("button", { name: "Close cover search" }),
      );
      const updated = structuredClone(model);
      updated.cases[0]!.status = status;
      updated.cases[0]!.current_published = false;
      act(() =>
        client.setQueriesData(
          { queryKey: ["shift-exchanges", "workspace", "user"] },
          updated,
        ),
      );
      await screen.findByText("Request updated");
      const dialog = screen.getByText("Request updated").closest("dialog")!;
      expect(
        within(dialog).getByRole("alert", { hidden: true }).textContent,
      ).toContain("This request is no longer open");
      expect(within(dialog).getByText("No longer published")).toBeTruthy();
      expect(within(dialog).queryByText("Alex Morgan")).toBeNull();
      expect(within(dialog).queryByText(/already been approved/)).toBeNull();
      expect(changeExchange).not.toHaveBeenCalled();
    },
  );

  it("tells a direct request owner whose response is still needed", async () => {
    model.cases[0]!.audience = "direct";
    model.cases[0]!.stage = "awaiting_peer";
    model.cases[0]!.applications = [
      { ...item.applications[0]!, status: "invited" },
    ];
    model.cases[0]!.candidate_count = 1;
    mount("/app/employee-hub/shift-hub?case=case");
    await screen.findByText("Awaiting teammate response");
    expect(screen.queryByText("Your response needed")).toBeNull();
    expect(screen.queryByRole("button", { name: "Accept request" })).toBeNull();
    expect(
      screen.getByText(
        /Your teammate must accept before your manager can approve/,
      ),
    ).toBeTruthy();
  });
  it("opens an employee case deep link in My requests and keeps that queue on back", async () => {
    mount("/app/employee-hub/shift-hub?case=case");
    await screen.findByText("Who wants it");
    expect(
      screen
        .getByRole("button", { name: "My requests" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.queryByText("No eligible shifts right now")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to requests" }));
    expect(
      (await screen.findByRole("button", { name: "My requests" })).getAttribute(
        "aria-current",
      ),
    ).toBe("page");
    expect(screen.queryByText("Who wants it")).toBeNull();
  });
  it("opens a closed case deep link in History", async () => {
    model.employee_id = null;
    model.cases[0]!.status = "invalidated";
    mount("/app/employee-hub/shift-hub?case=case");
    await screen.findByText("Current owner: Alex Morgan");
    expect(
      screen
        .getByRole("button", { name: "History" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.getAllByText("Shift changed").length).toBeGreaterThan(0);
    expect(screen.queryByText("invalidated")).toBeNull();
  });
  it("keeps ownership prominent and lists volunteers without owner veto", async () => {
    mount("/app/employee-hub/shift-hub?hub_view=requests&case=case");
    expect(await screen.findByText(/Until then it is your shift/)).toBeTruthy();
    expect(screen.getByText("Casey")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Approve transfer/ }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Accept request" })).toBeNull();
  });
  it("does not claim a pending pickup is scheduled", async () => {
    model.employee_id = "casey";
    model.cases[0]!.is_owner = false;
    mount("/app/employee-hub/shift-hub?hub_view=requests&case=case");
    expect(
      await screen.findByText(/Not added to your schedule yet/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Withdraw request" }));
    await waitFor(() =>
      expect(changeExchange).toHaveBeenCalledWith(
        "workspace",
        {
          action: "withdraw",
          case_id: "case",
          application_id: "Casey",
          expected_revision: 4,
        },
        expect.any(String),
      ),
    );
  });
  it("keeps a private note when closing the unfinished form is cancelled", async () => {
    model.cases = [];
    mount("/app/employee-hub/shift-hub?offer=shift&mode=cover");
    await screen.findByText(
      "You remain responsible until a manager approves the transfer.",
    );
    fireEvent.change(screen.getByRole("textbox", { hidden: true }), {
      target: { value: "Please arrange cover" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Close dialog", hidden: true }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Keep editing", hidden: true }),
    );
    expect(
      (screen.getByRole("textbox", { hidden: true }) as HTMLTextAreaElement)
        .value,
    ).toBe("Please arrange cover");
  });
  it("shows unpublished details as history instead of assigning responsibility", async () => {
    model.cases[0]!.status = "invalidated";
    model.cases[0]!.stage = "closed";
    model.cases[0]!.current_published = false;
    mount("/app/employee-hub/shift-hub?case=case&hub_view=history");
    await screen.findByText("This shift is no longer published");
    expect(screen.queryByText("Still your shift")).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "Start a new cover or swap request",
      }),
    ).toBeNull();
  });
  it("lets the current owner renew a materially changed offer", async () => {
    model.cases[0]!.status = "invalidated";
    model.cases[0]!.stage = "closed";
    model.cases[0]!.current_published = true;
    mount("/app/employee-hub/shift-hub?case=case&hub_view=history");
    await screen.findByText("Still your shift");
    fireEvent.click(
      screen.getByRole("button", { name: "Start a new cover or swap request" }),
    );
    // A release renews as a release (TAKAS-RELEASE).
    expect(await screen.findByText(/Note for teammates/)).toBeTruthy();
    expect(changeExchange).not.toHaveBeenCalled();
  });
  it("shows both current owners of a pending swap, including the recipient's own responsibility", async () => {
    model.employee_id = "blake";
    model.cases[0] = {
      ...model.cases[0]!,
      kind: "swap",
      requested_current_published: true,
      requested_shift: {
        ...shift,
        id: "other",
        source_id: "other-source",
        employee_id: "blake",
        employee_name: "Blake",
      },
    };
    mount("/app/employee-hub/shift-hub?case=case");
    await screen.findByText("Both owners keep their current shifts");
    const details = screen.getByRole("complementary", {
      name: "Request details",
    });
    expect(
      [...details.querySelectorAll(".sx-assignment strong")].map(
        (el) => el.textContent,
      ),
    ).toEqual(["Alex Morgan", "Blake"]);
    expect(within(details).getByText("You")).toBeTruthy();
    expect(
      within(details).getByText(
        "Each person remains responsible for their shift until final manager approval.",
      ),
    ).toBeTruthy();
  });
  it("separates a past approval from the current owners and removes future swap promises", async () => {
    model.cases[0] = {
      ...model.cases[0]!,
      kind: "swap",
      status: "completed",
      stage: "closed",
      requested_current_published: true,
      shift: { ...shift, employee_id: "casey", employee_name: "Casey" },
      requested_shift: {
        ...shift,
        id: "other",
        source_id: "other-source",
        employee_id: "drew",
        employee_name: "Drew",
      },
    };
    mount("/app/employee-hub/shift-hub?case=case&hub_view=history");
    await screen.findByText("Swap approved");
    const details = screen.getByRole("complementary", {
      name: "Request details",
    });
    expect(
      [...details.querySelectorAll(".sx-assignment strong")].map(
        (el) => el.textContent,
      ),
    ).toEqual(["Casey", "Drew"]);
    expect(within(details).getByText("First shift")).toBeTruthy();
    expect(within(details).getByText("Second shift")).toBeTruthy();
    expect(within(details).queryByText("You give")).toBeNull();
    expect(within(details).queryByText("You receive")).toBeNull();
    expect(
      within(details).queryByText(
        /Both shifts change together after final approval/,
      ),
    ).toBeNull();
    expect(
      within(details).getByText(
        "This request is complete. Assignments below include any later schedule changes.",
      ),
    ).toBeTruthy();
  });
  it("does not present a removed swap counterpart's retained owner as current", async () => {
    model.cases[0] = {
      ...model.cases[0]!,
      kind: "swap",
      status: "completed",
      stage: "closed",
      requested_current_published: false,
      requested_shift: {
        ...shift,
        id: "other",
        source_id: "other-source",
        employee_id: "blake",
        employee_name: "Blake",
      },
    };
    mount("/app/employee-hub/shift-hub?case=case&hub_view=history");
    await screen.findByText("One of these shifts is no longer published");
    const rows = screen
      .getByRole("complementary", { name: "Request details" })
      .querySelectorAll(".sx-assignment");
    expect(rows[0]?.textContent).toContain("Alex Morgan");
    expect(rows[1]?.textContent).toContain("Historical details");
    expect(rows[1]?.textContent).toContain("No longer published");
    expect(rows[1]?.textContent).not.toContain("Blake");
  });
  it("requires a positive publication flag before claiming an assignee is current", async () => {
    model.cases[0]!.audience = "direct";
    model.cases[0]!.current_published = undefined;
    mount("/app/employee-hub/shift-hub?case=case");
    await screen.findByText("Check current assignments");
    const details = screen.getByRole("complementary", {
      name: "Request details",
    });
    expect(details.querySelector(".sx-assignment")?.textContent).toContain(
      "Check the published schedule",
    );
    expect(within(details).queryByText("Still your shift")).toBeNull();
  });
  it("names a teammate's released shift by who released it", async () => {
    model.employee_id = "casey";
    model.cases[0]!.is_owner = false;
    mount("/app/employee-hub/shift-hub?case=case");
    await screen.findByRole("heading", { name: "Released by Alex Morgan" });
    const row = screen
      .getByRole("complementary", { name: "Request details" })
      .querySelector(".sx-assignment");
    expect(row?.textContent).toContain("Alex Morgan");
  });
});

// TAKAS-RELEASE (Mert, 2026-10-13/14): release, the deck, Take back, the three options.
describe("Shift Hub release", () => {
  const released = (id: string, date = "2030-01-10") => ({
    case_id: id,
    shift: { ...shift, id: `shift-${id}`, source_id: `source-${id}`, scheduled_date: date },
    note: "Family dinner came up. Section 4 is usually busy, thanks!",
    eligibility: { status: "eligible" as const, reasons: [] },
  });

  it("shows one released shift at a time, with the owner's note", async () => {
    model.employee_id = "blake";
    model.cases = [];
    model.opportunities = [released("one"), released("two", "2030-01-11")];
    mount("/app/employee-hub/shift-hub?hub_view=available");
    const top = await screen.findByRole("article", { name: /Alex Morgan can’t make this shift/ });
    expect(within(top).getByText(/Family dinner came up/)).toBeTruthy();
    expect(within(top).getByText("Your manager picks who gets it.")).toBeTruthy();
    expect(screen.getByText("Swipe right to take · left to pass · 2 left")).toBeTruthy();
  });

  // Open shifts in the pool (Mert, 2026-10-20): an open shift the manager offered is nobody's yet.
  it("shows an offered open shift as the manager's offer, with nobody to name", async () => {
    model.employee_id = "blake";
    model.cases = [];
    model.opportunities = [{ ...released("open"), note: "", shift: { ...released("open").shift, employee_id: null, employee_name: null } }];
    mount("/app/employee-hub/shift-hub?hub_view=available");
    const top = await screen.findByRole("article", { name: /Your manager is offering this open shift/ });
    expect(within(top).getByText("Offered by your manager")).toBeTruthy();
    expect(within(top).queryByText(/teammate|can’t make/i)).toBeNull();
  });

  it("passes on a card with Not for me", async () => {
    model.employee_id = "blake";
    model.cases = [];
    model.opportunities = [released("one")];
    mount("/app/employee-hub/shift-hub?hub_view=available");
    fireEvent.click(await screen.findByRole("button", { name: "Not for me" }));
    await waitFor(() =>
      expect(changeExchange).toHaveBeenCalledWith(
        "workspace",
        { action: "pass", shift_id: "shift-one", case_id: "one" },
        expect.any(String),
      ),
    );
  });

  it("takes a card with the right arrow key and passes with the left", async () => {
    model.employee_id = "blake";
    model.cases = [];
    model.opportunities = [released("one")];
    mount("/app/employee-hub/shift-hub?hub_view=available");
    const top = await screen.findByRole("article", { name: /Alex Morgan can’t make this shift/ });
    fireEvent.keyDown(top, { key: "ArrowRight" });
    await waitFor(() =>
      expect(changeExchange).toHaveBeenCalledWith(
        "workspace",
        { action: "apply", shift_id: "shift-one", case_id: "one" },
        expect.any(String),
      ),
    );
  });

  it("puts a card back when the choice is refused", async () => {
    model.employee_id = "blake";
    model.cases = [];
    model.opportunities = [released("one")];
    vi.mocked(changeExchange).mockRejectedValueOnce(new Error("This request closed 4 hours before the shift"));
    mount("/app/employee-hub/shift-hub?hub_view=available");
    fireEvent.click(await screen.findByRole("button", { name: "I’ll take it" }));
    expect(await screen.findByText(/This request closed 4 hours before the shift/)).toBeTruthy();
    expect(await screen.findByRole("article", { name: /Alex Morgan can’t make this shift/ })).toBeTruthy();
  });

  it("releases a shift with a note for teammates", async () => {
    model.cases = [];
    mount("/app/employee-hub/shift-hub?offer=shift&mode=release");
    const note = await screen.findByLabelText(/Note for teammates/);
    fireEvent.change(note, { target: { value: " Family dinner came up. " } });
    fireEvent.click(screen.getByRole("button", { name: "Release shift", hidden: true }));
    await waitFor(() =>
      expect(changeExchange).toHaveBeenCalledWith(
        "workspace",
        { action: "create", kind: "cover", shift_id: "shift", note: "", teammate_note: "Family dinner came up." },
        expect.any(String),
      ),
    );
  });

  // KARARLAR S-169: the owner whom nobody else can answer decides their own request in Requests.
  const SELF_ONLY = "No one else can approve this. It closes 4 hours before the shift.";
  it.each(["", "&mode=release", "&mode=cover", "&mode=swap"])(
    "tells the owner when no one else can approve a request for the shift (%s)",
    async (mode) => {
      model.cases = [];
      model.own_shifts = [{ ...shift, decision_tier: "self_only" }];
      mount(`/app/employee-hub/shift-hub?offer=shift${mode}`);
      expect(await screen.findByText(SELF_ONLY)).toBeTruthy();
    },
  );
  it("says nothing of it when someone else approves", async () => {
    model.cases = [];
    model.own_shifts = [{ ...shift, decision_tier: "location_manager" }];
    mount("/app/employee-hub/shift-hub?offer=shift");
    expect(await screen.findByRole("link", { name: /Release shift/, hidden: true })).toBeTruthy();
    expect(screen.queryByText(SELF_ONLY)).toBeNull();
  });

  it("offers the three named options for a shift opened without one", async () => {
    model.cases = [];
    mount("/app/employee-hub/shift-hub?offer=shift");
    const release = await screen.findByRole("link", { name: /Release shift/, hidden: true });
    expect(release.getAttribute("href")).toContain("mode=release");
    expect(screen.getByRole("link", { name: /Ask someone to cover/, hidden: true }).getAttribute("href")).toContain("mode=cover");
    expect(screen.getByRole("link", { name: /Swap/, hidden: true }).getAttribute("href")).toContain("mode=swap");
  });

  // CI 39099739762: the options kept only offer and mode, so a shift outside today's 42 days
  // (opened with from/to) was "no longer on your upcoming schedule" one click later.
  it("keeps the page's dates in the options' links", async () => {
    model.cases = [];
    mount("/app/employee-hub/shift-hub?offer=shift&from=2030-01-01&to=2030-01-31");
    const href = (await screen.findByRole("link", { name: /Release shift/, hidden: true })).getAttribute("href")!;
    const query = new URLSearchParams(href.slice(href.indexOf("?")));
    expect(Object.fromEntries(query)).toMatchObject({ offer: "shift", mode: "release", from: "2030-01-01", to: "2030-01-31" });
  });

  it("closes the options in the last 4 hours before the shift", async () => {
    model.cases = [];
    const soon = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    model.own_shifts = [{ ...shift, decision_tier: "location_manager", starts_at: soon }];
    mount("/app/employee-hub/shift-hub?offer=shift");
    expect(await screen.findByText("Changes are closed")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Release shift/, hidden: true })).toBeNull();
  });

  it("sends a shift with an open request to that request", async () => {
    mount("/app/employee-hub/shift-hub?offer=shift&mode=release");
    expect(await screen.findByText(/already has an open request/)).toBeTruthy();
    expect(screen.queryByLabelText(/Note for teammates/)).toBeNull();
  });

  it("shows the owner where the release stands and who wants it", async () => {
    mount("/app/employee-hub/shift-hub?case=case");
    const card = await screen.findByRole("region", { name: "Released shift" });
    expect(within(card).getByText("3 want it")).toBeTruthy();
    expect(within(card).getByText("Manager picks")).toBeTruthy();
    expect(within(card).getAllByText("Wants it")).toHaveLength(3);
  });

  // SEKME-KAYDIR (KARARLAR §1.5) on a phone: a sideways swipe moves between the views, but the deck
  // keeps its own swipe, so taking or passing on a card never changes the tab.
  it("keeps a swipe on the deck for the card, and a swipe beside it for the tabs", async () => {
    model.employee_id = "blake";
    model.cases = [];
    model.opportunities = [released("one")];
    const media = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("max-width"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    try {
      mount("/app/employee-hub/shift-hub?hub_view=available");
      const card = await screen.findByRole("article", { name: /Alex Morgan can’t make this shift/ });
      const swipeLeft = (target: Element) => {
        fireEvent.touchStart(target, { touches: [{ clientX: 300, clientY: 400 }] });
        fireEvent.touchEnd(target, { touches: [], changedTouches: [{ clientX: 120, clientY: 405 }] });
      };
      swipeLeft(card.querySelector(".sx-w-names")!);
      const views = screen.getByRole("navigation", { name: "Shift Hub views" });
      expect(within(views).getByRole("button", { name: /Available Shifts/ }).getAttribute("aria-current")).toBe("page");
      swipeLeft(screen.getByText(/Swipe right to take/));
      await waitFor(() =>
        expect(within(views).getByRole("button", { name: /My requests/ }).getAttribute("aria-current")).toBe("page"),
      );
    } finally {
      window.matchMedia = media;
    }
  });

  it("lets a swipe on an empty deck change the tab", async () => {
    model.employee_id = "blake";
    model.cases = [];
    model.opportunities = [];
    const media = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("max-width"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    try {
      mount("/app/employee-hub/shift-hub?hub_view=available");
      const empty = await screen.findByText("You’re all caught up");
      fireEvent.touchStart(empty, { touches: [{ clientX: 300, clientY: 400 }] });
      fireEvent.touchEnd(empty, { touches: [], changedTouches: [{ clientX: 120, clientY: 405 }] });
      const views = screen.getByRole("navigation", { name: "Shift Hub views" });
      await waitFor(() =>
        expect(within(views).getByRole("button", { name: /My requests/ }).getAttribute("aria-current")).toBe("page"),
      );
    } finally {
      window.matchMedia = media;
    }
  });

  // UI-FIELDMSG-2 (Mert 2026-10-18): a window's own refusal is said in its band, above its footer.
  it("says a refused release in the window's band", async () => {
    model.cases = [];
    vi.mocked(changeExchange).mockRejectedValueOnce(new Error("This shift starts too soon to release it."));
    mount("/app/employee-hub/shift-hub?offer=shift&mode=release");
    await screen.findByLabelText(/Note for teammates/);
    fireEvent.click(screen.getByRole("button", { name: "Release shift", hidden: true }));
    const alert = await screen.findByRole("alert", { hidden: true });
    expect(alert.textContent).toBe("This shift starts too soon to release it.");
    expect(alert.classList.contains("window-alert")).toBe(true);
    expect(alert.parentElement?.classList.contains("sx-w-foot")).toBe(true);
  });

  it("says a refused take back in the card's band", async () => {
    vi.mocked(changeExchange).mockRejectedValueOnce(new Error("Your manager already gave this shift to someone."));
    mount("/app/employee-hub/shift-hub?case=case");
    fireEvent.click(await screen.findByRole("button", { name: "Take back shift" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm take back" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Your manager already gave this shift to someone.");
    expect(alert.classList.contains("window-alert")).toBe(true);
    expect(alert.parentElement?.classList.contains("sx-w-foot")).toBe(true);
  });

  it("says a take back refusal without an empty footer once the release has closed", async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error("Your manager already gave this shift to someone."));
    const { rerender } = render(<ReleaseCard item={structuredClone(item)} canWrite run={run} />);
    fireEvent.click(screen.getByRole("button", { name: "Take back shift" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm take back" }));
    await screen.findByRole("alert");
    // The release closed meanwhile: the card has nothing left to do, only the refusal to say.
    rerender(<ReleaseCard item={{ ...structuredClone(item), status: "completed" }} canWrite run={run} />);
    const card = screen.getByRole("region", { name: "Released shift" });
    const alert = within(card).getByRole("alert");
    expect(alert.textContent).toBe("Your manager already gave this shift to someone.");
    expect(within(card).queryByRole("button", { name: "Take back shift" })).toBeNull();
    expect(card.querySelector(".sx-w-foot")).toBeNull();
    expect(alert.parentElement?.classList.contains("window-alert-slot")).toBe(true);
  });

  it("takes the shift back in two clicks, without a reason", async () => {
    mount("/app/employee-hub/shift-hub?case=case");
    const back = await screen.findByRole("button", { name: "Take back shift" });
    expect(back.className).toBe("sx-danger");
    fireEvent.click(back);
    expect(changeExchange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm take back" }));
    await waitFor(() =>
      expect(changeExchange).toHaveBeenCalledWith(
        "workspace",
        { action: "close", case_id: "case", expected_revision: 4, reason: "", private_note: "" },
        expect.any(String),
      ),
    );
  });
});
