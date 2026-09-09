import { useRef, useState } from "react";
import type {
  LineupSectionPlan,
  ScheduleLineupReadModel,
} from "@newfork/shared";
import { saveLineupSectionPlan } from "../lineup-data";
import { LineupDialog } from "./LineupDialog";
import { LineupSaveStatus, useLineupAutosave } from "./useLineupAutosave";

export function SectionPlanDialog({
  workspaceId,
  date,
  locationId,
  serviceId,
  sectionId,
  model,
  plan,
  onClose,
  onMove,
  refresh,
}: {
  workspaceId: string;
  date: string;
  locationId: string;
  serviceId: string | null;
  sectionId: string;
  model: ScheduleLineupReadModel;
  plan?: LineupSectionPlan;
  onClose: () => void;
  onMove?: (ids: string[]) => void;
  refresh: () => Promise<void>;
}) {
  const [closed, setClosed] = useState(plan?.closed ?? false);
  const [lead, setLead] = useState(plan?.lead_employee_id ?? "");
  const [stations, setStations] = useState(plan?.stations ?? "");
  const revision = useRef(plan?.revision ?? null);
  const section = model.sections.find((item) => item.id === sectionId);
  const team =
    model.locations
      .find((item) => item.id === locationId)
      ?.entries.filter(
        (entry) =>
          entry.employee_id &&
          !entry.call_off &&
          !entry.hidden &&
          !entry.orphaned &&
          (!serviceId || entry.shift_type_id === serviceId),
      ) ?? [];
  const occupied =
    model.locations
      .find((item) => item.id === locationId)
      ?.entries.filter(
        (entry) =>
          !entry.hidden &&
          !entry.orphaned &&
          (!serviceId || entry.shift_type_id === serviceId) &&
          (entry.placement_segments?.length
            ? entry.placement_segments.some(
                (segment) => segment.section_id === sectionId,
              )
            : entry.section_id === sectionId),
      ) ?? [];
  const people = [
    ...new Map(
      team.map((entry) => [entry.employee_id!, entry.employee_name]),
    ).entries(),
  ];
  const autosave = useLineupAutosave({
    value: { closed, lead, stations },
    validate: (draft) =>
      draft.closed && occupied.length
        ? "Move assignments and open needs before closing this section."
        : "",
    save: async (draft) => {
      const saved = await saveLineupSectionPlan(workspaceId, {
        date,
        location_id: locationId,
        shift_type_id: serviceId,
        section_id: sectionId,
        closed: draft.closed,
        lead_employee_id: draft.lead || null,
        stations: draft.stations,
        expected_revision: revision.current,
      });
      revision.current = saved.revision;
      await refresh();
    },
  });
  const close = async () => {
    if (await autosave.flush()) onClose();
  };
  return (
    <LineupDialog
      title={`${section?.name ?? "Section"} · service setup`}
      onClose={() => void close()}
    >
      <p className="lu-field-help">
        {date} ·{" "}
        {serviceId
          ? model.shift_types.find((item) => item.id === serviceId)?.name
          : "All day"}
        . A service setting takes precedence over the all-day setting.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void close();
        }}
      >
        <fieldset className="lu-editor-fields">
          <label className="lu-checkbox">
            <input
              type="checkbox"
              checked={closed}
              onChange={(event) => setClosed(event.target.checked)}
            />
            Closed for this day / service
          </label>
          <p className="lu-field-help">
            Closing is blocked while assignments or open needs remain. Reassign
            them first.
          </p>
          {closed && occupied.length ? (
            <div className="lu-impact">
              <strong>{occupied.length} assignments need a new section</strong>
              <p>
                Move these assignments and open needs before closing this
                section.
              </p>
              {onMove ? (
                <button
                  type="button"
                  className="nf-button secondary"
                  onClick={() => onMove(occupied.map((entry) => entry.id))}
                >
                  Choose where to move them
                </button>
              ) : null}
            </div>
          ) : null}
          <label>
            Section lead
            <select
              value={lead}
              onChange={(event) => setLead(event.target.value)}
            >
              <option value="">No lead selected</option>
              {people.map(([id, name]) => (
                <option value={id} key={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Stations / table ranges
            <textarea
              value={stations}
              maxLength={500}
              rows={3}
              placeholder="Tables 1–12 · Patio north · Pickup"
              onChange={(event) => setStations(event.target.value)}
            />
          </label>
        </fieldset>
        <LineupSaveStatus state={autosave} onDiscard={onClose} />
        <footer className="lu-dialog-footer">
          <button
            type="button"
            className="nf-button secondary"
            disabled={autosave.saving}
            onClick={() => void close()}
          >
            Done
          </button>
          <button
            className="nf-button lu-primary"
            disabled={autosave.saving || (closed && occupied.length > 0)}
          >
            {autosave.saving ? "Saving…" : "Save service setup"}
          </button>
        </footer>
      </form>
    </LineupDialog>
  );
}
