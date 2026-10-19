// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShiftType } from "@newfork/shared";
import ShiftTypesSettingsPage from "./ShiftTypesSettingsPage";
import { stubPhoneWidth } from "../lib/phone-width.test-util";
import { MemoryRouter } from "react-router";
import {
  listShiftTypes,
  saveShiftType,
  setShiftTypeArchived,
} from "./organization-data";
const workspace = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const type: ShiftType = {
  id: "afa60000-0000-4000-8000-000000000001",
  workspace_id: workspace,
  name: "Lunch",
  color: "#123456",
  default_start_time: "12:00",
  default_end_time: "16:00",
  default_revision: 1,
  crosses_midnight: false,
  sort_order: 0,
  archived_at: null,
};
const auth = vi.hoisted(() => ({ manage: true }));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    context: {
      workspace: { id: workspace },
      permissions: [
        "settings.shift_catalog.read",
        ...(auth.manage ? ["settings.shift_catalog.manage"] : []),
      ],
    },
  }),
}));
vi.mock("./organization-data", () => ({
  listShiftTypes: vi.fn(),
  saveShiftType: vi.fn(),
  reorderShiftTypes: vi.fn(),
  setShiftTypeArchived: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  auth.manage = true;
  vi.mocked(listShiftTypes).mockResolvedValue([type]);
  vi.mocked(saveShiftType).mockResolvedValue();
});
afterEach(cleanup);
async function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ShiftTypesSettingsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Edit Lunch" }));
  return client;
}
// PRESET-SAAT (S-183), variant A: Dinner 4:15–11:30 PM primary, 5–11 PM and 6–11:30 PM more.
describe("shift type times (variant A)", () => {
  it("adds a time, makes it primary and saves the old primary as an option", async () => {
    await setup();
    fireEvent.click(screen.getByRole("button", { name: "Add time" }));
    expect(
      screen.getByRole("button", { name: "Save shift type" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByText("Enter a start and an end time, or remove this time.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Time 2 start"), { target: { value: "17:00" } });
    fireEvent.change(screen.getByLabelText("Time 2 end"), { target: { value: "22:00" } });
    fireEvent.click(screen.getByLabelText("Make time 2 primary"));
    expect((screen.getByLabelText("Make time 2 primary") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save shift type" }));
    await waitFor(() =>
      expect(saveShiftType).toHaveBeenCalledWith(
        workspace,
        {
          name: "Lunch",
          color: "#123456",
          default_start_time: "17:00",
          default_end_time: "22:00",
          time_options: [{ start_time: "12:00", end_time: "16:00" }],
        },
        type.id,
        1,
      ),
    );
  });
  it("says in the list how many more times a type keeps", async () => {
    vi.mocked(listShiftTypes).mockResolvedValue([
      { ...type, time_options: [{ start_time: "17:00", end_time: "22:00" }] },
    ]);
    await setup();
    expect(screen.getAllByText(/\+1 more/).length).toBeGreaterThan(0);
  });
  it("opens a type with its options under the primary and refuses a repeated time", async () => {
    vi.mocked(listShiftTypes).mockResolvedValue([
      { ...type, time_options: [{ start_time: "17:00", end_time: "22:00" }] },
    ]);
    await setup();
    expect((screen.getByLabelText("Time 2 start") as HTMLInputElement).value).toBe("17:00");
    expect(screen.getByText("Primary")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Time 2 start"), { target: { value: "12:00" } });
    fireEvent.change(screen.getByLabelText("Time 2 end"), { target: { value: "16:00" } });
    expect(screen.getByText("This time is already in the list.")).toBeTruthy();
    expect(screen.getByLabelText("Time 2 end").getAttribute("aria-invalid")).toBe("true");
    expect(
      screen.getByRole("button", { name: "Save shift type" }).hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove time 2" }));
    expect(screen.queryByLabelText("Time 2 start")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Remove time 1" }).hasAttribute("disabled"),
    ).toBe(true);
  });
});

describe("shift type default review", () => {
  it("shows before/after reference hours and submits the reviewed revision", async () => {
    await setup();
    fireEvent.change(screen.getByLabelText("Time 1 start"), {
      target: { value: "11:00" },
    });
    expect(
      screen.getByText(
        "Currently saved: 12:00 PM – 4:00 PM. After saving: 11:00 AM – 4:00 PM.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/Existing shifts keep their saved reference hours/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save shift type" }));
    await waitFor(() =>
      expect(saveShiftType).toHaveBeenCalledWith(
        workspace,
        {
          name: "Lunch",
          color: "#123456",
          default_start_time: "11:00",
          default_end_time: "16:00",
          time_options: [],
        },
        type.id,
        1,
      ),
    );
  });
  it("explains overnight and missing default hours without inventing a valid range", async () => {
    await setup();
    fireEvent.change(screen.getByLabelText("Time 1 start"), {
      target: { value: "22:00" },
    });
    expect(
      screen.getByText(/After saving: 10:00 PM – 4:00 PM \(Ends next day\)/),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Time 1 start"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Time 1 end"), {
      target: { value: "" },
    });
    expect(
      screen.getByText(/Default start and end times are required/),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Save shift type" }).hasAttribute("disabled"),
    ).toBe(true);
  });
  // BL-677 (3): a grey Save says why; BL-1031: in the Schedule editor's words.
  it("says why Save is off when start and end are the same", async () => {
    await setup();
    fireEvent.change(screen.getByLabelText("Time 1 start"), {
      target: { value: "16:00" },
    });
    expect(
      screen.getByRole("button", { name: "Save shift type" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByText("Start and end time cannot be the same.")).toBeTruthy();
    expect(screen.getByLabelText("Time 1 end").getAttribute("aria-invalid")).toBe("true");
  });
  it("preserves edits on a stale save and reloads only on the explicit discard action", async () => {
    await setup();
    fireEvent.change(screen.getByLabelText("Time 1 start"), {
      target: { value: "11:00" },
    });
    vi.mocked(saveShiftType).mockRejectedValueOnce(
      new Error("Default hours changed"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save shift type" }));
    await screen.findByText("Default hours changed");
    expect(
      (screen.getByLabelText("Time 1 start") as HTMLInputElement).value,
    ).toBe("11:00");
    vi.mocked(listShiftTypes).mockResolvedValue([
      { ...type, default_revision: 2, default_start_time: "10:00" },
    ]);
    fireEvent.click(
      screen.getByRole("button", { name: "Discard draft and reload latest" }),
    );
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Time 1 start") as HTMLInputElement).value,
      ).toBe("10:00"),
    );
    expect(
      screen.getByRole("button", { name: "Save shift type" }).hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Time 1 start"), {
      target: { value: "11:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save shift type" }));
    await waitFor(() =>
      expect(vi.mocked(saveShiftType).mock.calls.at(-1)?.[3]).toBe(2),
    );
  });
  it("blocks a refreshed conflicting revision without discarding the local draft", async () => {
    const client = await setup();
    fireEvent.change(screen.getByLabelText("Time 1 start"), {
      target: { value: "11:00" },
    });
    client.setQueryData(
      ["shift-types", workspace],
      [{ ...type, default_revision: 2 }],
    );
    await screen.findByText(/The default hours changed while/);
    expect(
      screen.getByRole("button", { name: "Save shift type" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      (screen.getByLabelText("Time 1 start") as HTMLInputElement).value,
    ).toBe("11:00");
    expect(saveShiftType).not.toHaveBeenCalled();
  });
  it("keeps a draft when reloading fails", async () => {
    await setup();
    fireEvent.change(screen.getByLabelText("Time 1 start"), {
      target: { value: "11:00" },
    });
    vi.mocked(saveShiftType).mockRejectedValueOnce(new Error("Stale"));
    fireEvent.click(screen.getByRole("button", { name: "Save shift type" }));
    await screen.findByText("Stale");
    vi.mocked(listShiftTypes).mockRejectedValueOnce(new Error("Offline"));
    fireEvent.click(
      screen.getByRole("button", { name: "Discard draft and reload latest" }),
    );
    await screen.findByText(
      "Unable to reload this shift type. Your draft has been kept.",
    );
    expect(
      (screen.getByLabelText("Time 1 start") as HTMLInputElement).value,
    ).toBe("11:00");
  });
  it("does not reopen the old editor when a reload finishes after opening a new type", async () => {
    await setup();
    fireEvent.change(screen.getByLabelText("Time 1 start"), {
      target: { value: "11:00" },
    });
    vi.mocked(saveShiftType).mockRejectedValueOnce(new Error("Stale"));
    fireEvent.click(screen.getByRole("button", { name: "Save shift type" }));
    await screen.findByText("Stale");
    let resolve!: (value: ShiftType[]) => void;
    vi.mocked(listShiftTypes).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Discard draft and reload latest" }),
    );
    await waitFor(() => expect(listShiftTypes).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "New shift type" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Dinner" },
    });
    resolve([{ ...type, default_revision: 2 }]);
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Edit shift type" }),
      ).toBeNull(),
    );
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe(
      "Dinner",
    );
  });
  it("prevents changing submitted hours while a save is in flight", async () => {
    await setup();
    fireEvent.change(screen.getByLabelText("Time 1 start"), {
      target: { value: "11:00" },
    });
    let resolve!: () => void;
    vi.mocked(saveShiftType).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save shift type" }));
    await screen.findByRole("button", { name: "Saving" });
    expect(
      screen.getByLabelText("Time 1 start").hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "New shift type" })
        .hasAttribute("disabled"),
    ).toBe(true);
    resolve();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Saving" })).toBeNull(),
    );
  });
  it("opens the type linked from missing availability defaults and stays closed after dismissal", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <MemoryRouter
        initialEntries={[
          `/app/settings/scheduling/shift-types?edit=${type.id}`,
        ]}
      >
        <QueryClientProvider client={client}>
          <ShiftTypesSettingsPage />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "Edit shift type" });
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe(
      "Lunch",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Close shift type editor" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Edit shift type" }),
      ).toBeNull(),
    );
  });
});

