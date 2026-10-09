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
import { Download, FileDown, Maximize2, X } from "lucide-react";
import { useState } from "react";

import { ScheduleExportControls } from "./ScheduleExportControls";
import { ScheduleExportPreviewDialog } from "./ScheduleExportPreviewDialog";
import { ScheduleExportWorkspaceDialog } from "./ScheduleExportWorkspaceDialog";
import {
  formatScheduleExportLabel,
  scheduleExportErrorMessage,
  scheduleExportFilenameFallback,
} from "./scheduleExportDownload";

function defaultExportPanelSettings(
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

export function ScheduleExportPanel({
  weekStart,
  weekLabel,
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
  exportBlockedReason = null,
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
  readonly weekLabel: string;
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
  readonly exportBlockedReason?: string | null;
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
    locations.map((location) => location.id),
  );
  const [settings, setSettings] = useState(() =>
    defaultExportPanelSettings(defaultTimeFormat),
  );
  const [preview, setPreview] = useState<ScheduleExportPreview | null>(null);
  const [htmlPreview, setHtmlPreview] = useState<string | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabledReason =
    exportBlockedReason ?? (!locationIds.length ? "Select at least one location." : null);
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

  const resetGeneratedPreview = () => {
    setPreview(null);
    setHtmlPreview(null);
  };

  const run = async (action: () => Promise<void>) => {
    if (pending) return;
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
    if (settings.format === "print" || settings.format === "pdf") {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      const link = document.createElement("a");
      link.href = url;
      link.download = scheduleExportFilenameFallback(request);
      link.click();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const changeSource = (nextSource: string) => {
    setSource(nextSource);
    resetGeneratedPreview();
  };
  const applyPreset = (nextSettings: ScheduleExportSettings) => {
    setSettings(nextSettings);
    resetGeneratedPreview();
  };
  const changeSettings = (nextSettings: Partial<ScheduleExportSettings>) => {
    setSettings((current) => ({ ...current, ...nextSettings }));
    resetGeneratedPreview();
  };
  const toggleLocation = (locationId: string) => {
    setLocationIds((current) =>
      current.includes(locationId)
        ? current.filter((id) => id !== locationId)
        : [...current, locationId],
    );
    resetGeneratedPreview();
  };

  return (
    <aside
      data-schedule-export-panel
      data-testid="schedule-export-panel"
      className="schedule-export-panel"
    >
      <header>
        <div>
          <strong>Export schedule</strong>
          <span>{weekLabel}</span>
        </div>
        <div>
          <button
            type="button"
            className="icon-button"
            aria-label="Open export workspace"
            onClick={() => setWorkspaceOpen(true)}
          >
            <Maximize2 size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Cancel export"
            onClick={onClose}
            disabled={pending}
          >
            <X size={16} />
          </button>
        </div>
      </header>
      <div className="schedule-export-panel-body">
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
        {preview ? <ScheduleExportPreviewDialog preview={preview} /> : null}
        {htmlPreview ? (
          <iframe
            className="schedule-export-panel-frame"
            title="Schedule export preview"
            srcDoc={htmlPreview}
          />
        ) : null}
        {disabledReason ? (
          <p className="schedule-export-panel-warning">{disabledReason}</p>
        ) : null}
        {error ? (
          <p className="schedule-overwrite-warning" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <footer>
        <button type="button" onClick={onClose} disabled={pending}>
          Cancel
        </button>
        <button
          type="button"
          className="primary-command"
          disabled={Boolean(disabledReason) || pending}
          title={disabledReason ?? undefined}
          onClick={() => void run(download)}
        >
          <Download size={15} />{" "}
          {pending
            ? "Exporting..."
            : `Export ${formatScheduleExportLabel(settings.format)}`}
        </button>
        <button
          type="button"
          disabled={Boolean(disabledReason) || pending}
          onClick={() =>
            void run(async () => {
              if (settings.format === "pdf" || settings.format === "print") {
                setHtmlPreview(await onPreviewHtml(request));
                return;
              }
              setPreview(await onPreview(request));
            })
          }
        >
          <FileDown size={15} /> {pending ? "Preparing..." : "Preview"}
        </button>
      </footer>
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
          onPreviewHtml={async () => setHtmlPreview(await onPreviewHtml(request))}
          onDownload={download}
        />
      ) : null}
    </aside>
  );
}
