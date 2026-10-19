import { readFileSync } from "node:fs";

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
import { LINEUP_BUSY_MS } from "../schedule/lineup";
import { LineupPage } from "./LineupPage";

// Lineup, read-only first stage (Mert 2026-10-13): the day's live Schedule
// per location and shift, with the day picker and the two filters.

const context = {
  userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
  workspace: { id: ws, name: "Harbor & Vine" },
  membership: { access: { employee: false, management: "owner" }, status: "active",},
  permissions: ["schedule.read", "schedule.publish"],
  actions: ["schedule.read", "lineup.read", "lineup.share"],
} as unknown as ActiveWorkspaceContext;

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context }) }));
// The day and its wall clock are fixed: "today" is October 13 at 9 AM, before any test shift begins, so a draft or
// published lineup isn't drawn as started in the afternoon.
// A test can set another zone's wall clock: `clocks` by IANA zone, the device's own under "device".
let clocks: Record<string, string> = {};
vi.mock("../lib/today", async (original) => ({
  ...(await original<object>()),
  todayIn: () => "2026-10-13",
  clockIn: (zone?: string) => clocks[zone ?? "device"] ?? "09:00",
}));
let phone = false;
vi.mock("../lib/usePhoneWidth", () => ({ usePhoneWidth: () => phone, useListPhoneWidth: () => phone }));
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
// The locations the day read answers for (null: all of the model's): a manager who runs one place sees one.
let only: string | null = null;
// A location's time zone the day read gives, by location id (the model's otherwise).
let zones: Record<string, string> = {};
function readers(read: ReturnType<typeof dayRead>) {
  if (only) read.locations = read.locations.filter((location) => location.id === only);
  for (const location of read.locations) location.timezone = zones[location.id] ?? location.timezone;
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
  clocks = {};
  only = null;
  zones = {};
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

// The desktop, F (Mert 2026-10-19 ~2:45 AM, "f harika"; LINEUP-EDIT W1): the phone's day picker and shift tabs, one
// location's ticket between two arrows, and under it the team as one list under column headings.
describe("LineupPage", () => {
  const reduce = window.matchMedia;
  beforeEach(() => {
    // Reduced motion: the wheel jumps instead of spinning, so a test sees where it stops at once.
    window.matchMedia = ((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = reduce;
  });

  it("shows one location's ticket and its team under column headings: position, label, in – out, section", async () => {
    renderPage();
    const ticket = await screen.findByRole("region", { name: "Downtown, Lunch" });
    expect(read).toHaveBeenCalledWith(ws, day, "day");
    expect(within(ticket).getByText("Draft")).toBeTruthy();
    expect(within(ticket).getByRole("tab", { name: "Team 1" }).getAttribute("aria-selected")).toBe("true");
    // The ticket doesn't fold on the desktop.
    expect(within(ticket).queryByRole("button", { name: "Hide list" })).toBeNull();
    const heads = document.querySelector(".lineup-desk-cols")!;
    // Section is the last column, by the list's right edge (Mert 2026-10-19 ~5:30 AM).
    expect([...heads.children].map((cell) => cell.textContent)).toEqual(["", "Employee", "Position", "Label", "In – Out", "Section"]);
    const row = within(screen.getByRole("list", { name: "Server" })).getByRole("listitem");
    expect([...row.children].map((cell) => cell.textContent)).toEqual(["ML", "Maria Lopez", "Server", "Training", "11:00 AM – 4:00 PM", "—"]);
    expect(within(row).getByLabelText("No section")).toBeTruthy();
    // One list: the person's circle comes from the one place that draws it (LineupPersonCircle).
    expect(row.querySelector(".lineup-phone-avatar")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("moves between locations with the arrows beside the ticket, off at the ends", async () => {
    renderPage();
    await screen.findByRole("region", { name: "Downtown, Lunch" });
    expect((screen.getByRole("button", { name: "No previous location" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Next location: Uptown" }));
    const ticket = screen.getByRole("region", { name: "Uptown, Lunch" });
    expect(within(screen.getByRole("tabpanel")).getByText("Hannah Lee")).toBeTruthy();
    expect(ticket).toBeTruthy();
    expect((screen.getByRole("button", { name: "No next location" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Previous location: Downtown" }));
    expect(screen.getByRole("region", { name: "Downtown, Lunch" })).toBeTruthy();
  });

  it("shows the location picked, with no arrows, and the shift of its tab", async () => {
    renderPage(`/app/schedule/lineup?location=${downtown}&shift=${dinner}`);
    const ticket = await screen.findByRole("region", { name: "Downtown, Dinner" });
    expect(screen.queryByRole("region", { name: /^Uptown/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /location/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Dinner, no one", pressed: true })).toBeTruthy();
    expect(within(screen.getByRole("tabpanel")).getByText("No one is scheduled for Dinner at Downtown")).toBeTruthy();
    expect(within(ticket).getByText("Draft")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Lunch, 1 person" }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe(`?location=${downtown}&shift=${lunch}`));
  });

  it("moves day by day and lights the date when it is not today", async () => {
    renderPage();
    await screen.findByRole("region", { name: "Downtown, Lunch" });
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    await waitFor(() => expect(read).toHaveBeenCalledWith(ws, "2026-10-14", "day"));
    expect(screen.getByTestId("where").textContent).toBe("?date=2026-10-14");
    const date = screen.getByRole("button", { name: "Wed, Oct 14" });
    expect(date.getAttribute("data-other-day")).toBe("true");
    fireEvent.click(date);
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe(""));
  });

  it("shows fifteen days on the desktop's wheel", async () => {
    renderPage();
    await screen.findByRole("region", { name: "Downtown, Lunch" });
    const track = document.querySelector<HTMLElement>(".lineup-wheel-track")!;
    expect(track.style.getPropertyValue("--lineup-wheel-visible")).toBe("15");
    const wheel = readFileSync("src/schedule/lineup-wheel.css", "utf8");
    expect(wheel).toMatch(/\.lineup-wheel-track \{[^}]*width: calc\(100% \/ var\(--lineup-wheel-visible, 7\) \* var\(--lineup-wheel-days\)\);/);
  });

  // Mert 2026-10-19 ~5:30 AM (S-178 Ek 2): under In – Out, the difference in the total hours worked, managers only.
  it("says under In – Out how much longer or shorter the shift is than the Schedule's", async () => {
    world = model([
      shift({ employee: maria, job: server, type: lunch, start: "11:00", end: "16:00" }),
      shift({ employee: hannah, job: server, type: lunch, start: "11:00", end: "16:00" }),
      shift({ employee: chloe, job: server, type: lunch, start: "11:00", end: "16:00" }),
    ]);
    const realRead = api.getMockImplementation()!;
    api.mockImplementation(async (client, path, init) => {
      const answer = (await realRead(client, path, init)) as ReturnType<typeof dayRead>;
      if (!/\/lineups\/\d{4}-\d{2}-\d{2}$/.test(path)) return answer;
      const rows = answer.locations[0]!.lineups[0]!.rows;
      const at = (name: string) => rows.find((row) => row.employee_id === name)!;
      // Maria in at 10:00, out at 5:30 PM: +2 h 30 min. Hannah out at 3:00 PM: −1 h. Chloe 10:00 – 3:00 PM: the same 5 h.
      Object.assign(at(maria), { start_time: "10:00", end_time: "17:30", changed: ["start_time", "end_time"] });
      Object.assign(at(hannah), { end_time: "15:00", changed: ["end_time"] });
      Object.assign(at(chloe), { start_time: "10:00", end_time: "15:00", changed: ["start_time", "end_time"] });
      return answer;
    });
    renderPage(`/app/schedule/lineup?location=${downtown}`);
    const list = await screen.findByRole("list", { name: "Server" });
    const timeOf = (name: string) => within(list).getByText(name).closest("li")!.querySelector(".lineup-desk-time")!;
    const longer = timeOf("Maria Lopez").querySelector(".lineup-desk-change")!;
    expect(longer.textContent).toBe("+2 h 30 min");
    expect(longer.classList.contains("is-longer")).toBe(true);
    expect(longer.getAttribute("title")).toBe("Schedule 11:00 AM – 4:00 PM");
    const shorter = timeOf("Hannah Lee").querySelector(".lineup-desk-change")!;
    expect(shorter.textContent).toBe("\u22121 h");
    expect(shorter.classList.contains("is-shorter")).toBe(true);
    expect(timeOf("Chloe Davis").querySelector(".lineup-desk-change")).toBeNull();
    // The orange dot still says the time changed.
    expect(timeOf("Chloe Davis").querySelector(".lineup-phone-changed")).toBeTruthy();
  });

  it("keeps the page still: only the list under the ticket scrolls, its column headings pinned", () => {
    const frozen = readFileSync("src/views/list-page-frozen.css", "utf8");
    expect(frozen).toMatch(/\.lineup-page\.list-page\.list-page > \.lineup-desk \{\s*flex: 1 1 auto;/);
    const desk = readFileSync("src/views/lineup-desktop.css", "utf8");
    expect(desk).toMatch(/\.lineup-desk-scroll \{[^}]*min-height: 0;[^}]*overflow-y: auto;/);
    expect(desk).toMatch(/\.lineup-desk-cols \{\s*position: sticky;\s*top: 0;/);
    expect(desk).toMatch(/--lineup-desk-cols: 38px minmax\(0, 1\.25fr\) minmax\(0, 1fr\) minmax\(0, 0\.8fr\) minmax\(206px, 1\.1fr\) minmax\(0, 1fr\);/);
    // Headings centred on their columns' content; Employee starts where the names do.
    expect(desk).toMatch(/\.lineup-desk-cols \{[^}]*text-align: center;/);
    expect(desk).toMatch(/\.lineup-desk-cols > :nth-child\(2\) \{\s*text-align: left;/);
    expect(desk).toMatch(/\.lineup-desk-cell \{[^}]*text-align: center;/);
  });

  it("reads the notes and, once published, who read it in the ticket's tabs", async () => {
    reads = { [maria]: "2026-10-13T21:40:00Z" };
    renderPage();
    const ticket = await screen.findByRole("region", { name: "Downtown, Lunch" });
    expect((within(ticket).getByRole("tab", { name: "Read" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(ticket).getByRole("tab", { name: "Notes" }));
    expect(within(screen.getByRole("tabpanel")).getByText("No notes yet.")).toBeTruthy();
    cleanup();
    published = {
      [lunch]: { status: "shared", published: true, shared_at: "2026-10-13T21:10:00Z", ask_ack: true, acknowledged: 1, with_app: 1 },
    };
    renderPage();
    const team = await screen.findByRole("tabpanel");
    team.scrollTop = 300;
    fireEvent.click(screen.getByRole("tab", { name: "Read 1/1" }));
    const readers = within(screen.getByRole("tabpanel")).getByRole("region", { name: "Read" });
    expect(within(readers).getByText("Maria Lopez")).toBeTruthy();
    expect(within(screen.getByRole("tabpanel")).queryByRole("region", { name: "Not read yet" })).toBeNull();
    // Another tab starts at its top, not where Team was scrolled.
    expect(screen.getByRole("tabpanel").scrollTop).toBe(0);
  });

  it("shows a grey outline of the lineup while it loads, and says so once", async () => {
    read.mockReturnValue(new Promise(() => undefined));
    renderPage();
    const loading = screen.getByText("Loading lineups").closest("[role=status]") as HTMLElement;
    expect(loading.textContent).toBe("Loading lineups");
    expect(loading.querySelector(".lineup-desk-ticket .lineup-card")).toBeTruthy();
    expect(screen.queryByRole("region", { name: /Lunch/ })).toBeNull();
  });

  it("gives the load-error card and tries again from it", async () => {
    read.mockRejectedValueOnce(new RequestError("Down", "server_error", undefined, 500));
    renderPage("/app/schedule/lineup?date=2026-10-14");
    const card = await screen.findByRole("alert");
    expect(within(card).getByRole("heading", { name: "We couldn't load the lineup" })).toBeTruthy();
    expect(within(card).getByText("Wednesday, October 14 didn't load. Nothing was changed.")).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("region", { name: "Downtown, Lunch" })).toBeTruthy();
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
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Publish lineups" })).toBeNull(), { timeout: 2000 });
    expect(screen.getByRole("button", { name: "Published" })).toBeTruthy();
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      kind: "share",
      ask_ack: false,
      lineups: [{ location_id: downtown, service_date: day, shift_type_id: lunch }],
    });
  });

  // S-162 (Mert 2026-10-18): a published lineup has the phone's green Edit here too, not a red two-click Unpublish;
  // it opens the same Edit window, in the middle of the page.
  it("shows a published lineup green with its readers, and takes it back with the green Edit", async () => {
    published = {
      [lunch]: { status: "shared", published: true, shared_at: "2026-10-13T21:10:00Z", ask_ack: true, acknowledged: 1, with_app: 1 },
    };
    renderPage();
    const ticket = await screen.findByRole("region", { name: "Downtown, Lunch" });
    expect(within(ticket).getByText("Live")).toBeTruthy();
    expect(within(ticket).getByText("Published at 2:10 PM")).toBeTruthy();
    expect(within(ticket).getByRole("tab", { name: "Read 1/1" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Publish/ }));
    const window = screen.getByRole("dialog", { name: "Publish lineups" });
    const downtownList = within(window).getByRole("region", { name: "Downtown" });
    expect(within(downtownList).queryByRole("checkbox")).toBeNull();
    expect(within(window).queryByRole("button", { name: /Unpublish/ })).toBeNull();
    expect(document.querySelector(".lineup-publish-unpublish")).toBeNull();
    const edit = within(downtownList).getByRole("button", { name: "Edit Lunch lineup" });
    expect(edit.textContent).toBe("Edit");
    fireEvent.click(edit);
    expect(commands).toHaveLength(0);
    const ask = screen.getByRole("alertdialog", { name: "Edit Lunch lineup?" });
    expect(within(ask).getByText("Downtown · Published at 2:10 PM")).toBeTruthy();
    expect(within(ask).getByText("Back to draft")).toBeTruthy();
    expect(within(ask).getByText("Staff don't see it until you publish again.")).toBeTruthy();
    expect(within(ask).getByText("Everyone gets the new version")).toBeTruthy();
    expect(
      within(ask).getByText("When you publish again, everyone sees the new version; their earlier read doesn't carry over."),
    ).toBeTruthy();
    // Escape answers the Edit window only; the Publish window stays under it.
    fireEvent.keyDown(ask, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Publish lineups" })).toBeTruthy();
    // A click inside the Edit window isn't a click outside the Publish window.
    fireEvent.click(within(downtownList).getByRole("button", { name: "Edit Lunch lineup" }));
    const again = screen.getByRole("alertdialog", { name: "Edit Lunch lineup?" });
    fireEvent.pointerDown(within(again).getByText("Back to draft"));
    expect(screen.getByRole("dialog", { name: "Publish lineups" })).toBeTruthy();
    published = {};
    fireEvent.click(within(again).getByRole("button", { name: "Edit" }));
    expect(within(again).getByRole("button", { name: "Unpublishing…" })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ kind: "unpublish", lineups: [{ location_id: downtown, service_date: day, shift_type_id: lunch }] });
    // Back to draft, ticked to go out again; focus waits on its box, not on the page; no green line in the window.
    const box = await within(within(window).getByRole("region", { name: "Downtown" })).findByRole("checkbox", { name: /Lunch/ });
    expect(box.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(box);
    expect(within(window).queryByRole("status")).toBeNull();
  });

  it("locks the green Edit once the shift has started, as on the phone", async () => {
    clocks = { "America/Los_Angeles": "12:00" };
    published = {
      [lunch]: { status: "shared", published: true, shared_at: "2026-10-13T21:10:00Z", ask_ack: true, acknowledged: 1, with_app: 1 },
    };
    renderPage();
    await screen.findByRole("region", { name: "Downtown, Lunch" });
    fireEvent.click(screen.getByRole("button", { name: /^Publish/ }));
    const window = screen.getByRole("dialog", { name: "Publish lineups" });
    const edit = within(within(window).getByRole("region", { name: "Downtown" })).getByRole("button", { name: "Edit Lunch lineup" });
    expect((edit as HTMLButtonElement).disabled).toBe(true);
    expect(edit.title).toBe("This shift has started");
  });

  // LINEUP-E-POLISH 4: a day that is over says so, not "started".
  it("says the day is over on the locked Edit of a past day", async () => {
    published = {
      [lunch]: { status: "past", published: true, shared_at: "2026-10-13T21:10:00Z", ask_ack: true, acknowledged: 1, with_app: 1 },
    };
    renderPage();
    await screen.findByRole("region", { name: "Downtown, Lunch" });
    fireEvent.click(screen.getByRole("button", { name: /^Publish/ }));
    const window = screen.getByRole("dialog", { name: "Publish lineups" });
    const edit = within(within(window).getByRole("region", { name: "Downtown" })).getByRole("button", { name: "Edit Lunch lineup" });
    expect((edit as HTMLButtonElement).disabled).toBe(true);
    expect(edit.title).toBe("This day is over");
  });

  // LINEUP-E-POLISH 1: while Publishing… works, Escape and a click outside leave the window open, so a refusal
  // still shows in its band.
  // LINEUP-E-POLISH review (orta-1): the Publish that opened the window and the day controls wait while it publishes,
  // so the window and the answer stay.
  it("keeps the window and the day while it publishes: the page's Publish and the day controls wait", async () => {
    let refuse: ((reason: unknown) => void) | null = null;
    api.mockImplementation(async (_client, path) => {
      if (path.endsWith("/lineups/commands")) return new Promise((_resolve, reject) => (refuse = reject));
      const dayPath = /\/lineups\/(\d{4}-\d{2}-\d{2})$/.exec(path);
      return readers(dayRead(world, dayPath![1]!, published));
    });
    renderPage();
    const trigger = await screen.findByRole("button", { name: "Publish, 2 lineups waiting" });
    fireEvent.click(trigger);
    const window = screen.getByRole("dialog", { name: "Publish lineups" });
    fireEvent.click(within(window).getByRole("button", { name: "Publish 2" }));
    expect(trigger.getAttribute("aria-busy")).toBe("true");
    expect(trigger.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Publish lineups" })).toBe(window);
    const next = screen.getByRole("button", { name: "Next day" });
    expect(next.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("button", { name: "Previous day" }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("button", { name: "Tue, Oct 13" }).getAttribute("aria-disabled")).toBe("true");
    // The wheel is inert while it waits: no turn, no key.
    const wheel = document.querySelector(".lineup-wheel")!;
    expect(wheel.hasAttribute("inert")).toBe(true);
    fireEvent.click(next);
    fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
    expect(screen.getByTestId("where").textContent).toBe("");
    expect(screen.getByRole("dialog", { name: "Publish lineups" })).toBe(window);
    await waitFor(() => expect(refuse).not.toBeNull());
    refuse!(new RequestError("No", "lineup.one_day", undefined, 400));
    expect((await within(window).findByRole("alert")).textContent).toBe("Publish one day's lineups at a time.");
    // Back to normal once it has answered.
    expect(trigger.getAttribute("aria-busy")).toBeNull();
    expect(next.getAttribute("aria-disabled")).toBeNull();
    expect(wheel.hasAttribute("inert")).toBe(false);
    fireEvent.click(next);
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("?date=2026-10-14"));
  });

  // LINEUP-E-POLISH-2 (review D-2): what waits while it publishes looks off: the app's 0.55, a plain cursor, no hover.
  it("gives the waiting day controls and the page's Publish the off look, with no hover", () => {
    const page = readFileSync("src/schedule/lineup-wheel.css", "utf8");
    expect(page).toMatch(
      /\.lineup-toolbar :is\(\.lineup-step, \.lineup-date-label\)\[aria-disabled="true"\],\s*\.lineup-wheel\[inert\]\s*\{\s*cursor:\s*default;\s*opacity:\s*0\.55;/,
    );
    expect(page).toMatch(/\.lineup-toolbar :is\(\.lineup-step, \.lineup-date-label\)\[aria-disabled="true"\]:hover\s*\{\s*border-color:\s*var\(--theme-border-control\);/);
    const publish = readFileSync("src/schedule/lineup-publish.css", "utf8");
    expect(publish).toMatch(
      /\.nf-button\.lineup-publish-trigger\[aria-busy="true"\],\s*\.nf-button\.lineup-publish-trigger\[aria-busy="true"\]:hover\s*\{\s*background:\s*var\(--theme-accent\);\s*opacity:\s*\.55;\s*cursor:\s*default;/,
    );
  });

  it("keeps the window open through Escape and a click outside while it publishes, and shows a refusal", async () => {
    let refuse: ((reason: unknown) => void) | null = null;
    api.mockImplementation(async (_client, path) => {
      if (path.endsWith("/lineups/commands")) return new Promise((_resolve, reject) => (refuse = reject));
      const dayPath = /\/lineups\/(\d{4}-\d{2}-\d{2})$/.exec(path);
      return readers(dayRead(world, dayPath![1]!, published));
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Publish, 2 lineups waiting" }));
    const window = screen.getByRole("dialog", { name: "Publish lineups" });
    fireEvent.click(within(window).getByRole("button", { name: "Publish 2" }));
    const working = within(window).getByRole("button", { name: "Publishing…" });
    fireEvent.keyDown(working, { key: "Escape" });
    fireEvent.pointerDown(document.body);
    expect(screen.getByRole("dialog", { name: "Publish lineups" })).toBe(window);
    await waitFor(() => expect(refuse).not.toBeNull());
    refuse!(new RequestError("No", "lineup.one_day", undefined, 400));
    expect((await within(window).findByRole("alert")).textContent).toBe("Publish one day's lineups at a time.");
    // Once it is back, Escape closes it again.
    fireEvent.keyDown(within(window).getByRole("button", { name: "Publish 2" }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Publish lineups" })).toBeNull();
  });

  // LINEUP-E-POLISH 5: the Edit window opened from the Publish window says why it didn't go through in its band.
  it("says in the Edit window's band why Edit didn't go through, from the Publish window", async () => {
    published = {
      [lunch]: { status: "shared", published: true, shared_at: "2026-10-13T21:10:00Z", ask_ack: true, acknowledged: 1, with_app: 1 },
    };
    const realRead = api.getMockImplementation()!;
    api.mockImplementation(async (client, path, init) => {
      if (path.endsWith("/lineups/commands")) throw new RequestError("No", "lineup.past_day", undefined, 400);
      return realRead(client, path, init);
    });
    renderPage();
    await screen.findByRole("region", { name: "Downtown, Lunch" });
    fireEvent.click(screen.getByRole("button", { name: /^Publish/ }));
    const window = screen.getByRole("dialog", { name: "Publish lineups" });
    fireEvent.click(within(within(window).getByRole("region", { name: "Downtown" })).getByRole("button", { name: "Edit Lunch lineup" }));
    const ask = screen.getByRole("alertdialog", { name: "Edit Lunch lineup?" });
    fireEvent.click(within(ask).getByRole("button", { name: "Edit" }));
    expect((await within(ask).findByRole("alert")).textContent).toBe("This day is over. Its lineups can't change.");
    const edit = within(ask).getByRole("button", { name: "Edit" });
    expect(edit.getAttribute("aria-disabled")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Publish lineups" })).toBe(window);
  });

  // LINEUP-E-POLISH 2: "light up once" is per day: moving to a day whose lineup is already out lights nothing.
  it("lights nothing when the next day's lineup is already out", async () => {
    world = model([
      shift({ employee: maria, job: server, type: lunch, start: "11:00", end: "16:00" }),
      shift({ employee: maria, job: server, type: lunch, start: "11:00", end: "16:00", date: "2026-10-14" }),
    ]);
    api.mockImplementation(async (_client, path) => {
      const dayPath = /\/lineups\/(\d{4}-\d{2}-\d{2})$/.exec(path);
      if (!dayPath) throw new Error(`unexpected ${path}`);
      const out: Record<string, Partial<LineupDayLineup>> = dayPath[1] === "2026-10-14"
        ? { [lunch]: { status: "shared", published: true, shared_at: "2026-10-13T21:10:00Z", ask_ack: true, acknowledged: 0, with_app: 1 } }
        : {};
      return readers(dayRead(world, dayPath[1]!, out));
    });
    renderPage();
    const first = await screen.findByRole("region", { name: "Downtown, Lunch" });
    expect(within(first).queryByText(/^Published at /)).toBeNull();
    // Both days come into the cache, then back and forth between them.
    const ticket = () => screen.getByRole("region", { name: "Downtown, Lunch" });
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    await waitFor(() => within(ticket()).getByText(/^Published at /));
    fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
    await waitFor(() => expect(within(ticket()).queryByText(/^Published at /)).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    await waitFor(() => within(ticket()).getByText(/^Published at /));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(within(ticket()).getByText(/^Published at /).classList.contains("is-flash")).toBe(false);
    expect(within(ticket()).getByText("Live").classList.contains("is-flash")).toBe(false);
  });

  // LINEUP-E-POLISH 6: the Cancel that waits while an answer works looks off in every app window, not only Lineup's.
  it("keeps the waiting Cancel's look in the app window's own styles", () => {
    const shared = readFileSync("src/styles.css", "utf8");
    expect(shared).toMatch(/\.app-confirm footer \.secondary-button\[aria-disabled="true"\]\s*\{[^}]*opacity:\s*0?\.55/);
    const lineup = readFileSync("src/schedule/lineup-publish.css", "utf8");
    expect(lineup).not.toMatch(/secondary-button\[aria-disabled="true"\]/);
    // Hovering an answer that is off while it works doesn't light it up (review, low-2).
    expect(shared).toMatch(
      /\.nf-button:not\(\.secondary-button\):not\(\.danger-button\)\[aria-disabled="true"\]:hover\s*\{\s*background:\s*var\(--theme-accent\);/,
    );
    expect(shared).toMatch(/\.app-confirm footer \.secondary-button\[aria-disabled="true"\]:hover\s*\{\s*background:\s*var\(--theme-surface\);/);
  });

  // Mert 2026-10-17 (notice A; mockup v-e.js .d-pub): the window's Publish spins and says "Publishing…"; then the
  // window closes, the Publish that opened it says "Published" (2.6 s in all) with focus on it, then is as it was,
  // and the shift's "Published" lights up once; no green line, no notice.
  it("works in the window's Publish, then closes it and says Published on the page's Publish, one command however often it is pressed", async () => {
    // The day read says published once the command has gone.
    api.mockImplementation(async (_client, path, init) => {
      const dayPath = /\/lineups\/(\d{4}-\d{2}-\d{2})$/.exec(path);
      if (dayPath) return readers(dayRead(world, dayPath[1]!, published));
      const body = JSON.parse(String(init?.body)) as { command_id: string; kind: string };
      commands.push(body);
      published = { [lunch]: { status: "shared", published: true, shared_at: "2026-10-13T21:10:00Z", ask_ack: true, acknowledged: 0, with_app: 1 } };
      return { command_id: body.command_id, kind: body.kind, lineups: [] };
    });
    renderPage();
    const trigger = await screen.findByRole("button", { name: "Publish, 2 lineups waiting" });
    trigger.focus();
    fireEvent.click(trigger);
    const window = screen.getByRole("dialog", { name: "Publish lineups" });
    const go = within(window).getByRole("button", { name: "Publish 2" });
    go.focus();
    fireEvent.click(go);
    const pressed = Date.now();
    const working = within(window).getByRole("button", { name: "Publishing…" });
    expect(working).toBe(go);
    expect(working.getAttribute("aria-busy")).toBe("true");
    expect(working.getAttribute("aria-disabled")).toBe("true");
    expect(working.querySelector(".lineup-publish-spin")?.getAttribute("aria-hidden")).toBe("true");
    // Still in the keyboard's hands while it works.
    expect(document.activeElement).toBe(working);
    fireEvent.click(working);
    fireEvent.click(working);
    expect(within(window).queryByText(/notified/)).toBeNull();
    // The window stays while it works, then closes.
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Publish lineups" })).toBeNull(), { timeout: 2000 });
    expect(Date.now() - pressed).toBeGreaterThanOrEqual(850);
    const done = screen.getByRole("button", { name: "Published" });
    expect(done).toBe(trigger);
    expect(done.getAttribute("aria-live")).toBe("polite");
    expect(done.getAttribute("aria-disabled")).toBe("true");
    // Focus returns in the closing window's effect: wait for it (a busy machine may run the check first).
    await waitFor(() => expect(document.activeElement).toBe(done));
    // A press on Published doesn't open the window again.
    fireEvent.click(done);
    expect(screen.queryByRole("dialog", { name: "Publish lineups" })).toBeNull();
    expect(commands).toHaveLength(1);
    // The ticket's Live and "Published at" light up once, the window gone.
    const ticket = screen.getByRole("region", { name: "Downtown, Lunch" });
    await waitFor(() => expect(within(ticket).getByText(/^Published at /).classList.contains("is-flash")).toBe(true));
    expect(within(ticket).getByText("Live").classList.contains("is-flash")).toBe(true);
    // Then the button as it was, still holding focus.
    await waitFor(() => expect(trigger.getAttribute("aria-label")).toMatch(/^Publish/), { timeout: 3000 });
    expect(Date.now() - pressed).toBeGreaterThanOrEqual(2550);
    expect(trigger.getAttribute("aria-disabled")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(screen.queryAllByRole("status").filter((element) => element.getAttribute("data-testid") !== "where")).toEqual([]);
  });

  it("leaves the spinner out and only changes the words when motion is reduced", () => {
    const css = readFileSync("src/schedule/lineup-publish.css", "utf8");
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\.lineup-publish-spin\s*\{\s*display:\s*none;/);
    expect(css).not.toMatch(/lineup-publish-unpublish/);
    expect(css).not.toMatch(/lineup-publish-sum\.is-ok/);
    expect(css).not.toMatch(/lineup-publish-done/);
    expect(reduced).toMatch(/\.lineup-publish-ok\s*\{\s*animation:\s*none;/);
  });

  // Read times and "Published at" are the location's clock's, as on the phone: 21:10 / 21:40 UTC are 5:10 / 5:40 PM
  // in New York.
  it("tells when it went out and who read it when on the location's clock", async () => {
    zones = { [downtown]: "America/New_York" };
    reads = { [maria]: "2026-10-13T21:40:00Z" };
    published = {
      [lunch]: { status: "shared", published: true, shared_at: "2026-10-13T21:10:00Z", ask_ack: true, acknowledged: 1, with_app: 1 },
    };
    renderPage();
    const ticket = await screen.findByRole("region", { name: "Downtown, Lunch" });
    expect(within(ticket).getByText("Published at 5:10 PM")).toBeTruthy();
    fireEvent.click(within(ticket).getByRole("tab", { name: "Read 1/1" }));
    const readers = within(screen.getByRole("tabpanel")).getByRole("region", { name: "Read" });
    expect(within(readers).getByRole("listitem").textContent).toBe("MLMaria LopezServer5:40 PM");
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
    // The window stays open over the band (S-139), its Publish as it was; the page's Publish doesn't say Published.
    const window = screen.getByRole("dialog", { name: "Publish lineups" });
    const go = within(window).getByRole("button", { name: "Publish 2" });
    expect(go.getAttribute("aria-busy")).toBeNull();
    expect(screen.queryByRole("button", { name: "Published" })).toBeNull();
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
      await screen.findByRole("region", { name: "Downtown, Lunch" });
      expect(screen.queryByRole("button", { name: /^Publish/ })).toBeNull();
      // Nor the ticket's Edit: taking a lineup back is publishing's other half.
      expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
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
    expect([...location.options].map((option) => option.text)).toEqual(["All locations", "Downtown", "Uptown"]);
  });

  it("opens on the shift with people and reads it like a card", async () => {
    renderPage(`/app/schedule/lineup?location=${downtown}`);
    const lunchTab = await screen.findByRole("button", { name: "Lunch, 1 person" });
    expect(lunchTab.getAttribute("aria-pressed")).toBe("true");
    // Card 1 (Mert 2026-10-17): under the torn edge, Shift · People · Hours.
    const card = screen.getByRole("region", { name: "Downtown, Lunch" });
    expect(within(card).getByText("Shift").nextElementSibling?.textContent).toBe("Lunch");
    expect(within(card).getByText("People").nextElementSibling?.textContent).toBe("1");
    expect(within(card).getByText("Hours").nextElementSibling?.textContent).toBe("11:00 AM – 4:00 PM");
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
    expect(screen.getByText("No one is scheduled for Dinner at Downtown")).toBeTruthy();
    expect(screen.getByText("No one is scheduled for Dinner at Uptown")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Location" }), { target: { value: uptown } });
    expect(screen.getByTestId("where").textContent).toContain(`location=${uptown}`);
    expect(screen.queryByText("No one is scheduled for Dinner at Downtown")).toBeNull();
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

// All locations (Mert 2026-10-17 ~9:10 AM): a manager with more than one location opens on all of them, each with
// its own card and list, one under the other; the shift tabs stand for that shift at every location.
describe("LineupPage on a phone, All locations", () => {
  const reduce = window.matchMedia;
  beforeEach(() => {
    phone = true;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = reduce;
  });
  const live = { status: "shared", published: true, shared_at: "2026-10-13T21:10:00Z", ask_ack: true, acknowledged: 0, with_app: 1 } as const;

  it("opens on All locations: each location's card and list, one under the other, a line between", async () => {
    renderPage();
    const select = (await screen.findByRole("combobox", { name: "Location" })) as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(select.selectedOptions[0]!.text).toBe("All locations");
    const cards = await screen.findAllByRole("region", { name: /, Lunch$/ });
    expect(cards.map((card) => card.getAttribute("aria-label"))).toEqual(["Downtown, Lunch", "Uptown, Lunch"]);
    // The tab stands for Lunch at both: its count adds them.
    expect(screen.getByRole("button", { name: "Lunch, 2 people" }).getAttribute("aria-pressed")).toBe("true");
    const lists = screen.getAllByRole("list", { name: "Server" });
    expect(lists.map((list) => list.textContent)).toEqual([expect.stringContaining("Maria Lopez"), expect.stringContaining("Hannah Lee")]);
    const panels = screen.getAllByRole("tabpanel");
    expect(panels).toHaveLength(2);
    expect(new Set(panels.map((panel) => panel.id)).size).toBe(2);
    const line = screen.getByRole("separator");
    const after = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(after(panels[0]!, line) && after(line, cards[1]!)).toBe(true);
  });

  it("shows one location once picked, and all of them again from All locations", async () => {
    renderPage();
    const select = (await screen.findByRole("combobox", { name: "Location" })) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: uptown } });
    expect(screen.getByTestId("where").textContent).toBe(`?location=${uptown}`);
    expect(await screen.findByRole("region", { name: "Uptown, Lunch" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Downtown, Lunch" })).toBeNull();
    expect(screen.getByRole("button", { name: "Lunch, 1 person" })).toBeTruthy();
    expect(screen.queryByRole("separator")).toBeNull();
    fireEvent.change(select, { target: { value: "" } });
    expect(screen.getByTestId("where").textContent).toBe("");
    expect(await screen.findAllByRole("region", { name: /, Lunch$/ })).toHaveLength(2);
  });

  it("has no All locations for a manager of one location", async () => {
    only = downtown;
    renderPage();
    await screen.findByRole("region", { name: "Downtown, Lunch" });
    const select = screen.getByRole("combobox", { name: "Location" }) as HTMLSelectElement;
    expect([...select.options].map((option) => option.text)).toEqual(["Downtown"]);
  });

  it("folds each location's card on its own; folded cards stack with no line", async () => {
    renderPage();
    const [first, second] = await screen.findAllByRole("region", { name: /, Lunch$/ });
    fireEvent.click(within(first!).getByRole("button", { name: "Hide list" }));
    expect(within(first!).getByRole("button", { name: "Show list" })).toBeTruthy();
    expect(within(second!).getByRole("button", { name: "Hide list" })).toBeTruthy();
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.queryByRole("separator")).toBeNull();
    expect(second!.parentElement!.classList.contains("is-stacked")).toBe(true);
  });

  it("keeps each location's own tab", async () => {
    renderPage();
    const [first, second] = await screen.findAllByRole("region", { name: /, Lunch$/ });
    fireEvent.click(within(second!).getByRole("tab", { name: "Notes" }));
    expect(within(second!).getByRole("tab", { name: "Notes" }).getAttribute("aria-selected")).toBe("true");
    expect(within(first!).getByRole("tab", { name: "Team 1" }).getAttribute("aria-selected")).toBe("true");
  });

  it("shows Publish while any location shown has a draft on that shift", async () => {
    published = { [lunch]: live };
    world = model([
      shift({ employee: maria, job: server, type: lunch, start: "11:00", end: "16:00" }),
      shift({ employee: hannah, job: server, type: dinner, start: "16:00", end: "22:00", location: uptown }),
    ]);
    renderPage();
    // Lunch: Downtown's is out, Uptown's is empty: nothing to publish.
    await screen.findByRole("region", { name: "Uptown, Lunch" });
    expect(screen.queryByRole("button", { name: /^Publish/ })).toBeNull();
    // Dinner: Uptown's waits.
    fireEvent.click(screen.getByRole("button", { name: "Dinner, 1 person" }));
    await screen.findByRole("region", { name: "Uptown, Dinner" });
    expect(screen.getByRole("button", { name: "Publish, 1 lineup waiting" })).toBeTruthy();
  });

  // Each location's lock and "Published at" read its own clock: at 9 AM in Los Angeles it is noon in New York.
  it("locks and times each location on its own clock", async () => {
    zones = { [uptown]: "America/New_York" };
    clocks = { "America/New_York": "12:00" };
    published = { [lunch]: live };
    renderPage();
    const downtownCard = await screen.findByRole("region", { name: "Downtown, Lunch" });
    const uptownCard = screen.getByRole("region", { name: "Uptown, Lunch" });
    expect((within(downtownCard).getByRole("button", { name: "Edit" }) as HTMLButtonElement).disabled).toBe(false);
    expect((within(uptownCard).getByRole("button", { name: "Edit" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(uptownCard).getByRole("button", { name: "Edit" }).getAttribute("title")).toBe("This shift has started");
    expect(within(downtownCard).getByText(/^Published at /).textContent).not.toBe(within(uptownCard).getByText(/^Published at /).textContent);
    expect(within(uptownCard).getByText("Published at 5:10 PM")).toBeTruthy();
  });

  it("says when a location is closed, by name, and draws the others", async () => {
    world = model(
      [shift({ employee: maria, job: server, type: lunch, start: "11:00", end: "16:00" })],
      [{ id: "80000000-0000-4000-8000-000000000001", location_id: uptown, closed_date: day, title: "Holiday", is_all_day: true, kind: "closed", opens: null, closes: null }],
    );
    renderPage();
    expect(await screen.findByText("Uptown · Closed today · Holiday")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Downtown, Lunch" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lunch, 1 person" })).toBeTruthy();
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
    // The card's own behaviours are told for a manager of one place; All locations has its own tests below.
    only = downtown;
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

  // Card 1 (Mert 2026-10-17): "● Draft ✎ Edit" over "Not published yet", Edit off; "● Live ✎ Edit" over "Published
  // at <time>"; a started shift locks Edit. No "read-only" anywhere.
  const editOf = (card: HTMLElement) => within(card).getByRole("button", { name: "Edit" }) as HTMLButtonElement;
  const live = { status: "shared", published: true, shared_at: "2026-10-13T21:10:00Z", ask_ack: true, acknowledged: 1, with_app: 1 } as const;

  it("says a draft is a draft, not published yet, its Edit off", async () => {
    renderPage();
    const card = await screen.findByRole("region", { name: "Downtown, Lunch" });
    expect(within(card).getByText("Draft")).toBeTruthy();
    expect(within(card).getByText("Not published yet")).toBeTruthy();
    expect(editOf(card).disabled).toBe(true);
    expect(document.body.textContent).not.toMatch(/read-only|staff can't see it/i);
  });

  it("says a published lineup is live and when it went out, its Edit on", async () => {
    published = { [lunch]: live };
    renderPage();
    const card = await screen.findByRole("region", { name: "Downtown, Lunch" });
    expect(within(card).getByText("Live")).toBeTruthy();
    expect(within(card).getByText(/^Published at \d{1,2}:\d{2} [AP]M$/)).toBeTruthy();
    expect(editOf(card).disabled).toBe(false);
  });

  it("locks Edit once the shift has started, live or not", async () => {
    clocks = { "America/Los_Angeles": "12:00" };
    published = { [lunch]: live };
    renderPage();
    let card = await screen.findByRole("region", { name: "Downtown, Lunch" });
    expect(within(card).getByText("Live")).toBeTruthy();
    expect(editOf(card).disabled).toBe(true);
    expect(editOf(card).title).toBe("This shift has started");
    cleanup();
    published = {};
    renderPage();
    card = await screen.findByRole("region", { name: "Downtown, Lunch" });
    expect(within(card).getByText("Draft")).toBeTruthy();
    expect(within(card).getByText("Not published")).toBeTruthy();
    expect(editOf(card).disabled).toBe(true);
    expect(document.body.textContent).not.toMatch(/read-only/i);
  });

  // The lock reads the location's clock: noon in Los Angeles while the phone's own clock says 9 AM.
  it("tells a started shift by the location's clock, not the phone's", async () => {
    clocks = { "America/Los_Angeles": "12:00", device: "09:00" };
    renderPage();
    const card = await screen.findByRole("region", { name: "Downtown, Lunch" });
    expect(within(card).getByText("Not published")).toBeTruthy();
    cleanup();
    clocks = { "America/Los_Angeles": "09:00", device: "12:00" };
    renderPage();
    expect(within(await screen.findByRole("region", { name: "Downtown, Lunch" })).getByText("Not published yet")).toBeTruthy();
  });

  it("folds the card to its header from a tap or its chevron; the tabs' strip doesn't fold it", async () => {
    renderPage();
    const card = await screen.findByRole("region", { name: "Downtown, Lunch" });
    const fold = within(card).getByRole("button", { name: "Hide list" });
    expect(fold.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(within(card).getByRole("tab", { name: "Notes" }));
    expect(fold.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(within(card).getByText("Downtown"));
    expect(within(card).getByRole("button", { name: "Show list" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tabpanel")).toBeNull();
    expect(within(card).queryByText("Hours")).toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: "Show list" }));
    expect(screen.getByRole("tablist")).toBeTruthy();
    expect(screen.getByRole("tabpanel")).toBeTruthy();
  });

  // Edit window A (Mert 2026-10-17): today's rule, everyone acknowledges again (the changed-only rule is BL-1135).
  it("asks before Edit takes a published lineup back to draft, in the app's own window", async () => {
    published = { [lunch]: live };
    renderPage();
    const card = await screen.findByRole("region", { name: "Downtown, Lunch" });
    fireEvent.click(editOf(card));
    const ask = screen.getByRole("alertdialog", { name: "Edit Lunch lineup?" });
    expect(within(ask).getByText(/^Downtown · Published at \d{1,2}:\d{2} [AP]M$/)).toBeTruthy();
    expect(within(ask).getByText("Back to draft")).toBeTruthy();
    expect(within(ask).getByText("Staff don't see it until you publish again.")).toBeTruthy();
    // True whether or not the next publish asks staff to acknowledge.
    expect(within(ask).getByText("Everyone gets the new version")).toBeTruthy();
    expect(within(ask).getByText("When you publish again, everyone sees the new version; their earlier read doesn't carry over.")).toBeTruthy();
    expect(ask.textContent).not.toMatch(/acknowledge/i);
    expect(ask.textContent).not.toMatch(/only|change/i);
    // The card doesn't fold under the window.
    expect(within(card).getByRole("button", { name: "Hide list" })).toBeTruthy();
    fireEvent.click(within(ask).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(commands).toHaveLength(0);
    fireEvent.click(editOf(card));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Edit" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(commands[0]).toMatchObject({ kind: "unpublish", lineups: [{ location_id: downtown, service_date: day, shift_type_id: lunch }] });
    // Edit goes off once the lineup is a draft: focus waits on the card's chevron, not on the page's top.
    // The focus moves in an effect after the window has gone: wait for it (a busy machine may run the check first).
    await waitFor(() => expect(document.activeElement).toBe(within(card).getByRole("button", { name: "Hide list" })));
  });

  // Mert 2026-10-17 (~1:45 PM, notice A): the green Edit spins and says "Unpublishing…" while it works, then the
  // window closes and the card's Draft lights up once; no notice comes up from the bottom.
  it("works in the Edit window's green Edit, then lights the card's Draft once, with no notice", async () => {
    published = { [lunch]: live };
    renderPage();
    const card = await screen.findByRole("region", { name: "Downtown, Lunch" });
    fireEvent.click(editOf(card));
    const ask = screen.getByRole("alertdialog", { name: "Edit Lunch lineup?" });
    // The day read answers with the draft from now on.
    published = {};
    const edit = within(ask).getByRole("button", { name: "Edit" });
    edit.focus();
    fireEvent.click(edit);
    const pressed = Date.now();
    const working = within(ask).getByRole("button", { name: "Unpublishing…" }) as HTMLButtonElement;
    // Off while it works, yet still holding the keyboard's focus (not dropped on the page): aria-disabled, not disabled.
    expect(working).toBe(edit);
    expect(working.getAttribute("aria-disabled")).toBe("true");
    expect(working.getAttribute("aria-busy")).toBe("true");
    expect(document.activeElement).toBe(working);
    const cancel = within(ask).getByRole("button", { name: "Cancel" });
    expect(cancel.getAttribute("aria-disabled")).toBe("true");
    // A second press, Cancel or Escape while it works do nothing.
    fireEvent.click(working);
    fireEvent.click(cancel);
    fireEvent.keyDown(working, { key: "Escape" });
    expect(screen.getByRole("alertdialog")).toBe(ask);
    // The day read already says draft, the window still says when it went out (frozen when it opened).
    await within(card).findByText("Draft");
    expect(screen.queryByRole("alertdialog")).toBe(ask);
    expect(within(ask).getByText(/^Downtown · Published at \d{1,2}:\d{2} [AP]M$/)).toBeTruthy();
    expect(document.activeElement).toBe(working);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(commands).toHaveLength(1);
    // The answer is quick here; the button still holds LINEUP_BUSY_MS so its words can be read.
    expect(Date.now() - pressed).toBeGreaterThanOrEqual(LINEUP_BUSY_MS - 20);
    const status = within(card).getByText("Draft");
    expect(status.classList.contains("is-flash")).toBe(true);
    expect(within(card).getByText("Not published yet").classList.contains("is-flash")).toBe(true);
    fireEvent.animationEnd(status);
    expect(within(card).getByText("Draft").classList.contains("is-flash")).toBe(false);
    // No notice (the test's own address readout is an <output>, a status too).
    expect(screen.queryAllByRole("status").filter((element) => element.getAttribute("data-testid") !== "where")).toEqual([]);
  });

  it("says why Edit didn't go through, and the green Edit comes back", async () => {
    published = { [lunch]: live };
    const realRead = api.getMockImplementation()!;
    api.mockImplementation(async (client, path, init) => {
      if (path.endsWith("/lineups/commands")) throw new RequestError("No", "lineup.past_day", undefined, 400);
      return realRead(client, path, init);
    });
    renderPage();
    const card = await screen.findByRole("region", { name: "Downtown, Lunch" });
    fireEvent.click(editOf(card));
    const ask = screen.getByRole("alertdialog");
    fireEvent.click(within(ask).getByRole("button", { name: "Edit" }));
    // In the window's band (S-139), not a line in the text.
    expect((await within(ask).findByRole("alert")).textContent).toBe("This day is over. Its lineups can't change.");
    const edit = within(ask).getByRole("button", { name: "Edit" }) as HTMLButtonElement;
    expect(edit.disabled).toBe(false);
    expect(edit.getAttribute("aria-disabled")).toBeNull();
  });

  // LINEUP-E-POLISH 4: the card's lock says the day is over on a past day, "started" only while it runs.
  it("says the day is over on a past day's locked Edit", async () => {
    published = { [lunch]: { ...live, status: "past" } };
    renderPage();
    const card = await screen.findByRole("region", { name: "Downtown, Lunch" });
    expect(editOf(card).disabled).toBe(true);
    expect(editOf(card).title).toBe("This day is over");
  });

  // LINEUP-E-POLISH 2: moving to a day whose lineup is already out lights nothing on the card.
  it("lights nothing on the card when the next day's lineup is already out", async () => {
    world = model([
      shift({ employee: maria, job: server, type: lunch, start: "11:00", end: "16:00" }),
      shift({ employee: maria, job: server, type: lunch, start: "11:00", end: "16:00", date: "2026-10-14" }),
    ]);
    api.mockImplementation(async (_client, path) => {
      const dayPath = /\/lineups\/(\d{4}-\d{2}-\d{2})$/.exec(path);
      if (!dayPath) throw new Error(`unexpected ${path}`);
      return readers(dayRead(world, dayPath[1]!, dayPath[1] === "2026-10-14" ? { [lunch]: live } : {}));
    });
    renderPage();
    await within(await screen.findByRole("region", { name: "Downtown, Lunch" })).findByText("Draft");
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    await within(await screen.findByRole("region", { name: "Downtown, Lunch" })).findByText("Live");
    // Both days are in the cache now: back and forth between them.
    fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
    await within(await screen.findByRole("region", { name: "Downtown, Lunch" })).findByText("Draft");
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("?date=2026-10-14"));
    const card = await screen.findByRole("region", { name: "Downtown, Lunch" });
    await within(card).findByText("Live");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(within(card).getByText("Live").classList.contains("is-flash")).toBe(false);
  });

  // LINEUP-E-POLISH 3: All locations, the second location's lineup goes out: focus goes to its card's Edit, not
  // the first card's.
  it("gives focus to the published card's Edit when Publish goes, not the first card's", async () => {
    only = null;
    let sent = false;
    api.mockImplementation(async (_client, path, init) => {
      const dayPath = /\/lineups\/(\d{4}-\d{2}-\d{2})$/.exec(path);
      if (dayPath) {
        const out = readers(dayRead(world, dayPath[1]!, { [lunch]: live }));
        if (!sent) {
          // Uptown's lunch still waits; Downtown's is out.
          const draft = readers(dayRead(world, dayPath[1]!, {}));
          out.locations = out.locations.map((location) =>
            location.id === uptown ? draft.locations.find((each) => each.id === uptown)! : location);
        }
        return out;
      }
      const body = JSON.parse(String(init?.body)) as { command_id: string; kind: string };
      commands.push(body);
      sent = true;
      return { command_id: body.command_id, kind: body.kind, lineups: [] };
    });
    renderPage();
    const dock = await screen.findByRole("button", { name: "Publish, 1 lineup waiting" });
    dock.focus();
    // Where focus is the moment Publish leaves the page (BL-1158): already on the card's Edit, never on the page
    // in between. A check that waits for the dock to go runs right then, before anything scheduled after it.
    let focusWhenGone: Element | null | undefined;
    const watch = new MutationObserver(() => {
      if (focusWhenGone === undefined && !document.querySelector(".lineup-phone-dock")) focusWhenGone = document.activeElement;
    });
    watch.observe(document.body, { childList: true, subtree: true });
    fireEvent.click(dock);
    fireEvent.click(within(screen.getByRole("dialog", { name: "Publish lineups" })).getByRole("button", { name: "Publish 1" }));
    await waitFor(() => expect(document.querySelector(".lineup-phone-dock")).toBeNull(), { timeout: 4000 });
    watch.disconnect();
    const uptownCard = screen.getByRole("region", { name: "Uptown, Lunch" });
    const edit = within(uptownCard).getByRole("button", { name: "Edit" });
    expect(focusWhenGone).toBe(edit);
    expect(document.activeElement).toBe(edit);
  });

  // Read times are the location's clock's too: 21:40 UTC is 5:40 PM in New York.
  it("lists who read it when on the location's clock", async () => {
    zones = { [downtown]: "America/New_York" };
    reads = { [maria]: "2026-10-13T21:40:00Z" };
    published = { [lunch]: live };
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: "Read 1/1" }));
    const read = within(within(screen.getByRole("tabpanel")).getByRole("region", { name: "Read" })).getByRole("listitem");
    expect(read.textContent).toBe("MLMaria LopezServer5:40 PM");
  });

  // Mert 2026-10-18 (screenshots): Publish covered the last row. While it shows, the list ends with room for it.
  it("leaves room under the last row while Publish shows, and only a little air otherwise", async () => {
    renderPage();
    await screen.findByRole("button", { name: /^Publish, \d+ lineups? waiting$/ });
    const end = document.querySelector(".lineup-phone-end")!;
    expect(end.classList.contains("has-dock")).toBe(true);
    cleanup();
    published = { [lunch]: live };
    renderPage();
    await screen.findByRole("region", { name: "Downtown, Lunch" });
    expect(screen.queryByRole("button", { name: /^Publish/ })).toBeNull();
    expect(document.querySelector(".lineup-phone-end")!.classList.contains("has-dock")).toBe(false);
    const css = readFileSync("src/views/lineup-phone.css", "utf8");
    expect(css).toMatch(/\.lineup-phone-end\.has-dock\s*\{\s*height:\s*74px;/);
    expect(css).toMatch(/\.app-main:has\(\.lineup-phone-end\.has-dock\)\s*\{\s*scroll-padding-bottom:\s*74px;/);
  });

  // "Published at" reads the location's clock, as the lock does: 21:10 UTC is 5:10 PM in New York.
  it("tells when a lineup went out on the location's clock", async () => {
    const realRead = api.getMockImplementation()!;
    api.mockImplementation(async (client, path, init) => {
      const answer = await realRead(client, path, init);
      if (/\/lineups\/\d{4}-\d{2}-\d{2}$/.test(path))
        for (const location of (answer as ReturnType<typeof dayRead>).locations) location.timezone = "America/New_York";
      return answer;
    });
    published = { [lunch]: live };
    renderPage();
    const card = await screen.findByRole("region", { name: "Downtown, Lunch" });
    expect(within(card).getByText("Published at 5:10 PM")).toBeTruthy();
    fireEvent.click(editOf(card));
    expect(within(screen.getByRole("alertdialog")).getByText("Downtown · Published at 5:10 PM")).toBeTruthy();
  });

  // Nobody on it has the app: nothing to count, so no "0/0" bar.
  it("draws no progress bar when nobody on the lineup has the app", async () => {
    world = model([shift({ employee: maria, job: server, type: lunch, start: "11:00", end: "16:00" })]);
    reads = { [maria]: "no app" };
    published = { [lunch]: { ...live, acknowledged: 0, with_app: 0, people: 1 } };
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: "Read 0/0" }));
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).queryByRole("progressbar")).toBeNull();
    expect(within(panel).getAllByRole("region").map((region) => region.getAttribute("aria-label"))).toEqual(["No app"]);
    // Nor when the count says nobody while a row is still listed unread: no "0/0", no bar with a maximum of 0.
    cleanup();
    reads = {};
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: "Read 0/0" }));
    const again = screen.getByRole("tabpanel");
    expect(within(again).getByRole("region", { name: "Not read yet" })).toBeTruthy();
    expect(within(again).queryByRole("progressbar")).toBeNull();
    expect(within(again).queryByText("0/0")).toBeNull();
  });

  // Mert 2026-10-17 (~8 AM): only the page header stays fixed, at full size; everything under it scrolls.
  it("pins only the page header; the date row, wheel and tabs scroll with the page", async () => {
    renderPage();
    await screen.findByRole("region", { name: "Downtown, Lunch" });
    const pinned = document.querySelectorAll("[data-frozen-own]");
    expect(pinned).toHaveLength(1);
    const head = pinned[0]!;
    expect(head.className).toBe("lineup-phone-head");
    expect(head.querySelector(".catalog-page-header")).toBeTruthy();
    for (const name of ["Day", "Day. Swipe or use the arrow keys.", "Shifts"])
      expect(head.contains(screen.getByRole("group", { name }))).toBe(false);
    const css = readFileSync("src/views/lineup-phone.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const sticky = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, , body]) => /position\s*:\s*sticky/.test(body!))
      .map(([, selector]) => selector!.trim());
    expect(sticky).toEqual([".lineup-phone-page .lineup-phone-head"]);
  });

  // Mert 2026-10-17 (~9:10 AM): the location and the day go into the card, right under the shift tabs.
  it("puts the location and date in the card, under the shift tabs", async () => {
    renderPage();
    const card = await screen.findByRole("region", { name: "Downtown, Lunch" });
    expect(card.querySelector(".lineup-card-loc")?.textContent).toBe("Downtown");
    expect(card.querySelector(".lineup-card-date")?.textContent).toBe("Tue, Oct 13");
    expect(document.querySelector(".lineup-day-head")).toBeNull();
    expect(card.parentElement?.previousElementSibling?.classList.contains("lineup-phone-top")).toBe(true);
    // Team · Notes · Read sit inside the card.
    expect(card.contains(screen.getByRole("tablist", { name: "Lineup" }))).toBe(true);
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
    expect(screen.queryByRole("button", { name: /Add Staff|Call off/ })).toBeNull();
    // The one Edit is the card's (it takes the lineup back to draft); the list has none.
    expect(screen.getAllByRole("button", { name: /Edit/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Edit" }).closest(".lineup-card-head")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Team 1" }).getAttribute("aria-selected")).toBe("true");
  });

  // Mert 2026-10-17 (~11:30 AM): one white card, a section per note with its icon and heading; nothing edits it.
  it("reads the notes in the Notes tab, each in its own section, with nothing to type in", async () => {
    published = { [lunch]: { notes: { specials: "Halibut", n86: "", shift_notes: "Patio opens at 5" } } };
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: "Notes 2" }));
    const panel = screen.getByRole("tabpanel");
    const notes = within(panel).getByRole("region", { name: "Notes" });
    expect(within(notes).getAllByRole("heading").map((heading) => heading.textContent)).toEqual(["Specials", "Shift notes"]);
    expect(within(notes).getByRole("heading", { name: "Specials" }).nextElementSibling?.textContent).toBe("Halibut");
    expect(within(notes).getByRole("heading", { name: "Shift notes" }).nextElementSibling?.textContent).toBe("Patio opens at 5");
    expect(within(panel).queryByRole("textbox")).toBeNull();
    expect(within(panel).queryByRole("button")).toBeNull();
  });

  it("says when a lineup has no notes yet", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: "Notes" }));
    expect(within(screen.getByRole("tabpanel")).getByText("No notes yet.")).toBeTruthy();
  });

  // Mert 2026-10-17 (~2 PM): an empty shift's box hangs off its card and names the shift and the place, one line.
  it("joins an empty shift's box to its card, with no Add Staff", async () => {
    renderPage(`/app/schedule/lineup?shift=${dinner}`);
    const card = await screen.findByRole("region", { name: "Downtown, Dinner" });
    const box = screen.getByText("No one is scheduled for Dinner at Downtown");
    expect(box.getAttribute("title")).toBe("No one is scheduled for Dinner at Downtown");
    expect(card.classList.contains("is-joined")).toBe(true);
    expect(screen.queryByRole("button", { name: /Add Staff/ })).toBeNull();
  });

  // KARARLAR §1.5: a swipe sideways moves between Team, Notes and Read; the day wheel and the shift tabs keep
  // their own (a swipe never changes the shift). Read opens once the lineup is published.
  it("moves between Team, Notes and Read on a swipe, never the shift", async () => {
    published = { [lunch]: live };
    renderPage();
    const swipe = (target: Element, dx: number) => {
      fireEvent.touchStart(target, { touches: [{ clientX: 200, clientY: 500 }] });
      fireEvent.touchEnd(target, { touches: [], changedTouches: [{ clientX: 200 + dx, clientY: 505 }] });
    };
    const selected = () => screen.getAllByRole("tab").find((tab) => tab.getAttribute("aria-selected") === "true")!.textContent;
    swipe(await screen.findByRole("tabpanel"), -120);
    expect(selected()).toMatch(/^Notes/);
    swipe(screen.getByRole("tabpanel"), -120);
    expect(selected()).toMatch(/^Read/);
    swipe(screen.getByRole("tabpanel"), -120);
    expect(selected()).toMatch(/^Read/);
    const pressed = () => screen.getByRole("group", { name: "Shifts" }).querySelector('[aria-pressed="true"]')!.textContent;
    const shiftBefore = pressed();
    swipe(screen.getByRole("group", { name: "Shifts" }), 120);
    swipe(screen.getByRole("group", { name: /^Day. Swipe/ }), 120);
    expect(pressed()).toBe(shiftBefore);
    expect(selected()).toMatch(/^Read/);
  });

  it("stops a swipe at Notes while Read is off", async () => {
    renderPage();
    const swipe = (target: Element) => {
      fireEvent.touchStart(target, { touches: [{ clientX: 200, clientY: 500 }] });
      fireEvent.touchEnd(target, { touches: [], changedTouches: [{ clientX: 80, clientY: 505 }] });
    };
    swipe(await screen.findByRole("tabpanel"));
    swipe(screen.getByRole("tabpanel"));
    expect(screen.getByRole("tab", { name: "Notes" }).getAttribute("aria-selected")).toBe("true");
  });

  // Mert 2026-10-17 (~12:30 PM): Read stays in view but is off until the lineup is published.
  it("shows Read off until the lineup is published", async () => {
    renderPage();
    const tab = (await screen.findByRole("tab", { name: "Read" })) as HTMLButtonElement;
    expect(tab.disabled).toBe(true);
    fireEvent.click(tab);
    expect(screen.getByRole("tab", { name: "Team 1" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Team 1" }), { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Notes" }).getAttribute("aria-selected")).toBe("true");
  });

  // Mert 2026-10-17 (~1 PM): no summary card; one bar on the first heading (Read, or Not read yet when no one has
  // read it), N/N and the bar on the right; Read first, then Not read yet, then No app; no empty Read section.
  it("puts one progress bar on the first heading, nobody read yet", async () => {
    world = model([
      shift({ employee: maria, job: server, type: lunch, start: "11:00", end: "16:00" }),
      shift({ employee: hannah, job: server, type: lunch, start: "11:00", end: "16:00" }),
    ]);
    published = { [lunch]: { ...live, acknowledged: 0, with_app: 2, people: 2 } };
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: "Read 0/2" }));
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getAllByRole("region").map((region) => region.getAttribute("aria-label"))).toEqual(["Not read yet"]);
    const bar = within(within(panel).getByRole("region", { name: "Not read yet" })).getByRole("progressbar", { name: "0 of 2 read" });
    expect(bar.getAttribute("aria-valuenow")).toBe("0");
    expect(bar.previousElementSibling?.textContent).toBe("0/2");
    expect(within(panel).getAllByRole("progressbar")).toHaveLength(1);
  });

  it("lists who read it once published, who hasn't, and who has no app", async () => {
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
    expect(within(panel).queryByText(/of 2 read/)).toBeNull();
    expect(within(panel).getAllByRole("region").map((region) => region.getAttribute("aria-label"))).toEqual(["Read", "Not read yet", "No app"]);
    expect(within(within(panel).getByRole("region", { name: "Read" })).getByRole("progressbar", { name: "1 of 2 read" })).toBeTruthy();
    expect(within(panel).getAllByRole("progressbar")).toHaveLength(1);
    const group = (name: string) => within(within(panel).getByRole("region", { name })).getAllByRole("listitem");
    expect(group("Not read yet").map((row) => row.textContent)).toEqual(["MLMaria LopezServer—"]);
    const [read] = group("Read");
    expect(read!.textContent).toMatch(/^HLHannah LeeServer\d{1,2}:\d{2} [AP]M$/);
    expect(group("No app").map((row) => row.textContent)).toEqual(["CDChloe DavisServerNot counted"]);
  });

  it("keeps Publish at the bottom with the waiting count, and opens the window as a sheet", async () => {
    only = null;
    renderPage();
    const dock = await screen.findByRole("button", { name: "Publish, 2 lineups waiting" });
    expect(dock.closest(".lineup-phone-dock")).toBeTruthy();
    fireEvent.click(dock);
    const sheet = screen.getByRole("dialog", { name: "Publish lineups" });
    expect(sheet.classList.contains("is-sheet")).toBe(true);
    fireEvent.click(within(sheet).getByRole("button", { name: "Publish 2" }));
    expect(within(sheet).getByRole("button", { name: "Publishing…" })).toBeTruthy();
    expect(within(sheet).queryByText(/notified/)).toBeNull();
    // The sheet closes; the dock says Published.
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Publish lineups" })).toBeNull(), { timeout: 2000 });
    expect(screen.getByRole("button", { name: "Published" }).closest(".lineup-phone-dock")).toBeTruthy();
    expect(commands[0]).toMatchObject({ kind: "share", ask_ack: true });
  });

  it("places Publish over the app's bottom bar, its right edge where More ends", async () => {
    const bar = document.createElement("nav");
    bar.className = "phone-bar";
    const more = document.createElement("button");
    bar.append(document.createElement("a"), more);
    document.body.append(bar);
    only = null;
    bar.getBoundingClientRect = () => ({ top: 782, height: 62 }) as DOMRect;
    more.getBoundingClientRect = () => ({ left: 306, right: window.innerWidth - 10 }) as DOMRect;
    try {
      renderPage();
      const dock = (await screen.findByRole("button", { name: "Publish, 2 lineups waiting" })).closest<HTMLElement>(".lineup-phone-dock")!;
      expect([dock.style.left, dock.style.right, dock.style.bottom, dock.dataset.place]).toEqual([
        "",
        "10px",
        `${Math.round(window.innerHeight - 782 + 10)}px`,
        "bar",
      ]);
    } finally {
      bar.remove();
    }
  });

  // Mert 2026-10-17 (~1:40 PM, ~9:50 PM): Publish shows only while the shift on screen, at the location shown, has
  // a draft that can go out; its count still says how many the window sends.
  it("draws no Publish when the shift on screen has nothing to publish", async () => {
    world = model([]);
    renderPage();
    await screen.findByRole("region", { name: "Downtown, Lunch" });
    expect(screen.queryByRole("button", { name: /^Publish/ })).toBeNull();
    expect(document.querySelector(".lineup-phone-dock")).toBeNull();
  });

  it("draws Publish on a shift with a draft, not on a published or an empty one", async () => {
    only = null;
    world = model([
      shift({ employee: maria, job: server, type: lunch, start: "11:00", end: "16:00" }),
      shift({ employee: hannah, job: server, type: lunch, start: "11:00", end: "16:00", location: uptown }),
      shift({ employee: hannah, job: server, type: dinner, start: "17:00", end: "22:00", location: uptown }),
    ]);
    published = { [lunch]: live };
    renderPage(`/app/schedule/lineup?location=${downtown}`);
    await screen.findByRole("region", { name: "Downtown, Lunch" });
    // Uptown's dinner still waits, but Downtown's lunch is out: nothing to publish here.
    expect(screen.queryByRole("button", { name: /^Publish/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dinner, no one" }));
    await screen.findByRole("region", { name: "Downtown, Dinner" });
    expect(screen.queryByRole("button", { name: /^Publish/ })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Location" }), { target: { value: uptown } });
    await screen.findByRole("region", { name: "Uptown, Dinner" });
    expect(screen.getByRole("button", { name: "Publish, 1 lineup waiting" })).toBeTruthy();
  });

  // Mert 2026-10-17 (notice A; mockup v-e.js .d-pub): the sheet closes, the dock says Published, then goes (nothing
  // left to publish here); the card's Live and "Published at" light up once the sheet has closed, not behind it;
  // focus goes from the dock to the card's Edit, never to the page.
  it("closes the sheet on publish, says Published on the dock, then lets it go and lights the card", async () => {
    only = null;
    api.mockImplementation(async (_client, path, init) => {
      const dayPath = /\/lineups\/(\d{4}-\d{2}-\d{2})$/.exec(path);
      if (dayPath) return readers(dayRead(world, dayPath[1]!, published));
      const body = JSON.parse(String(init?.body)) as { command_id: string; kind: string };
      commands.push(body);
      published = { [lunch]: live };
      return { command_id: body.command_id, kind: body.kind, lineups: [] };
    });
    renderPage();
    const dock = await screen.findByRole("button", { name: "Publish, 2 lineups waiting" });
    dock.focus();
    fireEvent.click(dock);
    const sheet = screen.getByRole("dialog", { name: "Publish lineups" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Publish 2" }));
    const card = await screen.findByRole("region", { name: "Downtown, Lunch" });
    // Live under the sheet: not lit yet.
    await within(card).findByText("Live");
    expect(screen.getByRole("dialog", { name: "Publish lineups" })).toBeTruthy();
    expect(within(card).getByText("Live").classList.contains("is-flash")).toBe(false);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Publish lineups" })).toBeNull(), { timeout: 2000 });
    // Live and "Published at" light up once on the card (notice A), no notice.
    await waitFor(() => expect(within(card).getByText("Live").classList.contains("is-flash")).toBe(true));
    expect(within(card).getByText(/^Published at /).classList.contains("is-flash")).toBe(true);
    const said = screen.getByRole("button", { name: "Published" });
    expect(said).toBe(dock);
    await waitFor(() => expect(document.activeElement).toBe(dock));
    // Then it goes: nothing left to publish on this shift; focus waits on the card's Edit.
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Publish/ })).toBeNull(), { timeout: 3000 });
    expect(document.querySelector(".lineup-phone-dock")).toBeNull();
    expect(document.activeElement).toBe(within(card).getByRole("button", { name: "Edit" }));
    expect(screen.queryAllByRole("status").filter((element) => element.getAttribute("data-testid") !== "where")).toEqual([]);
  });

  // LINEUP-E-POLISH review (orta-1): a press on the floating Publish while the sheet publishes leaves the sheet, and
  // the day wheel's day stays, so a refusal still shows.
  it("keeps the sheet and the day while it publishes: the floating Publish and the day wait", async () => {
    only = null;
    let refuse: ((reason: unknown) => void) | null = null;
    api.mockImplementation(async (_client, path) => {
      if (path.endsWith("/lineups/commands")) return new Promise((_resolve, reject) => (refuse = reject));
      const dayPath = /\/lineups\/(\d{4}-\d{2}-\d{2})$/.exec(path);
      return readers(dayRead(world, dayPath![1]!, published));
    });
    renderPage();
    const dock = await screen.findByRole("button", { name: "Publish, 2 lineups waiting" });
    fireEvent.click(dock);
    const sheet = screen.getByRole("dialog", { name: "Publish lineups" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Publish 2" }));
    expect(dock.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(dock);
    expect(screen.getByRole("dialog", { name: "Publish lineups" })).toBe(sheet);
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    expect(screen.getByTestId("where").textContent).toBe("");
    expect(screen.getByRole("dialog", { name: "Publish lineups" })).toBe(sheet);
    await waitFor(() => expect(refuse).not.toBeNull());
    refuse!(new RequestError("No", "lineup.one_day", undefined, 400));
    expect((await within(sheet).findByRole("alert")).textContent).toBe("Publish one day's lineups at a time.");
    expect(dock.getAttribute("aria-busy")).toBeNull();
  });

  it("has no Publish dock for someone who can't publish", async () => {
    const actions = context.actions;
    (context as { actions: string[] }).actions = ["schedule.read", "lineup.read"];
    try {
      renderPage();
      await screen.findByRole("region", { name: "Downtown, Lunch" });
      expect(screen.queryByRole("button", { name: /^Publish/ })).toBeNull();
      // Nor an Edit: taking a lineup back is publishing's other half.
      expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    } finally {
      (context as { actions: readonly string[] }).actions = actions;
    }
  });
});
