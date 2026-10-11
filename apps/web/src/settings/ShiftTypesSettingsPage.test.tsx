// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShiftType } from "@newfork/shared";
import ShiftTypesSettingsPage from "./ShiftTypesSettingsPage";
import { MemoryRouter } from "react-router";
import { listShiftTypes, saveShiftType } from "./organization-data";
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
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    context: {
      workspace: { id: workspace },
      permissions: [
        "settings.shift_catalog.read",
        "settings.shift_catalog.manage",
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
describe("shift type default review", () => {
  it("shows before/after reference hours and submits the reviewed revision", async () => {
    await setup();
    fireEvent.change(screen.getByLabelText("Default start"), {
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
        },
        type.id,
        1,
      ),
    );
  });
  it("explains overnight and missing default hours without inventing a valid range", async () => {
    await setup();
    fireEvent.change(screen.getByLabelText("Default start"), {
      target: { value: "22:00" },
    });
    expect(
      screen.getByText(/After saving: 10:00 PM – 4:00 PM \(Ends next day\)/),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Default start"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Default end"), {
      target: { value: "" },
    });
    expect(
      screen.getByText(/Default start and end times are required/),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Save shift type" }).hasAttribute("disabled"),
    ).toBe(true);
  });
  // BL-677 (3): a grey Save says why.
  it("says why Save is off when start and end are the same", async () => {
    await setup();
    fireEvent.change(screen.getByLabelText("Default start"), {
      target: { value: "16:00" },
    });
    expect(
      screen.getByRole("button", { name: "Save shift type" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByText("Start and end times must be different.")).toBeTruthy();
    expect(screen.getByLabelText("Default end").getAttribute("aria-invalid")).toBe("true");
  });
  it("preserves edits on a stale save and reloads only on the explicit discard action", async () => {
    await setup();
    fireEvent.change(screen.getByLabelText("Default start"), {
      target: { value: "11:00" },
    });
    vi.mocked(saveShiftType).mockRejectedValueOnce(
      new Error("Default hours changed"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save shift type" }));
    await screen.findByText("Default hours changed");
    expect(
      (screen.getByLabelText("Default start") as HTMLInputElement).value,
    ).toBe("11:00");
    vi.mocked(listShiftTypes).mockResolvedValue([
      { ...type, default_revision: 2, default_start_time: "10:00" },
    ]);
    fireEvent.click(
      screen.getByRole("button", { name: "Discard draft and reload latest" }),
    );
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Default start") as HTMLInputElement).value,
      ).toBe("10:00"),
    );
    expect(
      screen.getByRole("button", { name: "Save shift type" }).hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Default start"), {
      target: { value: "11:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save shift type" }));
    await waitFor(() =>
      expect(vi.mocked(saveShiftType).mock.calls.at(-1)?.[3]).toBe(2),
    );
  });
  it("blocks a refreshed conflicting revision without discarding the local draft", async () => {
    const client = await setup();
    fireEvent.change(screen.getByLabelText("Default start"), {
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
      (screen.getByLabelText("Default start") as HTMLInputElement).value,
    ).toBe("11:00");
    expect(saveShiftType).not.toHaveBeenCalled();
  });
  it("keeps a draft when reloading fails", async () => {
    await setup();
    fireEvent.change(screen.getByLabelText("Default start"), {
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
      (screen.getByLabelText("Default start") as HTMLInputElement).value,
    ).toBe("11:00");
  });
  it("does not reopen the old editor when a reload finishes after opening a new type", async () => {
    await setup();
    fireEvent.change(screen.getByLabelText("Default start"), {
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
    fireEvent.click(screen.getByRole("button", { name: "Add shift type" }));
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
    fireEvent.change(screen.getByLabelText("Default start"), {
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
      screen.getByLabelText("Default start").hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Add shift type" })
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
