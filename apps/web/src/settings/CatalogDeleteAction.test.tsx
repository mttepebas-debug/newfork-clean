import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogDeleteAction, type CatalogKind } from "./CatalogDeleteAction";
import { organizationRequest } from "./organization-data";
import { deleteJob } from "./jobs-management-data";
vi.mock("./organization-data", () => ({ organizationRequest: vi.fn() }));
vi.mock("./jobs-management-data", () => ({ deleteJob: vi.fn() }));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(organizationRequest).mockResolvedValue({ removed_count: 1 });
  vi.mocked(deleteJob).mockResolvedValue({ removed_count: 1 });
});
function setup(kind: CatalogKind, inline = false) {
  const onDeleted = vi.fn(),
    onLockChange = vi.fn();
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <CatalogDeleteAction
        kind={kind}
        id="item"
        name="Example"
        workspaceId="workspace"
        onDeleted={onDeleted}
        onLockChange={onLockChange}
        inline={inline}
      />
    </QueryClientProvider>,
  );
  return { onDeleted, onLockChange };
}
describe("inline catalog deletion", () => {
  it.each(["jobs", "locations", "shift-types", "shift-labels"] as const)(
    "requires a second click for %s",
    async (kind) => {
      const { onDeleted } = setup(kind);
      fireEvent.click(screen.getByRole("button", { name: /^Delete/ }));
      expect(organizationRequest).not.toHaveBeenCalled();
      expect(deleteJob).not.toHaveBeenCalled();
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(document.activeElement?.textContent).toBe("Cancel");
      fireEvent.click(screen.getByRole("button", { name: /^Delete/ }));
      await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
      if (kind === "jobs")
        expect(deleteJob).toHaveBeenCalledWith("workspace", "item");
      else
        expect(organizationRequest).toHaveBeenCalledWith(
          "workspace",
          `/organization/${kind}/item`,
          { method: "DELETE" },
        );
    },
  );
  it.each(["keep", "delete"] as const)(
    "sends the department jobs choice: %s",
    async (choice) => {
      setup("departments");
      fireEvent.click(
        screen.getByRole("button", { name: "Delete department" }),
      );
      if (choice === "delete")
        fireEvent.click(screen.getByLabelText("Delete jobs too"));
      fireEvent.click(
        screen.getByRole("button", { name: "Delete department" }),
      );
      await waitFor(() =>
        expect(organizationRequest).toHaveBeenCalledWith(
          "workspace",
          "/organization/departments/item",
          {
            method: "DELETE",
            body: JSON.stringify({ jobs: choice }),
          },
        ),
      );
    },
  );
  it("Escape cancels confirmation without deleting or closing the editor", () => {
    const { onDeleted, onLockChange } = setup("locations");
    fireEvent.click(screen.getByRole("button", { name: "Delete location" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("group")).toBeNull();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(organizationRequest).not.toHaveBeenCalled();
    expect(onLockChange).toHaveBeenLastCalledWith(false);
  });
  it("keeps confirmation and the editor open when deletion fails", async () => {
    vi.mocked(organizationRequest).mockRejectedValueOnce(
      new Error("Employee access denied"),
    );
    const { onDeleted } = setup("locations");
    fireEvent.click(screen.getByRole("button", { name: "Delete location" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete location" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Employee access denied",
    );
    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });
});
describe("trigger-only confirmation", () => {
  it("turns the button into a confirm step and deletes on the second click", async () => {
    const { onDeleted } = setup("locations", true);
    fireEvent.click(screen.getByRole("button", { name: "Delete location" }));
    expect(organizationRequest).not.toHaveBeenCalled();
    expect(screen.queryByRole("group")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
    expect(organizationRequest).toHaveBeenCalledWith("workspace", "/organization/locations/item", { method: "DELETE" });
  });
  it("resets on blur and shows failures inline", async () => {
    vi.mocked(organizationRequest).mockRejectedValueOnce(new Error("Employee access denied"));
    const { onDeleted, onLockChange } = setup("locations", true);
    fireEvent.click(screen.getByRole("button", { name: "Delete location" }));
    fireEvent.blur(screen.getByRole("button", { name: "Confirm delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete location" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Employee access denied");
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onLockChange).toHaveBeenLastCalledWith(false);
  });
});
