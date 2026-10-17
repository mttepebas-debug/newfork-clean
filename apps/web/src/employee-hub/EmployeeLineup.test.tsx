import type { MyLineups } from "@newfork/shared";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "../lib/supabase";
import { dinner, hannah, maria, model, server, shift, ws } from "../schedule/lineup.testing";
import { getEmployeeScheduleBoard } from "./employee-hub-data";
import { EmployeeLineup } from "./EmployeeLineup";

// The employee's Lineup (KARARLAR 2026-10-17, E's employee screen): her ticket, Team · Notes, Acknowledge.

vi.mock("../lib/supabase", async (original) => ({ ...(await original<object>()), supabaseClient: {}, apiRequest: vi.fn() }));
vi.mock("./employee-hub-data", async (original) => ({ ...(await original<object>()), getEmployeeScheduleBoard: vi.fn() }));
vi.mock("../lib/today", async (original) => ({ ...(await original<object>()), todayIn: () => "2026-10-13" }));

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

function renderLineup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <EmployeeLineup workspaceId={ws} employeeId={maria} date="2026-10-13" timeFormat="12h" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  answer = mine();
  acknowledged.length = 0;
  api.mockReset();
  api.mockImplementation(async (_client, path) => {
    if (path.endsWith("/my-lineups/2026-10-13")) return answer;
    const ack = /\/lineups\/versions\/([^/]+)\/acknowledge$/.exec(path);
    if (ack) {
      acknowledged.push(ack[1]!);
      return { status: "saved", version_id: ack[1], acknowledged_at: "2026-10-13T22:00:00+00:00" };
    }
    throw new Error(`unexpected ${path}`);
  });
  board.mockReset();
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

  it("orders her lineups by start time, the same start by name", async () => {
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
    const group = await screen.findByRole("group", { name: "Your lineups" });
    expect(within(group).getAllByRole("button").map((button) => button.textContent)).toEqual(["Brunch", "Lunch", "Dinner"]);
    expect(within(group).getByRole("button", { name: "Brunch" }).getAttribute("aria-pressed")).toBe("true");
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
});
