import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LocationsSettingsPage from "./LocationsSettingsPage";
import { formatUsPhone, usLettersMessage } from "@newfork/shared";
import { listLocations, saveLocation } from "./organization-data";
import { RequestError } from "../lib/request-error";
import { stubPhoneWidth } from "../lib/phone-width.test-util";

const state = vi.hoisted(() => ({ canEdit: true }));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context: {
  workspace: { id: "workspace" }, permissions: state.canEdit ? ["settings.locations.manage"] : [],
} }) }));
vi.mock("./organization-data", () => ({ listLocations: vi.fn(), saveLocation: vi.fn(), setLocationArchived: vi.fn() }));
vi.mock("./CatalogDeleteAction", () => ({ CatalogDeleteAction: () => null }));
vi.mock("./LocationTimezoneField", () => ({ LocationTimezoneField: () => null }));

const legacy = { id: "location", workspace_id: "workspace", name: "Main",
  street_address: "1 Road", city: "City", region: "CA", postal_code: "90001",
  country_code: "US", timezone: "America/Los_Angeles", sort_order: 0, archived_at: null, short_name: "MAIN" };
const current = { ...legacy, id: "deniz", name: "Deniz", short_name: "DNZ", phone: "+14155550100" };
function page() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><LocationsSettingsPage /></QueryClientProvider>);
  return client;
}
const save = () => screen.getByRole("button", { name: "Save location" }) as HTMLButtonElement;
beforeEach(() => {
  vi.clearAllMocks(); state.canEdit = true;
  vi.mocked(listLocations).mockResolvedValue([legacy, current]);
  vi.mocked(saveLocation).mockResolvedValue();
});

describe("Locations table", () => {
  it("shows address and phone columns without short names", async () => {
    page();
    await screen.findByRole("button", { name: /^Deniz/ });
    expect(screen.getByText("Address")).toBeTruthy();
    expect(screen.getByText("Phone number")).toBeTruthy();
    // One way to show a saved US number (P4, BL-503).
    expect(screen.getByText("+1 (415) 555-0100")).toBeTruthy();
    expect(screen.queryByText("DNZ")).toBeNull();
  });
});

// BL-664 (1): an empty address part leaves no stray comma.
describe("Locations address", () => {
  it("joins only the parts that are filled in", async () => {
    vi.mocked(listLocations).mockResolvedValue([
      { ...current, street_address: "", city: "Oakland", region: "CA", postal_code: "" },
    ]);
    page();
    await screen.findByRole("button", { name: /^Deniz/ });
    expect(screen.getAllByText("Oakland, CA").length).toBeGreaterThan(0);
    expect(screen.queryByText(/^,/)).toBeNull();
  });
});

