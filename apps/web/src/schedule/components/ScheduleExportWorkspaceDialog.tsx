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
} from "@newfork/shared/schedule";
import { FileDown, X } from "lucide-react";

import { ScheduleExportControls } from "./ScheduleExportControls";
import { ScheduleExportPresets } from "./ScheduleExportPresets";
import { ScheduleExportPreviewDialog } from "./ScheduleExportPreviewDialog";
import { ScheduleExportRecentEvents } from "./ScheduleExportRecentEvents";
import { ScheduleExportSchedules } from "./ScheduleExportSchedules";

export function ScheduleExportWorkspaceDialog({
  source,
  settings,
  locationIds,
  locations,
  drafts,
  presets,
  scheduledExports,
  recentExportEvents,
  request,
  preview,
  htmlPreview,
  pending,
  error,
  run,
  onClose,
  onSourceChange,
  onApplyPreset,
  onSettingsChange,
  onToggleLocation,
  onSavePreset,
  onDeletePreset,
  onCreateScheduledExport,
  onToggleScheduledExport,
  onDeleteScheduledExport,
  onPreview,
  onPreviewHtml,
  onDownload,
}: {
  readonly source: string;
  readonly settings: ScheduleExportSettings;
  readonly locationIds: readonly string[];
  readonly locations: readonly ScheduleLocation[];
  readonly drafts: readonly ScheduleDraftSummary[];
  readonly presets: readonly ScheduleExportPreset[];
  readonly scheduledExports: readonly ScheduleExportSchedule[];
  readonly recentExportEvents: readonly ScheduleRecentExportEvent[];
  readonly request: ScheduleExportRequest;
  readonly preview: ScheduleExportPreview | null;
  readonly htmlPreview: string | null;
  readonly pending: boolean;
  readonly error: string | null;
  readonly run: (action: () => Promise<void>) => void;
  readonly onClose: () => void;
  readonly onSourceChange: (source: string) => void;
  readonly onApplyPreset: (settings: ScheduleExportSettings) => void;
  readonly onSettingsChange: (next: Partial<ScheduleExportSettings>) => void;
  readonly onToggleLocation: (locationId: string) => void;
  readonly onSavePreset: (
    name: string,
    settings: ScheduleExportSettings,
  ) => Promise<boolean>;
  readonly onDeletePreset: (presetId: string) => Promise<boolean>;
  readonly onCreateScheduledExport: (
    input: CreateScheduleExportScheduleInput,
  ) => Promise<unknown>;
  readonly onToggleScheduledExport: (
    scheduleId: string,
    enabled: boolean,
  ) => Promise<unknown>;
  readonly onDeleteScheduledExport: (scheduleId: string) => Promise<unknown>;
  readonly onPreview: () => Promise<void>;
  readonly onPreviewHtml: () => Promise<void>;
  readonly onDownload: () => Promise<void>;
}) {
  return (
    <div className="schedule-dialog-layer schedule-export-workspace-layer">
      <button
        type="button"
        className="schedule-dialog-backdrop"
        aria-label="Close export workspace"
        onClick={onClose}
      />
      <section
        className="schedule-dialog schedule-export-workspace"
        role="dialog"
        aria-modal="true"
        aria-label="Export workspace"
      >
        <header>
          <h2>Export workspace</h2>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close export workspace"
          >
            <X size={16} />
          </button>
        </header>
        <div className="schedule-export-workspace-body">
          <aside className="schedule-export-workspace-controls">
            <ScheduleExportControls
              source={source}
              settings={settings}
              locationIds={locationIds}
              locations={locations}
              drafts={drafts}
              presets={presets}
              onSourceChange={onSourceChange}
              onApplyPreset={onApplyPreset}
              onSettingsChange={onSettingsChange}
              onToggleLocation={onToggleLocation}
            />
            <ScheduleExportPresets
              presets={presets}
              settings={request.settings}
              pending={pending}
              onSavePreset={onSavePreset}
              onDeletePreset={onDeletePreset}
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
            />
            <ScheduleExportRecentEvents events={recentExportEvents} />
          </aside>
          <section className="schedule-export-workspace-preview">
            <div className="schedule-export-workspace-preview-header">
              <div>
                <strong>Preview</strong>
                <span>
                  {settings.format === "print" ? "PDF" : settings.format.toUpperCase()}
                </span>
              </div>
              <div>
                <button
                  type="button"
                  disabled={pending || !locationIds.length}
                  onClick={() =>
                    run(
                      settings.format === "print" || settings.format === "pdf"
                        ? onPreviewHtml
                        : onPreview,
                    )
                  }
                >
                  {pending ? "Rendering preview..." : "Preview export"}
                </button>
                {preview || htmlPreview ? (
                  <button
                    type="button"
                    className="primary-command"
                    disabled={pending}
                    onClick={() => run(onDownload)}
                  >
                    <FileDown size={15} />{" "}
                    {settings.format === "csv"
                      ? "Download CSV"
                      : settings.format === "xlsx"
                        ? "Download XLSX"
                        : "Download PDF"}
                  </button>
                ) : null}
              </div>
            </div>
            {settings.format === "csv" || settings.format === "xlsx" ? (
              <p className="schedule-export-workspace-empty">
                {settings.format.toUpperCase()} is a data file - no print preview.
              </p>
            ) : pending ? (
              <p className="schedule-export-workspace-empty">
                Rendering preview...
              </p>
            ) : error ? (
              <p className="schedule-overwrite-warning" role="alert">
                Preview could not be generated. Try again after refreshing the
                schedule.
              </p>
            ) : htmlPreview ? (
              <iframe
                className="schedule-export-workspace-frame"
                title="Schedule export preview"
                srcDoc={htmlPreview}
              />
            ) : preview ? (
              <ScheduleExportPreviewDialog preview={preview} />
            ) : (
              <p className="schedule-export-workspace-empty">
                Generate a preview to review the printable schedule.
              </p>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
