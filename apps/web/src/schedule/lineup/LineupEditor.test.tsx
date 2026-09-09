import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  LineupCandidate,
  ScheduleLineupEntry,
  ScheduleLineupReadModel,
} from "@newfork/shared";
import { LineupEditor } from "./LineupEditor";
import {
  getLineupCandidates,
  previewLineupOperation,
  applyLineupOperation,
  submitLineupProposal,
} from "../lineup-data";
import { refreshExchangeSurfaces } from "../../employee-hub/shift-exchanges/exchange-data";
vi.mock("../../settings/organization-data", () => ({
  loadSchedulingSettings: vi.fn(async () => ({ minimum_travel_minutes: 30 })),
}));
const toast = vi.hoisted(() => ({ warning: vi.fn() }));
vi.mock("@newfork/ui", () => ({ useToast: () => toast }));
vi.mock("../lineup-data", () => ({
  getLineupCandidates: vi.fn(),
  getLineup: vi.fn(),
  getLineupDestinations: vi.fn(),
  previewLineupOperation: vi.fn(),
  applyLineupOperation: vi.fn(),
  submitLineupProposal: vi.fn(),
  saveLineupEntry: vi.fn(),
  deleteLineupEntry: vi.fn(),
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
const row: ScheduleLineupEntry = {
  id: "10000000-0000-4000-8000-000000000001",
  overlay_id: null,
  source_shift_id: "10000000-0000-4000-8000-000000000001",
  is_manual: false,
  orphaned: false,
  employee_id: null,
  employee_name: "",
  job_id: "10000000-0000-4000-8000-000000000003",
  job_name: "Server",
  shift_type_id: "10000000-0000-4000-8000-000000000004",
  shift_type_name: "Dinner",
  start_time: "17:00",
  end_time: "23:00",
  section_id: null,
  section_name: "",
  station: "",
  call_off: false,
  hidden: false,
  display_order: 0,
  revision: null,
};
const location = {
  id: "10000000-0000-4000-8000-000000000005",
  name: "Main Dining",
  timezone: "America/Los_Angeles",
  lineup_id: null,
  revision: null,
  shared_at: null,
  share_version: 0,
  entries: [row],
  briefs: [],
  summary: { active_entries: 1, open_rows: 0, called_off: 0 },
};
const model: ScheduleLineupReadModel = {
  workspace_id: "10000000-0000-4000-8000-000000000020",
  date: "2030-01-07",
  source: "published",
  jobs: [
    {
      id: row.job_id!,
      name: "Server",
      color: "#999999",
      sort_order: 0,
      department_id: null,
    },
  ],
  shift_types: [
    {
      id: row.shift_type_id!,
      name: "Dinner",
      color: "#999999",
      sort_order: 0,
      default_start_time: "17:00",
      default_end_time: "23:00",
    },
  ],
  employees: [],
  locations: [location],
  settings: { time_format: "24h" },
  sections: [
    {
      id: "10000000-0000-4000-8000-000000000006",
      workspace_id: "10000000-0000-4000-8000-000000000020",
      name: "Patio",
      color: "#999999",
      sort_order: 0,
      revision: 1,
    },
  ],
};

const person: LineupCandidate = {
  employee_id: "10000000-0000-4000-8000-000000000002",
  display_name: "Alex Kim",
  status: "eligible",
  reasons: ["Available for the full interval"],
  available_start: null,
  available_end: null,
};
const ready = {
  allowed: true,
  requires_approval: false,
  fingerprint: "a".repeat(64),
  effects: ["Alex covers this shift"],
  blockers: [],
};
const saved = vi.fn().mockResolvedValue(undefined);
function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const draw = (currentModel = model) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LineupEditor
          row={row}
          sectionId={null}
          mode="replace"
          workspaceId="workspace"
          date="2030-01-07"
          location={location}
          model={currentModel}
          serviceId={row.shift_type_id}
          onClose={vi.fn()}
          onSaved={saved}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const result = render(draw());
  return {
    ...result,
    client,
    changeModel: (next: ScheduleLineupReadModel) => result.rerender(draw(next)),
  };
}
async function selectAndReview() {
  fireEvent.click(await screen.findByRole("button", { name: /Alex Kim/ }));
  fireEvent.change(screen.getByLabelText("Reason for change"), {
    target: { value: "Keep the lunch coverage" },
  });
  const review = screen.getByRole("button", { name: "Review impact" });
  review.focus();
  fireEvent.click(review);
  await screen.findByRole("button", { name: "Confirm change" });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getLineupCandidates).mockResolvedValue([person]);
  vi.mocked(previewLineupOperation).mockResolvedValue(ready);
});
afterEach(cleanup);

