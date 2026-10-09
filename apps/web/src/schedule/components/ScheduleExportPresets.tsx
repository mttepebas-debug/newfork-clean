import type {
  ScheduleExportPreset,
  ScheduleExportSettings,
} from "@newfork/shared/schedule";
import { Trash2 } from "lucide-react";
import { useState } from "react";

export function ScheduleExportPresets({
  presets,
  settings,
  pending,
  onSavePreset,
  onDeletePreset,
}: {
  readonly presets: readonly ScheduleExportPreset[];
  readonly settings: ScheduleExportSettings;
  readonly pending: boolean;
  readonly onSavePreset: (
    name: string,
    settings: ScheduleExportSettings,
  ) => Promise<boolean>;
  readonly onDeletePreset: (presetId: string) => Promise<boolean>;
}) {
  const [presetName, setPresetName] = useState("");

  return (
    <section className="schedule-export-presets" data-testid="schedule-export-presets">
      <div className="schedule-preset-row">
        <input
          aria-label="Preset name"
          placeholder="Preset name"
          value={presetName}
          maxLength={80}
          onChange={(event) => setPresetName(event.target.value)}
        />
        <button
          type="button"
          disabled={pending || !presetName.trim()}
          onClick={() =>
            void onSavePreset(presetName.trim(), settings).then((saved) => {
              if (saved) setPresetName("");
            })
          }
        >
          Save preset
        </button>
      </div>
      {presets.length ? (
        <div className="schedule-preset-list">
          {presets.map((preset) => (
            <span key={preset.id}>
              {preset.name}
              <button
                type="button"
                aria-label={`Delete ${preset.name}`}
                disabled={pending}
                onClick={() => void onDeletePreset(preset.id)}
              >
                <Trash2 size={13} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
