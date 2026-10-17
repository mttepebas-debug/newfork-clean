import type { MyLineups } from "@newfork/shared";
import { configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "../lib/supabase";
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
  section_name: "Patio", label_names: ["Closer"], called_off: false,
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
      mine: [row],
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
  it("shows her shift as a ticket and the whole team, her own row marked", async () => {
    renderLineup();
    const view = await screen.findByRole("region", { name: "Dinner lineup" });
    expect(within(view).getByText("4:00 PM – 10:00 PM", { selector: ".employee-lineup-time" })).toBeTruthy();
    expect(within(view).getByText("Server · Patio · Closer")).toBeTruthy();
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

  // Mert 2026-10-17 (~7:30 AM): the manager's shift tabs, with her own lineups only (the read gives no other).
  it("shows her lineups as the shift tabs, by start time, the same start by name", async () => {
    const [dinnerLineup] = mine().lineups;
    const at = (id: string, name: string, start: string) => ({
      ...dinnerLineup!,
      id,
      shift_type_name: name,
      mine: [{ ...row, start_time: start }],
    });
    answer = {
      ...mine(),
      lineups: [
        at("91000000-0000-4000-8000-000000000001", "Dinner", "16:00"),
        at("91000000-0000-4000-8000-000000000002", "Lunch", "11:00"),
        at("91000000-0000-4000-8000-000000000003", "Brunch", "11:00"),
      ],
    };
    renderLineup();
    const group = await screen.findByRole("group", { name: "Shifts" });
    expect(within(group).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "Brunch, 2 people",
      "Lunch, 2 people",
      "Dinner, 2 people",
    ]);
    expect(group.closest(".lineup-shift-tabs")).toBeTruthy();
    expect(within(group).getByRole("button", { name: "Brunch, 2 people" }).getAttribute("aria-pressed")).toBe("true");
    // The tabs sit over the location and date head.
    const head = screen.getByRole("heading", { name: "Downtown" });
    expect(group.compareDocumentPosition(head) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(within(group).getByRole("button", { name: "Dinner, 2 people" }));
    expect(await screen.findByRole("region", { name: "Dinner lineup" })).toBeTruthy();
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
  // Mert 2026-10-17 (~7 AM, ~7:50 AM): the location and date, then her ticket, then Team · Notes; the ticket
  // stays over both tabs.
  it("puts the location and date, then her ticket, over Team · Notes", async () => {
    renderLineup();
    const view = await screen.findByRole("region", { name: "Dinner lineup" });
    const heading = within(view).getByRole("heading", { name: "Downtown" });
    const ticket = view.querySelector(".employee-lineup-ticket")!;
    const tabs = within(view).getByRole("tablist");
    const after = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(after(heading, ticket)).toBe(true);
    expect(after(ticket, tabs)).toBe(true);
    expect(within(view).getByText("Tuesday, October 13 · Dinner")).toBeTruthy();
    expect(within(view).getByRole("tabpanel").contains(ticket)).toBe(false);
    fireEvent.click(within(view).getByRole("tab", { name: /^Notes/ }));
    expect(view.querySelector(".employee-lineup-ticket")).toBeTruthy();
    expect(within(view).getByRole("tabpanel").textContent).toContain("Halibut");
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
          mine: [{ ...row, start_time: "10:00", end_time: "14:00" }],
        },
      ],
    };
    renderLineup();
    const select = await screen.findByRole("combobox", { name: "Location" });
    expect([...(select as HTMLSelectElement).options].map((option) => option.textContent)).toEqual(["Uptown", "Downtown"]);
    expect(await screen.findByRole("region", { name: "Lunch lineup" })).toBeTruthy();
    // One lineup at each location: one shift tab.
    expect(within(screen.getByRole("group", { name: "Shifts" })).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Lunch, 2 people",
    ]);
    fireEvent.change(select, { target: { value: downtown } });
    expect(await screen.findByRole("region", { name: "Dinner lineup" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Downtown" })).toBeTruthy();
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
