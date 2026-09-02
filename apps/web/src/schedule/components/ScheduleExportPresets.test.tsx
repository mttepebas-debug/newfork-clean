import type {
  ScheduleExportPreset,
  ScheduleExportSettings,
} from "@newfork/shared/schedule";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScheduleExportPresets } from "./ScheduleExportPresets";

const settings: ScheduleExportSettings = {
  format: "csv",
  layout: "weekly",
  time_format: "12h",
  include_unassigned: true,
  include_notes: false,
  include_scheduled_hours: true,
  csv_delimiter: ",",
};

function preset(overrides: Partial<ScheduleExportPreset> = {}): ScheduleExportPreset {
  return {
    id: "99999999-9999-4999-8999-999999999999",
    workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
    name: "Payroll CSV",
    settings,
    created_by: "88888888-8888-4888-8888-888888888888",
    updated_at: "2026-08-17T12:00:00.000Z",
    ...overrides,
  };
}

describe("ScheduleExportPresets", () => {
  it("saves the current settings and clears the input after success", async () => {
    const save = vi.fn().mockResolvedValue(true);

    render(
      <ScheduleExportPresets
        presets={[]}
        settings={settings}
        pending={false}
        onSavePreset={save}
        onDeletePreset={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Preset name"), {
      target: { value: "Payroll CSV" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save preset" }));

    await waitFor(() => expect(save).toHaveBeenCalledWith("Payroll CSV", settings));
    await waitFor(() =>
      expect(screen.getByLabelText("Preset name")).toHaveProperty("value", ""),
    );
  });

  it("keeps the input when saving fails", async () => {
    const save = vi.fn().mockResolvedValue(false);

    render(
      <ScheduleExportPresets
        presets={[]}
        settings={settings}
        pending={false}
        onSavePreset={save}
        onDeletePreset={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Preset name"), {
      target: { value: "Still here" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save preset" }));

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(screen.getByLabelText("Preset name")).toHaveProperty(
      "value",
      "Still here",
    );
  });

  it("renders saved presets and deletes one by id", () => {
    const remove = vi.fn().mockResolvedValue(true);

    render(
      <ScheduleExportPresets
        presets={[preset()]}
        settings={settings}
        pending={false}
        onSavePreset={vi.fn()}
        onDeletePreset={remove}
      />,
    );

    expect(screen.getByText("Payroll CSV")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete Payroll CSV" }));

    expect(remove).toHaveBeenCalledWith("99999999-9999-4999-8999-999999999999");
  });
});