// Locations A (Mert 2026-10-07): the shared list language.
describe("Locations list", () => {
  it("has a list header, Active / Archived tabs and New location at the end of the filter row", async () => {
    vi.mocked(listLocations).mockResolvedValue([legacy, { ...current, archived_at: "2026-10-01T00:00:00Z" }]);
    page();
    await screen.findByRole("button", { name: /^Main/ });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Locations");
    expect(screen.queryByText("Show archived")).toBeNull();
    expect(screen.queryByRole("button", { name: /Add location/ })).toBeNull();
    expect(screen.getByRole("button", { name: "New location" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Deniz/ })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Archived" }));
    expect(screen.getByRole("button", { name: /^Deniz/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Main/ })).toBeNull();
    // BL-602: ← → walk the tabs; the list is one Tab stop.
    const archived = screen.getByRole("tab", { name: "Archived" });
    expect(archived.tabIndex).toBe(0);
    expect(screen.getByRole("tab", { name: "Active" }).tabIndex).toBe(-1);
    archived.focus();
    fireEvent.keyDown(archived, { key: "ArrowLeft" });
    expect(document.activeElement?.textContent).toBe("Active");
    expect(screen.getByRole("button", { name: /^Main/ })).toBeTruthy();
  });
  it("says where archived locations go when there are none", async () => {
    page();
    await screen.findByRole("button", { name: /^Main/ });
    fireEvent.click(screen.getByRole("tab", { name: "Archived" }));
    expect(screen.getByText("No archived locations")).toBeTruthy();
    expect(screen.getByText("Archived locations will appear here.")).toBeTruthy();
  });
  it("sorts by a column heading; a third click goes back to the list's order", async () => {
    page();
    await screen.findByRole("button", { name: /^Main/ });
    const names = () => [...document.querySelectorAll(".job-row-name")].map((node) => node.textContent);
    expect(names()).toEqual(["Main", "Deniz"]);
    fireEvent.click(screen.getByRole("button", { name: "Location" }));
    expect(names()).toEqual(["Deniz", "Main"]);
    fireEvent.click(screen.getByRole("button", { name: "Location" }));
    expect(names()).toEqual(["Main", "Deniz"]);
    expect(screen.queryByRole("button", { name: "Clear column sorting" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Location" }));
    expect(names()).toEqual(["Main", "Deniz"]);
    expect(
      screen.getByRole("button", { name: "Location" }).closest("[role='columnheader']")?.getAttribute("aria-sort"),
    ).toBe("none");
  });
  it("hides New location from a reader", async () => {
    state.canEdit = false; page();
    await screen.findByRole("button", { name: /^Main/ });
    expect(screen.queryByRole("button", { name: "New location" })).toBeNull();
  });
});

describe("Location short name editor", () => {
  it("fills the suggestion on save when the short name is empty", async () => {
    const client = page();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    fireEvent.click(await screen.findByRole("button", { name: /^Main/ }));
    fireEvent.change(screen.getByLabelText("Short name"), { target: { value: "" } });
    expect(screen.getByLabelText("Short name")).toHaveProperty("placeholder", "MN");
    fireEvent.click(save());
    await waitFor(() => expect(saveLocation).toHaveBeenCalledWith("workspace", expect.objectContaining({ short_name: "MN", phone: null }), "location"));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["schedule-read", "workspace"] }));
  });
  it("uppercases typed values and reports format rules only after a failed save", async () => {
    page();
    fireEvent.click(await screen.findByRole("button", { name: /^Main/ }));
    fireEvent.change(screen.getByLabelText("Short name"), { target: { value: "a b" } });
    expect(screen.getByLabelText("Short name")).toHaveProperty("value", "A B");
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(save());
    expect((await screen.findByRole("alert")).textContent).toContain("letters A–Z, numbers or hyphens");
    expect(screen.getByLabelText("Short name").getAttribute("aria-invalid")).toBe("true");
    expect(saveLocation).not.toHaveBeenCalled();
  });
  it("marks the short name required when no suggestion exists", async () => {
    page();
    fireEvent.click(await screen.findByRole("button", { name: /^Main/ }));
    fireEvent.change(screen.getByLabelText("Location name"), { target: { value: "A" } });
    fireEvent.change(screen.getByLabelText("Short name"), { target: { value: "" } });
    fireEvent.click(save());
    expect(screen.getByLabelText("Short name").getAttribute("aria-invalid")).toBe("true");
    expect(saveLocation).not.toHaveBeenCalled();
  });
  it("retains the user's input when the database rejects a duplicate", async () => {
    vi.mocked(saveLocation).mockRejectedValue(new Error("This short name is already used in this workspace. Choose another one."));
    page();
    fireEvent.click(await screen.findByRole("button", { name: /^Main/ }));
    fireEvent.change(screen.getByLabelText("Short name"), { target: { value: "MN" } });
    fireEvent.click(save());
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "This short name is already used in this workspace. Choose another one.");
    expect(screen.getByLabelText("Short name")).toHaveProperty("value", "MN");
  });
  // BL-1045: by its key, a location deleted meanwhile; the list loads again
  // and the sentence stays with the draft. A refusal without the key reloads nothing.
  it.each([
    [new RequestError("This item was deleted. Reload the catalog.", "catalog.deleted", undefined, 409), 2],
    [new Error("This short name is already used in this workspace. Choose another one."), 1],
  ])("reloads the list only for a location deleted meanwhile (%s)", async (refusal, reads) => {
    vi.mocked(saveLocation).mockRejectedValue(refusal);
    page();
    fireEvent.click(await screen.findByRole("button", { name: /^Main/ }));
    fireEvent.change(screen.getByLabelText("Location name"), { target: { value: "Main street" } });
    fireEvent.click(save());
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", refusal.message);
    await waitFor(() => expect(listLocations).toHaveBeenCalledTimes(reads));
    expect(screen.getByLabelText("Location name")).toHaveProperty("value", "Main street");
  });
  it("keeps readonly locations readonly", async () => {
    state.canEdit = false; page();
    fireEvent.click(await screen.findByRole("button", { name: /^Main/ }));
    expect(save().disabled).toBe(true);
    expect(screen.getByLabelText("Short name").closest("fieldset")?.disabled).toBe(true);
  });
});

