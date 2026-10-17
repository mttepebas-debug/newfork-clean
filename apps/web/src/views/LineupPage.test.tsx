import type { ActiveWorkspaceContext } from "@newfork/shared";
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RequestError } from "../lib/request-error";
import { getScheduleReadModel } from "../schedule/schedule-data";
import type { LineupDayLineup } from "@newfork/shared";
import { apiRequest } from "../lib/supabase";
import { chloe, day, dayRead, dinner, downtown, hannah, lunch, maria, model, server, shift, uptown, ws } from "../schedule/lineup.testing";
import { LineupPage } from "./LineupPage";

// Lineup, read-only first stage (Mert 2026-10-13): the day's live Schedule
// per location and shift, with the day picker and the two filters.

const context = {
  userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
  workspace: { id: ws, name: "Harbor & Vine" },
  membership: { role: "owner", status: "active", allLocations: true },
  permissions: ["schedule.read", "schedule.publish"],
  actions: ["schedule.read", "lineup.read", "lineup.share"],
} as unknown as ActiveWorkspaceContext;

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context }) }));
vi.mock("../lib/today", async (original) => ({ ...(await original<object>()), todayIn: () => "2026-10-13" }));
let phone = false;
vi.mock("../lib/usePhoneWidth", () => ({ usePhoneWidth: () => phone }));
vi.mock("../schedule/hooks/useScheduleRealtime", () => ({ useScheduleRealtime: () => undefined }));
vi.mock("../schedule/schedule-data", async (original) => ({
  ...(await original<object>()),
  getScheduleReadModel: vi.fn(),
}));

vi.mock("../lib/supabase", async (original) => ({ ...(await original<object>()), supabaseClient: {}, apiRequest: vi.fn() }));

// The phone page carries the day wheel's few hundred day buttons: a role query over them is slow on a busy
// machine, so a find waits longer than Testing Library's 1 s.
configure({ asyncUtilTimeout: 5000 });

const read = vi.mocked(getScheduleReadModel);
const api = vi.mocked(apiRequest);
// The world both reads answer from: the Schedule read gives the catalog, the lineup day read the rows.
let world = model([]);
let published: Record<string, Partial<LineupDayLineup>> = {};
const commands: unknown[] = [];
// Who read a lineup: per employee, when she acknowledged, or "no app".
let reads: Record<string, string | "no app"> = {};
function readers(read: ReturnType<typeof dayRead>) {
  for (const location of read.locations)
    for (const lineup of location.lineups)
      for (const row of lineup.rows) {
        const said = row.employee_id ? reads[row.employee_id] : undefined;
        if (said === "no app") Object.assign(row, { has_app: false });
        else if (said) Object.assign(row, { acknowledged_at: said });
      }
  return read;
}

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.search}</output>;
}

function renderPage(url = "/app/schedule/lineup") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="/app/schedule/lineup"
            element={
              <>
                <LineupPage />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  phone = false;
  published = {};
  reads = {};
  commands.length = 0;
  world = model([
    shift({ employee: maria, job: server, type: lunch, start: "11:00", end: "16:00", labels: ["Training"] }),
    shift({ employee: hannah, job: server, type: lunch, start: "11:00", end: "16:00", location: uptown }),
  ]);
  read.mockReset();
  read.mockImplementation(async () => world);
  api.mockReset();
  api.mockImplementation(async (_client, path, init) => {
    const dayPath = /\/lineups\/(\d{4}-\d{2}-\d{2})$/.exec(path);
    if (dayPath) return readers(dayRead(world, dayPath[1]!, published));
    if (path.endsWith("/lineups/commands")) {
      const body = JSON.parse(String(init?.body)) as { command_id: string; kind: string; lineups: { shift_type_id: string }[] };
      commands.push(body);
      return { command_id: body.command_id, kind: body.kind, lineups: [] };
    }
    throw new Error(`unexpected ${path}`);
  });
});

