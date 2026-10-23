import type { TimeOffDeciderView, TimeOffImpact, TimeOffRequestsPage } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestError } from "../lib/request-error";
import { TimeOffAnswers } from "./TimeOffAnswers";

// Time off rebuild D3: Requests → Time off with the new time off. The list, the answer drawer, the approve
// window, the two-click decline, and what the drawer says when the answer does not go through.

configure({ asyncUtilTimeout: 5000 });
const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const api = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("../lib/supabase", () => ({ supabaseClient: {}, apiRequest: api.apiRequest }));

function view(overrides: Partial<TimeOffDeciderView>): TimeOffDeciderView {
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
    added_by_name: null,
    employee_id: "735032ec-0e98-4fb1-8005-c4ede5b1726b",
    employee_name: "Alex Kim",
    location_names: ["Downtown", "Midtown"],
    shifts_opened: 0,
    ...overrides,
  };
}
const wedding = view({});
const dentist = view({
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
  employee_name: "Sam Lee",
  decided_at: "2026-10-21T17:00:00+00:00",
  decided_by_name: "Rachel Adams",
  decision_note: "Covered by Jo.",
  shifts_opened: 1,
});
// D4: Sam asks to cancel his approved time off.
const cancelAsk = view({
  id: "98020000-0000-4000-8000-000000000009",
  kind: "cancel",
  cancels_id: dentist.id,
  kind_of_leave: "personal",
  starts_at: dentist.starts_at,
  ends_at: dentist.ends_at,
  all_day: false,
  start_date: "2026-10-27",
  end_date: "2026-10-27",
  start_time: "13:00",
  end_time: "18:00",
  note: "My appointment moved.",
  employee_name: "Sam Lee",
  created_at: "2026-10-22T15:00:00+00:00",
});
const page: TimeOffRequestsPage = { total: 2, waiting: 1, page: 1, page_size: 50, time_format: "12h", locations: [], requests: [wedding, dentist] };
const shift = {
  id: "22000000-0000-4000-8000-000000000004",
  scheduled_date: "2026-11-13",
  start_time: "09:00",
  end_time: "15:00",
  job_name: "Server",
  starts_at: "2026-11-13T17:00:00+00:00",
  ends_at: "2026-11-13T23:00:00+00:00",
  timezone: "America/Los_Angeles",
};
const impact: TimeOffImpact = {
  request: wedding,
  fingerprint: "11611d0e7f9542616aa542c39e615471",
  shift_count: 3,
  hidden_shift_count: 1,
  locations: [
    { location_id: "11000000-0000-4000-8000-000000000001", location_name: "Downtown", shifts: [shift, { ...shift, id: "22000000-0000-4000-8000-000000000005", scheduled_date: "2026-11-14", starts_at: "2026-11-14T17:00:00+00:00" }] },
  ],
};

type Routes = {
  list?: (path: string) => unknown;
  impact?: () => unknown;
  answer?: (body: unknown) => unknown;
  answerCancel?: (body: unknown) => unknown;
  takeBack?: (body: unknown) => unknown;
};
function answerWith(routes: Routes) {
  api.apiRequest.mockImplementation(async (_client: unknown, path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (path.endsWith("/impact")) return (routes.impact ?? (() => impact))();
    if (path.endsWith("/answer-cancellation")) return (routes.answerCancel ?? (() => ({ ...cancelAsk, status: "approved", revision: 2, decided_by_name: "Rachel Adams" })))(body);
    if (path.endsWith("/take-back")) return (routes.takeBack ?? (() => ({ ...dentist, status: "revoked", revision: 3, ended_by_name: "Rachel Adams", ended_note: body.note })))(body);
    if (path.endsWith("/answer")) return (routes.answer ?? (() => ({ ...wedding, status: "approved", revision: 2, decided_by_name: "Rachel Adams", shifts_opened: 3 })))(body);
    if (path.includes("/time-off-requests")) return (routes.list ?? (() => page))(path);
    throw new Error(`unexpected ${path}`);
  });
}

