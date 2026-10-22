import type { TimeOffDeciderView, TimeOffEntryImpact, TimeOffEntryPeople } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestError } from "../lib/request-error";
import { TimeOffEntry } from "./TimeOffEntry";

// Time off rebuild D5: Requests → Time off → Add time off. Whoever may answer enters approved time off for
// somebody: the person first, then the kind, the days and the note; the shifts it opens are listed, and
// adding asks first when some open. A refusal stays in the drawer, beside its field.

configure({ asyncUtilTimeout: 5000 });
const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const api = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("../lib/supabase", () => ({ supabaseClient: {}, apiRequest: api.apiRequest }));

const maria = "735032ec-0e98-4fb1-8005-c4ede5b1726b";
const people: TimeOffEntryPeople = {
  people: [
    { employee_id: "735032ec-0e98-4fb1-8005-c4ede5b1726c", name: "Alex Kim", location_names: ["Downtown"], time_zone: "America/Los_Angeles", today: "2035-01-10" },
    { employee_id: maria, name: "Maria Lopez", location_names: ["Downtown", "Midtown"], time_zone: "America/Los_Angeles", today: "2035-01-10" },
  ],
};
const shift = {
  id: "22000000-0000-4000-8000-000000000004",
  scheduled_date: "2035-01-11",
  start_time: "09:00",
  end_time: "15:00",
  job_name: "Server",
  starts_at: "2035-01-11T17:00:00+00:00",
  ends_at: "2035-01-11T23:00:00+00:00",
  timezone: "America/Los_Angeles",
};
const impact: TimeOffEntryImpact = {
  fingerprint: "99b79f028d99c773d76fa15d790a19fc",
  shift_count: 2,
  hidden_shift_count: 1,
  time_zone: "America/Los_Angeles",
  overlap: null,
  locations: [{ location_id: "11000000-0000-4000-8000-000000000001", location_name: "Downtown", shifts: [shift] }],
};
const entered: TimeOffDeciderView = {
  id: "98020000-0000-4000-8000-000000000001",
  kind: "leave",
  kind_of_leave: "sick",
  status: "approved",
  starts_at: "2035-01-11T08:00:00+00:00",
  ends_at: "2035-01-12T08:00:00+00:00",
  all_day: true,
  time_timezone: "America/Los_Angeles",
  start_date: "2035-01-11",
  end_date: "2035-01-11",
  start_time: null,
  end_time: null,
  note: null,
  revision: 1,
  created_at: "2035-01-10T17:00:00+00:00",
  added_by_name: "Rachel Adams",
  decided_at: "2035-01-10T17:00:00+00:00",
  decided_by_name: "Rachel Adams",
  decision_note: null,
  ended_at: null,
  ended_note: null,
  cancels_id: null,
  ended_by_name: null,
  used_until: null,
  cancellation: null,
  employee_id: maria,
  employee_name: "Maria Lopez",
  location_names: ["Downtown", "Midtown"],
  shifts_opened: 2,
};

type Routes = { impact?: (path: string) => unknown; enter?: (body: unknown) => unknown };
function answerWith(routes: Routes = {}) {
  api.apiRequest.mockImplementation(async (_client: unknown, path: string, init?: RequestInit) => {
    if (path.endsWith("/entries/people")) return people;
    if (path.includes("/entries/impact")) return (routes.impact ?? (() => impact))(path);
    if (path.endsWith("/entries") && init?.method === "POST") return (routes.enter ?? (() => entered))(JSON.parse(String(init.body)));
    throw new Error(`unexpected ${path}`);
  });
}
const posts = () => api.apiRequest.mock.calls.filter(([, , init]) => (init as RequestInit | undefined)?.method === "POST");
const impactAsks = () => api.apiRequest.mock.calls.map(([, path]) => String(path)).filter((path) => path.includes("/entries/impact"));

function renderIt(onAdded = vi.fn(), onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TimeOffEntry workspaceId={workspaceId} timeFormat="12h" onAdded={onAdded} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onAdded, onClose };
}

