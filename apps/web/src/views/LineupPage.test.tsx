import type { ActiveWorkspaceContext } from "@newfork/shared";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RequestError } from "../lib/request-error";
import { getScheduleReadModel } from "../schedule/schedule-data";
import type { LineupDayLineup } from "@newfork/shared";
import { apiRequest } from "../lib/supabase";
import { day, dayRead, dinner, downtown, hannah, lunch, maria, model, server, shift, uptown, ws } from "../schedule/lineup.testing";
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

const read = vi.mocked(getScheduleReadModel);
const api = vi.mocked(apiRequest);
// The world both reads answer from: the Schedule read gives the catalog, the lineup day read the rows.
let world = model([]);
let published: Record<string, Partial<LineupDayLineup>> = {};
const commands: unknown[] = [];

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
    if (dayPath) return dayRead(world, dayPath[1]!, published);
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