function Harness({ initial = "" }: { initial?: string }) {
  const [selected, setSelected] = useState(initial);
  const [current, setCurrent] = useState(1);
  return (
    <TimeOffAnswers
      workspaceId={workspaceId}
      timeFormat="12h"
      locationId=""
      search=""
      page={current}
      pageSize={50}
      onPageChange={setCurrent}
      onPageSizeChange={() => setCurrent(1)}
      selectedId={selected}
      onSelect={setSelected}
    />
  );
}
function renderIt(initial = "") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness initial={initial} />
    </QueryClientProvider>,
  );
}
const posts = () =>
  api.apiRequest.mock.calls.filter(([, path, init]) => String(path).endsWith("/answer") && (init as RequestInit | undefined)?.method === "POST");
const bodyOf = (call: unknown[]) => JSON.parse(String((call[2] as RequestInit).body));

const cancelPosts = (suffix: string) =>
  api.apiRequest.mock.calls.filter(([, path, init]) => String(path).endsWith(suffix) && (init as RequestInit | undefined)?.method === "POST");

describe("Requests → Time off (new)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-22T16:30:00Z"));
    api.apiRequest.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("lists each request as one sentence with its status, waiting first", async () => {
    answerWith({});
    renderIt();
    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      "Time offAlex Kim asks for vacation, Nov 13–16Needs decisionNov 13, 12:00 AMPacific Time",
      "Time offSam Lee asks for personal time off, Oct 27, 1:00 PM to 6:00 PMApproved—No expiry",
    ]);
    expect(api.apiRequest.mock.calls[0]![1]).toBe(`/v1/workspaces/${workspaceId}/time-off-requests?view=all&sort=needs_decision&page=1&page_size=50`);
  });

  it("opens a waiting request with its shifts location by location", async () => {
    answerWith({});
    renderIt();
    fireEvent.click(await screen.findByRole("row", { name: /Alex Kim/ }));
    const dialog = screen.getByRole("dialog", { name: "Review time off" });
    expect(within(dialog).getByRole("heading", { level: 2 }).textContent).toBe("Alex Kim Vacation Needs decision");
    expect(within(dialog).getByText("Fri, Nov 13 to Mon, Nov 16")).toBeTruthy();
    expect(within(dialog).getByText("My sister's wedding in Portland.")).toBeTruthy();
    fireEvent.click(await within(dialog).findByRole("tab", { name: "Shifts 3" }));
    expect(within(dialog).getByText("Downtown")).toBeTruthy();
    expect(within(dialog).getAllByText(/9:00 AM–3:00 PM/)).toHaveLength(2);
    expect(within(dialog).getByText("1 more at a location whose schedule you don't see.")).toBeTruthy();
  });

  it("asks before an approval that opens shifts, then says what happened in the drawer", async () => {
    answerWith({});
    renderIt();
    fireEvent.click(await screen.findByRole("row", { name: /Alex Kim/ }));
    const dialog = screen.getByRole("dialog", { name: "Review time off" });
    await within(dialog).findByText("Approving opens 3 shifts.");
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Note to Alex/ }), { target: { value: " Have fun " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
    const confirm = screen.getByRole("alertdialog", { name: "Approve time off?" });
    expect(within(confirm).getByText("3 shifts go to open shifts.")).toBeTruthy();
    expect(posts()).toHaveLength(0);
    fireEvent.click(within(confirm).getByRole("button", { name: "Approve" }));
    expect(await within(dialog).findByText("Approved. 3 shifts went to open shifts.")).toBeTruthy();
    expect(bodyOf(posts()[0]!)).toEqual({ verdict: "approve", note: "Have fun", expected_revision: 1, expected_impact: impact.fingerprint });
    expect(within(dialog).getByRole("heading", { level: 2 }).textContent).toBe("Alex Kim Vacation Approved");
    expect(within(dialog).queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("approves at once when no shift opens", async () => {
    answerWith({ impact: () => ({ ...impact, shift_count: 0, hidden_shift_count: 0, locations: [] }), answer: () => ({ ...wedding, status: "approved", revision: 2 }) });
    renderIt();
    fireEvent.click(await screen.findByRole("row", { name: /Alex Kim/ }));
    const dialog = screen.getByRole("dialog", { name: "Review time off" });
    await within(dialog).findByText("No shift opens.");
    fireEvent.click(within(dialog).getByRole("tab", { name: "Shifts" }));
    expect(within(dialog).getByText("No published shifts in these days.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
    expect(await within(dialog).findByText("Approved.")).toBeTruthy();
    expect(screen.queryByRole("alertdialog", { name: "Approve time off?" })).toBeNull();
  });

  it("declines with two clicks and an optional note", async () => {
    answerWith({ answer: () => ({ ...wedding, status: "declined", revision: 2, decision_note: null }) });
    renderIt();
    fireEvent.click(await screen.findByRole("row", { name: /Alex Kim/ }));
    const dialog = screen.getByRole("dialog", { name: "Review time off" });
    await within(dialog).findByText("Approving opens 3 shifts.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Decline" }));
    expect(posts()).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm decline" }));
    expect(await within(dialog).findByText("Declined.")).toBeTruthy();
    expect(bodyOf(posts()[0]!)).toEqual({ verdict: "decline", note: null, expected_revision: 1, expected_impact: null });
  });

  it("reads the request again when it changed, and says so", async () => {
    let impacts = 0;
    answerWith({
      impact: () => {
        impacts += 1;
        return impact;
      },
      answer: () => {
        throw new RequestError("The shifts this time off opens changed", "time_off.changed", undefined, 409);
      },
    });
    renderIt();
    fireEvent.click(await screen.findByRole("row", { name: /Alex Kim/ }));
    const dialog = screen.getByRole("dialog", { name: "Review time off" });
    await within(dialog).findByText("Approving opens 3 shifts.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
    fireEvent.click(within(screen.getByRole("alertdialog", { name: "Approve time off?" })).getByRole("button", { name: "Approve" }));
    expect(await within(dialog).findByText("This request changed. Review it again.")).toBeTruthy();
    await waitFor(() => expect(impacts).toBeGreaterThan(1));
    expect(within(dialog).getByRole("button", { name: "Approve" })).toBeTruthy();
  });

  it.each([
    ["authz.rank", "You can't answer your own time off request."],
    ["authz.document_blocked", "Add your missing documents before you answer requests."],
    ["time_off.not_pending", "This request already has an answer."],
    ["time_off.not_found", "This request is no longer available."],
    [undefined, "Couldn't save your answer. Try again."],
  ] as const)("says why an answer with %s did not go through", async (reason, text) => {
    answerWith({
      answer: () => {
        throw new RequestError("Refused", reason, undefined, reason?.startsWith("authz") ? 403 : 409);
      },
    });
    renderIt();
    fireEvent.click(await screen.findByRole("row", { name: /Alex Kim/ }));
    const dialog = screen.getByRole("dialog", { name: "Review time off" });
    await within(dialog).findByText("Approving opens 3 shifts.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Decline" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm decline" }));
    expect(await within(dialog).findByText(text)).toBeTruthy();
  });

  it("shows an answered request with who answered and the note, without buttons", async () => {
    answerWith({});
    renderIt();
    fireEvent.click(await screen.findByRole("row", { name: /Sam Lee/ }));
    const dialog = screen.getByRole("dialog", { name: "Review time off" });
    expect(within(dialog).getByText("Approved by Rachel Adams, Oct 21")).toBeTruthy();
    expect(within(dialog).getByText("Covered by Jo.")).toBeTruthy();
    expect(within(dialog).getByText("1 shift went to open shifts.")).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("lists time off a manager added as added, not asked, and says who added it (D5)", async () => {
    const added = { ...dentist, added_by_name: "Rachel Adams", note: "Doctor's note on file.", created_at: "2026-10-21T17:00:00+00:00" };
    answerWith({ list: () => ({ ...page, requests: [wedding, added] }) });
    renderIt();
    fireEvent.click(await screen.findByRole("row", { name: /Sam Lee has personal time off, added by Rachel Adams, Oct 27/ }));
    const dialog = screen.getByRole("dialog", { name: "Review time off" });
    expect(within(dialog).getByText("Added by Rachel Adams, Oct 21")).toBeTruthy();
    expect(within(dialog).queryByText(/Approved by/)).toBeNull();
    expect(within(dialog).getByText("Added")).toBeTruthy();
    expect(within(dialog).getByText("Rachel Adams's note")).toBeTruthy();
  });

  it("opens a linked request the page does not list", async () => {
    const linked = view({ id: "98020000-0000-4000-8000-000000000009", employee_name: "Jo Park" });
    answerWith({
      list: (path) => (path.includes("request_id=") ? { ...page, total: 1, requests: [linked] } : page),
      impact: () => ({ ...impact, request: linked }),
    });
    renderIt(linked.id);
    const dialog = await screen.findByRole("dialog", { name: "Review time off" });
    expect(within(dialog).getByRole("heading", { level: 2 }).textContent).toContain("Jo Park");
  });

  it("says when nothing is there, and when the list could not load", async () => {
    answerWith({ list: () => ({ ...page, total: 0, waiting: 0, requests: [] }) });
    const empty = renderIt();
    expect(await screen.findByText("No time off requests match these filters.")).toBeTruthy();
    empty.unmount();
    answerWith({ list: () => { throw new RequestError("Workspace operation failed", undefined, undefined, 500); } });
    renderIt();
    expect(await screen.findByText("We couldn't load time off requests")).toBeTruthy();
  });

  // D4 (KARARLAR S-239 (4), (6)): a cancellation is answered like time off; approved time off is revoked
  // with a note.
  it("lists a cancellation as one sentence and answers it without reading shifts", async () => {
    answerWith({ list: () => ({ ...page, total: 3, waiting: 2, requests: [cancelAsk, wedding, dentist] }) });
    renderIt();
    const table = await screen.findByRole("table");
    const first = within(table).getAllByRole("row")[1]!;
    expect(first.textContent).toContain("Sam Lee asks to cancel time off, Oct 27, 1:00 PM to 6:00 PM");
    expect(within(first).getByText("Needs decision")).toBeTruthy();
    fireEvent.click(first);
    const drawer = await screen.findByRole("dialog", { name: "Review time off" });
    expect(within(drawer).getByText("Cancel time off")).toBeTruthy();
    expect(within(drawer).getByText("My appointment moved.")).toBeTruthy();
    expect(within(drawer).getByText("Approving removes the rest of this time off.")).toBeTruthy();
    expect(api.apiRequest.mock.calls.some(([, path]) => String(path).endsWith("/impact"))).toBe(false);
    fireEvent.click(within(drawer).getByRole("button", { name: "Approve" }));
    const confirm = screen.getByRole("alertdialog", { name: "Cancel Sam's time off?" });
    expect(within(confirm).getByText("The rest of the time off is removed. Shifts that went to open shifts stay open.")).toBeTruthy();
    expect(cancelPosts("/answer-cancellation")).toHaveLength(0);
    fireEvent.click(within(confirm).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(cancelPosts("/answer-cancellation")).toHaveLength(1));
    const [, path] = cancelPosts("/answer-cancellation")[0]!;
    expect(path).toBe(`/v1/workspaces/${workspaceId}/time-off-requests/${cancelAsk.id}/answer-cancellation`);
    expect(bodyOf(cancelPosts("/answer-cancellation")[0]!)).toEqual({ verdict: "approve", note: null, expected_revision: 1 });
    expect(await within(drawer).findByText("Approved. The rest of the time off is removed.")).toBeTruthy();
  });

  it("declines a cancellation with two clicks and a note", async () => {
    answerWith({
      list: () => ({ ...page, requests: [cancelAsk] }),
      answerCancel: (body) => ({ ...cancelAsk, status: "declined", revision: 2, decided_by_name: "Rachel Adams", decision_note: (body as { note: string }).note }),
    });
    renderIt(cancelAsk.id);
    const drawer = await screen.findByRole("dialog", { name: "Review time off" });
    fireEvent.change(within(drawer).getByRole("textbox", { name: /Note to Sam/ }), { target: { value: "We need you that day." } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Decline" }));
    expect(cancelPosts("/answer-cancellation")).toHaveLength(0);
    fireEvent.click(within(drawer).getByRole("button", { name: "Confirm decline" }));
    await waitFor(() => expect(cancelPosts("/answer-cancellation")).toHaveLength(1));
    expect(bodyOf(cancelPosts("/answer-cancellation")[0]!)).toEqual({ verdict: "decline", note: "We need you that day.", expected_revision: 1 });
    expect(await within(drawer).findByText("Declined. The time off stays.")).toBeTruthy();
  });

  it("revokes approved time off only with a note, with two clicks", async () => {
    answerWith({ impact: () => ({ ...impact, request: dentist, shift_count: 0, hidden_shift_count: 0, locations: [] }) });
    renderIt(dentist.id);
    const drawer = await screen.findByRole("dialog", { name: "Review time off" });
    const revoke = within(drawer).getByRole("button", { name: "Revoke" }) as HTMLButtonElement;
    expect(revoke.disabled).toBe(true);
    expect(within(drawer).getByText("Only what has not started is removed. Shifts that went to open shifts stay open.")).toBeTruthy();
    fireEvent.change(within(drawer).getByRole("textbox", { name: /Why are you revoking it\?/ }), { target: { value: " Inventory day " } });
    expect(revoke.disabled).toBe(false);
    fireEvent.click(revoke);
    expect(cancelPosts("/take-back")).toHaveLength(0);
    fireEvent.click(within(drawer).getByRole("button", { name: "Confirm revoke" }));
    await waitFor(() => expect(cancelPosts("/take-back")).toHaveLength(1));
    const [, path] = cancelPosts("/take-back")[0]!;
    expect(path).toBe(`/v1/workspaces/${workspaceId}/time-off-requests/${dentist.id}/take-back`);
    expect(bodyOf(cancelPosts("/take-back")[0]!)).toEqual({ note: "Inventory day", expected_revision: 1 });
    expect(await within(drawer).findByText("Revoked. Sam is told.")).toBeTruthy();
  });

  it("says a cancellation waits on approved time off, and reads revoked time off", async () => {
    const revoked = view({ ...dentist, id: "98020000-0000-4000-8000-000000000003", status: "revoked", ended_at: "2026-10-22T15:00:00+00:00", ended_by_name: "Rachel Adams",
      ended_note: "Inventory day" });
    const asked = { ...dentist, cancellation: { id: cancelAsk.id, status: "pending" as const, note: "My appointment moved.",
      revision: 1, created_at: cancelAsk.created_at, decided_at: null, decided_by_name: null, decision_note: null } };
    answerWith({
      list: () => ({ ...page, requests: [asked, revoked] }),
      impact: () => ({ ...impact, request: asked, shift_count: 0, hidden_shift_count: 0, locations: [] }),
    });
    renderIt(dentist.id);
    const drawer = await screen.findByRole("dialog", { name: "Review time off" });
    expect(within(drawer).getByText("Sam asked to cancel this time off. Answer it in the list.")).toBeTruthy();
    fireEvent.click(within(drawer).getByRole("button", { name: "Close details" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows.some((row) => /Revoked/.test(row.textContent ?? ""))).toBe(true);
  });

  it("says why a revoke did not go through", async () => {
    answerWith({
      impact: () => ({ ...impact, request: dentist, shift_count: 0, hidden_shift_count: 0, locations: [] }),
      takeBack: () => {
        throw new RequestError("This time off changed", "time_off.changed", undefined, 409);
      },
    });
    renderIt(dentist.id);
    const drawer = await screen.findByRole("dialog", { name: "Review time off" });
    fireEvent.change(within(drawer).getByRole("textbox", { name: /Why are you revoking it\?/ }), { target: { value: "Inventory day" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Revoke" }));
    fireEvent.click(within(drawer).getByRole("button", { name: "Confirm revoke" }));
    expect(await within(drawer).findByText("This time off changed. Review it again.")).toBeTruthy();
  });
});
