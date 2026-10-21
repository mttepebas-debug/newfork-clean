import type {
  CreateScheduleExportScheduleInput,
  ScheduleDraftSummary,
  ScheduleExportPreset,
  ScheduleExportPreview,
  ScheduleExportRequest,
  ScheduleExportSchedule,
  ScheduleExportSettings,
  ScheduleLocation,
  ScheduleRecentExportEvent,
  ScheduleReadModel,
} from "@newfork/shared/schedule";
import { FileDown, Maximize2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ScheduleExportControls } from "./ScheduleExportControls";
import { ScheduleExportPresets } from "./ScheduleExportPresets";
import { ScheduleExportPreviewDialog } from "./ScheduleExportPreviewDialog";
import { ScheduleExportRecentEvents } from "./ScheduleExportRecentEvents";
import { ScheduleExportSchedules } from "./ScheduleExportSchedules";
import { ScheduleExportWorkspaceDialog } from "./ScheduleExportWorkspaceDialog";
import {
  scheduleExportErrorMessage,
  scheduleExportFilenameFallback,
} from "./scheduleExportDownload";
import { firstLocationZone } from "../../lib/today";

function defaultExportSettings(
  timeFormat: ScheduleReadModel["settings"]["time_format"],
): ScheduleExportSettings {
  return {
  format: "pdf",
  layout: "weekly",
  locale: "en",
  time_format: timeFormat,
  include_unassigned: true,
  include_notes: false,
  include_scheduled_hours: true,
  csv_delimiter: ",",
  };
}

