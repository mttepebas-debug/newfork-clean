import type {
  ScheduleDraftSummary,
  ScheduleExportPreset,
  ScheduleExportSettings,
  ScheduleLocation,
} from "@newfork/shared/schedule";
import {
  AlertTriangle,
  CalendarDays,
  Clock3,
  FileSpreadsheet,
  FileText,
  Languages,
  Table2,
} from "lucide-react";
import type { ReactNode } from "react";

type ExportPaperSize = NonNullable<ScheduleExportSettings["paper_size"]>;
type ExportOrientation = NonNullable<ScheduleExportSettings["orientation"]>;
type ExportFitMode = NonNullable<ScheduleExportSettings["fit_mode"]>;
type ExportLocale = NonNullable<ScheduleExportSettings["locale"]>;
type SegmentOption<T extends string> = {
  readonly value: T;
  readonly label: string;
  readonly icon?: ReactNode;
};

export function ScheduleExportControls({
  source,
  settings,
  locationIds,
  locations,
  drafts,
  presets,
  onSourceChange,
  onApplyPreset,
  onSettingsChange,
  onToggleLocation,
}: {
  readonly source: string;
  readonly settings: ScheduleExportSettings;
  readonly locationIds: readonly string[];
  readonly locations: readonly ScheduleLocation[];
  readonly drafts: readonly ScheduleDraftSummary[];
  readonly presets: readonly ScheduleExportPreset[];
  readonly onSourceChange: (source: string) => void;
  readonly onApplyPreset: (settings: ScheduleExportSettings) => void;
  readonly onSettingsChange: (next: Partial<ScheduleExportSettings>) => void;
  readonly onToggleLocation: (locationId: string) => void;
}) {
  const showPdfFitWarning =
    settings.format === "pdf" &&
    settings.layout !== "daily_roster" &&
    settings.fit_mode === "fit_to_page";

  return (
    <>
      <div className="schedule-export-grid">
        <label>
          Source
          <select
            value={source}
            onChange={(event) => onSourceChange(event.target.value)}
          >
            <option value="published">Published schedule</option>
            {drafts.map((draft) => (
              <option key={draft.id} value={draft.id}>
                {draft.name} · revision {draft.revision}
              </option>
            ))}
          </select>
        </label>
        <label>
          Preset
          <select
            defaultValue=""
            onChange={(event) => {
              const preset = presets.find(
                (item) => item.id === event.target.value,
              );
              if (preset) onApplyPreset(preset.settings);
            }}
          >
            <option value="">Custom settings</option>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </label>
        <SegmentedControl
          label="Format"
          value={settings.format}
          options={[
            {
              value: "pdf",
              label: "PDF",
              icon: <FileText size={14} />,
            },
            {
              value: "xlsx",
              label: "XLSX",
              icon: <FileSpreadsheet size={14} />,
            },
            { value: "csv", label: "CSV", icon: <Table2 size={14} /> },
          ]}
          onChange={(format) => onSettingsChange({ format })}
        />
        {settings.format !== "csv" ? (
          <SegmentedControl
            label="Layout"
            value={settings.layout}
            columns={3}
            options={[
              {
                value: "weekly",
                label: "Weekly table",
                icon: <Table2 size={14} />,
              },
              {
                value: "daily",
                label: "Daily sections",
                icon: <CalendarDays size={14} />,
              },
              {
                value: "daily_roster",
                label: "Daily roster",
                icon: <CalendarDays size={14} />,
              },
            ]}
            onChange={(layout) => onSettingsChange({ layout })}
          />
        ) : null}
        <SegmentedControl
          label="Time"
          value={settings.time_format}
          options={[
            { value: "12h", label: "12-hour", icon: <Clock3 size={14} /> },
            { value: "24h", label: "24-hour", icon: <Clock3 size={14} /> },
          ]}
          onChange={(time_format) => onSettingsChange({ time_format })}
        />
        <SegmentedControl<ExportLocale>
          label="Language"
          value={settings.locale ?? "en"}
          columns={3}
          options={[
            { value: "en", label: "EN", icon: <Languages size={14} /> },
            { value: "tr", label: "TR", icon: <Languages size={14} /> },
            { value: "es", label: "ES", icon: <Languages size={14} /> },
          ]}
          onChange={(locale) =>
            onSettingsChange({
              locale,
              ...(locale === "en" ? {} : { csv_delimiter: ";" }),
            })
          }
        />
        {settings.format === "csv" ? (
          <SegmentedControl
            label="Delimiter"
            value={settings.csv_delimiter}
            options={[
              { value: ",", label: "Comma" },
              { value: ";", label: "Semicolon" },
            ]}
            onChange={(csv_delimiter) => onSettingsChange({ csv_delimiter })}
          />
        ) : null}
        {settings.format === "print" || settings.format === "pdf" ? (
          <>
            <SegmentedControl<ExportPaperSize>
              label="Paper"
              value={settings.paper_size ?? "a4"}
              options={[
                { value: "a4", label: "A4" },
                { value: "letter", label: "Letter" },
              ]}
              onChange={(paper_size) => onSettingsChange({ paper_size })}
            />
            {settings.layout !== "daily_roster" ? (
              <>
                <SegmentedControl<ExportOrientation>
                  label="Orientation"
                  value={settings.orientation ?? "auto"}
                  columns={3}
                  options={[
                    { value: "auto", label: "Auto" },
                    { value: "portrait", label: "Portrait" },
                    { value: "landscape", label: "Landscape" },
                  ]}
                  onChange={(orientation) =>
                    onSettingsChange({ orientation })
                  }
                />
                <SegmentedControl<ExportFitMode>
                  label="Fit"
                  value={settings.fit_mode ?? "auto"}
                  columns={3}
                  options={[
                    { value: "auto", label: "Auto" },
                    { value: "fit_to_page", label: "One page" },
                    { value: "one_location_per_page", label: "Per location" },
                  ]}
                  onChange={(fit_mode) => onSettingsChange({ fit_mode })}
                />
              </>
            ) : null}
          </>
        ) : null}
        {showPdfFitWarning ? (
          <div className="schedule-export-warning" role="status">
            <AlertTriangle size={14} aria-hidden />
            <span>
              One-page PDF exports can be hard to read when the schedule has
              many rows.
            </span>
          </div>
        ) : null}
      </div>
      <fieldset className="schedule-publication-locations">
        <legend>Locations</legend>
        {locations.map((location) => (
          <label key={location.id} className="schedule-publication-location">
            <input
              type="checkbox"
              checked={locationIds.includes(location.id)}
              onChange={() => onToggleLocation(location.id)}
            />
            <span>
              <strong>{location.name}</strong>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="schedule-export-options">
        <label className="schedule-check">
          <input
            type="checkbox"
            checked={settings.include_unassigned}
            onChange={(event) =>
              onSettingsChange({ include_unassigned: event.target.checked })
            }
          />{" "}
          Include open shifts
        </label>
        <label className="schedule-check">
          <input
            type="checkbox"
            checked={settings.include_notes}
            onChange={(event) =>
              onSettingsChange({ include_notes: event.target.checked })
            }
          />{" "}
          Include notes
        </label>
        <label className="schedule-check">
          <input
            type="checkbox"
            checked={settings.include_scheduled_hours}
            onChange={(event) =>
              onSettingsChange({
                include_scheduled_hours: event.target.checked,
              })
            }
          />{" "}
          Include scheduled hours
        </label>
      </div>
    </>
  );
}

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  columns = 2,
  onChange,
}: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly SegmentOption<T>[];
  readonly columns?: 2 | 3;
  readonly onChange: (value: T) => void;
}) {
  return (
    <div className="schedule-export-segment-field">
      <span>{label}</span>
      <div
        className="schedule-export-segment-group"
        data-columns={columns}
        role="group"
        aria-label={label}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.icon}
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