describe("live staffing review", () => {
  it("returns a stale direct decision to review without losing the employee or retrying automatically", async () => {
    vi.mocked(previewLineupOperation).mockResolvedValue({
      ...ready,
      availability_warning: { policy: "confirm", fingerprint: "b".repeat(64) },
    });
    vi.mocked(applyLineupOperation).mockRejectedValueOnce(
      new Error("stale Line Up operation preview"),
    );
    show();
    fireEvent.click(await screen.findByRole("button", { name: /Alex Kim/ }));
    fireEvent.change(screen.getByLabelText("Reason for change"), {
      target: { value: "Keep this choice" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review impact" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Assign anyway" }),
    );
    await screen.findByText("stale Line Up operation preview");
    expect(screen.queryByRole("button", { name: "Assign anyway" })).toBeNull();
    expect(
      screen
        .getByRole("button", { name: /Alex Kim/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByLabelText("Reason for change")).toHaveProperty(
      "value",
      "Keep this choice",
    );
    expect(
      screen.getByRole("button", { name: "Review impact" }),
    ).toHaveProperty("disabled", false);
    expect(applyLineupOperation).toHaveBeenCalledTimes(1);
  });
  it("does not report a warning as saved when the assignment request fails", async () => {
    vi.mocked(previewLineupOperation).mockResolvedValue({
      ...ready,
      availability_warning: { policy: "warn", fingerprint: "b".repeat(64) },
    });
    vi.mocked(applyLineupOperation).mockRejectedValueOnce(
      new Error("Network unavailable"),
    );
    show();
    await selectAndReview();
    fireEvent.click(screen.getByRole("button", { name: "Confirm change" }));
    await screen.findByText("Network unavailable");
    expect(toast.warning).not.toHaveBeenCalled();
  });
  it("keeps a weekly-conflict candidate selectable and confirms the full assignment once", async () => {
    const warning = { policy: "confirm" as const, fingerprint: "b".repeat(64) };
    vi.mocked(getLineupCandidates).mockResolvedValue([
      { ...person, availability_warning: warning },
    ]);
    vi.mocked(previewLineupOperation).mockResolvedValue({
      ...ready,
      availability_warning: warning,
    });
    show();
    const candidate = await screen.findByRole("button", { name: /Alex Kim/ });
    expect(candidate).toHaveProperty("disabled", false);
    expect(candidate.textContent).toContain("Availability conflict");
    fireEvent.click(candidate);
    fireEvent.change(screen.getByLabelText("Reason for change"), {
      target: { value: "Cover dinner" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review impact" }));
    const assign = await screen.findByRole("button", { name: "Assign anyway" });
    expect(applyLineupOperation).not.toHaveBeenCalled();
    fireEvent.click(assign);
    await waitFor(() =>
      expect(applyLineupOperation).toHaveBeenCalledWith(
        "workspace",
        expect.objectContaining({ employee_id: person.employee_id }),
        ready.fingerprint,
        expect.any(String),
        true,
      ),
    );
    expect(toast.warning).not.toHaveBeenCalled();
  });
  it("allows an offer to be sent without the direct-assignment availability confirmation", async () => {
    vi.mocked(previewLineupOperation).mockResolvedValue({
      ...ready,
      availability_warning: { policy: "confirm", fingerprint: "b".repeat(64) },
    });
    show();
    fireEvent.click(await screen.findByRole("button", { name: /Alex Kim/ }));
    fireEvent.change(screen.getByLabelText("Reason for change"), {
      target: { value: "Offer dinner" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review impact" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Send offer for employee response",
      }),
    );
    await waitFor(() => expect(submitLineupProposal).toHaveBeenCalled());
    expect(applyLineupOperation).not.toHaveBeenCalled();
  });
  it("shows one warning only after a warn-policy assignment succeeds", async () => {
    vi.mocked(previewLineupOperation).mockResolvedValue({
      ...ready,
      availability_warning: { policy: "warn", fingerprint: "b".repeat(64) },
    });
    show();
    await selectAndReview();
    expect(toast.warning).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm change" }));
    await waitFor(() => expect(toast.warning).toHaveBeenCalledTimes(1));
    expect(applyLineupOperation).toHaveBeenCalledWith(
      "workspace",
      expect.any(Object),
      ready.fingerprint,
      expect.any(String),
    );
  });
  it.each([
    ["17:00", "23:00", "2030-01-08T03:00:00Z", "2030-01-08T05:00:00Z"],
    ["22:00", "02:00", "2030-01-08T08:30:00Z", "2030-01-08T09:30:00Z"],
  ])(
    "keeps the full %s-%s target when choosing a partially available employee",
    async (start, end, availableStart, availableEnd) => {
      vi.mocked(getLineupCandidates).mockResolvedValue([
        {
          ...person,
          status: "partial",
          reasons: ["Availability conflict"],
          available_start: availableStart,
          available_end: availableEnd,
        },
      ]);
      show();
      fireEvent.change(screen.getByLabelText("Starts"), {
        target: { value: start },
      });
      fireEvent.change(screen.getByLabelText("Ends"), {
        target: { value: end },
      });
      await selectAndReview();
      expect(screen.getByLabelText("Starts")).toHaveProperty("value", start);
      expect(screen.getByLabelText("Ends")).toHaveProperty("value", end);
      expect(screen.queryByText(/Remaining coverage stays open/)).toBeNull();
      expect(previewLineupOperation).toHaveBeenLastCalledWith(
        "workspace",
        expect.objectContaining({
          employee_id: person.employee_id,
          target: expect.objectContaining({
            date: model.date,
            start_time: start,
            end_time: end,
          }),
        }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Confirm change" }));
      await waitFor(() =>
        expect(applyLineupOperation).toHaveBeenCalledWith(
          "workspace",
          expect.objectContaining({
            employee_id: person.employee_id,
            target: expect.objectContaining({
              date: model.date,
              start_time: start,
              end_time: end,
            }),
          }),
          ready.fingerprint,
          expect.any(String),
        ),
      );
    },
  );
  it("keeps the selected employee after an hour edit but requires a fresh full-interval review", async () => {
    show();
    await selectAndReview();
    fireEvent.change(screen.getByLabelText("Ends"), {
      target: { value: "22:00" },
    });
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: /Alex Kim/ })
          .getAttribute("aria-pressed"),
      ).toBe("true"),
    );
    expect(screen.queryByRole("button", { name: "Confirm change" })).toBeNull();
    const review = screen.getByRole("button", { name: "Review impact" });
    await waitFor(() => expect(review).toHaveProperty("disabled", false));
    fireEvent.click(review);
    await screen.findByRole("button", { name: "Confirm change" });
    expect(previewLineupOperation).toHaveBeenLastCalledWith(
      "workspace",
      expect.objectContaining({
        employee_id: person.employee_id,
        target: expect.objectContaining({
          date: model.date,
          start_time: "17:00",
          end_time: "22:00",
        }),
      }),
    );
    expect(applyLineupOperation).not.toHaveBeenCalled();
    expect(submitLineupProposal).not.toHaveBeenCalled();
  });
  it("keeps an employee selected when edited hours reveal a blocker without permitting assignment or an offer", async () => {
    show();
    await selectAndReview();
    vi.mocked(getLineupCandidates).mockResolvedValue([
      {
        ...person,
        status: "ineligible",
        reasons: ["Another published shift overlaps"],
      },
    ]);
    vi.mocked(previewLineupOperation).mockResolvedValue({
      ...ready,
      allowed: false,
      blockers: ["Another published shift overlaps"],
    });
    fireEvent.change(screen.getByLabelText("Ends"), {
      target: { value: "23:30" },
    });
    const candidate = await screen.findByRole("button", {
      name: /Alex Kim.*Another published shift overlaps/,
    });
    expect(candidate.getAttribute("aria-pressed")).toBe("true");
    expect(candidate).toHaveProperty("disabled", true);
    const review = screen.getByRole("button", { name: "Review impact" });
    await waitFor(() => expect(review).toHaveProperty("disabled", false));
    fireEvent.click(review);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Confirm change" }),
      ).toHaveProperty("disabled", true),
    );
    expect(
      screen.queryByRole("button", {
        name: "Send offer for employee response",
      }),
    ).toBeNull();
    expect(applyLineupOperation).not.toHaveBeenCalled();
    expect(submitLineupProposal).not.toHaveBeenCalled();
  });
  it("shows the company minimum and the effective server-reviewed travel time", async () => {
    vi.mocked(previewLineupOperation).mockResolvedValue({
      ...ready,
      minimum_travel_minutes: 30,
      effective_travel_minutes: 60,
    });
    show();
    expect(
      await screen.findByText(/Company minimum: 30 minutes between locations/),
    ).toBeTruthy();
    await selectAndReview();
    expect(
      screen.getByText(/Travel between locations: 60 minutes/),
    ).toBeTruthy();
  });
  it("retires a reviewed operation when the company travel policy refreshes", async () => {
    const { client } = show();
    await selectAndReview();
    await act(async () => {
      client.setQueryData(["scheduling-settings", "workspace"], {
        minimum_travel_minutes: 60,
      });
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Confirm change" }),
      ).toBeNull(),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Staffing details changed",
    );
    expect(screen.getByLabelText("Reason for change")).toHaveProperty(
      "value",
      "Keep the lunch coverage",
    );
    expect(applyLineupOperation).not.toHaveBeenCalled();
  });
  it("refetches the actual candidate query on an exchange event and retires stale review while preserving the reason", async () => {
    const { client } = show();
    await selectAndReview();
    const cancel = screen.getByRole("button", { name: "Cancel" });
    cancel.focus();
    vi.mocked(getLineupCandidates).mockResolvedValue([
      {
        ...person,
        status: "ineligible",
        reasons: ["Another shift now overlaps"],
      },
    ]);
    await act(async () => refreshExchangeSurfaces(client, "workspace"));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Confirm change" }),
      ).toBeNull(),
    );
    expect(getLineupCandidates).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByRole("button", {
        name: "Send offer for employee response",
      }),
    ).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain(
      "Staffing details changed",
    );
    expect(
      (screen.getByLabelText("Reason for change") as HTMLTextAreaElement).value,
    ).toBe("Keep the lunch coverage");
    expect(
      (screen.getByRole("button", { name: /Alex Kim/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(document.activeElement).toBe(cancel);
    expect(applyLineupOperation).not.toHaveBeenCalled();
    expect(submitLineupProposal).not.toHaveBeenCalled();
  });
  it("keeps an unchanged server review after a quiet refetch", async () => {
    const { client } = show();
    await selectAndReview();
    await act(async () => refreshExchangeSurfaces(client, "workspace"));
    expect(screen.getByRole("button", { name: "Confirm change" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("invalidates a reviewed source changed in the live model and requires a new fingerprint", async () => {
    const { changeModel } = show();
    await selectAndReview();
    changeModel({
      ...model,
      locations: [
        {
          ...location,
          entries: [{ ...row, revision: 2, start_time: "18:00" }],
        },
      ],
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Confirm change" }),
      ).toBeNull(),
    );
    vi.mocked(previewLineupOperation).mockResolvedValue({
      ...ready,
      fingerprint: "b".repeat(64),
    });
    fireEvent.click(screen.getByRole("button", { name: "Review impact" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirm change" }),
    );
    await waitFor(() =>
      expect(applyLineupOperation).toHaveBeenCalledWith(
        "workspace",
        expect.any(Object),
        "b".repeat(64),
        expect.any(String),
      ),
    );
  });
  it("discards a preview response that arrives after its source changed", async () => {
    let finish!: (value: typeof ready) => void;
    vi.mocked(previewLineupOperation).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { changeModel } = show();
    fireEvent.click(await screen.findByRole("button", { name: /Alex Kim/ }));
    fireEvent.change(screen.getByLabelText("Reason for change"), {
      target: { value: "Preserve this reason" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review impact" }));
    changeModel({
      ...model,
      locations: [{ ...location, entries: [{ ...row, revision: 2 }] }],
    });
    await act(async () => finish(ready));
    expect(screen.queryByRole("button", { name: "Confirm change" })).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain(
      "changed during review",
    );
    expect(
      (screen.getByLabelText("Reason for change") as HTMLTextAreaElement).value,
    ).toBe("Preserve this reason");
  });
  it("disables confirmation during candidate refresh and recovers after an identical response", async () => {
    const { client } = show();
    await selectAndReview();
    let finish!: (value: LineupCandidate[]) => void;
    vi.mocked(getLineupCandidates).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    let refreshing!: Promise<void>;
    act(() => {
      refreshing = refreshExchangeSurfaces(client, "workspace");
    });
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Confirm change",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Send offer for employee response",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await act(async () => {
      finish([person]);
      await refreshing;
    });
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Confirm change",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
  });
  it("retires the review when the source disappears without reusing its fallback row", async () => {
    const { changeModel } = show();
    await selectAndReview();
    changeModel({ ...model, locations: [{ ...location, entries: [] }] });
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Confirm change" }),
      ).toBeNull(),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Staffing details changed",
    );
    expect(applyLineupOperation).not.toHaveBeenCalled();
  });
  it("does not keep final actions available after candidate refresh fails", async () => {
    const { client } = show();
    await selectAndReview();
    vi.mocked(getLineupCandidates).mockRejectedValue(
      new Error("Candidate lookup unavailable"),
    );
    await act(async () => refreshExchangeSurfaces(client, "workspace"));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Confirm change" }),
      ).toBeNull(),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Review impact",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Reason for change") as HTMLTextAreaElement).value,
    ).toBe("Keep the lunch coverage");
  });
});
