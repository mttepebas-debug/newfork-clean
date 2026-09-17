import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LocationsSettingsPage from "./LocationsSettingsPage";
import { formatUsPhone } from "./location-draft";
import { listLocations, saveLocation } from "./organization-data";

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
    expect(screen.getByText("(415) 555-0100")).toBeTruthy();
    expect(screen.queryByText("DNZ")).toBeNull();
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
  it("keeps readonly locations readonly", async () => {
    state.canEdit = false; page();
    fireEvent.click(await screen.findByRole("button", { name: /^Main/ }));
    expect(save().disabled).toBe(true);
    expect(screen.getByLabelText("Short name").closest("fieldset")?.disabled).toBe(true);
  });
});

describe("Location phone", () => {
  it.each([["4", "(4"], ["4155", "(415) 5"], ["14155550100", "(415) 555-0100"], ["415-555-0100 99", "(415) 555-0100"], ["", ""]])(
    "formats %s as %s", (value, expected) => expect(formatUsPhone(value)).toBe(expected));
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
