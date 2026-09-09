import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmployeeLineupOffers } from "./EmployeeLineupOffers";
import { getLineupOffers, respondToLineupOffer } from "../lineup-data";

vi.mock("../lineup-data", () => ({
  getLineupOffers: vi.fn(),
  respondToLineupOffer: vi.fn(),
}));
const offer = {
  id: "10000000-0000-4000-8000-000000000001",
  status: "pending",
  date: "2030-01-07",
  location_name: "Main Dining",
  job_name: "Server",
  start_time: "22:00",
  end_time: "02:00",
  expires_at: "2030-01-07T22:00:00Z",
};
const workspace = "10000000-0000-4000-8000-000000000002";
function show(path = "/app/employee-hub/shift-hub") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/app/employee-hub/shift-hub"
            element={
              <EmployeeLineupOffers
                workspaceId={workspace}
                showLineupLink
                timeFormat="12h"
              />
            }
          />
          <Route
            path="/app/employee-hub/lineup"
            element={<EmployeeLineupOffers workspaceId={workspace} />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getLineupOffers).mockResolvedValue([offer]);
  vi.mocked(respondToLineupOffer).mockResolvedValue({ status: "accepted" });
});
afterEach(cleanup);

describe("manager staffing offers in the employee action center", () => {
  it("requires an explicit accept-anyway action and sends the current own-availability token", async () => {
    const warning = { fingerprint: "a".repeat(64) };
    vi.mocked(getLineupOffers).mockResolvedValue([
      { ...offer, availability_warning: warning },
    ]);
    show();
    const accept = await screen.findByRole("button", { name: "Accept anyway" });
    expect(
      screen.getByText(/will not change your weekly preferences/),
    ).toBeTruthy();
    expect(respondToLineupOffer).not.toHaveBeenCalled();
    vi.mocked(getLineupOffers).mockResolvedValue([
      { ...offer, status: "accepted", availability_warning: null },
    ]);
    fireEvent.click(accept);
    await screen.findByText("Awaiting manager");
    expect(respondToLineupOffer).toHaveBeenCalledWith(
      workspace,
      offer.id,
      "accept",
      warning.fingerprint,
    );
    expect(screen.queryByText(/conflicts with your availability/)).toBeNull();
  });
  it("does not attach acceptance evidence when declining a conflicting offer", async () => {
    vi.mocked(getLineupOffers).mockResolvedValue([
      { ...offer, availability_warning: { fingerprint: "a".repeat(64) } },
    ]);
    show();
    const decline = await screen.findByRole("button", { name: "Decline" });
    vi.mocked(getLineupOffers).mockResolvedValue([]);
    fireEvent.click(decline);
    await screen.findByText("Offer declined. Your schedule has not changed.");
    expect(respondToLineupOffer).toHaveBeenCalledWith(
      workspace,
      offer.id,
      "decline",
    );
  });
  it("requires a new click with a fresh token after a changed-conflict rejection", async () => {
    vi.mocked(getLineupOffers).mockResolvedValue([
      { ...offer, availability_warning: { fingerprint: "a".repeat(64) } },
    ]);
    vi.mocked(respondToLineupOffer).mockRejectedValueOnce(
      new Error("Refresh this changed offer"),
    );
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: "Accept anyway" }),
    );
    await screen.findByText("Refresh this changed offer");
    expect(
      screen.getByRole("button", { name: "Accept anyway" }),
    ).toHaveProperty("disabled", true);
    vi.mocked(getLineupOffers).mockResolvedValue([
      { ...offer, availability_warning: { fingerprint: "b".repeat(64) } },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Refresh offers" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Accept anyway" }),
      ).toHaveProperty("disabled", false),
    );
    expect(respondToLineupOffer).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Accept anyway" }));
    await waitFor(() =>
      expect(respondToLineupOffer).toHaveBeenLastCalledWith(
        workspace,
        offer.id,
        "accept",
        "b".repeat(64),
      ),
    );
  });
  it("renders one underlying offer and follows its Line Up link with keyboard focus", async () => {
    show();
    const link = await screen.findByRole("link", { name: "View in Line Up" });
    expect(link.getAttribute("href")).toBe(
      `/app/employee-hub/lineup?staffing_offer=${offer.id}`,
    );
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByText(/\(\+1 day\)/)).toBeTruthy();
    fireEvent.click(link);
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("article")),
    );
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "View in Line Up" })).toBeNull();
    expect(respondToLineupOffer).not.toHaveBeenCalled();
  });
  it("accepts once and shows awaiting manager without a second response action", async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(respondToLineupOffer).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    show();
    const accept = await screen.findByRole("button", { name: "Accept offer" });
    fireEvent.click(accept);
    fireEvent.click(accept);
    expect(respondToLineupOffer).toHaveBeenCalledTimes(1);
    expect(respondToLineupOffer).toHaveBeenCalledWith(
      workspace,
      offer.id,
      "accept",
    );
    vi.mocked(getLineupOffers).mockResolvedValue([
      { ...offer, status: "accepted" },
    ]);
    finish({ status: "accepted" });
    await screen.findByText("Awaiting manager");
    expect(screen.queryByRole("button", { name: "Accept offer" })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain(
      "not on your schedule yet",
    );
  });
  it("retains a successful acceptance if the following read fails, then recovers", async () => {
    show();
    const accept = await screen.findByRole("button", { name: "Accept offer" });
    vi.mocked(getLineupOffers).mockRejectedValue(new Error("offline"));
    fireEvent.click(accept);
    await screen.findByRole("alert");
    expect(screen.getByText("Awaiting manager")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Offer accepted");
    expect(screen.queryByRole("button", { name: "Accept offer" })).toBeNull();
    vi.mocked(getLineupOffers).mockResolvedValue([
      { ...offer, status: "accepted" },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Refresh offers" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(respondToLineupOffer).toHaveBeenCalledTimes(1);
  });
  it("declines the last offer and retains the confirmation after the row disappears", async () => {
    show();
    const decline = await screen.findByRole("button", { name: "Decline" });
    decline.focus();
    vi.mocked(getLineupOffers).mockResolvedValue([]);
    fireEvent.click(decline);
    await screen.findByText("Offer declined. Your schedule has not changed.");
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("status")),
    );
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(respondToLineupOffer).toHaveBeenCalledWith(
      workspace,
      offer.id,
      "decline",
    );
  });
  it("does not mislabel a failed response as accepted and requires a fresh read", async () => {
    vi.mocked(respondToLineupOffer).mockRejectedValue(
      new Error("Offer has expired"),
    );
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: "Accept offer" }),
    );
    await screen.findByText("Offer has expired");
    expect(
      (
        screen.getByRole("button", {
          name: "Accept offer",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.queryByText("Awaiting manager")).toBeNull();
    vi.mocked(getLineupOffers).mockResolvedValue([]);
    fireEvent.click(screen.getByRole("button", { name: "Refresh offers" }));
    await waitFor(() => expect(screen.queryByRole("article")).toBeNull());
    expect(respondToLineupOffer).toHaveBeenCalledTimes(1);
  });
  it("explains a closed or inaccessible deep link and points to the actual Schedule route", async () => {
    vi.mocked(getLineupOffers).mockResolvedValue([]);
    show(`/app/employee-hub/lineup?staffing_offer=${offer.id}`);
    await screen.findByText("This offer is no longer awaiting your response");
    expect(
      screen
        .getByRole("link", { name: "View my schedule" })
        .getAttribute("href"),
    ).toBe("/app/employee-hub/schedule");
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("article")),
    );
    expect(respondToLineupOffer).not.toHaveBeenCalled();
  });
  it("shows a loading status and provides a retry after an initial read failure", async () => {
    let fail!: (reason: Error) => void;
    vi.mocked(getLineupOffers).mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
    );
    show();
    expect(screen.getByRole("status").textContent).toContain(
      "Loading shift offers",
    );
    fail(new Error("offline"));
    fireEvent.click(
      await screen.findByRole("button", { name: "Refresh offers" }),
    );
    await screen.findByRole("button", { name: "Accept offer" });
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("does not expose acceptance for an unknown terminal status", async () => {
    vi.mocked(getLineupOffers).mockResolvedValue([
      { ...offer, status: "confirmed" },
    ]);
    show();
    await screen.findByText("Offer updated");
    expect(screen.queryByRole("button", { name: "Accept offer" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Decline" })).toBeNull();
  });
});
