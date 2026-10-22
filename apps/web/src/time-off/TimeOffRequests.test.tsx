import type { MyTimeOff, TimeOffRequestView } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestError } from "../lib/request-error";
import { TimeOffRequests } from "./TimeOffRequests";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const api = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("../lib/supabase", () => ({ supabaseClient: {}, apiRequest: api.apiRequest }));

function request(overrides: Partial<TimeOffRequestView>): TimeOffRequestView {
  return {
    id: "98020000-0000-4000-8000-000000000001",
    kind: "leave",
    kind_of_leave: "vacation",
    status: "pending",
    starts_at: "2026-11-13T08:00:00+00:00",
    ends_at: "2026-11-17T08:00:00+00:00",
    all_day: true,
    time_timezone: "America/Los_Angeles",
    start_date: "2026-11-13",
    end_date: "2026-11-16",
    start_time: null,
    end_time: null,
    note: "My sister's wedding in Portland.",
    revision: 1,
    created_at: "2026-10-20T17:00:00+00:00",
    decided_at: null,
    decided_by_name: null,
    decision_note: null,
    ended_at: null,
    ended_note: null,
    cancels_id: null,
    ended_by_name: null,
    used_until: null,
    cancellation: null,
    ...overrides,
  };
}

const wedding = request({});
const dentist = request({
  id: "98020000-0000-4000-8000-000000000002",
  kind_of_leave: "personal",
  status: "approved",
  starts_at: "2026-10-27T20:00:00+00:00",
  ends_at: "2026-10-28T01:00:00+00:00",
  all_day: false,
  start_date: "2026-10-27",
  end_date: "2026-10-27",
  start_time: "13:00",
  end_time: "18:00",
  note: null,
  decided_at: "2026-10-21T17:00:00+00:00",
  decided_by_name: "Rachel Adams",
});
const moving = request({
  id: "98020000-0000-4000-8000-000000000003",
  kind_of_leave: "other",
  status: "expired",
  starts_at: "2026-10-09T07:00:00+00:00",
  ends_at: "2026-10-10T07:00:00+00:00",
  start_date: "2026-10-09",
  end_date: "2026-10-09",
  note: "Moving day.",
});
// D4: a cancellation waiting on approved time off.
const cancelWaiting = {
  id: "98020000-0000-4000-8000-000000000009",
  status: "pending" as const,
  note: "Plans changed",
  revision: 1,
  created_at: "2026-10-22T15:00:00+00:00",
  decided_at: null,
  decided_by_name: null,
  decision_note: null,
};
const mine: MyTimeOff = {
  time_zone: "America/Los_Angeles",
  today: "2026-10-22",
  location_names: ["Downtown", "Midtown"],
  requests: [wedding, dentist, moving],
};

function answer(routes: {
  mine?: () => unknown;
  ask?: (body: unknown) => unknown;
  withdraw?: (body: unknown) => unknown;
  shifts?: (path: string) => unknown;
  cancel?: (body: unknown) => unknown;
}) {
  api.apiRequest.mockImplementation(async (_client: unknown, path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (path.endsWith("/time-off-requests/mine")) return (routes.mine ?? (() => mine))();
    if (path.includes("/time-off-requests/my-shifts?")) return (routes.shifts ?? (() => ({ count: 0, shifts: [] })))(path);
    if (path.endsWith("/cancellation")) return (routes.cancel ?? (() => ({ ...dentist, cancellation: cancelWaiting })))(body);
    if (path.endsWith("/withdraw")) return (routes.withdraw ?? (() => ({ ...wedding, status: "withdrawn", revision: 2 })))(body);
    if (path.endsWith("/time-off-requests") && init?.method === "POST") return (routes.ask ?? (() => wedding))(body);
    throw new Error(`unexpected ${path}`);
  });
}

function renderIt() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TimeOffRequests workspaceId={workspaceId} timeFormat="12h" />
    </QueryClientProvider>,
  );
}

const posts = (suffix: string) =>
  api.apiRequest.mock.calls.filter(([, path, init]) => String(path).endsWith(suffix) && (init as RequestInit | undefined)?.method === "POST");