async function chooseMariaTomorrow() {
  const dialog = await screen.findByRole("dialog", { name: "Add time off" });
  const person = await within(dialog).findByRole("combobox", { name: "Employee" });
  await within(person).findByRole("option", { name: "Maria Lopez" });
  fireEvent.change(person, { target: { value: maria } });
  fireEvent.click(within(dialog).getByRole("radio", { name: /Sick/ }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Tomorrow" }));
  return dialog;
}

afterEach(() => {
  api.apiRequest.mockReset();
});

describe("Add time off", () => {
  it("lists the people one may add time off for, the person first", async () => {
    answerWith();
    renderIt();
    const dialog = await screen.findByRole("dialog", { name: "Add time off" });
    const person = await within(dialog).findByRole("combobox", { name: "Employee" });
    await within(person).findByRole("option", { name: "Maria Lopez" });
    expect(within(person).getAllByRole("option").map((option) => option.textContent)).toEqual(["Choose an employee", "Alex Kim", "Maria Lopez"]);
    expect(impactAsks()).toHaveLength(0);
  });

  it("shows the shifts that go to open shifts and asks first, then adds on what it read", async () => {
    answerWith();
    const { onAdded } = renderIt();
    const dialog = await chooseMariaTomorrow();
    expect(await within(dialog).findByText("2 shifts go to open shifts")).toBeTruthy();
    expect(within(dialog).getByText(/Thu, Jan 11, 9:00 AM to 3:00 PM/)).toBeTruthy();
    expect(within(dialog).getByText("1 more at a location whose schedule you don't see.")).toBeTruthy();
    expect(new URL(impactAsks().at(-1)!, "http://x").searchParams.toString()).toBe(`employee_id=${maria}&start=2035-01-11&end=2035-01-11`);
    fireEvent.change(within(dialog).getByLabelText(/Note for Maria/), { target: { value: "Flu" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add time off" }));
    const confirm = await within(dialog).findByRole("alertdialog", { name: "Add time off for Maria?" });
    expect(within(confirm).getByText("2 shifts go to open shifts.")).toBeTruthy();
    expect(posts()).toHaveLength(0);
    fireEvent.click(within(confirm).getByRole("button", { name: "Add time off" }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(entered));
    const body = JSON.parse(String((posts()[0]![2] as RequestInit).body));
    expect(posts()[0]![1]).toBe(`/v1/workspaces/${workspaceId}/time-off-requests/entries`);
    expect(body).toEqual({
      employee_id: maria,
      kind_of_leave: "sick",
      start_date: "2035-01-11",
      end_date: "2035-01-11",
      all_day: true,
      start_time: null,
      end_time: null,
      note: "Flu",
      expected_timezone: "America/Los_Angeles",
      expected_impact: impact.fingerprint,
      client_key: expect.any(String),
    });
  });

  it("adds at once when no shift opens, today included", async () => {
    answerWith({ impact: () => ({ ...impact, shift_count: 0, hidden_shift_count: 0, locations: [] }) });
    const { onAdded } = renderIt();
    const dialog = await chooseMariaTomorrow();
    fireEvent.change(within(dialog).getByLabelText("First day"), { target: { value: "2035-01-10" } });
    expect(await within(dialog).findByText("No shift goes to open shifts.")).toBeTruthy();
    expect(within(dialog).queryByText(/has passed/)).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add time off" }));
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(within(dialog).queryByRole("alertdialog")).toBeNull();
    expect(JSON.parse(String((posts()[0]![2] as RequestInit).body)).start_date).toBe("2035-01-10");
  });

  it("refuses a day before the person's today before it sends", async () => {
    answerWith();
    renderIt();
    const dialog = await chooseMariaTomorrow();
    fireEvent.change(within(dialog).getByLabelText("First day"), { target: { value: "2035-01-09" } });
    expect(await within(dialog).findByText("That day has passed. Time off can start today at the earliest.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add time off" }));
    expect(posts()).toHaveLength(0);
  });

  it("says to answer a request waiting for those days first, and does not send", async () => {
    answerWith({ impact: () => ({ ...impact, overlap: "pending" }) });
    renderIt();
    const dialog = await chooseMariaTomorrow();
    expect(await within(dialog).findByText("Maria has a request waiting for these days. Answer it first.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add time off" }));
    expect(within(dialog).queryByRole("alertdialog")).toBeNull();
    expect(posts()).toHaveLength(0);
  });

  it("keeps the form and says why when the database refuses", async () => {
    answerWith({
      impact: () => ({ ...impact, shift_count: 0, hidden_shift_count: 0, locations: [] }),
      enter: () => {
        throw new RequestError("Refused", "time_off.overlap", undefined, 409);
      },
    });
    const { onAdded } = renderIt();
    const dialog = await chooseMariaTomorrow();
    await within(dialog).findByText("No shift goes to open shifts.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Add time off" }));
    expect(await within(dialog).findByText("Maria already has time off in these days.")).toBeTruthy();
    expect(onAdded).not.toHaveBeenCalled();
    expect((within(dialog).getByRole("combobox", { name: "Employee" }) as HTMLSelectElement).value).toBe(maria);
  });
});
