import { useEffect, useRef, useState } from "react";
import type {
  LineupPlacementPreview,
  ScheduleLineupEntry,
  ScheduleLineupLocation,
  ScheduleLineupReadModel,
} from "@newfork/shared";
import {
  applyLineupPlacements,
  previewLineupPlacements,
  type LineupPlacementBatch,
} from "../lineup-data";
import { LineupDialog } from "./LineupDialog";
import { entryInput, lineupSectionAllowed } from "./lineup-helpers";
import { formatTimeRange } from "../lib/scheduleDateTime";

export function LineupPlacements({
  workspaceId,
  date,
  location,
  model,
  rows,
  initialIds = [],
  onClose,
  refresh,
}: {
  workspaceId: string;
  date: string;
  location: ScheduleLineupLocation;
  model: ScheduleLineupReadModel;
  rows: ScheduleLineupEntry[];
  initialIds?: string[];
  onClose: () => void;
  refresh: () => Promise<void>;
}) {
  const [selected, setSelected] = useState(initialIds);
  const [section, setSection] = useState("");
  const [station, setStation] = useState("");
  const [partial, setPartial] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [preview, setPreview] = useState<LineupPlacementPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [undo, setUndo] = useState<LineupPlacementBatch | null>(null);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (preview || saved) {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView?.({ block: "start" });
    }
  }, [preview, saved]);
  const batch: LineupPlacementBatch = {
    date,
    location_id: location.id,
    entries: rows
      .filter((row) => selected.includes(row.id))
      .map((row) => ({
        id: row.id,
        expected_revision: row.revision,
        entry: {
          ...entryInput(row),
          section_id: section || null,
          station,
          placement_segments: partial ? undefined : [],
          placement_range: partial
            ? { start_time: start, end_time: end }
            : undefined,
        },
      })),
  };
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Section placement could not be saved",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <LineupDialog title="Place your team" onClose={onClose}>
      <p className="lu-field-help">
        {location.name} · {date}. Select assignments, choose their section, then
        review coverage before saving.
      </p>
      {saved ? (
        <div className="lu-impact">
          <h3 tabIndex={-1} ref={heading}>
            Section placements saved
          </h3>
          <p>
            The board is updated. Share the new plan when your team is ready.
          </p>
          {undo ? (
            <button
              className="nf-button secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const check = await previewLineupPlacements(
                    workspaceId,
                    undo,
                  );
                  if (!check.allowed)
                    throw new Error(
                      check.rows.flatMap((row) => row.blockers).join(" · "),
                    );
                  await applyLineupPlacements(
                    workspaceId,
                    undo,
                    check.fingerprint,
                    crypto.randomUUID(),
                  );
                  await refresh();
                  setUndo(null);
                  setSaved(false);
                  setPreview(null);
                  setKey(crypto.randomUUID());
                })
              }
            >
              Undo section placements
            </button>
          ) : null}
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              if (!preview) {
                setPreview(await previewLineupPlacements(workspaceId, batch));
                return;
              }
              const result = await applyLineupPlacements(
                workspaceId,
                batch,
                preview.fingerprint,
                key,
              );
              setUndo({
                date,
                location_id: location.id,
                entries: result.entries.map((item, index) => ({
                  id: item.entry_id,
                  expected_revision: item.entry_revision,
                  entry: entryInput(
                    rows.find((row) => row.id === batch.entries[index]!.id)!,
                  ),
                })),
              });
              await refresh();
              setSaved(true);
            });
          }}
        >
          <fieldset
            className="lu-editor-fields"
            disabled={busy || Boolean(preview)}
          >
            <div className="lu-form-grid">
              <label>
                Destination section
                <select
                  value={section}
                  onChange={(event) => setSection(event.target.value)}
                >
                  <option value="">Unassigned</option>
                  {model.sections.map((item) => (
                    <option
                      key={item.id}
                      value={item.id}
                      disabled={!lineupSectionAllowed(item, location.id)}
                    >
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Station / tables
                <input
                  value={station}
                  maxLength={80}
                  onChange={(event) => setStation(event.target.value)}
                />
              </label>
            </div>
            <label className="lu-checkbox">
              <input
                type="checkbox"
                checked={partial}
                onChange={(event) => setPartial(event.target.checked)}
              />
              Only part of each shift
            </label>
            {partial ? (
              <div className="lu-form-grid">
                <label>
                  Placement starts
                  <input
                    type="time"
                    required
                    value={start}
                    onChange={(event) => setStart(event.target.value)}
                  />
                </label>
                <label>
                  Placement ends
                  <input
                    type="time"
                    required
                    value={end}
                    onChange={(event) => setEnd(event.target.value)}
                  />
                </label>
              </div>
            ) : null}
            <p className="lu-field-help">
              {partial
                ? `Each interval must fit within its shift, in ${location.timezone}. Past placements stay unchanged.`
                : "Applies to each full shift. Use a partial interval for service already in progress."}
            </p>
            <div className="lu-bulk-selection">
              <div className="lu-bulk-heading">
                <strong>{selected.length} selected</strong>
                <button
                  type="button"
                  onClick={() =>
                    setSelected(
                      selected.length === rows.length
                        ? []
                        : rows.map((row) => row.id),
                    )
                  }
                >
                  {selected.length === rows.length
                    ? "Clear selection"
                    : "Select all"}
                </button>
              </div>
              {rows.map((row) => (
                <label className="lu-bulk-row" key={row.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(row.id)}
                    onChange={(event) =>
                      setSelected((ids) =>
                        event.target.checked
                          ? [...ids, row.id]
                          : ids.filter((id) => id !== row.id),
                      )
                    }
                  />
                  <span>
                    <strong>{row.employee_name || "Open position"}</strong>
                    <small>
                      {row.job_name} · {row.section_name || "Unassigned"}
                      {row.start_time && row.end_time
                        ? ` · ${formatTimeRange(row.start_time, row.end_time, model.settings.time_format)}`
                        : ""}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {preview ? (
            <section className="lu-impact">
              <h3 tabIndex={-1} ref={heading}>
                Review section coverage
              </h3>
              {preview.rows.map((row) => (
                <div
                  className={
                    row.allowed ? "lu-bulk-result" : "lu-bulk-result lu-error"
                  }
                  key={row.entry_id}
                >
                  <strong>
                    {row.employee_name} ·{" "}
                    {row.allowed ? "Ready" : "Needs attention"}
                  </strong>
                  {row.effects.map((effect, index) => (
                    <p key={index}>{effect}</p>
                  ))}
                  {row.blockers.map((blocker) => (
                    <p key={blocker}>{blocker}</p>
                  ))}
                </div>
              ))}
              {!preview.allowed ? (
                <p>
                  Nothing will be saved until these conflicts are resolved. Edit
                  your choices or remove the affected assignments.
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  setKey(crypto.randomUUID());
                }}
              >
                Edit choices
              </button>
            </section>
          ) : null}
          <footer className="lu-dialog-footer">
            <button
              type="button"
              className="nf-button secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="nf-button lu-primary"
              disabled={
                busy || !selected.length || Boolean(preview && !preview.allowed)
              }
            >
              {busy
                ? "Saving…"
                : preview
                  ? "Confirm section placements"
                  : "Review section coverage"}
            </button>
          </footer>
        </form>
      )}
      {error ? (
        <p className="lu-error" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <footer className="lu-dialog-footer">
          <button className="nf-button lu-primary" onClick={onClose}>
            Back to Line Up
          </button>
        </footer>
      ) : null}
    </LineupDialog>
  );
}
