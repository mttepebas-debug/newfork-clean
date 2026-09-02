import type {
  ScheduleDraftSummary,
  ScheduleExportPreset,
  ScheduleExportSettings,
  ScheduleLocation,
} from "@newfork/shared/schedule";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScheduleExportControls } from "./ScheduleExportControls";

const settings: ScheduleExportSettings = {
  format: "csv",
  layout: "weekly",
  locale: "en",
  time_format: "12h",
  include_unassigned: true,
  include_notes: false,
  include_scheduled_hours: true,
  csv_delimiter: ",",
};

const frontLocationId = "11111111-1111-4111-8111-111111111111";
const kitchenLocationId = "22222222-2222-4222-8222-222222222222";

const locations: ScheduleLocation[] = [
  {
    id: frontLocationId,
    name: "Front",
    timezone: "America/Los_Angeles",
    sort_order: 0,
    publication_status: "published",
    published_at: "2026-08-17T12:00:00.000Z",
  },
  {
    id: kitchenLocationId,
    name: "Kitchen",
    timezone: "America/Los_Angeles",
    sort_order: 1,
    publication_status: "unpublished",
    published_at: null,
  },
];

const draft: ScheduleDraftSummary = {
  id: "33333333-3333-4333-8333-333333333333",
  workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
  week_start: "2026-08-17",
  name: "Manager edits",
  revision: 2,
  created_by: "88888888-8888-4888-8888-888888888888",
  updated_by: "88888888-8888-4888-8888-888888888888",
  created_at: "2026-08-17T12:00:00.000Z",
  updated_at: "2026-08-17T12:00:00.000Z",
};

const preset: ScheduleExportPreset = {
  id: "44444444-4444-4444-8444-444444444444",
  workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
  name: "Payroll CSV",
  settings: {
    ...settings,
    include_notes: true,
    csv_delimiter: ";",
  },
  created_by: "88888888-8888-4888-8888-888888888888",
  updated_at: "2026-08-17T12:00:00.000Z",
};

function renderControls(overrides: Partial<Parameters<typeof ScheduleExportControls>[0]> = {}) {
  const props: Parameters<typeof ScheduleExportControls>[0] = {
    source: "published",
    settings,
    locationIds: [frontLocationId],
    locations,
    drafts: [draft],
    presets: [preset],
    onSourceChange: vi.fn(),
    onApplyPreset: vi.fn(),
    onSettingsChange: vi.fn(),
    onToggleLocation: vi.fn(),
    ...overrides,
  };

  render(<ScheduleExportControls {...props} />);
  return props;
}

describe("ScheduleExportControls", () => {
  it("renders source, preset, export format, locations, and options", () => {
    renderControls();

    expect(screen.getByLabelText("Source")).toHaveProperty("value", "published");
    expect(screen.getByText("Manager edits · revision 2")).toBeTruthy();
    expect(screen.getByLabelText("Preset")).toHaveProperty("value", "");
    const format = screen.getByRole("group", { name: "Format" });
    expect(within(format).getByRole("button", { name: /CSV/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Comma" }).getAttribute("aria-pressed"),
    ).toBe("true");
    const language = screen.getByRole("group", { name: "Language" });
    expect(within(language).getByRole("button", { name: "EN" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(
      (screen.getByLabelText("Include open shifts") as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Include notes") as HTMLInputElement).checked,
    ).toBe(false);
  });

  it("emits source, preset, location, and setting changes", () => {
    const props = renderControls();

    fireEvent.change(screen.getByLabelText("Source"), {
      target: { value: draft.id },
    });
    fireEvent.change(screen.getByLabelText("Preset"), {
      target: { value: preset.id },
    });
    fireEvent.click(screen.getByLabelText("Kitchen"));
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    fireEvent.click(screen.getByRole("button", { name: "TR" }));
    fireEvent.click(screen.getByLabelText("Include notes"));

    expect(props.onSourceChange).toHaveBeenCalledWith(draft.id);
    expect(props.onApplyPreset).toHaveBeenCalledWith(preset.settings);
    expect(props.onToggleLocation).toHaveBeenCalledWith(kitchenLocationId);
    expect(props.onSettingsChange).toHaveBeenCalledWith({ format: "pdf" });
    expect(props.onSettingsChange).toHaveBeenCalledWith({
      locale: "tr",
      csv_delimiter: ";",
    });
    expect(props.onSettingsChange).toHaveBeenCalledWith({
      include_notes: true,
    });
  });

  it("hides delimiter controls for print exports", () => {
    renderControls({ settings: { ...settings, format: "print" } });

    expect(screen.queryByRole("group", { name: "Delimiter" })).toBeNull();
  });

  it("renders print layout controls and emits paper, orientation, and fit changes", () => {
    const props = renderControls({
      settings: {
        ...settings,
        format: "print",
        paper_size: "a4",
        orientation: "auto",
        fit_mode: "auto",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Letter" }));
    fireEvent.click(screen.getByRole("button", { name: "Landscape" }));
    fireEvent.click(screen.getByRole("button", { name: "One page" }));

    expect(props.onSettingsChange).toHaveBeenCalledWith({
      paper_size: "letter",
    });
    expect(props.onSettingsChange).toHaveBeenCalledWith({
      orientation: "landscape",
    });
    expect(props.onSettingsChange).toHaveBeenCalledWith({
      fit_mode: "fit_to_page",
    });
  });

  it("emits the reference daily roster layout and hides orientation and fit controls", () => {
    const props = renderControls({
      settings: {
        ...settings,
        format: "pdf",
        layout: "weekly",
        orientation: "auto",
        fit_mode: "auto",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Daily roster" }));

    expect(props.onSettingsChange).toHaveBeenCalledWith({
      layout: "daily_roster",
    });

    cleanup();
    renderControls({
      settings: {
        ...settings,
        format: "pdf",
        layout: "daily_roster",
        orientation: "landscape",
        fit_mode: "fit_to_page",
      },
    });

    expect(screen.getByRole("group", { name: "Paper" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Orientation" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Fit" })).toBeNull();
  });

  it("surfaces the PDF fit warning and hides it for non-PDF formats", () => {
    const warning = /hard to read/;
    renderControls({
      settings: {
        ...settings,
        format: "pdf",
        layout: "weekly",
        fit_mode: "fit_to_page",
      },
    });

    expect(screen.getByText(warning)).toBeTruthy();

    cleanup();
    renderControls({
      settings: {
        ...settings,
        format: "csv",
        layout: "weekly",
        fit_mode: "fit_to_page",
      },
    });

    expect(screen.queryByText(warning)).toBeNull();

    cleanup();
    renderControls({
      settings: {
        ...settings,
        format: "pdf",
        layout: "daily_roster",
        fit_mode: "fit_to_page",
      },
    });

    expect(screen.queryByText(warning)).toBeNull();
  });

  it("hides the layout picker for CSV exports", () => {
    renderControls({ settings: { ...settings, format: "csv" } });

    expect(screen.queryByRole("group", { name: "Layout" })).toBeNull();
  });

  it("emits the XLSX format from the reference-style format buttons", () => {
    const props = renderControls();

    fireEvent.click(screen.getByRole("button", { name: "XLSX" }));

    expect(props.onSettingsChange).toHaveBeenCalledWith({ format: "xlsx" });
  });
});