export function ScheduleExportDialog({
  weekStart,
  defaultTimeFormat = "12h",
  locations,
  drafts,
  presets,
  scheduledExports,
  recentExportEvents,
  showShiftType,
  showShiftLabels,
  showClockTimes,
  showRoleSeparators,
  showPresetShiftBadges,
  onClose,
  onPreview,
  onPreviewHtml,
  onDownload,
  onSavePreset,
  onDeletePreset,
  onCreateScheduledExport,
  onToggleScheduledExport,
  onDeleteScheduledExport,
}: {
  readonly weekStart: string;
  readonly defaultTimeFormat?: ScheduleReadModel["settings"]["time_format"];
  readonly locations: readonly ScheduleLocation[];
  readonly drafts: readonly ScheduleDraftSummary[];
  readonly presets: readonly ScheduleExportPreset[];
  readonly scheduledExports: readonly ScheduleExportSchedule[];
  readonly recentExportEvents: readonly ScheduleRecentExportEvent[];
  readonly showShiftType: boolean;
  readonly showShiftLabels: boolean;
  readonly showClockTimes: boolean;
  readonly showRoleSeparators: boolean;
  readonly showPresetShiftBadges: boolean;
  readonly onClose: () => void;
  readonly onPreview: (
    request: ScheduleExportRequest,
  ) => Promise<ScheduleExportPreview>;
  readonly onPreviewHtml: (request: ScheduleExportRequest) => Promise<string>;
  readonly onDownload: (request: ScheduleExportRequest) => Promise<Blob>;
  readonly onSavePreset: (
    name: string,
    settings: ScheduleExportSettings,
  ) => Promise<unknown>;
  readonly onDeletePreset: (presetId: string) => Promise<unknown>;
  readonly onCreateScheduledExport: (
    input: CreateScheduleExportScheduleInput,
  ) => Promise<unknown>;
  readonly onToggleScheduledExport: (
    scheduleId: string,
    enabled: boolean,
  ) => Promise<unknown>;
  readonly onDeleteScheduledExport: (scheduleId: string) => Promise<unknown>;
}) {
  const [source, setSource] = useState("published");
  const [locationIds, setLocationIds] = useState(() =>
    locations.map((item) => item.id),
  );
  const [settings, setSettings] = useState(() =>
    defaultExportSettings(defaultTimeFormat),
  );
  const [preview, setPreview] = useState<ScheduleExportPreview | null>(null);
  const [htmlPreview, setHtmlPreview] = useState<string | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request: ScheduleExportRequest = {
    week_start: weekStart,
    source:
      source === "published"
        ? { type: "published" }
        : { type: "draft", draft_id: source },
    location_ids: locationIds,
    settings: {
      ...settings,
      show_shift_type: showShiftType,
      show_labels: showShiftLabels,
      show_clock_in_out: showClockTimes,
      show_role_separators: showRoleSeparators,
      show_preset_shift_badges: showPresetShiftBadges,
    },
  };
  const changeSettings = (next: Partial<ScheduleExportSettings>) => {
    setSettings((current) => ({ ...current, ...next }));
    setPreview(null);
    setHtmlPreview(null);
  };
  const run = async (action: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(scheduleExportErrorMessage(caught));
    } finally {
      setPending(false);
    }
  };
  const download = async () => {
    const blob = await onDownload(request);
    const url = URL.createObjectURL(blob);
    if (settings.format === "print" || settings.format === "pdf")
      window.open(url, "_blank", "noopener,noreferrer");
    else {
      const link = document.createElement("a");
      link.href = url;
      link.download = scheduleExportFilenameFallback(request);
      link.click();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  const changeSource = (nextSource: string) => {
    setSource(nextSource);
    setPreview(null);
    setHtmlPreview(null);
  };
  const applyPreset = (nextSettings: ScheduleExportSettings) => {
    setSettings(nextSettings);
    setPreview(null);
    setHtmlPreview(null);
  };
  const toggleLocation = (locationId: string) => {
    setLocationIds((current) =>
      current.includes(locationId)
        ? current.filter((id) => id !== locationId)
        : [...current, locationId],
    );
    setPreview(null);
    setHtmlPreview(null);
  };
  return (
    <Dialog
      title="Export schedule"
      onClose={onClose}
      actions={
        <button
          type="button"
          className="icon-button"
          aria-label="Open export workspace"
          onClick={() => setWorkspaceOpen(true)}
        >
          <Maximize2 size={16} />
        </button>
      }
    >
      <div className="schedule-tool-dialog schedule-export-dialog">
        <ScheduleExportControls
          source={source}
          settings={settings}
          locationIds={locationIds}
          locations={locations}
          drafts={drafts}
          presets={presets}
          onSourceChange={changeSource}
          onApplyPreset={applyPreset}
          onSettingsChange={changeSettings}
          onToggleLocation={toggleLocation}
        />
        <ScheduleExportPresets
          presets={presets}
          settings={request.settings}
          pending={pending}
          onSavePreset={async (name, nextSettings) => {
            let saved = false;
            await run(async () => {
              await onSavePreset(name, nextSettings);
              saved = true;
            });
            return saved;
          }}
          onDeletePreset={async (presetId) => {
            let deleted = false;
            await run(async () => {
              await onDeletePreset(presetId);
              deleted = true;
            });
            return deleted;
          }}
        />
        <ScheduleExportSchedules
          presets={presets}
          schedules={scheduledExports}
          selectedLocationIds={locationIds}
          pending={pending}
          run={run}
          onCreate={onCreateScheduledExport}
          onToggle={onToggleScheduledExport}
          onDelete={onDeleteScheduledExport}
          locationZone={firstLocationZone(locations.filter((item) => locationIds.includes(item.id))) ?? firstLocationZone(locations)}
        />
        <ScheduleExportRecentEvents events={recentExportEvents} />
        {preview ? <ScheduleExportPreviewDialog preview={preview} /> : null}
        {error ? (
          <p className="schedule-overwrite-warning" role="alert">
            {error}
          </p>
        ) : null}
        <div className="schedule-dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          {preview ? (
            <button
              type="button"
              className="primary"
              disabled={pending}
              onClick={() => void run(download)}
            >
              <FileDown size={15} />{" "}
              {settings.format === "csv"
                ? "Download CSV"
                : settings.format === "xlsx"
                  ? "Download XLSX"
                  : "Download PDF"}
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              disabled={pending || !locationIds.length}
              onClick={() =>
                void run(async () => setPreview(await onPreview(request)))
              }
            >
              {pending ? "Preparing…" : "Preview export"}
            </button>
          )}
        </div>
        {workspaceOpen ? (
          <ScheduleExportWorkspaceDialog
            source={source}
            settings={settings}
            locationIds={locationIds}
            locations={locations}
            drafts={drafts}
            presets={presets}
            scheduledExports={scheduledExports}
            recentExportEvents={recentExportEvents}
            request={request}
            preview={preview}
            htmlPreview={htmlPreview}
            pending={pending}
            error={error}
            run={run}
            onClose={() => setWorkspaceOpen(false)}
            onSourceChange={changeSource}
            onApplyPreset={applyPreset}
            onSettingsChange={changeSettings}
            onToggleLocation={toggleLocation}
            onSavePreset={async (name, nextSettings) => {
              let saved = false;
              await run(async () => {
                await onSavePreset(name, nextSettings);
                saved = true;
              });
              return saved;
            }}
            onDeletePreset={async (presetId) => {
              let deleted = false;
              await run(async () => {
                await onDeletePreset(presetId);
                deleted = true;
              });
              return deleted;
            }}
            onCreateScheduledExport={onCreateScheduledExport}
            onToggleScheduledExport={onToggleScheduledExport}
            onDeleteScheduledExport={onDeleteScheduledExport}
            onPreview={async () => setPreview(await onPreview(request))}
            onPreviewHtml={async () =>
              setHtmlPreview(await onPreviewHtml(request))
            }
            onDownload={download}
          />
        ) : null}
      </div>
    </Dialog>
  );
}

function Dialog({
  title,
  actions,
  children,
  onClose,
}: {
  readonly title: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly onClose: () => void;
}) {
  return (
    <div className="schedule-dialog-backdrop" role="presentation">
      <section
        className="schedule-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <div className="schedule-dialog-header-actions">
            {actions}
            <button type="button" onClick={onClose} aria-label="Close dialog">
              ×
            </button>
          </div>
        </header>
        {children}
      </section>
    </div>
  );
}