describe("LineupPage", () => {
  it("shows each location's shifts with who works, when and the label", async () => {
    renderPage();
    const downtownCard = await screen.findByRole("article", { name: "Downtown" });
    expect(read).toHaveBeenCalledWith(ws, day, "day");
    const lunchShift = within(downtownCard).getByRole("region", { name: "Lunch" });
    expect(within(lunchShift).getByText("1 person")).toBeTruthy();
    const row = within(lunchShift).getByText("Maria Lopez").closest("tr")!;
    expect(within(row).getByText("11:00 AM – 4:00 PM")).toBeTruthy();
    expect(within(row).getByText("Training")).toBeTruthy();
    // An empty shift stays as a short card.
    const dinnerShift = within(downtownCard).getByRole("region", { name: "Dinner" });
    expect(within(dinnerShift).getByText("No one is scheduled.")).toBeTruthy();
  });

  it("folds a shift from its header", async () => {
    renderPage();
    const downtownCard = await screen.findByRole("article", { name: "Downtown" });
    const header = within(downtownCard).getByRole("button", { name: /Lunch/ });
    fireEvent.click(header);
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(within(downtownCard).queryByText("Maria Lopez")).toBeNull();
  });

  it("moves day by day and lights the date when it is not today", async () => {
    renderPage();
    await screen.findByRole("article", { name: "Downtown" });
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    await waitFor(() => expect(read).toHaveBeenCalledWith(ws, "2026-10-14", "day"));
    expect(screen.getByTestId("where").textContent).toBe("?date=2026-10-14");
    const date = screen.getByRole("button", { name: "Wed, Oct 14" });
    expect(date.getAttribute("data-other-day")).toBe("true");
    fireEvent.click(date);
    expect(screen.getByTestId("where").textContent).toBe("");
  });

  it("filters by location and shift", async () => {
    renderPage(`/app/schedule/lineup?location=${downtown}&shift=${dinner}`);
    const card = await screen.findByRole("article", { name: "Downtown" });
    expect(screen.queryByRole("article", { name: "Uptown" })).toBeNull();
    expect(within(card).queryByRole("region", { name: "Lunch" })).toBeNull();
    expect(within(card).getByRole("region", { name: "Dinner" })).toBeTruthy();
  });

  it("shows a grey outline of the lineup while it loads, and says so once", async () => {
    read.mockReturnValue(new Promise(() => undefined));
    renderPage();
    const loading = screen.getByText("Loading lineups").closest("[role=status]") as HTMLElement;
    expect(loading.textContent).toBe("Loading lineups");
    expect(loading.querySelector(".lineup-location.lineup-outline")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Days of the week" })).toBeNull();
  });

  it("gives the load-error card and tries again from it", async () => {
    read.mockRejectedValueOnce(new RequestError("Down", "server_error", undefined, 500));
    renderPage("/app/schedule/lineup?date=2026-10-14");
    const card = await screen.findByRole("alert");
    expect(within(card).getByRole("heading", { name: "We couldn't load the lineup" })).toBeTruthy();
    expect(within(card).getByText("Wednesday, October 14 didn't load. Nothing was changed.")).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("article", { name: "Downtown" })).toBeTruthy();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("gives the one no-access card when the core says no", async () => {
    read.mockRejectedValue(new RequestError("Not allowed", "authz.out_of_scope", "schedule.read", 403));
    renderPage();
    expect(await screen.findByText("You don't have access to Lineup")).toBeTruthy();
    expect(screen.queryByText("We couldn't load the lineup")).toBeNull();
    // The card alone: no page title or date controls around it (Mert 2026-10-14).
    expect(screen.getAllByRole("heading")).toHaveLength(1);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

// LINEUP-PUBLISH-WEB: the Publish button and its window (Mert 2026-10-13, PLAN §3).
describe("LineupPage publishing", () => {
  it("counts the lineups waiting on the Publish button", async () => {
    renderPage();
    const button = await screen.findByRole("button", { name: "Publish, 2 lineups waiting" });
    expect(button.textContent).toContain("2");
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it("rests faded when there is nothing to publish or take back", async () => {
    world = model([]);
    renderPage();
    const button = await screen.findByRole("button", { name: "Publish" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("lists lineups by location with boxes, asks to acknowledge, and publishes the ticked ones", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Publish, 2 lineups waiting" }));
    const window = screen.getByRole("dialog", { name: "Publish lineups" });
    const downtownList = within(window).getByRole("region", { name: "Downtown" });
    const box = within(downtownList).getByRole("checkbox", { name: /Lunch/ });
    expect(box.getAttribute("aria-checked")).toBe("true");
    expect(within(window).getByRole("region", { name: "Uptown" })).toBeTruthy();
    // Untick Uptown: only Downtown goes.
    fireEvent.click(within(within(window).getByRole("region", { name: "Uptown" })).getByRole("checkbox", { name: /Lunch/ }));
    const ask = within(window).getByRole("switch", { name: "Ask staff to acknowledge" });
    expect(ask.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(ask);
    fireEvent.click(within(window).getByRole("button", { name: "Publish 1" }));
    await within(window).findByText("Published 1 lineup · 1 person notified");
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      kind: "share",
      ask_ack: false,
      lineups: [{ location_id: downtown, service_date: day, shift_type_id: lunch }],
    });
  });

  it("shows a published lineup green with its readers, and unpublishes it with two clicks", async () => {
    published = {
      [lunch]: { status: "shared", published: true, shared_at: "2026-10-13T21:10:00Z", ask_ack: true, acknowledged: 1, with_app: 1 },
    };
    renderPage();
    const downtownCard = await screen.findByRole("article", { name: "Downtown" });
    const lunchShift = within(downtownCard).getByRole("region", { name: "Lunch" });
    expect(within(lunchShift).getByText(/^Published /)).toBeTruthy();
    expect(within(lunchShift).getByText("Read 1/1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Publish/ }));
    const window = screen.getByRole("dialog", { name: "Publish lineups" });
    const downtownList = within(window).getByRole("region", { name: "Downtown" });
    expect(within(downtownList).queryByRole("checkbox")).toBeNull();
    const unpublish = within(downtownList).getByRole("button", { name: "Unpublish Lunch" });
    fireEvent.click(unpublish);
    expect(commands).toHaveLength(0);
    fireEvent.click(within(downtownList).getByRole("button", { name: /Unpublish Lunch\?/ }));
    await within(window).findByText("Unpublished. Staff can't see Lunch until you publish it again.");
    expect(commands[0]).toMatchObject({ kind: "unpublish", lineups: [{ location_id: downtown, shift_type_id: lunch }] });
  });

  it("opens who read a lineup from its Read count, and closes with a click outside or Escape", async () => {
    reads = { [maria]: "2026-10-13T21:40:00Z" };
    published = {
      [lunch]: { status: "shared", published: true, shared_at: "2026-10-13T21:10:00Z", ask_ack: true, acknowledged: 1, with_app: 1 },
    };
    renderPage();
    const downtownCard = await screen.findByRole("article", { name: "Downtown" });
    const count = within(downtownCard).getByRole("button", { name: "Read by 1 of 1 with the app" });
    fireEvent.click(count);
    const panel = screen.getByRole("dialog", { name: "Who read Lunch" });
    expect(document.activeElement).toBe(panel);
    expect(within(within(panel).getByRole("region", { name: "Read" })).getByText("Maria Lopez")).toBeTruthy();
    expect(within(panel).queryByRole("region", { name: "Not read yet" })).toBeNull();
    // Reading it does not fold the shift.
    expect(within(downtownCard).getByRole("button", { name: "Lunch, 1 person" }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog", { name: "Who read Lunch" })).toBeNull();
    fireEvent.click(count);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Who read Lunch" }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Who read Lunch" })).toBeNull();
    expect(document.activeElement).toBe(count);
  });

  it("says what a refused publish means, never the server's sentence", async () => {
    api.mockImplementation(async (_client, path) => {
      if (path.endsWith("/lineups/commands")) throw new RequestError("raw sentence", "lineup.one_day", undefined, 400);
      const dayPath = /\/lineups\/(\d{4}-\d{2}-\d{2})$/.exec(path);
      return dayRead(world, dayPath![1]!, published);
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Publish, 2 lineups waiting" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish 2" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Publish one day's lineups at a time.");
    expect(screen.queryByText("raw sentence")).toBeNull();
  });

  it("closes with Escape", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Publish, 2 lineups waiting" }));
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Publish lineups" }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Publish lineups" })).toBeNull();
  });

  it("takes focus into the window when it opens and gives it back to Publish when it closes", async () => {
    renderPage();
    const button = await screen.findByRole("button", { name: "Publish, 2 lineups waiting" });
    fireEvent.click(button);
    const window = screen.getByRole("dialog", { name: "Publish lineups" });
    expect(window.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.activeElement).toBe(button);
  });

  it("has no Publish for someone who can't publish", async () => {
    const actions = context.actions;
    (context as { actions: string[] }).actions = ["schedule.read", "lineup.read"];
    try {
      renderPage();
      await screen.findByRole("article", { name: "Downtown" });
      expect(screen.queryByRole("button", { name: /^Publish/ })).toBeNull();
    } finally {
      (context as { actions: readonly string[] }).actions = actions;
    }
  });
});

// Phone (Mert 2026-10-14, "B"): one location and one shift at a time; the
// shifts are tabs, a summary card on top, then the team.
describe("LineupPage on a phone", () => {
  beforeEach(() => {
    phone = true;
    world = (
      model([
        shift({ employee: maria, job: server, type: lunch, start: "11:00", end: "16:00", labels: ["Training"] }),
        shift({ employee: hannah, job: server, type: lunch, start: "11:00", end: "16:00", location: uptown }),
        shift({ employee: hannah, job: server, type: dinner, start: "16:00", end: "22:00", date: "2026-10-14" }),
      ])
    );
  });

  it("shows one location's shift as tabs, a summary and the team", async () => {
    renderPage("/app/schedule/lineup?date=2026-10-12");
    const tabs = await screen.findByRole("group", { name: "Shifts" });
    expect(within(tabs).getAllByRole("button").map((tab) => tab.getAttribute("aria-label"))).toEqual([
      "Lunch, no one",
      "Dinner, no one",
    ]);
    expect(screen.queryByRole("navigation", { name: "Days of the week" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Filter by shift" })).toBeNull();
    const location = screen.getByRole("combobox", { name: "Location" }) as HTMLSelectElement;
    expect([...location.options].map((option) => option.text)).toEqual(["Downtown", "Uptown"]);
  });

  it("opens on the shift with people and reads it like a card", async () => {
    renderPage();
    const lunchTab = await screen.findByRole("button", { name: "Lunch, 1 person" });
    expect(lunchTab.getAttribute("aria-pressed")).toBe("true");
    const summary = screen.getByRole("region", { name: "Lunch" });
    expect(within(summary).getByText("On the floor").previousSibling?.textContent).toBe("1");
    expect(within(summary).getByText("First in").previousSibling?.textContent).toBe("11:00 AM");
    expect(within(summary).getByText("Last out").previousSibling?.textContent).toBe("4:00 PM");
    const team = screen.getByRole("list", { name: "Server" });
    const maria = within(team).getByRole("listitem");
    expect(maria.textContent).toContain("Maria Lopez");
    expect(maria.textContent).toContain("11:00 AM – 4:00 PM");
    expect(maria.textContent).toContain("Training");
  });

  it("moves between shifts and locations", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Dinner, no one" }));
    expect(screen.getByTestId("where").textContent).toBe(`?shift=${dinner}`);
    expect(screen.getByText("No one is scheduled for Dinner.")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Location" }), { target: { value: uptown } });
    expect(screen.getByTestId("where").textContent).toContain(`location=${uptown}`);
    fireEvent.click(screen.getByRole("button", { name: "Lunch, 1 person" }));
    expect(within(screen.getByRole("list", { name: "Server" })).getByText("Hannah Lee")).toBeTruthy();
  });

  it("shows the phone outline while it loads", () => {
    read.mockReturnValue(new Promise(() => undefined));
    renderPage();
    const loading = screen.getByText("Loading lineups").closest("[role=status]") as HTMLElement;
    expect(loading.classList.contains("lineup-phone-outline")).toBe(true);
  });
});

// E · Çark tarih (KARARLAR Lineup, Mert 2026-10-17): the wheel, the summary's state, Team · Notes · Read,
// read-only rows and the Publish dock over the bottom bar.
describe("LineupPage on a phone, E", () => {
  const reduce = window.matchMedia;
  beforeEach(() => {
    phone = true;
    // Reduced motion: the wheel jumps instead of spinning, so a test sees where it stops at once.
    window.matchMedia = ((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    published = {};
  });
  afterEach(() => {
    window.matchMedia = reduce;
  });

  it("shows seven days on a wheel, the day in the middle pressed", async () => {
    renderPage("/app/schedule/lineup?date=2026-10-14");
    const wheel = await screen.findByRole("group", { name: "Day. Swipe or use the arrow keys." });
    const middle = within(wheel).getByRole("button", { name: "Wednesday, October 14, 2026" });
    expect(middle.getAttribute("aria-pressed")).toBe("true");
    expect(middle.tabIndex).toBe(0);
    // The first of a month shows the month where the weekday sits.
    expect(within(wheel).getByRole("button", { name: "Sunday, November 1, 2026" }).textContent).toBe("NOV1");
    expect(screen.getByRole("button", { name: "Wed, Oct 14" }).getAttribute("data-other-day")).toBe("true");
  });

  it("turns to a tapped day and loads it; the date button brings today back", async () => {
    renderPage();
    const wheel = await screen.findByRole("group", { name: "Day. Swipe or use the arrow keys." });
    fireEvent.click(within(wheel).getByRole("button", { name: "Thursday, October 15, 2026" }), { detail: 0 });
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("?date=2026-10-15"));
    await waitFor(() => expect(read).toHaveBeenCalledWith(ws, "2026-10-15", "day"));
    fireEvent.click(screen.getByRole("button", { name: "Thu, Oct 15" }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe(""));
  });

  it("steps a day with ‹ › and the arrow keys", async () => {
    renderPage();
    const wheel = await screen.findByRole("group", { name: "Day. Swipe or use the arrow keys." });
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("?date=2026-10-14"));
    fireEvent.keyDown(wheel, { key: "ArrowLeft" });
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe(""));
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Tuesday, October 13, 2026");
  });

  it("says a draft lineup is a draft, and a published one when it went out, with nothing to edit", async () => {
    renderPage();
    const summary = await screen.findByRole("region", { name: "Lunch" });
    expect(within(summary).getByText("Draft · staff can't see it")).toBeTruthy();
    cleanup();
    published = { [lunch]: { status: "shared", published: true, shared_at: "2026-10-13T21:10:00Z", ask_ack: true, acknowledged: 1, with_app: 1 } };
    renderPage();
    const after = await screen.findByRole("region", { name: "Lunch" });
    expect(within(after).getByText(/^Published \d/)).toBeTruthy();
    expect(within(after).queryByRole("button")).toBeNull();
  });

  it("lists the team read-only: no person panel, call off, Add Staff or note editing", async () => {
    renderPage();
    const team = await screen.findByRole("list", { name: "Server" });
    const row = within(team).getByRole("listitem");
    expect(row.textContent).toContain("MLMaria Lopez11:00 AM – 4:00 PM");
    expect(within(row).getByText("Training")).toBeTruthy();
    expect(within(team).queryByRole("button")).toBeNull();
    fireEvent.click(row);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: /Add Staff|Call off|Edit/ })).toBeNull();
    expect(screen.getByRole("tab", { name: "Team 1" }).getAttribute("aria-selected")).toBe("true");
  });

  it("reads the notes in the Notes tab, with nothing to type in", async () => {
    published = { [lunch]: { notes: { specials: "Halibut", n86: "", shift_notes: "Patio opens at 5" } } };
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: "Notes 2" }));
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("Halibut")).toBeTruthy();
    expect(within(panel).getByText("Patio opens at 5")).toBeTruthy();
    expect(within(panel).queryByRole("textbox")).toBeNull();
    expect(within(panel).queryByRole("button")).toBeNull();
  });

  it("lists who read it once published, who hasn't, and who has no app", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: "Read" }));
    expect(screen.getByText("No one has seen it yet")).toBeTruthy();
    cleanup();
    world = model([
      shift({ employee: maria, job: server, type: lunch, start: "11:00", end: "16:00" }),
      shift({ employee: hannah, job: server, type: lunch, start: "11:00", end: "16:00" }),
      shift({ employee: chloe, job: server, type: lunch, start: "12:00", end: "16:00" }),
    ]);
    reads = { [hannah]: "2026-10-13T21:40:00Z", [chloe]: "no app" };
    published = { [lunch]: { status: "shared", published: true, shared_at: "2026-10-13T21:10:00Z", ask_ack: true, acknowledged: 1, with_app: 2, people: 3 } };
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: "Read 1/2" }));
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("of 2 read")).toBeTruthy();
    const group = (name: string) => within(within(panel).getByRole("region", { name })).getAllByRole("listitem");
    expect(group("Not read yet").map((row) => row.textContent)).toEqual(["MLMaria LopezServer—"]);
    const [read] = group("Read");
    expect(read!.textContent).toMatch(/^HLHannah LeeServer\d{1,2}:\d{2} [AP]M$/);
    expect(group("No app").map((row) => row.textContent)).toEqual(["CDChloe DavisServerNot counted"]);
  });

  it("keeps Publish at the bottom with the waiting count, and opens the window as a sheet", async () => {
    renderPage();
    const dock = await screen.findByRole("button", { name: "Publish, 2 lineups waiting" });
    expect(dock.closest(".lineup-phone-dock")).toBeTruthy();
    fireEvent.click(dock);
    const sheet = screen.getByRole("dialog", { name: "Publish lineups" });
    expect(sheet.classList.contains("is-sheet")).toBe(true);
    fireEvent.click(within(sheet).getByRole("button", { name: "Publish 2" }));
    await within(sheet).findByText("Published 2 lineups · 2 people notified");
    expect(commands[0]).toMatchObject({ kind: "share", ask_ack: true });
  });

  it("rests grey and off when there is nothing to publish or take back", async () => {
    world = model([]);
    renderPage();
    const dock = await screen.findByRole("button", { name: "Publish" });
    expect((dock as HTMLButtonElement).disabled).toBe(true);
    expect(dock.closest(".lineup-phone-dock")).toBeTruthy();
  });

  it("has no Publish dock for someone who can't publish", async () => {
    const actions = context.actions;
    (context as { actions: string[] }).actions = ["schedule.read", "lineup.read"];
    try {
      renderPage();
      await screen.findByRole("region", { name: "Lunch" });
      expect(screen.queryByRole("button", { name: /^Publish/ })).toBeNull();
    } finally {
      (context as { actions: readonly string[] }).actions = actions;
    }
  });
});
