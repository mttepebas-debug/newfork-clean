import type {
  ScheduleExportPreset,
  ScheduleExportSchedule,
} from "@newfork/shared/schedule";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ScheduleExportSchedules,
  formatLastSent,
  formatScheduleHour,
  parseRecipients,
  truncateScheduleExportError,
  validateRecipients,
} from "./ScheduleExportSchedules";

function preset(overrides: Partial<ScheduleExportPreset> = {}): ScheduleExportPreset {
  return {
    id: "99999999-9999-4999-8999-999999999999",
    workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
    name: "Weekly CSV",
    settings: {
      format: "csv",
      layout: "weekly",
      time_format: "12h",
      include_unassigned: true,
      include_notes: false,
      include_scheduled_hours: true,
      csv_delimiter: ",",
    },
    created_by: "88888888-8888-4888-8888-888888888888",
    updated_at: "2026-08-17T12:00:00.000Z",
    ...overrides,
  };
}

function schedule(
  overrides: Partial<ScheduleExportSchedule> = {},
): ScheduleExportSchedule {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
    preset_id: "99999999-9999-4999-8999-999999999999",
    preset_name: "Weekly CSV",
    name: "Monday managers",
    recipients: ["manager@example.com"],
    location_ids: ["11111111-1111-4111-8111-111111111111"],
    day_of_week: 1,
    send_hour: 8,
    timezone: "America/Los_Angeles",
    enabled: true,
    last_sent_at: null,
    consecutive_failures: 0,
    last_error: null,
    auto_disabled_at: null,
    created_at: "2026-08-17T12:00:00.000Z",
    updated_at: "2026-08-17T12:00:00.000Z",
    ...overrides,
  };
}

describe("ScheduleExportSchedules", () => {
  it("renders scheduled email rows and status details", () => {
    render(
      <ScheduleExportSchedules
        presets={[preset()]}
        schedules={[schedule()]}
        selectedLocationIds={["11111111-1111-4111-8111-111111111111"]}
        pending={false}
        run={(action) => void action()}
        onCreate={vi.fn()}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("Scheduled emails")).toBeTruthy();
    expect(screen.getByText("Monday managers")).toBeTruthy();
    expect(screen.getByText(/Weekly CSV - Monday 8:00 AM/)).toBeTruthy();
    expect(screen.getByText("Last sent: Never")).toBeTruthy();
  });

  it("shows an auto-disabled badge with the truncated last error", () => {
    const lastError =
      "All 12 recipient send(s) failed for schedule 77777777-7777-4777-8777-777777777777 after repeated retries";

    render(
      <ScheduleExportSchedules
        presets={[preset()]}
        schedules={[
          schedule({
            enabled: false,
            consecutive_failures: 3,
            last_error: lastError,
            auto_disabled_at: "2026-08-18T12:00:00.000Z",
          }),
        ]}
        selectedLocationIds={["11111111-1111-4111-8111-111111111111"]}
        pending={false}
        run={(action) => void action()}
        onCreate={vi.fn()}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText(/Auto-disabled/).textContent).toContain(
      truncateScheduleExportError(lastError),
    );
    expect(screen.queryByText(lastError)).toBeNull();
  });

  it("creates a scheduled export from the form and clears editable fields", async () => {
    const create = vi.fn().mockResolvedValue(undefined);

    render(
      <ScheduleExportSchedules
        presets={[preset()]}
        schedules={[]}
        selectedLocationIds={["11111111-1111-4111-8111-111111111111"]}
        pending={false}
        run={(action) => void action()}
        onCreate={create}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Schedule name"), {
      target: { value: "Sunday recap" },
    });
    expect(screen.getByLabelText("Schedule name").getAttribute("id")).toBe(
      "schedule-export-name",
    );
    fireEvent.change(screen.getByLabelText("Scheduled export preset"), {
      target: { value: "99999999-9999-4999-8999-999999999999" },
    });
    expect(
      screen.getByLabelText("Scheduled export preset").getAttribute("id"),
    ).toBe("schedule-export-preset");
    fireEvent.change(screen.getByLabelText("Recipients"), {
      target: { value: "a@example.com, b@example.com, a@example.com" },
    });
    expect(screen.getByLabelText("Recipients").getAttribute("id")).toBe(
      "schedule-export-recipients",
    );
    fireEvent.change(screen.getByLabelText("Day of week"), {
      target: { value: "0" },
    });
    expect(screen.getByLabelText("Day of week").getAttribute("id")).toBe(
      "schedule-export-day",
    );
    fireEvent.change(screen.getByLabelText("Send hour"), {
      target: { value: "7" },
    });
    expect(screen.getByLabelText("Send hour").getAttribute("id")).toBe(
      "schedule-export-hour",
    );
    expect(screen.getByLabelText("Timezone").getAttribute("id")).toBe(
      "schedule-export-timezone",
    );
    fireEvent.click(screen.getByRole("button", { name: "Add scheduled email" }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        name: "Sunday recap",
        preset_id: "99999999-9999-4999-8999-999999999999",
        recipients: ["a@example.com", "b@example.com"],
        location_ids: ["11111111-1111-4111-8111-111111111111"],
        day_of_week: 0,
        send_hour: 7,
        timezone: "America/Los_Angeles",
      }),
    );
    expect(screen.getByLabelText("Schedule name")).toHaveProperty("value", "");
    expect(screen.getByLabelText("Recipients")).toHaveProperty("value", "");
  });

  it("toggles and deletes existing scheduled exports", () => {
    const toggle = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(undefined);

    render(
      <ScheduleExportSchedules
        presets={[preset()]}
        schedules={[schedule()]}
        selectedLocationIds={["11111111-1111-4111-8111-111111111111"]}
        pending={false}
        run={(action) => void action()}
        onCreate={vi.fn()}
        onToggle={toggle}
        onDelete={remove}
      />,
    );

    fireEvent.click(screen.getByLabelText("Enable Monday managers"));
    fireEvent.click(
      screen.getByRole("button", { name: "Delete schedule Monday managers" }),
    );

    expect(toggle).toHaveBeenCalledWith(
      "77777777-7777-4777-8777-777777777777",
      false,
    );
    expect(remove).toHaveBeenCalledWith("77777777-7777-4777-8777-777777777777");
  });

  it("validates recipients and disables create when locations are not selected", () => {
    render(
      <ScheduleExportSchedules
        presets={[preset()]}
        schedules={[]}
        selectedLocationIds={[]}
        pending={false}
        run={(action) => void action()}
        onCreate={vi.fn()}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Schedule name"), {
      target: { value: "Sunday recap" },
    });
    fireEvent.change(screen.getByLabelText("Scheduled export preset"), {
      target: { value: "99999999-9999-4999-8999-999999999999" },
    });
    fireEvent.change(screen.getByLabelText("Recipients"), {
      target: { value: "not-an-email" },
    });

    expect(screen.getByText('"not-an-email" is not a valid email.')).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add scheduled email" }))
      .toHaveProperty("disabled", true);
  });

  it("exposes small formatting helpers used by the schedule row", () => {
    expect(formatScheduleHour(0)).toBe("12:00 AM");
    expect(formatScheduleHour(13)).toBe("1:00 PM");
    expect(parseRecipients("a@example.com, a@example.com, b@example.com")).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
    expect(validateRecipients([])).toBe("At least one recipient email is required.");
    expect(formatLastSent(null)).toBe("Last sent: Never");
    expect(truncateScheduleExportError("x".repeat(84))).toBe(
      `${"x".repeat(79)}...`,
    );
  });
});
