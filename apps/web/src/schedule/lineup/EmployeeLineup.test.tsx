import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmployeeLineupSnapshot } from "@newfork/shared";
import { EmployeeLineup } from "./EmployeeLineup";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import {
  getEmployeeLineup,
  getLineupOffers,
  recordLineupReceipt,
} from "../lineup-data";

vi.mock("../lineup-data", () => ({
  getEmployeeLineup: vi.fn(),
  getLineupOffers: vi.fn(),
  recordLineupReceipt: vi.fn(),
}));
const snapshot: EmployeeLineupSnapshot = {
  snapshot_id: "10000000-0000-4000-8000-000000000001",
  location_id: "10000000-0000-4000-8000-000000000002",
  location_name: "Main Dining",
  date: "2030-01-07",
  version: 4,
  shared_at: "2030-01-07T15:00:00Z",
  viewed_at: null,
  acknowledged_at: null,
  source_current: true,
  entries: [
    {
      id: "10000000-0000-4000-8000-000000000003",
      employee_name: "Alex Kim",
      job_name: "Server",
      section_name: "Floor",
      station: "Tables 1–8",
      start_time: "17:00",
      end_time: "23:00",
      shift_type_name: "Dinner",
    },
  ],
  notes: [
    {
      id: "10000000-0000-4000-8000-000000000004",
      category: "priority",
      content: "Briefing at 16:45",
      pinned: true,
    },
  ],
  briefs: [],
};
function RouteProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="route">{location.search}</output>
      <button onClick={() => navigate(-1)}>Browser back</button>
    </>
  );
}
function show(path = "/app/employee-hub/lineup") {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const result = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <RouteProbe />
        <EmployeeLineup
          workspaceId="10000000-0000-4000-8000-000000000005"
          from="2030-01-07"
          to="2030-01-14"
          timeFormat="24h"
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, client };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getEmployeeLineup).mockResolvedValue([structuredClone(snapshot)]);
  vi.mocked(getLineupOffers).mockResolvedValue([]);
  vi.mocked(recordLineupReceipt).mockResolvedValue({});
});
afterEach(cleanup);
describe("employee shared Line Up", () => {
  it("loads a linked future day and explains when no shared plan exists", async () => {
    vi.mocked(getEmployeeLineup).mockResolvedValue([]);
    show("/app/employee-hub/lineup?date=2030-11-04");
    await screen.findByText("No shared plan for this day.");
    expect(getEmployeeLineup).toHaveBeenCalledWith(
      expect.any(String),
      "2030-11-04",
      "2030-11-04",
    );
    expect(screen.getByText("Shared plans for Mon, Nov 4, 2030")).toBeTruthy();
    expect(recordLineupReceipt).not.toHaveBeenCalled();
  });
  it("uses the default location-aware range for a nonexistent linked date", async () => {
    show("/app/employee-hub/lineup?date=2030-02-31");
    await screen.findByText("Main Dining");
    expect(getEmployeeLineup).toHaveBeenCalledWith(
      expect.any(String),
      "2030-01-07",
      "2030-01-14",
    );
    expect(
      (screen.getByLabelText("Line Up date") as HTMLInputElement).value,
    ).toBe("2030-01-07");
  });
  it("keeps an unapplied date and focus during a shared-plan refresh", async () => {
    const { client } = show();
    await screen.findByText("Main Dining");
    const date = screen.getByLabelText("Line Up date") as HTMLInputElement;
    fireEvent.change(date, { target: { value: "2030-11-04" } });
    date.focus();
    await client.invalidateQueries({ queryKey: ["employee-lineup"] });
    expect(date.value).toBe("2030-11-04");
    expect(document.activeElement).toBe(date);
    expect(getEmployeeLineup).not.toHaveBeenCalledWith(
      expect.any(String),
      "2030-11-04",
      "2030-11-04",
    );
  });
  it("applies a day, returns to upcoming, and restores the day with browser back", async () => {
    show(
      "/app/employee-hub/lineup?staffing_offer=10000000-0000-4000-8000-000000000099",
    );
    await screen.findByText("Main Dining");
    fireEvent.change(screen.getByLabelText("Line Up date"), {
      target: { value: "2030-11-04" },
    });
    const submit = screen.getByRole("button", { name: "Show day" });
    submit.focus();
    fireEvent.click(submit);
    await waitFor(() =>
      expect(getEmployeeLineup).toHaveBeenCalledWith(
        expect.any(String),
        "2030-11-04",
        "2030-11-04",
      ),
    );
    expect(document.activeElement).toBe(submit);
    expect(screen.getByTestId("route").textContent).toContain(
      "staffing_offer=",
    );
    expect(screen.getByTestId("route").textContent).toContain(
      "date=2030-11-04",
    );
    fireEvent.click(screen.getByRole("button", { name: "Upcoming" }));
    await waitFor(() =>
      expect(screen.getByTestId("route").textContent).not.toContain("date="),
    );
    expect(screen.getByTestId("route").textContent).toContain(
      "staffing_offer=",
    );
    fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
    await screen.findByText("Shared plans for Mon, Nov 4, 2030");
    expect(
      (screen.getByLabelText("Line Up date") as HTMLInputElement).value,
    ).toBe("2030-11-04");
  });
  it("puts the new current assignment before a removed assignment for the same day", async () => {
    const removed = {
      ...snapshot,
      snapshot_id: "10000000-0000-4000-8000-000000000007",
      location_name: "Previous location",
      entries: [],
    };
    vi.mocked(getEmployeeLineup).mockResolvedValue([removed, snapshot]);
    show();
    await screen.findByText("Main Dining");
    expect(screen.getAllByRole("article")[0]?.textContent).toContain(
      "Main Dining",
    );
    expect(screen.getAllByRole("article")[1]?.textContent).toContain(
      "Previous location",
    );
  });
  it("shows the assignment instruction stored in the shared version", async () => {
    vi.mocked(getEmployeeLineup).mockResolvedValueOnce([
      {
        ...snapshot,
        entries: [
          {
            ...snapshot.entries[0]!,
            note: "Cover the private dining entrance",
          },
        ],
      },
    ]);
    show();
    expect(
      await screen.findByText("Cover the private dining entrance"),
    ).toBeTruthy();
  });
  it("shows personal before-and-after context and the shared section team", async () => {
    vi.mocked(getEmployeeLineup).mockResolvedValue([
      {
        ...snapshot,
        changes: {
          previous_version: 3,
          assignment_changed: true,
          brief_changed: true,
          previous_entries: [
            {
              ...snapshot.entries[0]!,
              section_name: "Patio",
              station: "Tables 10–12",
            },
          ],
        },
        section_team: [
          {
            ...snapshot.entries[0]!,
            id: "10000000-0000-4000-8000-000000000006",
            employee_name: "Jordan Lee",
          },
        ],
      },
    ]);
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: /View daily brief/ }),
    );
    expect(screen.getByText("Since v3")).toBeTruthy();
    expect(screen.getByText(/Your assignment changed/)).toBeTruthy();
    expect(screen.getByText(/Server · Patio · Tables 10–12/)).toBeTruthy();
    expect(screen.getByText(/service notes or brief changed/)).toBeTruthy();
    expect(screen.getByText("Jordan Lee")).toBeTruthy();
    expect(screen.getByText("From this shared plan · v4")).toBeTruthy();
  });
  it("explains an unchanged personal plan without inventing a change", async () => {
    vi.mocked(getEmployeeLineup).mockResolvedValue([
      {
        ...snapshot,
        changes: {
          previous_version: 3,
          assignment_changed: false,
          brief_changed: false,
          previous_entries: snapshot.entries,
        },
        section_team: [],
      },
    ]);
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: /View daily brief/ }),
    );
    expect(
      screen.getByText("Your assignment and relevant brief are unchanged."),
    ).toBeTruthy();
    expect(screen.queryByText(/Your assignment changed/)).toBeNull();
  });

  it("labels expired snapshot instructions without rewriting the shared content", async () => {
    vi.mocked(getEmployeeLineup).mockResolvedValue([
      {
        ...snapshot,
        notes: [{ ...snapshot.notes[0]!, expires_at: "2000-01-01T12:00:00Z" }],
      },
    ]);
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: /View daily brief/ }),
    );
    expect(screen.getByText(/Expired instruction/)).toBeTruthy();
    expect(screen.getByText("Briefing at 16:45")).toBeTruthy();
  });
  it("records opening the brief separately from explicit acknowledgement", async () => {
    show();
    await screen.findByText("Tables 1–8");
    expect(recordLineupReceipt).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /View daily brief/ }));
    await waitFor(() =>
      expect(recordLineupReceipt).toHaveBeenCalledWith(
        expect.any(String),
        snapshot.snapshot_id,
        "view",
      ),
    );
    expect(screen.getByText("Briefing at 16:45")).toBeTruthy();
    fireEvent.click(
      await screen.findByRole("button", { name: "I've read this plan" }),
    );
    await waitFor(() =>
      expect(recordLineupReceipt).toHaveBeenCalledWith(
        expect.any(String),
        snapshot.snapshot_id,
        "acknowledge",
      ),
    );
  });
  it("keeps an unpublished source visible as history and prevents acknowledgement", async () => {
    vi.mocked(getEmployeeLineup).mockResolvedValue([
      { ...snapshot, source_current: false },
    ]);
    show();
    await screen.findByText(/historical shared plan/);
    expect(
      (
        screen.getByRole("button", {
          name: "I've read this plan",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(recordLineupReceipt).not.toHaveBeenCalled();
  });
  it("shows a persisted acknowledgement without submitting another response", async () => {
    vi.mocked(getEmployeeLineup).mockResolvedValue([
      { ...snapshot, acknowledged_at: "2030-01-07T16:00:00Z" },
    ]);
    show();
    const button = await screen.findByRole("button", { name: "Acknowledged" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(recordLineupReceipt).not.toHaveBeenCalled();
  });
});