function phoneWidth(on: boolean) {
  window.matchMedia = ((media: string) => ({
    matches: on && media === "(max-width: 767px)",
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

describe("Time off (new)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-22T16:30:00Z")); // 9:30 AM in Los Angeles
    api.apiRequest.mockReset();
    phoneWidth(false);
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists what is coming in a table and the rest under Past", async () => {
    answer({});
    renderIt();
    const table = await screen.findByRole("table");
    expect(screen.getByText("Ask for days or hours off. A manager at Downtown or Midtown answers.")).toBeTruthy();
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      "Oct 27TuePersonal1:00 PM to 6:00 PMApproved",
      "Nov 13–164 daysVacationAll dayPending",
    ]);
    expect(screen.getByRole("tab", { name: "Past 1" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Past 1" }));
    expect(within(screen.getByRole("table")).getAllByRole("row")[1]!.textContent).toBe("Oct 9FriOtherAll dayExpired");
  });

  it("sends a request and closes the drawer", async () => {
    answer({});
    renderIt();
    fireEvent.click(await screen.findByRole("button", { name: "Request time off" }));
    const dialog = screen.getByRole("dialog", { name: "Request time off" });
    fireEvent.click(within(dialog).getByRole("radio", { name: /Vacation/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Tomorrow" }));
    expect(within(dialog).getByText("Oct 23")).toBeTruthy();
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Note for your manager/ }), { target: { value: "  Flight at noon " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const [, , init] = posts("/time-off-requests")[0]!;
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      kind_of_leave: "vacation",
      start_date: "2026-10-23",
      end_date: "2026-10-23",
      all_day: true,
      start_time: null,
      end_time: null,
      note: "Flight at noon",
      expected_timezone: "America/Los_Angeles",
      client_key: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });

  it("asks for a type before sending, and refuses today as a whole day", async () => {
    answer({});
    renderIt();
    fireEvent.click(await screen.findByRole("button", { name: "Request time off" }));
    const dialog = screen.getByRole("dialog", { name: "Request time off" });
    fireEvent.change(within(dialog).getByLabelText("First day"), { target: { value: "2026-10-22" } });
    expect(within(dialog).getByText("Today has already started. Turn off All day to ask for the rest of today.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Send request" }));
    expect(within(dialog).getByText("Choose a type.")).toBeTruthy();
    expect(posts("/time-off-requests")).toHaveLength(0);
  });

  it("keeps the form and says why when the database refuses", async () => {
    answer({
      ask: () => {
        throw new RequestError("You already have time off or a request in these hours", "time_off.overlap", undefined, 409);
      },
    });
    renderIt();
    fireEvent.click(await screen.findByRole("button", { name: "Request time off" }));
    const dialog = screen.getByRole("dialog", { name: "Request time off" });
    fireEvent.click(within(dialog).getByRole("radio", { name: /Sick/ }));
    fireEvent.change(within(dialog).getByLabelText("First day"), { target: { value: "2026-11-14" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send request" }));
    expect(await within(dialog).findByText("You already have time off or a request in these hours. Withdraw that request first.")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Request time off" })).toBeTruthy();
    expect((within(dialog).getByRole("radio", { name: /Sick/ }) as HTMLInputElement).checked).toBe(true);
    expect((within(dialog).getByLabelText("First day") as HTMLInputElement).value).toBe("2026-11-14");
  });

  it("withdraws a waiting request with two clicks in its drawer", async () => {
    answer({});
    renderIt();
    fireEvent.click(await screen.findByRole("row", { name: /Vacation/ }));
    const dialog = screen.getByRole("dialog", { name: "Time off" });
    expect(within(dialog).getByText("Fri, Nov 13 to Mon, Nov 16")).toBeTruthy();
    expect(within(dialog).getByText("Waiting for a manager")).toBeTruthy();
    expect(within(dialog).getByText("Your note: My sister's wedding in Portland.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Withdraw" }));
    expect(posts("/withdraw")).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm withdraw" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const [, path, init] = posts("/withdraw")[0]!;
    expect(path).toBe(`/v1/workspaces/${workspaceId}/time-off-requests/${wedding.id}/withdraw`);
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ expected_revision: 1 });
  });

  it("withdraws from the row's menu, also with two clicks, and offers it only while it waits", async () => {
    answer({});
    renderIt();
    fireEvent.click(await screen.findByRole("button", { name: "Actions for Personal, Oct 27" }));
    expect(screen.queryByRole("menuitem", { name: "Withdraw request" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Actions for Vacation, Nov 13–16" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Withdraw request" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Confirm withdraw" }));
    await waitFor(() => expect(posts("/withdraw")).toHaveLength(1));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("on a phone shows rows, a detail card with When and Length, and a Type list in the form", async () => {
    phoneWidth(true);
    answer({});
    renderIt();
    fireEvent.click(await screen.findByRole("button", { name: /Vacation\s*Pending/ }));
    const detail = screen.getByRole("dialog", { name: "Time off" });
    expect(within(detail).getByText("When")).toBeTruthy();
    expect(within(detail).getByText("4 days")).toBeTruthy();
    fireEvent.click(within(detail).getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Request time off" }));
    const form = screen.getByRole("dialog", { name: "Request time off" });
    expect(within(form).getByRole("combobox", { name: "Type" })).toBeTruthy();
    expect(within(form).queryByRole("radiogroup")).toBeNull();
    expect(within(form).getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("shows an answer with who gave it and their note, approved or declined", async () => {
    const declined = request({
      id: "98020000-0000-4000-8000-000000000004",
      kind_of_leave: "sick",
      status: "declined",
      starts_at: "2026-11-20T08:00:00+00:00",
      ends_at: "2026-11-21T08:00:00+00:00",
      start_date: "2026-11-20",
      end_date: "2026-11-20",
      decided_at: "2026-10-21T18:00:00+00:00",
      decided_by_name: "Rachel Adams",
      decision_note: "We are short that day.",
    });
    answer({ mine: () => ({ ...mine, requests: [{ ...dentist, decision_note: "Enjoy." }, declined] }) });
    renderIt();
    fireEvent.click(await screen.findByRole("row", { name: /Personal/ }));
    let dialog = screen.getByRole("dialog", { name: "Time off" });
    expect(within(dialog).getByText("Rachel Adams, Oct 21")).toBeTruthy();
    expect(within(dialog).getByText("Rachel Adams wrote").parentElement!.textContent).toBe("Rachel Adams wroteEnjoy.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("tab", { name: "Past 1" }));
    fireEvent.click(await screen.findByRole("row", { name: /Sick/ }));
    dialog = screen.getByRole("dialog", { name: "Time off" });
    expect(within(dialog).getByText("Declined", { selector: "strong" })).toBeTruthy();
    expect(within(dialog).getByText("Rachel Adams wrote").parentElement!.textContent).toBe("Rachel Adams wroteWe are short that day.");
  });

  it("on a phone says which shifts would go to open shifts if the days are approved", async () => {
    phoneWidth(true);
    answer({
      shifts: () => ({
        count: 2,
        shifts: [
          { id: "22000000-0000-4000-8000-000000000004", location_name: "Downtown", job_name: "Server", scheduled_date: "2026-10-23", start_time: "09:00", end_time: "15:00" },
          { id: "22000000-0000-4000-8000-000000000005", location_name: "Midtown", job_name: "Cook", scheduled_date: "2026-10-23", start_time: "17:00", end_time: "22:00" },
        ],
      }),
    });
    renderIt();
    fireEvent.click(await screen.findByRole("button", { name: "Request time off" }));
    const form = screen.getByRole("dialog", { name: "Request time off" });
    expect(within(form).queryByRole("note")).toBeNull();
    fireEvent.click(within(form).getByRole("button", { name: "Tomorrow" }));
    const box = await within(form).findByRole("note");
    expect(box.textContent).toBe("2 shifts go to open shifts if approvedFri, Oct 23, 9:00 AM to 3:00 PM DowntownFri, Oct 23, 5:00 PM to 10:00 PM Midtown");
    const asked = api.apiRequest.mock.calls.map(([, path]) => String(path)).filter((path) => path.includes("/my-shifts?"));
    expect(asked.at(-1)).toBe(`/v1/workspaces/${workspaceId}/time-off-requests/my-shifts?start=2026-10-23&end=2026-10-23`);
  });

  // D4 (KARARLAR S-239 (4)): approved time off, started or not, is cancelled by a request a manager answers.
  it("asks to cancel approved time off from the row's menu, with an optional note", async () => {
    answer({});
    renderIt();
    fireEvent.click(await screen.findByRole("button", { name: "Actions for Vacation, Nov 13–16" }));
    expect(screen.queryByRole("menuitem", { name: "Ask to cancel" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Actions for Personal, Oct 27" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Ask to cancel" }));
    const dialog = screen.getByRole("dialog", { name: "Time off" });
    const note = within(dialog).getByRole("textbox", { name: /Why do you want to cancel\?/ });
    expect(within(dialog).getByText("Optional")).toBeTruthy();
    expect(within(dialog).getByText("A manager answers. Until then you stay off. Shifts that already went to open shifts stay open.")).toBeTruthy();
    fireEvent.change(note, { target: { value: "  Plans changed " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send cancellation request" }));
    await waitFor(() => expect(posts("/cancellation")).toHaveLength(1));
    const [, path, init] = posts("/cancellation")[0]!;
    expect(path).toBe(`/v1/workspaces/${workspaceId}/time-off-requests/${dentist.id}/cancellation`);
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      note: "Plans changed",
      expected_revision: 1,
      client_key: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    await waitFor(() => expect(within(dialog).queryByRole("textbox", { name: /Why do you want to cancel\?/ })).toBeNull());
  });

  it("keeps the time off when the box is closed, and sends no note when none is written", async () => {
    answer({});
    renderIt();
    fireEvent.click(await screen.findByRole("row", { name: /Personal/ }));
    const dialog = screen.getByRole("dialog", { name: "Time off" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Ask to cancel" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep my time off" }));
    expect(within(dialog).queryByRole("textbox")).toBeNull();
    expect(posts("/cancellation")).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Ask to cancel" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Send cancellation request" }));
    await waitFor(() => expect(posts("/cancellation")).toHaveLength(1));
    expect(JSON.parse(String((posts("/cancellation")[0]![2] as RequestInit).body)).note).toBeNull();
  });

  it("says a cancellation waits, and withdraws it with two clicks", async () => {
    answer({ mine: () => ({ ...mine, requests: [{ ...dentist, cancellation: cancelWaiting }] }) });
    renderIt();
    const row = await screen.findByRole("row", { name: /Personal/ });
    expect(within(row).getByText("Cancellation pending")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Actions for Personal, Oct 27" }));
    expect(screen.queryByRole("menuitem", { name: "Ask to cancel" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Withdraw cancellation" }));
    expect(posts("/withdraw")).toHaveLength(0);
    fireEvent.click(screen.getByRole("menuitem", { name: "Confirm withdraw" }));
    await waitFor(() => expect(posts("/withdraw")).toHaveLength(1));
    const [, path, init] = posts("/withdraw")[0]!;
    expect(path).toBe(`/v1/workspaces/${workspaceId}/time-off-requests/${cancelWaiting.id}/withdraw`);
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ expected_revision: 1 });
  });

  it("shows the cancellation's steps in the drawer, with a two-click withdraw", async () => {
    answer({ mine: () => ({ ...mine, requests: [{ ...dentist, cancellation: cancelWaiting }] }) });
    renderIt();
    fireEvent.click(await screen.findByRole("row", { name: /Personal/ }));
    const dialog = screen.getByRole("dialog", { name: "Time off" });
    expect(within(dialog).getByText("Cancellation asked")).toBeTruthy();
    expect(within(dialog).getByText("Your reason: Plans changed")).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Ask to cancel" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Withdraw cancellation" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm withdraw" }));
    await waitFor(() => expect(posts("/withdraw")).toHaveLength(1));
    expect(String(posts("/withdraw")[0]![1])).toContain(cancelWaiting.id);
  });

  it("says why a cancellation did not go through", async () => {
    answer({
      cancel: () => {
        throw new RequestError("A cancellation is already waiting for an answer", "time_off.cancel_pending", undefined, 409);
      },
    });
    renderIt();
    fireEvent.click(await screen.findByRole("row", { name: /Personal/ }));
    const dialog = screen.getByRole("dialog", { name: "Time off" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Ask to cancel" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Send cancellation request" }));
    expect(await within(dialog).findByText("You already asked to cancel this time off. Wait for the answer.")).toBeTruthy();
  });

  it("reads time off cancelled after it started, and time off revoked with the manager's note", async () => {
    const cancelled = request({
      id: "98020000-0000-4000-8000-000000000005",
      status: "cancelled",
      starts_at: "2026-10-20T07:00:00+00:00",
      ends_at: "2026-10-24T07:00:00+00:00",
      start_date: "2026-10-20",
      end_date: "2026-10-23",
      decided_at: "2026-10-15T17:00:00+00:00",
      decided_by_name: "Rachel Adams",
      ended_at: "2026-10-21T19:00:00+00:00",
      ended_by_name: "Rachel Adams",
      used_until: "2026-10-21T19:00:00+00:00",
      cancellation: { ...cancelWaiting, status: "approved", decided_at: "2026-10-21T19:00:00+00:00", decided_by_name: "Rachel Adams" },
    });
    const revoked = request({
      id: "98020000-0000-4000-8000-000000000006",
      kind_of_leave: "personal",
      status: "revoked",
      starts_at: "2026-11-20T08:00:00+00:00",
      ends_at: "2026-11-21T08:00:00+00:00",
      start_date: "2026-11-20",
      end_date: "2026-11-20",
      decided_at: "2026-10-15T17:00:00+00:00",
      decided_by_name: "Rachel Adams",
      ended_at: "2026-10-21T19:00:00+00:00",
      ended_by_name: "Sam Lee",
      ended_note: "Inventory day, everyone is needed.",
    });
    answer({ mine: () => ({ ...mine, requests: [cancelled, revoked] }) });
    renderIt();
    fireEvent.click(await screen.findByRole("tab", { name: "Past 2" }));
    fireEvent.click(screen.getByRole("row", { name: /Vacation/ }));
    let dialog = screen.getByRole("dialog", { name: "Time off" });
    expect(within(dialog).getByText("Cancelled", { selector: "strong" })).toBeTruthy();
    expect(within(dialog).getByText("Rachel Adams, Oct 21")).toBeTruthy();
    expect(within(dialog).getByText("You were off until Wed, Oct 21, 12:00 PM. Shifts that went to open shifts stay open.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("row", { name: /Personal/ }));
    dialog = screen.getByRole("dialog", { name: "Time off" });
    expect(within(dialog).getByText("Revoked", { selector: "strong" })).toBeTruthy();
    expect(within(dialog).getByText("Sam Lee wrote").parentElement!.textContent).toBe("Sam Lee wroteInventory day, everyone is needed.");
    expect(within(dialog).queryByRole("button", { name: "Ask to cancel" })).toBeNull();
  });

  it("on a phone asks to cancel in the bottom card", async () => {
    phoneWidth(true);
    answer({});
    renderIt();
    fireEvent.click(await screen.findByRole("button", { name: /Personal\s*Approved/ }));
    const detail = screen.getByRole("dialog", { name: "Time off" });
    fireEvent.click(within(detail).getByRole("button", { name: "Ask to cancel" }));
    expect(within(detail).getByRole("button", { name: "Send cancellation request" })).toBeTruthy();
    expect(within(detail).getByRole("button", { name: "Keep my time off" })).toBeTruthy();
  });

  it("says when nothing is there yet, and when the list could not load", async () => {
    answer({ mine: () => ({ ...mine, requests: [] }) });
    const empty = renderIt();
    expect(await screen.findByText(/No time off yet\./)).toBeTruthy();
    empty.unmount();
    answer({ mine: () => { throw new RequestError("Workspace operation failed", undefined, undefined, 500); } });
    renderIt();
    expect(await screen.findByText("Couldn't load your time off.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});
