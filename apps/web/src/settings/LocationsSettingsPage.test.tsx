import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LocationsSettingsPage from "./LocationsSettingsPage";
import { listLocations, saveLocation } from "./organization-data";

const state = vi.hoisted(() => ({ canEdit: true }));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context: {
  workspace: { id: "workspace" }, permissions: state.canEdit ? ["settings.locations.manage"] : [],
} }) }));
vi.mock("./organization-data", () => ({ listLocations: vi.fn(), saveLocation: vi.fn(), setLocationArchived: vi.fn() }));
vi.mock("./CatalogDeleteAction", () => ({ CatalogDeleteAction: () => null }));

const legacy = { id: "location", workspace_id: "workspace", name: "Main",
  street_address: "1 Road", city: "City", region: "CA", postal_code: "90001",
  country_code: "US", timezone: "America/Los_Angeles", sort_order: 0, archived_at: null, short_name: null };
function page() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><LocationsSettingsPage /></QueryClientProvider>);
  return client;
}
beforeEach(() => {
  vi.clearAllMocks(); state.canEdit = true;
  vi.mocked(listLocations).mockResolvedValue([legacy]);
  vi.mocked(saveLocation).mockResolvedValue();
});
describe("Location short name editor", () => {
  it("opens legacy records without throwing and requires a valid short name to save", async () => {
    const client = page();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    fireEvent.click(await screen.findByRole("button", { name: /Main.*Short name needed/ }));
    const save = screen.getByRole("button", { name: "Save location" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Short name"), { target: { value: "MAIN" } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(saveLocation).toHaveBeenCalledWith("workspace", expect.objectContaining({ short_name: "MAIN" }), "location"));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["schedule-read", "workspace"] }));
  });
  it("retains the user's input when the database rejects a duplicate", async () => {
    vi.mocked(saveLocation).mockRejectedValue(new Error("This short name is already used in this workspace. Choose another one."));
    page();
    fireEvent.click(await screen.findByRole("button", { name: /Main.*Short name needed/ }));
    fireEvent.change(screen.getByLabelText("Short name"), { target: { value: "MAIN" } });
    fireEvent.click(screen.getByRole("button", { name: "Save location" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "This short name is already used in this workspace. Choose another one.");
    expect(screen.getByLabelText("Short name")).toHaveProperty("value", "MAIN");
  });
  it("keeps readonly locations readonly", async () => {
    state.canEdit = false; page();
    fireEvent.click(await screen.findByRole("button", { name: /Main.*Short name needed/ }));
    expect((screen.getByRole("button", { name: "Save location" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText("Short name").closest("fieldset")?.disabled).toBe(true);
  });
});
