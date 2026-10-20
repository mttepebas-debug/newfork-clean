import type { MyLineups } from "@newfork/shared";
import { configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "../lib/supabase";
import { LINEUP_BUSY_MS } from "../schedule/lineup";
import { dinner, downtown, hannah, lunch, maria, model, server, shift, uptown, ws } from "../schedule/lineup.testing";
import { getEmployeeScheduleBoard } from "./employee-hub-data";
import { EmployeeLineup } from "./EmployeeLineup";

// The employee's Lineup (KARARLAR 2026-10-17, E's employee screen): her ticket, Team · Notes, Acknowledge.

vi.mock("../lib/supabase", async (original) => ({ ...(await original<object>()), supabaseClient: {}, apiRequest: vi.fn() }));
vi.mock("./employee-hub-data", async (original) => ({ ...(await original<object>()), getEmployeeScheduleBoard: vi.fn() }));
vi.mock("../lib/today", async (original) => ({ ...(await original<object>()), todayIn: () => "2026-10-13" }));

// The day wheel carries a few hundred day buttons: a role query over them is slow on a busy machine.
configure({ asyncUtilTimeout: 5000 });

const api = vi.mocked(apiRequest);
const board = vi.mocked(getEmployeeScheduleBoard);
const versionId = "90000000-0000-4000-8000-000000000001";
const row = {
  start_time: "16:00", end_time: "22:00", crosses_midnight: false, job_name: "Server", job_color: "#2255ee",
  section_name: "Patio", label_names: ["Closer"], called_off: false, art_key: null as MyLineups["lineups"][number]["mine"][number]["art_key"],
};

function mine(overrides: Partial<MyLineups["lineups"][number]> = {}): MyLineups {
  return {
    workspace_id: ws,
    date: "2026-10-13",
    lineups: [{
      id: "91000000-0000-4000-8000-000000000001",
      version_id: versionId,
      version: 1,
      location: { id: "20000000-0000-4000-8000-000000000001", name: "Downtown", timezone: "America/Los_Angeles" },
      shift_type_id: dinner,
      shift_type_name: "Dinner",
      color: "#5b4bd6",
      shared_at: "2026-10-13T21:10:00+00:00",
      ask_ack: true,
      acknowledged_at: null,
      notes: { specials: "Halibut", n86: "", shift_notes: "" },
      mine: [{ ...row, replaced: false }],
      team: [
        { ...row, employee_id: maria, name: "Maria Lopez", department_name: "Front of House", is_me: true },
        { ...row, section_name: null, label_names: [], employee_id: hannah, name: "Hannah Lee", department_name: "Front of House", is_me: false },
      ],
      ...overrides,
    }],
  };
}

let answer: MyLineups;
const acknowledged: string[] = [];

function Where() {
  return <div data-testid="where">{useLocation().search}</div>;
}

// The hub's part: the day is the address's ?date=, today without one.
function Page() {
  const date = new URLSearchParams(useLocation().search).get("date") ?? "2026-10-13";
  return <EmployeeLineup workspaceId={ws} employeeId={maria} date={date} timeFormat="12h" />;
}

function renderLineup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/employee-hub/schedule/lineup"]}>
        <Page />
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const reduce = window.matchMedia;
afterEach(() => {
  window.matchMedia = reduce;
});

beforeEach(() => {
  // Reduced motion: the wheel jumps instead of spinning, so a test sees where it stops at once.
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  answer = mine();
  acknowledged.length = 0;
  api.mockReset();
  api.mockImplementation(async (_client, path) => {
    if (path.endsWith("/my-lineups/2026-10-13")) return answer;
    // Another day the wheel turns to: nothing published.
    const other = /\/my-lineups\/(\d{4}-\d{2}-\d{2})$/.exec(path);
    if (other) return { workspace_id: ws, date: other[1], lineups: [] };
    const ack = /\/lineups\/versions\/([^/]+)\/acknowledge$/.exec(path);
    if (ack) {
      acknowledged.push(ack[1]!);
      return { status: "saved", version_id: ack[1], acknowledged_at: "2026-10-13T22:00:00+00:00" };
    }
    throw new Error(`unexpected ${path}`);
  });
  board.mockReset();
  board.mockResolvedValue(model([]));
});

describe("EmployeeLineup", () => {
  // AVATAR-IKON slice 4: her circle and each teammate's draw the Lineup drawing; without one, the initials.
  it("draws her drawing on her ticket and each teammate's in the team, initials without one", async () => {
    answer = mine({
      mine: [{ ...row, art_key: "001-server", replaced: false }],
      team: [
        { ...row, art_key: "001-server", employee_id: maria, name: "Maria Lopez", department_name: "Front of House", is_me: true },
        { ...row, employee_id: hannah, name: "Hannah Lee", department_name: "Front of House", is_me: false },
      ],
    });
    renderLineup();
    const view = await screen.findByRole("region", { name: "Dinner lineup" });
    const stub = view.querySelector(".employee-lineup-avatar.is-large")!;
    await waitFor(() => expect(stub.querySelector("svg")).not.toBeNull(), { timeout: 15000 });
    expect(stub.textContent).toBe("");
    const team = within(view).getByRole("list", { name: "Server" });
    const circle = (name: string) => within(team).getByText(name).closest("li")!.querySelector(".employee-lineup-avatar")!;
    expect(circle("Maria Lopez").querySelector("svg")).not.toBeNull();
    expect(circle("Hannah Lee").textContent).toBe("HL");
    // Her position's colour still rings the circle.
    expect((circle("Hannah Lee") as HTMLElement).style.getPropertyValue("--job")).toBe("#2255ee");
  });

  it("shows her shift as a ticket and the whole team, her own row marked", async () => {
    renderLineup();
    const view = await screen.findByRole("region", { name: "Dinner lineup" });
    expect(within(view).getByText("4:00 PM – 10:00 PM", { selector: ".employee-lineup-time" })).toBeTruthy();
    expect(within(view).getByText("Server · Closer · Patio")).toBeTruthy();
    expect(within(view).getByRole("tab", { name: /^Team/ }).getAttribute("aria-selected")).toBe("true");
    const team = within(view).getByRole("list", { name: "Server" });
    const me = within(team).getByText("Maria Lopez").closest("li")!;
    expect(me.className).toBe("is-me");
    // Mert 2026-10-14 (PLAN §4): the green row alone marks her; no "You" label on screen.
    expect(within(me).queryByText("You")).toBeNull();
    expect(me.querySelector(".employee-lineup-you")).toBeNull();
    expect(me.querySelector(".sr-only")?.textContent).toBe("(you)");
    expect(within(team).getByText("Hannah Lee")).toBeTruthy();
  });

  // Mert 2026-10-17 (~8:35 AM): every shift type shows; only a published lineup she is on opens (its count is the
  // people on it); the others are grey, say why, and carry no count. Her lineups come from her own read, the
  // types from her schedule read.
  it("shows every shift type as a tab, only hers pressable, by start time", async () => {
    const [dinnerLineup] = mine().lineups;
    answer = {
      ...mine(),
      lineups: [
        dinnerLineup!,
        {
          ...dinnerLineup!,
          id: "91000000-0000-4000-8000-000000000003",
          version_id: "90000000-0000-4000-8000-000000000003",
          // A type the catalog no longer has: its tab still shows, by her start.
          shift_type_id: "30000000-0000-4000-8000-000000000009",
          shift_type_name: "Brunch",
          mine: [{ ...row, replaced: false, start_time: "09:00", end_time: "13:00" }],
        },
      ],
    };
    renderLineup();
    const group = await screen.findByRole("group", { name: "Shifts" });
    expect(group.closest(".lineup-shift-tabs")).toBeTruthy();
    const tabs = within(group).getAllByRole("button");
    expect(tabs.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Brunch, 2 people",
      "Lunch. You're not on a published Lunch lineup",
      "Dinner, 2 people",
    ]);
    const off = tabs[1] as HTMLButtonElement;
    expect(off.disabled).toBe(true);
    expect(off.className).toBe("is-off");
    expect(off.title).toBe("You're not on a published Lunch lineup");
    expect(off.querySelector("strong")).toBeNull();
    expect(tabs[0]!.getAttribute("aria-pressed")).toBe("true");
    expect(await screen.findByRole("region", { name: "Brunch lineup" })).toBeTruthy();
    fireEvent.click(off);
    expect(screen.getByRole("region", { name: "Brunch lineup" })).toBeTruthy();
    fireEvent.click(tabs[2]!);
    expect(await screen.findByRole("region", { name: "Dinner lineup" })).toBeTruthy();
  });

  // Called off, she is still on her lineup: its tab opens and the ticket says so (as before).
  it("keeps a lineup she is called off on pressable, and says she's called off", async () => {
    const [dinnerLineup] = mine().lineups;
    answer = {
      ...mine(),
      lineups: [
        {
          ...dinnerLineup!,
          mine: [{ ...row, replaced: false, called_off: true }],
          team: dinnerLineup!.team.map((member) => (member.is_me ? { ...member, called_off: true } : member)),
        },
      ],
    };
    renderLineup();
    const view = await screen.findByRole("region", { name: "Dinner lineup" });
    const tab = within(screen.getByRole("group", { name: "Shifts" })).getByRole("button", { name: "Dinner, 1 person" }) as HTMLButtonElement;
    expect(tab.disabled).toBe(false);
    expect(tab.getAttribute("aria-pressed")).toBe("true");
    expect(within(view).getByText("You're called off.")).toBeTruthy();
    expect(screen.queryByText(/^You're not on a lineup/)).toBeNull();
  });

  it("greys every shift tab over the calm card when she is on no published lineup", async () => {
    answer = { workspace_id: ws, date: "2026-10-13", lineups: [] };
    board.mockResolvedValue(model([shift({ employee: maria, job: server, type: dinner, start: "16:00", end: "22:00" })]));
    renderLineup();
    const calm = await screen.findByText("Your Dinner lineup isn't published yet");
    const group = screen.getByRole("group", { name: "Shifts" });
    const tabs = within(group).getAllByRole("button") as HTMLButtonElement[];
    expect(tabs.map((button) => [button.textContent, button.disabled])).toEqual([
      ["Lunch", true],
      ["Dinner", true],
    ]);
    expect(group.compareDocumentPosition(calm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("moves between Team and Notes with the arrow keys, one tab stop", async () => {
    renderLineup();
    const team = await screen.findByRole("tab", { name: /^Team/ });
    const notes = screen.getByRole("tab", { name: /^Notes/ });
    expect([team.tabIndex, notes.tabIndex]).toEqual([0, -1]);
    team.focus();
    fireEvent.keyDown(team, { key: "ArrowRight" });
    expect(notes.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(notes);
    expect([team.tabIndex, notes.tabIndex]).toEqual([-1, 0]);
    fireEvent.keyDown(notes, { key: "ArrowRight" });
    expect(document.activeElement).toBe(team);
    fireEvent.keyDown(team, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(notes);
  });

  it("reads the notes", async () => {
    renderLineup();
    fireEvent.click(await screen.findByRole("tab", { name: /^Notes/ }));
    expect(screen.getByText("Specials")).toBeTruthy();
    expect(screen.getByText("Halibut")).toBeTruthy();
  });

  it("acknowledges once: the button goes and says so", async () => {
    renderLineup();
    fireEvent.click(await screen.findByRole("button", { name: "Acknowledge" }));
    expect((await screen.findByRole("status")).textContent).toBe("Acknowledged.");
    expect(screen.queryByRole("button", { name: "Acknowledge" })).toBeNull();
    expect(acknowledged).toEqual([versionId]);
  });

  // Mert 2026-10-17 (~1:45–1:50 PM): the button says what it does, a spinner and "Acknowledging…", then
  // "Acknowledged." comes in where it was, its check popping in; no notice. Even a quick answer holds a moment.
  it("works inside the Acknowledge button, then slides Acknowledged. in where it was", async () => {
    renderLineup();
    const button = await screen.findByRole("button", { name: "Acknowledge" });
    button.focus();
    fireEvent.click(button);
    const pressed = Date.now();
    const working = screen.getByRole("button", { name: "Acknowledging…" }) as HTMLButtonElement;
    // Off while it works, but it keeps the keyboard's focus: aria-disabled and busy, not disabled.
    expect(working).toBe(button);
    expect(working.getAttribute("aria-disabled")).toBe("true");
    expect(working.getAttribute("aria-busy")).toBe("true");
    expect(document.activeElement).toBe(working);
    expect(working.querySelector(".employee-lineup-spin")?.getAttribute("aria-hidden")).toBe("true");
    // A second press while it works sends nothing more.
    fireEvent.click(working);
    const done = await screen.findByRole("status");
    // The answer is quick here; the button still holds LINEUP_BUSY_MS so its words can be read.
    expect(Date.now() - pressed).toBeGreaterThanOrEqual(LINEUP_BUSY_MS - 20);
    expect(done.textContent).toBe("Acknowledged.");
    expect(done.classList.contains("is-in")).toBe(true);
    expect(acknowledged).toEqual([versionId]);
    // The button went: focus waits on the ticket's fold, not on the page.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Hide team and notes" }));
  });

  it("gives Acknowledge back with a line under it when it didn't go through", async () => {
    const real = api.getMockImplementation()!;
    api.mockImplementation(async (client, path, init) => {
      if (path.endsWith("/acknowledge")) throw new Error("offline");
      return real(client, path, init);
    });
    renderLineup();
    fireEvent.click(await screen.findByRole("button", { name: "Acknowledge" }));
    expect(await screen.findByText("It didn't go through. Check your connection, then try again.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Acknowledge" }) as HTMLButtonElement).disabled).toBe(false);
  });

  // Mert 2026-10-17 (~9:10 AM): a tap on the ticket folds that lineup's Team · Notes; the ticket and Acknowledge stay.
  it("folds Team · Notes from a tap on the ticket or its chevron; the ticket and Acknowledge stay", async () => {
    renderLineup();
    const view = await screen.findByRole("region", { name: "Dinner lineup" });
    const chevron = within(view).getByRole("button", { name: "Hide team and notes" });
    expect(chevron.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(view.querySelector(".employee-lineup-time")!);
    expect(within(view).queryByRole("tablist")).toBeNull();
    expect(within(view).queryByRole("tabpanel")).toBeNull();
    expect(view.querySelector(".employee-lineup-ticket")).toBeTruthy();
    expect(within(view).getByRole("button", { name: "Acknowledge" })).toBeTruthy();
    const show = within(view).getByRole("button", { name: "Show team and notes" });
    expect(show.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(show);
    expect(within(view).getByRole("tablist")).toBeTruthy();
    expect(within(view).getByRole("button", { name: "Hide team and notes" })).toBeTruthy();
  });

  it("has no Acknowledge when staff were not asked, or once she has", async () => {
    answer = mine({ ask_ack: false });
    renderLineup();
    await screen.findByRole("region", { name: "Dinner lineup" });
    expect(screen.queryByRole("button", { name: "Acknowledge" })).toBeNull();
  });

  it("says her lineup isn't published yet when she works that day", async () => {
    answer = { workspace_id: ws, date: "2026-10-13", lineups: [] };
    board.mockResolvedValue(model([shift({ employee: maria, job: server, type: dinner, start: "16:00", end: "22:00" })]));
    renderLineup();
    expect(await screen.findByText("Your Dinner lineup isn't published yet")).toBeTruthy();
    expect(screen.getByText("You'll get a notification when it is.")).toBeTruthy();
  });

  it("says she isn't on a lineup when she doesn't work that day", async () => {
    answer = { workspace_id: ws, date: "2026-10-13", lineups: [] };
    board.mockResolvedValue(model([]));
    renderLineup();
    expect(await screen.findByText("You're not on a lineup today")).toBeTruthy();
  });
  // Mert 2026-10-17 (~8:30 AM): no heading; the shift tabs, then her ticket (location, date, in – out, position ·
  // label · section), then Team · Notes; the ticket stays over both tabs.
  it("puts her ticket under the shift tabs and over Team · Notes, location and date inside it", async () => {
    renderLineup();
    const view = await screen.findByRole("region", { name: "Dinner lineup" });
    expect(within(view).queryByRole("heading", { name: "Downtown" })).toBeNull();
    const ticket = view.querySelector(".employee-lineup-ticket")!;
    const after = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(after(screen.getByRole("group", { name: "Shifts" }), ticket)).toBe(true);
    expect(after(ticket, within(view).getByRole("tablist"))).toBe(true);
    expect([...ticket.querySelectorAll(".employee-lineup-ticket-body > p")].map((p) => p.textContent)).toEqual([
      "Downtown",
      "Tuesday, October 13",
      "4:00 PM – 10:00 PM",
      "Server · Closer · Patio",
    ]);
    expect(within(view).getByRole("tabpanel").contains(ticket)).toBe(false);
    fireEvent.click(within(view).getByRole("tab", { name: /^Notes/ }));
    expect(view.querySelector(".employee-lineup-ticket")).toBeTruthy();
    expect(within(view).getByRole("tabpanel").textContent).toContain("Halibut");
  });

  // Mert 2026-10-17 (~8:30 AM): a time changed since the Schedule loops old → new on the changed end only; a
  // screen reader hears one sentence instead.
  it("shows a time changed since the Schedule, the changed end animated and one sentence for screen readers", async () => {
    answer = mine({ mine: [{ ...row, replaced: false, start_time: "16:30" }] });
    board.mockResolvedValue(model([shift({ employee: maria, job: server, type: dinner, start: "16:00", end: "22:00" })]));
    renderLineup();
    const view = await screen.findByRole("region", { name: "Dinner lineup" });
    const time = await waitFor(() => {
      const element = view.querySelector(".employee-lineup-time.is-changed");
      expect(element).toBeTruthy();
      return element!;
    });
    const swaps = time.querySelectorAll(".employee-lineup-swap");
    expect(swaps).toHaveLength(1);
    expect(swaps[0]!.getAttribute("aria-hidden")).toBe("true");
    expect(swaps[0]!.querySelector(".employee-lineup-old")!.textContent).toBe("4:00 PM");
    expect(swaps[0]!.querySelector(".employee-lineup-new")!.textContent).toBe("4:30 PM");
    expect(time.querySelector(".sr-only")!.textContent).toBe("4:30 PM – 10:00 PM, changed today, was 4:00 PM – 10:00 PM");
    expect(time.textContent).not.toContain("Changed today");
  });

  // S-178 madde 3 and ek 2 (LINEUP-EDIT W2a): the orange dot and the hours worked against the Schedule are the
  // managers' marks; an employee's lineup has neither, nor anything that edits it.
  it("has none of the managers' marks: no orange dot, no hours difference, no pickers", async () => {
    answer = mine({ mine: [{ ...row, replaced: false, start_time: "15:00", end_time: "23:00" }] });
    board.mockResolvedValue(model([shift({ employee: maria, job: server, type: dinner, start: "16:00", end: "22:00" })]));
    renderLineup();
    const view = await screen.findByRole("region", { name: "Dinner lineup" });
    await waitFor(() => expect(view.querySelector(".employee-lineup-time.is-changed")).toBeTruthy());
    expect(document.querySelector(".lineup-phone-changed, .lineup-desk-change")).toBeNull();
    expect(view.textContent).not.toMatch(/[+−]\d+ h/);
    expect(screen.queryByRole("combobox", { name: /^(Position|Label|Section), / })).toBeNull();
    expect(screen.queryByRole("textbox", { name: /^(In|Out), / })).toBeNull();
    expect(screen.queryByRole("button", { name: "Manage sections" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit notes" })).toBeNull();
  });

  it("shows an unchanged time plain", async () => {
    board.mockResolvedValue(model([shift({ employee: maria, job: server, type: dinner, start: "16:00", end: "22:00" })]));
    renderLineup();
    const view = await screen.findByRole("region", { name: "Dinner lineup" });
    await waitFor(() => expect(board).toHaveBeenCalled());
    const time = view.querySelector(".employee-lineup-time")!;
    expect(time.className).toBe("employee-lineup-time");
    expect(time.textContent).toBe("4:00 PM – 10:00 PM");
    expect(time.querySelector(".employee-lineup-swap, .sr-only")).toBeNull();
  });

  // Mert 2026-10-17 (~7:10, ~7:20 AM): the manager's date row and day wheel, on her page too.
  it("turns the day with the wheel, the arrows and the date button, as the manager's does", async () => {
    renderLineup();
    await screen.findByRole("region", { name: "Dinner lineup" });
    const wheel = screen.getByRole("group", { name: "Day. Swipe or use the arrow keys." });
    expect(within(wheel).getByRole("button", { name: "Tuesday, October 13, 2026" }).getAttribute("aria-pressed")).toBe("true");
    const label = screen.getByRole("button", { name: "Tue, Oct 13" });
    expect(label.getAttribute("data-other-day")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("?date=2026-10-14"));
    expect(screen.getByRole("button", { name: "Wed, Oct 14" }).getAttribute("data-other-day")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Wed, Oct 14" }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe(""));
    fireEvent.click(within(wheel).getByRole("button", { name: "Thursday, October 15, 2026" }), { detail: 0 });
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("?date=2026-10-15"));
    fireEvent.keyDown(wheel, { key: "ArrowLeft" });
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("?date=2026-10-14"));
  });

  // Mert 2026-10-17 (~9:10 AM): with lineups at more than one place, the list starts with All locations, the
  // default: the shift tab stands for that shift at every place, each lineup one under the other.
  it("opens on All locations: her lineups of the shift at every place, one under the other", async () => {
    const [dinnerLineup] = mine().lineups;
    answer = {
      ...mine(),
      lineups: [
        dinnerLineup!,
        {
          ...dinnerLineup!,
          id: "91000000-0000-4000-8000-000000000002",
          version_id: "90000000-0000-4000-8000-000000000002",
          location: { id: uptown, name: "Uptown", timezone: "America/Los_Angeles" },
          mine: [{ ...row, replaced: false, start_time: "10:00", end_time: "14:00" }],
        },
      ],
    };
    renderLineup();
    const select = (await screen.findByRole("combobox", { name: "Location" })) as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent)).toEqual(["All locations", "Uptown", "Downtown"]);
    expect(select.value).toBe("");
    const views = await screen.findAllByRole("region", { name: /^Dinner lineup/ });
    expect(views.map((view) => view.getAttribute("aria-label"))).toEqual(["Dinner lineup, Uptown", "Dinner lineup, Downtown"]);
    expect(views.map((view) => view.querySelector(".employee-lineup-place")!.textContent)).toEqual(["Uptown", "Downtown"]);
    expect(within(screen.getByRole("group", { name: "Shifts" })).getByRole("button", { name: "Dinner, 4 people" }).getAttribute("aria-pressed")).toBe("true");
    // Each has its own tabs.
    const tabs = screen.getAllByRole("tab", { name: /^Team/ });
    expect(new Set(tabs.map((tab) => tab.id)).size).toBe(2);
    fireEvent.click(within(views[1]!).getByRole("tab", { name: /^Notes/ }));
    expect(within(views[1]!).getByRole("tabpanel").textContent).toContain("Halibut");
    expect(within(views[0]!).getByRole("tab", { name: /^Team/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("separator")).toBeTruthy();
    // One place picked: that one alone.
    fireEvent.change(select, { target: { value: downtown } });
    expect(await screen.findByRole("region", { name: "Dinner lineup" })).toBeTruthy();
    expect(screen.queryByRole("separator")).toBeNull();
  });

  it("says she isn't on that shift at a place she picked, and points to All locations", async () => {
    const [dinnerLineup] = mine().lineups;
    answer = {
      ...mine(),
      lineups: [
        dinnerLineup!,
        {
          ...dinnerLineup!,
          id: "91000000-0000-4000-8000-000000000002",
          version_id: "90000000-0000-4000-8000-000000000002",
          location: { id: uptown, name: "Uptown", timezone: "America/Los_Angeles" },
          shift_type_id: lunch,
          shift_type_name: "Lunch",
          mine: [{ ...row, replaced: false, start_time: "10:00", end_time: "14:00" }],
        },
      ],
    };
    renderLineup();
    const select = (await screen.findByRole("combobox", { name: "Location" })) as HTMLSelectElement;
    // All locations: Lunch first (it starts first), Dinner pressable too.
    expect(await screen.findByRole("region", { name: "Lunch lineup" })).toBeTruthy();
    fireEvent.click(within(screen.getByRole("group", { name: "Shifts" })).getByRole("button", { name: "Dinner, 2 people" }));
    expect(await screen.findByRole("region", { name: "Dinner lineup" })).toBeTruthy();
    fireEvent.change(select, { target: { value: uptown } });
    expect(await screen.findByText("You're not on a Dinner lineup at Uptown")).toBeTruthy();
    expect(screen.getByText("Pick All locations to see yours.")).toBeTruthy();
    expect(screen.queryByRole("region", { name: /lineup$/ })).toBeNull();
    fireEvent.change(select, { target: { value: "" } });
    expect(await screen.findByRole("region", { name: "Dinner lineup" })).toBeTruthy();
  });

  it("lists her lineups' locations; choosing one shows its lineup", async () => {
    const [dinnerLineup] = mine().lineups;
    answer = {
      ...mine(),
      lineups: [
        dinnerLineup!,
        {
          ...dinnerLineup!,
          id: "91000000-0000-4000-8000-000000000002",
          version_id: "90000000-0000-4000-8000-000000000002",
          location: { id: uptown, name: "Uptown", timezone: "America/Los_Angeles" },
          shift_type_id: lunch,
          shift_type_name: "Lunch",
          mine: [{ ...row, replaced: false, start_time: "10:00", end_time: "14:00" }],
        },
      ],
    };
    renderLineup();
    const select = await screen.findByRole("combobox", { name: "Location" });
    expect([...(select as HTMLSelectElement).options].map((option) => option.textContent)).toEqual(["All locations", "Uptown", "Downtown"]);
    fireEvent.change(select, { target: { value: uptown } });
    expect(await screen.findByRole("region", { name: "Lunch lineup" })).toBeTruthy();
    // One lineup at each location: that tab opens, the other type is grey.
    expect(within(screen.getByRole("group", { name: "Shifts" })).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Lunch, 2 people",
      "Dinner. You're not on a published Dinner lineup",
    ]);
    fireEvent.change(select, { target: { value: downtown } });
    expect(await screen.findByRole("region", { name: "Dinner lineup" })).toBeTruthy();
    expect(document.querySelector(".employee-lineup-place")!.textContent).toBe("Downtown");
  });

  it("keeps the location row on a day with no published lineup: where she works", async () => {
    answer = { workspace_id: ws, date: "2026-10-13", lineups: [] };
    board.mockResolvedValue(model([shift({ employee: maria, job: server, type: dinner, start: "16:00", end: "22:00" })]));
    renderLineup();
    await screen.findByText("Your Dinner lineup isn't published yet");
    const select = screen.getByRole("combobox", { name: "Location" });
    expect([...(select as HTMLSelectElement).options].map((option) => option.textContent)).toEqual(["Downtown"]);
  });
});