// Shift catalog, design A (Mert 2026-10-12): the shared list language.
describe("shift catalog list", () => {
  afterEach(() => vi.unstubAllGlobals());
  function renderList() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <MemoryRouter initialEntries={["/app/settings/scheduling/shift-types"]}>
        <QueryClientProvider client={client}>
          <ShiftTypesSettingsPage />
        </QueryClientProvider>
      </MemoryRouter>,
    );
  }
  const close: ShiftType = {
    ...type,
    id: "afa60000-0000-4000-8000-000000000002",
    name: "Close",
    default_start_time: "22:30",
    default_end_time: "02:00",
    crosses_midnight: true,
    sort_order: 1,
  };
  const brunch: ShiftType = {
    ...type,
    id: "afa60000-0000-4000-8000-000000000003",
    name: "Brunch",
    sort_order: 2,
    archived_at: "2026-10-01T12:00:00Z",
  };

  it("heads the page Shift catalog with its tabs, a full search and New at the end", async () => {
    const { container } = renderList();
    await screen.findByRole("button", { name: "Edit Lunch" });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Shift catalog",
    );
    // A computer shows General's heading, not the list eyebrow (Mert 2026-10-18).
    expect(container.querySelector(".catalog-page-eyebrow")).toBeNull();
    expect(
      container.querySelector(".settings-page-header .settings-heading-icon"),
    ).toBeTruthy();
    expect(container.querySelector("section")?.classList).toContain(
      "list-page",
    );
    expect(
      screen.getByRole("tab", { name: "Shift types" }).getAttribute(
        "aria-selected",
      ),
    ).toBe("true");
    const filterRow = container.querySelector(".catalog-toolbar-filter-row");
    expect(filterRow?.querySelector("input")?.getAttribute("aria-label")).toBe(
      "Search shift types",
    );
    expect(filterRow?.lastElementChild).toBe(
      screen.getByRole("button", { name: "New shift type" }),
    );
    // No status filter and no "Show archived" box (Mert: "dropdown filtreyi kaldır").
    expect(container.querySelector("select")).toBeNull();
    expect(screen.queryByText("Show archived")).toBeNull();
    expect(container.querySelector(".catalog-page-actions")).toBeNull();
  });

  // Mert 2026-10-14: on a phone "+ Add" sits at the right end of the tab row.
  it("puts New shift type beside the tabs on a phone", async () => {
    stubPhoneWidth();
    const { container } = renderList();
    await screen.findByRole("button", { name: "Edit Lunch" });
    const add = screen.getByRole("button", { name: "New shift type" });
    expect(add.closest(".catalog-toolbar-status-row .catalog-tab-add")).toBeTruthy();
    expect(
      container.querySelector(".catalog-toolbar-filter-row .list-add-button"),
    ).toBeNull();
  });

  it("closes the list with archived types, marked Archived and restorable", async () => {
    vi.mocked(listShiftTypes).mockResolvedValue([brunch, type, close]);
    vi.mocked(setShiftTypeArchived).mockResolvedValue(undefined);
    renderList();
    await screen.findByRole("button", { name: "Edit Brunch" });
    const names = [
      ...document.querySelectorAll(".job-catalog-row .job-row-name"),
    ].map((name) => name.textContent);
    expect(names).toEqual(["Lunch", "Close", "Brunch"]);
    const archivedRow = screen
      .getByRole("button", { name: "Edit Brunch" })
      .closest(".job-catalog-row")!;
    expect(archivedRow.getAttribute("data-archived")).toBe("true");
    expect(archivedRow.textContent).toContain("Archived");
    fireEvent.click(screen.getByRole("button", { name: "Actions for Brunch" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore Brunch" }));
    await waitFor(() =>
      expect(setShiftTypeArchived).toHaveBeenCalledWith(
        workspace,
        brunch.id,
        false,
      ),
    );
  });

  it("keeps archived types last under a column sort", async () => {
    vi.mocked(listShiftTypes).mockResolvedValue([type, close, brunch]);
    renderList();
    await screen.findByRole("button", { name: "Edit Brunch" });
    fireEvent.click(screen.getByRole("button", { name: "Sort by Shift type" }));
    const names = [
      ...document.querySelectorAll(".job-catalog-row .job-row-name"),
    ].map((name) => name.textContent);
    expect(names).toEqual(["Close", "Lunch", "Brunch"]);
  });

  it("writes the phone card line with the hours and their length", async () => {
    vi.mocked(listShiftTypes).mockResolvedValue([type, close]);
    renderList();
    await screen.findByRole("button", { name: "Edit Close" });
    const lines = [
      ...document.querySelectorAll(".shift-catalog-card-line"),
    ].map((line) => line.textContent);
    expect(lines).toEqual([
      "12:00 PM – 4:00 PM · 4 h",
      "10:30 PM – 2:00 AM · Ends next day · 3 h 30 min",
    ]);
  });

  it("says the catalog is empty, and that a search found nothing", async () => {
    vi.mocked(listShiftTypes).mockResolvedValue([]);
    const first = renderList();
    expect(
      await screen.findByRole("heading", { name: "No shift types yet" }),
    ).toBeTruthy();
    first.unmount();
    vi.mocked(listShiftTypes).mockResolvedValue([type]);
    renderList();
    await screen.findByRole("button", { name: "Edit Lunch" });
    fireEvent.change(screen.getByLabelText("Search shift types"), {
      target: { value: "brunch" },
    });
    expect(
      screen.getByRole("heading", { name: "No shift types match your search." }),
    ).toBeTruthy();
  });

  it("shows a reader the list without New or row actions", async () => {
    auth.manage = false;
    renderList();
    await screen.findByRole("button", { name: "Edit Lunch" });
    expect(screen.queryByRole("button", { name: "New shift type" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Actions for Lunch" })).toBeNull();
  });
});

// Loading and error in the "B" look (Mert 2026-10-14).
describe("Shift types loading and error", () => {
  const renderQueued = () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ShiftTypesSettingsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    return client;
  };

  it("outlines the list while it loads", () => {
    vi.mocked(listShiftTypes).mockReturnValueOnce(new Promise(() => {}));
    renderQueued();
    expect(screen.getByRole("status").textContent).toContain("Loading shift types");
    expect(screen.queryByText("Loading shift types...")).toBeNull();
  });

  it("shows the load-error card with Try again, not the server's sentence", async () => {
    vi.mocked(listShiftTypes).mockRejectedValueOnce(new Error("catalog service down"));
    renderQueued();
    const card = await screen.findByRole("alert");
    expect(within(card).getByRole("heading", { name: "We couldn't load shift types" })).toBeTruthy();
    expect(screen.queryByText("catalog service down")).toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Lunch")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "We couldn't load shift types" })).toBeNull();
  });

  it("keeps the last list and says so when a refresh fails", async () => {
    const client = renderQueued();
    expect(await screen.findByText("Lunch")).toBeTruthy();
    vi.mocked(listShiftTypes).mockRejectedValueOnce(new Error("catalog service down"));
    await act(async () => {
      await client.refetchQueries();
    });
    const line = await screen.findByRole("alert");
    expect(line.textContent).toContain("Shift types didn't refresh. This is the last list that loaded.");
    expect(screen.getByText("Lunch")).toBeTruthy();
    expect(screen.queryByText("catalog service down")).toBeNull();
    fireEvent.click(within(line).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