describe("Location phone", () => {
  it.each([["4", "4"], ["415", "(415)"], ["4155", "(415) 5"], ["415555", "(415) 555-"], ["14155550100", "(415) 555-0100"], ["415-555-0100 99", "(415) 555-0100"], ["", ""]])(
    "formats %s as %s", (value, expected) => expect(formatUsPhone(value)).toBe(expected));
  // BL-503: the one US phone field, a fixed +1 before the number.
  it("draws the fixed +1 before the number", async () => {
    page();
    fireEvent.click(await screen.findByRole("button", { name: /^Deniz/ }));
    const phone = screen.getByLabelText("Phone number");
    expect(phone.closest(".us-phone-field")?.querySelector(".us-phone-prefix")?.textContent).toBe("+1");
  });

  it("opens a saved US number in the mask", async () => {
    page();
    fireEvent.click(await screen.findByRole("button", { name: /^Deniz/ }));
    expect(screen.getByLabelText("Phone number")).toHaveProperty("value", "(415) 555-0100");
  });

  it("saves US numbers in E.164 and rejects incomplete ones", async () => {
    page();
    fireEvent.click(await screen.findByRole("button", { name: /^Deniz/ }));
    expect(save().disabled).toBe(true);
    const phone = screen.getByLabelText("Phone number");
    fireEvent.change(phone, { target: { value: "(415) 555-01" } });
    fireEvent.click(save());
    expect((await screen.findByRole("alert")).textContent).toContain("10-digit US phone number");
    fireEvent.change(phone, { target: { value: "6505550142" } });
    expect(phone).toHaveProperty("value", "(650) 555-0142");
    fireEvent.click(save());
    await waitFor(() => expect(saveLocation).toHaveBeenCalledWith("workspace", expect.objectContaining({ phone: "+16505550142", short_name: "DNZ" }), "deniz"));
  });
});

// BL-503: KARARLAR "Form ve girdi kuralları (ABD)".
describe("Location names and addresses", () => {
  it.each([["Location name"], ["Street address"], ["City"], ["State / region"]])(
    "says under %s that Turkish-only letters are not taken, and saves nothing",
    async (label) => {
      page();
      fireEvent.click(await screen.findByRole("button", { name: /^Deniz/ }));
      fireEvent.change(screen.getByLabelText(label), { target: { value: "Kadıköy" } });
      fireEvent.click(save());
      const error = await screen.findByText(usLettersMessage);
      expect(error.id).toBe(screen.getByLabelText(label).getAttribute("aria-describedby"));
      expect(saveLocation).not.toHaveBeenCalled();
    },
  );
});

// Mert 2026-10-14: on a phone "+ Add" sits at the right end of the tab row.
describe("Locations add button on a phone", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("keeps New location at the end of the filter row on a computer", async () => {
    page();
    await screen.findByRole("button", { name: /^Main/ });
    const add = screen.getByRole("button", { name: "New location" });
    expect(add.closest(".catalog-toolbar-filter-row")).toBeTruthy();
    expect(add.closest(".catalog-toolbar-status-row")).toBeNull();
  });
  // KARARLAR S-253 (Mert 2026-10-23): never in the tab row; beside the first box, short label Add.
  it("keeps it in the box row, short label Add, on a phone", async () => {
    stubPhoneWidth();
    page();
    await screen.findByRole("button", { name: /^Main/ });
    const add = screen.getByRole("button", { name: "New location" });
    expect(add.closest(".catalog-toolbar-filter-row")).toBeTruthy();
    expect(add.closest(".catalog-toolbar-status-row")).toBeNull();
    expect(add.querySelector(".list-add-short")?.textContent).toBe("Add");
  });
});

// Loading and error in the "B" look (Mert 2026-10-14).
describe("Locations loading and error", () => {
  it("outlines the list while locations load", async () => {
    vi.mocked(listLocations).mockReturnValueOnce(new Promise(() => {}));
    page();
    expect((await screen.findByRole("status")).textContent).toBe("Loading locations");
    expect(screen.queryByText("Loading locations...")).toBeNull();
  });

  it("shows the card with Try again, not the server's sentence, when locations fail", async () => {
    vi.mocked(listLocations).mockRejectedValueOnce(new Error("relation does not exist"));
    page();
    expect(await screen.findByRole("heading", { name: "We couldn't load locations" })).toBeTruthy();
    expect(screen.queryByText("relation does not exist")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Deniz")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "We couldn't load locations" })).toBeNull();
  });

  it("keeps the last list with one line when a refresh fails", async () => {
    const client = page();
    expect(await screen.findByText("Deniz")).toBeTruthy();
    vi.mocked(listLocations).mockRejectedValueOnce(new Error("timeout"));
    await act(async () => {
      await client.refetchQueries();
    });
    expect((await screen.findByRole("alert")).textContent).toContain("Locations didn't refresh. This is the last list that loaded.");
    expect(screen.getByText("Deniz")).toBeTruthy();
    expect(screen.queryByText("timeout")).toBeNull();
  });
});
