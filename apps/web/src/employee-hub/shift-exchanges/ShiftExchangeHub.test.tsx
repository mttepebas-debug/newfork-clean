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
import {
  changeExchange,
  getExchangeCandidates,
  getExchangePreview,
  getExchanges,
} from "./exchange-data";

vi.mock("../../auth/AuthContext", () => ({
  useAuth: () => ({ context: { userId: "user" } }),
}));
vi.mock("../../schedule/lineup/LineupQueue", () => ({
  EmployeeLineupOffers: () => null,
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
function mount(route = "/app/employee-hub/shift-hub", manager = false) {
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
        <ShiftExchangeHub workspaceId="workspace" manager={manager} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, client };
}
beforeEach(() => {
  vi.clearAllMocks();
  model = {
    enabled: true,
    employee_id: "alex",
    cases: [structuredClone(item)],
    opportunities: [],
    own_shifts: [shift],
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
  vi.mocked(getExchangePreview).mockResolvedValue({
    allowed: true,
    fingerprint: "fresh",
    reasons: [],
    receiver: { status: "eligible", reasons: [] },
    giver: null,
    requires_other_manager: false,
    other_applications: 2,
  });
  vi.mocked(changeExchange).mockResolvedValue({
    case_id: "case",
    revision: 5,
    status: "open",
  });
});
describe("Shift Hub outcome contracts", () => {
  it("shows an own-availability warning and sends its token only on Request anyway", async () => {
    const fingerprint = "a".repeat(64);
    model.cases = [];
    model.opportunities = [
      {
        case_id: null,
        shift: { ...shift, employee_id: null, employee_name: null },
        eligibility: {
          status: "eligible",
          reasons: [],
          availability_warning: { fingerprint },
        },
      },
    ];
    mount("/app/employee-hub/shift-hub?hub_view=available");
    const request = await screen.findByRole("button", {
      name: "Request anyway",
    });
    expect(screen.getByText(/Conflicts with your availability/)).toBeTruthy();
    expect(changeExchange).not.toHaveBeenCalled();
    fireEvent.click(request);
    await waitFor(() =>
      expect(changeExchange).toHaveBeenCalledWith(
        "workspace",
        {
          action: "apply",
          shift_id: "shift",
          availability_fingerprint: fingerprint,
        },
        expect.any(String),
      ),
    );
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
    mount("/app/employee-hub/shift-hub?offer=shift");
    await screen.findByText(
      "You remain responsible until a manager approves the transfer.",
    );
    fireEvent.click(
      screen.getByRole("radio", { name: /Swap shifts/, hidden: true }),
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

  it.each(["ineligible", "unavailable"])(
    "replaces the stale transfer summary when eligibility becomes %s during confirmation",
    async (state) => {
      const { client } = mount("/app/schedule/requests?case=case", true);
      fireEvent.click(
        await screen.findByRole("button", { name: "Review Casey" }),
      );
      const approve = screen.getByRole("button", {
        name: "Approve transfer to Casey",
      });
      await waitFor(() =>
        expect((approve as HTMLButtonElement).disabled).toBe(false),
      );
      fireEvent.click(approve);
      const note = screen.getByLabelText(/Private manager note/);
      fireEvent.change(note, { target: { value: "Keep this review note" } });
      if (state === "unavailable")
        vi.mocked(getExchangePreview).mockRejectedValue(
          new Error("Temporary failure"),
        );
      else
        vi.mocked(getExchangePreview).mockResolvedValue({
          allowed: false,
          fingerprint: "changed",
          reasons: ["Position assignment ended"],
          receiver: {
            status: "ineligible",
            reasons: ["Position assignment ended"],
          },
          giver: null,
          requires_other_manager: false,
          other_applications: 2,
        });
      await act(async () => {
        await client.invalidateQueries({
          queryKey: ["shift-exchanges", "workspace", "preview"],
        });
      });
      await screen.findByText("Review needs updating");
      const dialog = screen
        .getByText("Review needs updating")
        .closest("dialog")!;
      expect(
        within(dialog).queryByText(
          /This changes the published assignment immediately/,
        ),
      ).toBeNull();
      expect(
        within(dialog).getByText(
          state === "unavailable"
            ? "Eligibility could not be checked. Go back and retry the check before approving."
            : "This transfer cannot be approved with the current eligibility details. Review the reason below before trying again.",
        ),
      ).toBeTruthy();
      if (state === "ineligible")
        expect(
          within(dialog).getByText("Position assignment ended"),
        ).toBeTruthy();
      expect((note as HTMLTextAreaElement).value).toBe("Keep this review note");
      expect(
        (
          within(dialog).getByRole("button", {
            name: "Confirm transfer to Casey",
            hidden: true,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      expect(changeExchange).not.toHaveBeenCalled();
    },
  );

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
      true,
    );
    const detail = await screen.findByRole("complementary", {
      name: "Request details",
    });
    expect(within(detail).getByText(/outside your list filters/)).toBeTruthy();
    expect(within(detail).getByText("Alex Morgan")).toBeTruthy();
    expect(document.querySelectorAll(".sx-case-row")).toHaveLength(0);
    expect(
      screen.getByText(/No requests match this stage and these filters/),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "0 cases ready for a decision · Every transfer needs your final approval.",
      ),
    ).toBeTruthy();
    expect(getExchanges).toHaveBeenCalledWith("workspace", true, {
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
    model.opportunities = ["2030-01-09", "2030-01-10", "2030-01-11"].map(
      (date) => ({
        case_id: null,
        shift: {
          ...shift,
          id: date,
          source_id: date,
          employee_id: null,
          scheduled_date: date,
        },
        eligibility: { status: "eligible", reasons: [] },
      }),
    );
    mount("/app/employee-hub/shift-hub?from=2030-01-10&to=2030-01-10");
    await screen.findByRole("navigation", { name: "Shift Hub views" });
    expect(document.querySelector(".sx-list")?.textContent).toContain(
      "Thu, Jan 10",
    );
    expect(document.querySelector(".sx-list")?.textContent).not.toContain(
      "Wed, Jan 9",
    );
    expect(document.querySelector(".sx-list")?.textContent).not.toContain(
      "Fri, Jan 11",
    );
  });

  it.each(["direct", "swap"] as const)(
    "keeps the note and blocks a %s request when the selected match disappears",
    async (mode) => {
      model.cases = [];
      const { client } = mount("/app/employee-hub/shift-hub?offer=shift");
      await screen.findByText(
        "You remain responsible until a manager approves the transfer.",
      );
      fireEvent.click(
        screen.getByRole("radio", {
          name: mode === "swap" ? /Swap shifts/ : "Ask a teammate",
          hidden: true,
        }),
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
  it.each(["direct", "swap"] as const)(
    "offers an in-place retry and preserves %s selections after eligibility lookup fails",
    async (mode) => {
      model.cases = [];
      const { client } = mount("/app/employee-hub/shift-hub?offer=shift");
      await screen.findByText(
        "You remain responsible until a manager approves the transfer.",
      );
      fireEvent.click(
        screen.getByRole("radio", {
          name: mode === "swap" ? /Swap shifts/ : "Ask a teammate",
          hidden: true,
        }),
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
  it("can return from an empty swap search to the cover pool without losing its note", async () => {
    model.cases = [];
    vi.mocked(getExchangeCandidates).mockResolvedValue({
      employees: [],
      shifts: [],
    });
    mount("/app/employee-hub/shift-hub?offer=shift");
    await screen.findByText(
      "You remain responsible until a manager approves the transfer.",
    );
    fireEvent.click(
      screen.getByRole("radio", { name: /Swap shifts/, hidden: true }),
    );
    fireEvent.change(screen.getByRole("textbox", { hidden: true }), {
      target: { value: "Please find cover" },
    });
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Start a cover search instead",
        hidden: true,
      }),
    );
    expect(
      (screen.getByRole("textbox", { hidden: true }) as HTMLTextAreaElement)
        .value,
    ).toBe("Please find cover");
    expect(
      (
        screen.getByRole("radio", {
          name: "Offer to eligible teammates",
          hidden: true,
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(changeExchange).not.toHaveBeenCalled();
  });
  it("does not move focus away from a note edited while eligibility retries", async () => {
    model.cases = [];
    vi.mocked(getExchangeCandidates).mockRejectedValueOnce(
      new Error("Offline"),
    );
    mount("/app/employee-hub/shift-hub?offer=shift");
    await screen.findByText(
      "You remain responsible until a manager approves the transfer.",
    );
    fireEvent.click(
      screen.getByRole("radio", { name: "Ask a teammate", hidden: true }),
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
  it.each(["approve", "reject"] as const)(
    "keeps notes and blocks %s when the selected applicant withdraws during review",
    async (decision) => {
      const { client } = mount("/app/schedule/requests?case=case", true);
      fireEvent.click(
        await screen.findByRole("button", { name: "Review Casey" }),
      );
      const approve = screen.getByRole("button", {
        name: "Approve transfer to Casey",
      });
      await waitFor(() =>
        expect((approve as HTMLButtonElement).disabled).toBe(false),
      );
      fireEvent.click(
        decision === "approve"
          ? approve
          : screen.getByRole("button", { name: "Decline this application" }),
      );
      const note = screen.getByLabelText(/Private manager note/);
      fireEvent.change(note, { target: { value: "Review note stays here" } });
      if (decision === "reject") {
        fireEvent.change(
          screen.getByLabelText(/Reason shared with affected employees/),
          { target: { value: "Coverage requirement" } },
        );
      }
      const updated = structuredClone(model);
      updated.cases[0]!.revision += 1;
      updated.cases[0]!.applications[1]!.status = "withdrawn";
      updated.cases[0]!.candidate_count = 2;
      act(() =>
        client.setQueriesData(
          { queryKey: ["shift-exchanges", "workspace", "user"] },
          updated,
        ),
      );
      await screen.findByText(
        "This application is no longer available for a decision. Close this review to see the latest result.",
      );
      const confirm = screen.getByRole("button", {
        name:
          decision === "approve" ? "Confirm transfer" : "Decline application",
        hidden: true,
      });
      expect((confirm as HTMLButtonElement).disabled).toBe(true);
      expect((note as HTMLTextAreaElement).value).toBe(
        "Review note stays here",
      );
      expect(changeExchange).not.toHaveBeenCalled();
    },
  );
  it.each(["approve", "reject", "close"] as const)(
    "shows the other manager's result and preserves the draft in an open %s review",
    async (decision) => {
      const { client } = mount("/app/schedule/requests?case=case", true);
      fireEvent.click(
        await screen.findByRole("button", { name: "Review Casey" }),
      );
      const approve = screen.getByRole("button", {
        name: "Approve transfer to Casey",
      });
      await waitFor(() =>
        expect((approve as HTMLButtonElement).disabled).toBe(false),
      );
      const trigger =
        decision === "approve"
          ? approve
          : screen.getByRole("button", {
              name:
                decision === "reject"
                  ? "Decline this application"
                  : "Close cover search",
            });
      trigger.focus();
      fireEvent.click(trigger);
      const note = screen.getByLabelText(/Private manager note/);
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
      expect(within(dialog).queryByText(/Alex Morgan → Casey/)).toBeNull();
      expect(
        within(dialog).queryByText(/current owner remains responsible/),
      ).toBeNull();
      expect((note as HTMLTextAreaElement).value).toBe("My unfinished review");
      expect(document.activeElement).toBe(note);
      expect(within(dialog).getByText(/It has not been sent/)).toBeTruthy();
      const final = within(dialog).queryByRole("button", {
        name:
          decision === "approve"
            ? "Confirm transfer"
            : decision === "reject"
              ? "Decline application"
              : "Close search",
        hidden: true,
      });
      expect(final).toBeNull();
      expect(changeExchange).not.toHaveBeenCalled();
      fireEvent.click(
        within(dialog).getByRole("button", {
          name: "View latest result",
          hidden: true,
        }),
      );
      await waitFor(() =>
        expect(document.activeElement).toBe(
          screen.getByRole("heading", { name: "Cover request" }),
        ),
      );
    },
  );

  it.each(["cancelled", "expired", "invalidated"] as const)(
    "explains a %s request without claiming a transfer or inferring an unpublished owner",
    async (status) => {
      const { client } = mount("/app/schedule/requests?case=case", true);
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

  it("shows both current published owners when another manager completes the reviewed swap", async () => {
    model.cases[0]!.kind = "swap";
    model.cases[0]!.requested_shift = {
      ...shift,
      id: "return",
      source_id: "return-source",
      employee_id: "casey",
      employee_name: "Casey",
    };
    model.cases[0]!.requested_current_published = true;
    const { client } = mount("/app/schedule/requests?case=case", true);
    fireEvent.click(
      await screen.findByRole("button", { name: "Review Casey" }),
    );
    const approve = screen.getByRole("button", {
      name: "Approve transfer to Casey",
    });
    await waitFor(() =>
      expect((approve as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(approve);
    const updated = structuredClone(model);
    const result = updated.cases[0]!;
    result.status = "completed";
    result.shift = {
      ...result.shift,
      employee_id: "casey",
      employee_name: "Casey",
    };
    result.requested_shift = {
      ...result.requested_shift!,
      employee_id: "alex",
      employee_name: "Alex Morgan",
    };
    result.applications.forEach((a) => {
      a.status = a.id === "Casey" ? "approved" : "closed_other_selected";
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
    ).toContain("This swap has already been approved");
    expect(
      [...dialog.querySelectorAll(".sx-assignment strong")].map(
        (e) => e.textContent,
      ),
    ).toEqual(["Casey", "Alex Morgan"]);
    expect(within(dialog).getByText("First shift")).toBeTruthy();
    expect(within(dialog).getByText("Second shift")).toBeTruthy();
    expect(changeExchange).not.toHaveBeenCalled();
  });

  it("takes a manager from a long candidate list to the review and back without choosing a replacement automatically", async () => {
    model.cases[0]!.applications = Array.from({ length: 10 }, (_, index) => ({
      ...item.applications[0]!,
      id: `candidate-${index}`,
      employee_id: `employee-${index}`,
      employee_name: `Alexandria Montgomery-Wellington ${index + 1}`,
    }));
    model.cases[0]!.candidate_count = 10;
    mount("/app/schedule/requests?case=case", true);
    const select = await screen.findByRole("button", {
      name: "Review Alexandria Montgomery-Wellington 1",
    });
    expect(getExchangePreview).not.toHaveBeenCalled();
    fireEvent.click(select);
    const heading = await screen.findByRole("heading", {
      name: "Alex Morgan → Alexandria Montgomery-Wellington 1",
    });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    fireEvent.click(screen.getByRole("button", { name: "Back to candidates" }));
    expect(document.activeElement).toBe(select);
    fireEvent.click(select);
    expect(document.activeElement).toBe(heading);
    const approve = screen.getByRole("button", {
      name: "Approve transfer to Alexandria Montgomery-Wellington 1",
    });
    await waitFor(() =>
      expect((approve as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(approve);
    const confirm = screen.getByRole("button", {
      name: "Confirm transfer to Alexandria Montgomery-Wellington 1",
      hidden: true,
    });
    expect(confirm.textContent).toBe("Confirm transfer");
    expect(
      document.getElementById(confirm.getAttribute("aria-describedby")!)
        ?.textContent,
    ).toContain("Alexandria Montgomery-Wellington 1");
    expect(changeExchange).not.toHaveBeenCalled();
  });
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
    await screen.findByText("Still your shift");
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
    expect(screen.queryByText("Still your shift")).toBeNull();
  });
  it("opens a closed manager case deep link in History", async () => {
    model.employee_id = null;
    model.cases[0]!.status = "invalidated";
    mount("/app/schedule/requests?case=case", true);
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
    expect(await screen.findByText("Still your shift")).toBeTruthy();
    expect(screen.getByText("Casey")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Approve transfer/ }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Accept request" })).toBeNull();
  });
  it("requires a deliberate candidate choice and separates rejection from closing the case", async () => {
    model.employee_id = null;
    model.cases[0]!.is_owner = false;
    mount("/app/schedule/requests?case=case", true);
    await screen.findByText("Current owner: Alex Morgan");
    expect(
      screen.queryByRole("button", { name: /Approve transfer/ }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Review Casey" }));
    await screen.findByRole("button", { name: "Approve transfer to Casey" });
    fireEvent.click(
      screen.getByRole("button", { name: "Decline this application" }),
    );
    const dialog = screen
      .getByText("Decline this application", { selector: "h2" })
      .closest("dialog")!;
    expect(within(dialog).getByText(/Only Casey’s application/)).toBeTruthy();
    fireEvent.change(
      within(dialog).getByLabelText("Reason shared with affected employees"),
      { target: { value: "Coverage priority" } },
    );
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Decline application",
        hidden: true,
      }),
    );
    await waitFor(() =>
      expect(changeExchange).toHaveBeenCalledWith(
        "workspace",
        expect.objectContaining({
          action: "reject",
          application_id: "Casey",
          reason: "Coverage priority",
          expected_revision: 4,
        }),
        expect.any(String),
      ),
    );
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
  it("explains that no transfer occurred when approval discovers changed terms", async () => {
    model.employee_id = null;
    model.cases[0]!.is_owner = false;
    vi.mocked(changeExchange).mockResolvedValue({
      case_id: "case",
      revision: 5,
      status: "invalidated",
    });
    mount("/app/schedule/requests?case=case", true);
    fireEvent.click(
      await screen.findByRole("button", { name: "Review Casey" }),
    );
    const approve = await screen.findByRole("button", {
      name: "Approve transfer to Casey",
    });
    await waitFor(() =>
      expect((approve as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(approve);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Confirm transfer to Casey",
        hidden: true,
      }),
    );
    expect(
      await screen.findByText(/Shift details changed. No transfer was made/),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "Manager approved the change. Schedules have been updated.",
      ),
    ).toBeNull();
  });
  it("keeps a private note when closing the unfinished form is cancelled", async () => {
    model.cases = [];
    mount("/app/employee-hub/shift-hub?offer=shift");
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
  it("leaves history and responsibility visible when writes are disabled", async () => {
    model.enabled = false;
    mount("/app/employee-hub/shift-hub?hub_view=requests&case=case");
    await screen.findByText("Still your shift");
    expect(
      (
        screen.getByRole("button", {
          name: "Close cover search",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByText("Request history")).toBeTruthy();
  });
  it("explains shared Line Up reconciliation and prevents approval even for an eligible employee", async () => {
    model.employee_id = null;
    model.cases[0]!.is_owner = false;
    const reason =
      "This shift is missing from the shared Line Up. Review and share its assignment before approving.";
    vi.mocked(getExchangePreview).mockResolvedValue({
      allowed: false,
      fingerprint: "unchanged-consent",
      reasons: [reason],
      receiver: { status: "eligible", reasons: [] },
      giver: null,
      requires_other_manager: false,
      other_applications: 2,
    });
    mount("/app/schedule/requests?case=case", true);
    fireEvent.click(
      await screen.findByRole("button", { name: "Review Casey" }),
    );
    await screen.findByText(reason);
    const approve = screen.getByRole("button", {
      name: "Approve transfer to Casey",
    }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    fireEvent.click(approve);
    expect(changeExchange).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("region", { name: "Casey eligibility" }),
    ).toBeNull();
    expect(screen.getByText(/Employee consent stays valid/)).toBeTruthy();
  });
  it("blocks approval when the final server preview detects ineligibility", async () => {
    model.employee_id = null;
    model.cases[0]!.is_owner = false;
    vi.mocked(getExchangePreview).mockResolvedValue({
      allowed: false,
      fingerprint: "changed",
      reasons: ["The receiving employee is not eligible for the full shift"],
      receiver: {
        status: "ineligible",
        reasons: ["Overlaps approved time off"],
      },
      giver: null,
      requires_other_manager: false,
      other_applications: 2,
    });
    mount("/app/schedule/requests?case=case", true);
    fireEvent.click(
      await screen.findByRole("button", { name: "Review Casey" }),
    );
    await screen.findByText(
      "The receiving employee is not eligible for the full shift",
    );
    expect(
      within(
        screen.getByRole("region", { name: "Casey eligibility" }),
      ).getByText("Overlaps approved time off"),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Approve transfer to Casey",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.queryByLabelText(/override/i)).toBeNull();
  });
  it("explains each side of an ineligible swap using the fresh manager preview", async () => {
    model.cases[0]!.kind = "swap";
    model.cases[0]!.requested_shift = {
      ...shift,
      id: "requested",
      employee_id: "casey",
      employee_name: "Casey",
    };
    vi.mocked(getExchangePreview).mockResolvedValue({
      allowed: false,
      fingerprint: "changed",
      reasons: ["Both employees need a fresh eligibility review"],
      receiver: {
        status: "partial",
        reasons: ["Availability covers only part of this shift"],
      },
      giver: {
        status: "verification_required",
        reasons: [
          "Availability is not confirmed",
          "Availability is not confirmed",
        ],
      },
      requires_other_manager: false,
      other_applications: 0,
    });
    mount("/app/schedule/requests?case=case", true);
    fireEvent.click(
      await screen.findByRole("button", { name: "Review Casey" }),
    );
    const receiver = await screen.findByRole("region", {
      name: "Casey eligibility",
    });
    const giver = screen.getByRole("region", {
      name: "Alex Morgan eligibility",
    });
    expect(
      within(receiver).getByText("Availability covers only part of this shift"),
    ).toBeTruthy();
    expect(
      within(receiver).getByText("Receiving the offered shift"),
    ).toBeTruthy();
    expect(
      within(giver).getAllByText("Availability is not confirmed"),
    ).toHaveLength(1);
    expect(
      within(giver).getByText("Receiving the requested shift"),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Approve transfer to Casey",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(changeExchange).not.toHaveBeenCalled();
  });
  it("keeps both shift details visible in a swap confirmation and after eligibility changes", async () => {
    model.cases[0]!.kind = "swap";
    model.cases[0]!.requested_shift = {
      ...shift,
      id: "requested",
      employee_id: "casey",
      employee_name: "Casey",
      location_name: "Requested location",
    };
    const { client } = mount("/app/schedule/requests?case=case", true);
    fireEvent.click(
      await screen.findByRole("button", { name: "Review Casey" }),
    );
    const approve = screen.getByRole("button", {
      name: "Approve transfer to Casey",
    });
    await waitFor(() =>
      expect((approve as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(approve);
    const dialog = screen
      .getByText("Confirm your decision", { selector: "h2" })
      .closest("dialog")!;
    expect(within(dialog).getByText("Offered shift")).toBeTruthy();
    expect(within(dialog).getByText("Requested shift")).toBeTruthy();
    expect(within(dialog).getByText(/Requested location/)).toBeTruthy();
    vi.mocked(getExchangePreview).mockResolvedValue({
      allowed: false,
      fingerprint: "changed",
      reasons: ["The other employee is not eligible for the exchanged shift"],
      receiver: { status: "eligible", reasons: [] },
      giver: {
        status: "partial",
        reasons: ["Availability covers only part of this shift"],
      },
      requires_other_manager: false,
      other_applications: 0,
    });
    await act(async () => {
      await client.invalidateQueries({
        queryKey: ["shift-exchanges", "workspace", "preview"],
      });
    });
    expect(
      await within(dialog).findByText(
        "Availability covers only part of this shift",
      ),
    ).toBeTruthy();
    expect(within(dialog).getByText("Requested shift")).toBeTruthy();
    expect(
      (
        within(dialog).getByLabelText(
          "Confirm transfer to Casey",
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
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
    await screen.findByText(
      "You remain responsible until a manager approves the transfer.",
    );
    expect(changeExchange).not.toHaveBeenCalled();
  });
  it("keeps changed requests readable when their published hours are unresolved", async () => {
    model.cases[0]!.status = "invalidated";
    model.cases[0]!.stage = "closed";
    model.cases[0]!.shift = {
      ...shift,
      time_basis: "unresolved",
      start_time: null,
      end_time: null,
      starts_at: null,
      ends_at: null,
    };
    mount("/app/employee-hub/shift-hub?case=case&hub_view=history");
    await screen.findAllByText("Hours need confirmation");
    expect(screen.queryByText(/0 scheduled hours/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Accept request" })).toBeNull();
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
  it("labels an open pickup without inventing an assigned owner", async () => {
    model.cases[0] = {
      ...model.cases[0]!,
      kind: "open_pickup",
      owner_id: null,
      owner_name: null,
      shift: { ...shift, employee_id: null, employee_name: null },
    };
    mount("/app/employee-hub/shift-hub?case=case");
    await screen.findByRole("heading", { name: "Open shift pickup" });
    const row = screen
      .getByRole("complementary", { name: "Request details" })
      .querySelector(".sx-assignment");
    expect(row?.textContent).toContain("Open shift · No assigned employee");
    expect(row?.textContent).not.toContain("Currently responsible");
  });
});
