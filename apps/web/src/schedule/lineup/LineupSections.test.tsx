import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { scheduleLineupReadModelSchema } from "@newfork/shared";
import { SectionsDialog } from "./LineupSections";
Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
  configurable: true,
  value: function () {
    this.setAttribute("open", "");
  },
});
Object.defineProperty(HTMLDialogElement.prototype, "close", {
  configurable: true,
  value: function () {
    this.removeAttribute("open");
  },
});
const workspace = "10000000-0000-4000-8000-000000000001";
const location = "10000000-0000-4000-8000-000000000002";
const job = "10000000-0000-4000-8000-000000000003";
const model = scheduleLineupReadModelSchema.parse({
  workspace_id: workspace,
  date: "2030-01-07",
  source: "published",
  settings: { time_format: "24h" },
  locations: [
    {
      id: location,
      name: "Main Dining",
      timezone: "America/Los_Angeles",
      lineup_id: null,
      revision: null,
      shared_at: null,
      share_version: 0,
      entries: [],
      briefs: [],
      summary: { active_entries: 0, open_rows: 0, called_off: 0 },
    },
  ],
  sections: [
    {
      id: "10000000-0000-4000-8000-000000000004",
      workspace_id: workspace,
      name: "Floor",
      color: "#557766",
      sort_order: 0,
      revision: 1,
      location_ids: [],
      shift_type_ids: [],
      job_ids: [],
    },
  ],
  jobs: [
    {
      id: job,
      name: "Server",
      color: "#557766",
      sort_order: 0,
      department_id: "10000000-0000-4000-8000-000000000005",
    },
  ],
  shift_types: [],
  employees: [],
});
afterEach(cleanup);
describe("section applicability editor", () => {
  it("saves explicit scope arrays and keeps a revision-checked undo", async () => {
    const onSave = vi
      .fn()
      .mockImplementation(async (_id, _revision, value) => ({
        ...model.sections[0],
        ...value,
        revision: 2,
      }));
    render(
      <SectionsDialog
        sections={model.sections}
        model={model}
        onClose={vi.fn()}
        onSave={onSave}
        onArchive={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByText("All locations · All services · All positions"),
    );
    fireEvent.click(screen.getByLabelText("Main Dining"));
    fireEvent.click(screen.getByLabelText("Server"));
    fireEvent.click(screen.getByRole("button", { name: "Save Floor" }));
    await screen.findByText("Sections updated.");
    expect(onSave).toHaveBeenCalledWith(
      model.sections[0]!.id,
      1,
      expect.objectContaining({
        location_ids: [location],
        job_ids: [job],
        shift_type_ids: [],
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Undo section changes" }),
    );
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave).toHaveBeenLastCalledWith(
      model.sections[0]!.id,
      2,
      expect.objectContaining({
        location_ids: [],
        job_ids: [],
        shift_type_ids: [],
      }),
    );
  });
  it("retains the choices when a future assignment prevents a restriction", async () => {
    const onSave = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "Reassign 2 future assignments or open needs before restricting this section",
        ),
      );
    render(
      <SectionsDialog
        sections={model.sections}
        model={model}
        onClose={vi.fn()}
        onSave={onSave}
        onArchive={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByText("All locations · All services · All positions"),
    );
    fireEvent.click(screen.getByLabelText("Server"));
    fireEvent.click(screen.getByRole("button", { name: "Save Floor" }));
    await screen.findByRole("alert");
    expect((screen.getByLabelText("Server") as HTMLInputElement).checked).toBe(
      true,
    );
    expect(
      screen.queryByRole("button", { name: "Undo section changes" }),
    ).toBeNull();
  });
});
