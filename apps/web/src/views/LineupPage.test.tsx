import type { ActiveWorkspaceContext } from "@newfork/shared";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RequestError } from "../lib/request-error";
import { getScheduleReadModel } from "../schedule/schedule-data";
import { day, dinner, downtown, hannah, lunch, maria, model, server, shift, uptown, ws } from "../schedule/lineup.testing";
import { LineupPage } from "./LineupPage";

// Lineup, read-only first stage (Mert 2026-10-13): the day's live Schedule
// per location and shift, with the day picker and the two filters.

const context = {
  userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
  workspace: { id: ws, name: "Harbor & Vine" },
  membership: { role: "owner", status: "active", allLocations: true },
  permissions: ["schedule.read"],
  actions: ["schedule.read"],
} as unknown as ActiveWorkspaceContext;

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context }) }));
vi.mock("../lib/today", async (original) => ({ ...(await original<object>()), todayIn: () => "2026-10-13" }));
vi.mock("../schedule/hooks/useScheduleRealtime", () => ({ useScheduleRealtime: () => undefined }));
vi.mock("../schedule/schedule-data", async (original) => ({
  ...(await original<object>()),
  getScheduleReadModel: vi.fn(),
}));

const read = vi.mocked(getScheduleReadModel);

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
  read.mockReset();
  read.mockResolvedValue(
    model([
      shift({ employee: maria, job: server, type: lunch, start: "11:00", end: "16:00", labels: ["Training"] }),
      shift({ employee: hannah, job: server, type: lunch, start: "11:00", end: "16:00", location: uptown }),
    ]),
  );
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
    expect(loading.getAttribute("aria-busy")).toBe("true");
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
    expect(await screen.findByText("You don't have access to the lineup")).toBeTruthy();
  });
});
