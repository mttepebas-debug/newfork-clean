import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useNavigate, useLocation } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { EmployeeHubReadModel } from "@newfork/shared";
import { EmployeeTeamView } from "./EmployeeTeamView";
import { getEmployeeHub } from "./employee-hub-data";
import { refreshExchangeSurfaces } from "./shift-exchanges/exchange-data";
vi.mock("./employee-hub-data", () => ({ getEmployeeHub: vi.fn() }));
const own = {
  id: "shift",
  employee_id: "alex",
  employee_name: "Alex",
  scheduled_date: "2026-12-08",
  location_id: "location",
  location_name: "Dining",
  job_name: "Server",
  start_time: "09:00",
  end_time: "17:00",
  note: "private note",
};
let model: EmployeeHubReadModel;
beforeEach(() => {
  vi.clearAllMocks();
  model = {
    workspace_id: "workspace",
    employee: { id: "alex", display_name: "Alex" },
    locations: [
      { id: "location", name: "Dining", timezone: "America/Los_Angeles" },
    ],
    settings: { time_format: "12h" },
    shifts: [own],
    team_shifts: [
      { ...own, id: "other", employee_id: "blake", employee_name: "Blake" },
    ],
    open_shifts: [],
    team: [
      {
        id: "blake",
        display_name: "Blake",
        job_names: ["Server"],
        location_names: ["Dining"],
      },
    ],
    availability: null,
    requests: [],
    lineup: [],
  };
  vi.mocked(getEmployeeHub).mockImplementation(async () =>
    structuredClone(model),
  );
});
afterEach(cleanup);
function Navigation() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <>
      <button onClick={() => navigate(-1)}>Back test</button>
      <output>{location.search}</output>
    </>
  );
}
function mount(search = "?date=2026-12-08") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/employee-hub/my-team" + search]}>
        <Navigation />
        <EmployeeTeamView
          workspaceId="workspace"
          userId="user"
          today="2026-09-07"
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}
it("shows own and colleague assignments; only own shift opens its exact exchange detail", async () => {
  mount();
  const link = await screen.findByRole("link", {
    name: "Find cover or swap for your Server shift at Dining",
  });
  expect(link.getAttribute("href")).toBe(
    "/app/employee-hub/shift-hub?offer=shift&from=2026-12-08&to=2026-12-08",
  );
  expect(
    screen.getAllByRole("link", { name: /Find cover or swap/ }),
  ).toHaveLength(1);
  const location = screen.getByRole("region", { name: "Dining" });
  expect(within(location).getByText("Blake")).toBeTruthy();
  expect(within(location).getByText("You")).toBeTruthy();
  expect(screen.queryByText("private note")).toBeNull();
  expect(screen.getByRole("heading", { name: "Team directory" })).toBeTruthy();
  expect(getEmployeeHub).toHaveBeenCalledWith(
    "workspace",
    "2026-12-08",
    "2026-12-08",
  );
});
it("refreshes the actual query after transfer and removes the former owner's action", async () => {
  const client = mount();
  await screen.findByRole("link", { name: /Find cover or swap/ });
  model.shifts = [];
  model.team_shifts = [
    { ...own, employee_id: "blake", employee_name: "Blake" },
  ];
  await act(async () => {
    await refreshExchangeSurfaces(client, "workspace");
  });
  await waitFor(() =>
    expect(
      screen.queryByRole("link", { name: /Find cover or swap/ }),
    ).toBeNull(),
  );
  expect(
    within(screen.getByRole("region", { name: "Dining" })).getByText("Blake"),
  ).toBeTruthy();
});
it("keeps draft date during refresh; applying it changes the range and Back restores the applied date", async () => {
  const client = mount();
  await screen.findByRole("link", { name: /Find cover or swap/ });
  const input = screen.getByLabelText("Team schedule date") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "2026-12-15" } });
  await act(async () => {
    await refreshExchangeSurfaces(client, "workspace");
  });
  expect(input.value).toBe("2026-12-15");
  fireEvent.click(screen.getByRole("button", { name: "Show day" }));
  await screen.findByText("No published shifts for this day");
  expect(getEmployeeHub).toHaveBeenLastCalledWith(
    "workspace",
    "2026-12-15",
    "2026-12-15",
  );
  fireEvent.click(screen.getByRole("button", { name: "Back test" }));
  await screen.findByRole("link", { name: /Find cover or swap/ });
  expect(input.value).toBe("2026-12-08");
});
it("keeps date controls mounted while a newly selected date loads", async () => {
  mount();
  await screen.findByRole("link", { name: /Find cover or swap/ });
  let resolve!: (value: EmployeeHubReadModel) => void;
  vi.mocked(getEmployeeHub).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const input = screen.getByLabelText("Team schedule date");
  fireEvent.change(input, { target: { value: "2026-12-15" } });
  fireEvent.click(screen.getByRole("button", { name: "Show day" }));
  await screen.findByText("Loading the team schedule…");
  expect(screen.getByLabelText("Team schedule date")).toBe(input);
  expect(screen.queryByRole("link", { name: /Find cover or swap/ })).toBeNull();
  await act(async () => resolve(model));
});
it("hides stale assignments on denied refresh and retains a retry route", async () => {
  const client = mount();
  await screen.findByRole("link", { name: /Find cover or swap/ });
  vi.mocked(getEmployeeHub).mockRejectedValue(new Error("denied"));
  await act(async () => {
    await refreshExchangeSurfaces(client, "workspace");
  });
  await screen.findByRole("alert");
  expect(screen.queryByRole("link", { name: /Find cover or swap/ })).toBeNull();
  expect(screen.queryByRole("heading", { name: "Team directory" })).toBeNull();
  vi.mocked(getEmployeeHub).mockResolvedValue(model);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("link", { name: /Find cover or swap/ });
});
it("deduplicates IDs, excludes off-day and open rows, and labels unresolved hours", async () => {
  model.team_shifts.push(
    {...model.team_shifts[0]!},
    { ...own, id: "tomorrow", scheduled_date: "2026-12-09" },
    { ...own, id: "open", employee_id: null },
  );
  model.shifts = [
    { ...own, time_basis: "unresolved", start_time: "", end_time: "" },
  ];
  model.team_shifts = model.team_shifts.filter((row) => row.id !== own.id);
  mount();
  await screen.findByText("Hours need confirmation");
  expect(document.querySelectorAll("[data-team-shift-id]")).toHaveLength(2);
  expect(screen.queryByText(/12:00 AM/)).toBeNull();
});
it("falls back from an invalid date without fetching an impossible range", async () => {
  mount("?date=2026-02-30");
  await screen.findByText("No published shifts for this day");
  expect(getEmployeeHub).toHaveBeenCalledWith(
    "workspace",
    "2026-09-07",
    "2026-09-07",
  );
});
