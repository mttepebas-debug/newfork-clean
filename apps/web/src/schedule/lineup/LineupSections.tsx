import { useEffect, useRef, useState } from "react";
import { Plus, Save, Trash2, Undo2, X } from "lucide-react";
import type {
  ScheduleLineupReadModel,
  ScheduleLineupSection,
  ScheduleLineupSectionInput,
} from "@newfork/shared";
import { LineupDialog } from "./LineupDialog";
type Draft = ScheduleLineupSectionInput & {
  clientKey?: string;
  id: string | null;
  revision: number | null;
};
const valueOf = (
  section: ScheduleLineupSection | Draft,
): ScheduleLineupSectionInput => ({
  name: section.name,
  color: section.color,
  sort_order: section.sort_order,
  location_ids: section.location_ids ?? [],
  shift_type_ids: section.shift_type_ids ?? [],
  job_ids: section.job_ids ?? [],
});
function ScopeChoices({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <fieldset className="lu-section-scope">
      <legend>{label}</legend>
      <p>
        {selected.length
          ? `${selected.length} selected`
          : `All ${label.toLowerCase()} allowed`}
        . Select specific values to limit this section.
      </p>
      <div>
        {options.map((option) => (
          <label className="lu-checkbox" key={option.id}>
            <input
              type="checkbox"
              checked={selected.includes(option.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, option.id]
                    : selected.filter((id) => id !== option.id),
                )
              }
            />
            {option.name}
          </label>
        ))}
      </div>
      {selected.length ? (
        <button
          className="nf-button secondary"
          type="button"
          onClick={() => onChange([])}
        >
          Allow all {label.toLowerCase()}
        </button>
      ) : null}
    </fieldset>
  );
}
export function SectionsDialog({
  sections,
  model,
  onClose,
  onSave,
  onArchive,
}: {
  sections: ScheduleLineupSection[];
  model: ScheduleLineupReadModel;
  onClose: () => void;
  onSave: (
    id: string | null,
    revision: number | null,
    value: ScheduleLineupSectionInput,
  ) => Promise<ScheduleLineupSection>;
  onArchive: (id: string, revision: number) => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Draft[]>(
    sections.map((section) => ({
      ...valueOf(section),
      clientKey: section.id,
      id: section.id,
      revision: section.revision,
    })),
  );
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null);
  const [undo, setUndo] = useState<{
    id: string;
    revision: number;
    value: ScheduleLineupSectionInput;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const wasBusy = useRef(false);
  useEffect(() => {
    if (!busy && wasBusy.current)
      (trigger.current?.isConnected
        ? trigger.current
        : addButton.current
      )?.focus();
    wasBusy.current = busy;
  }, [busy]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  function change(index: number, patch: Partial<Draft>) {
    setDrafts((items) =>
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }
  async function run(action: () => Promise<void>) {
    trigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setBusy(true);
    setError(false);
    setMessage("");
    try {
      await action();
      setMessage("Sections updated.");
    } catch (err) {
      setError(true);
      setMessage(err instanceof Error ? err.message : "Section update failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <LineupDialog title="Manage sections" onClose={onClose}>
      <p className="lu-field-help">
        Define where each section is used and which positions can work there.
        Existing future assignments must be moved before adding a conflicting
        restriction.
      </p>
      <div className="lineup-section-editor">
        {drafts.map((draft, index) => (
          <section
            className="lu-section-definition"
            key={draft.clientKey ?? draft.id ?? `new-${index}`}
          >
            <div className="lineup-section-row">
              <input
                type="color"
                aria-label={`Color for ${draft.name || "new section"}`}
                value={draft.color}
                disabled={busy}
                onChange={(event) =>
                  change(index, { color: event.target.value })
                }
              />
              <input
                aria-label={`Section name ${index + 1}`}
                value={draft.name}
                placeholder="Section name"
                maxLength={80}
                disabled={busy}
                onChange={(event) =>
                  change(index, { name: event.target.value })
                }
              />
              <input
                type="number"
                min="0"
                aria-label={`Sort order for ${draft.name || "new section"}`}
                value={draft.sort_order}
                disabled={busy}
                onChange={(event) =>
                  change(index, { sort_order: Number(event.target.value) })
                }
              />
              <button
                className="icon-button"
                aria-label={`Save ${draft.name || "section"}`}
                disabled={busy || !draft.name.trim()}
                onClick={() =>
                  void run(async () => {
                    const prior = sections.find(
                      (section) => section.id === draft.id,
                    );
                    const saved = await onSave(draft.id, draft.revision, {
                      ...valueOf(draft),
                      name: draft.name.trim(),
                    });
                    change(index, {
                      ...valueOf(saved),
                      id: saved.id,
                      revision: saved.revision,
                    });
                    setUndo(
                      prior
                        ? {
                            id: saved.id,
                            revision: saved.revision,
                            value: valueOf(prior),
                          }
                        : null,
                    );
                  })
                }
              >
                <Save size={16} />
              </button>
              {draft.id ? (
                <button
                  className={`icon-button ${confirmArchive === draft.id ? "danger" : ""}`}
                  aria-label={
                    confirmArchive === draft.id
                      ? `Confirm archive ${draft.name}`
                      : `Archive ${draft.name}`
                  }
                  disabled={busy}
                  onClick={() =>
                    confirmArchive === draft.id
                      ? void run(async () => {
                          await onArchive(draft.id!, draft.revision!);
                          setDrafts((items) =>
                            items.filter((item) => item.id !== draft.id),
                          );
                          setConfirmArchive(null);
                          setUndo(null);
                        })
                      : setConfirmArchive(draft.id)
                  }
                >
                  <Trash2 size={16} />
                </button>
              ) : (
                <button
                  className="icon-button"
                  aria-label="Remove unsaved section"
                  disabled={busy}
                  onClick={() =>
                    setDrafts((items) => items.filter((_, i) => i !== index))
                  }
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <details className="lu-section-rules">
              <summary>
                {draft.location_ids?.length === 1
                  ? (model.locations.find(
                      (item) => item.id === draft.location_ids![0],
                    )?.name ?? "1 location")
                  : draft.location_ids?.length
                    ? `${draft.location_ids.length} locations`
                    : "All locations"}{" "}
                ·{" "}
                {draft.shift_type_ids?.length === 1
                  ? (model.shift_types.find(
                      (item) => item.id === draft.shift_type_ids![0],
                    )?.name ?? "1 service")
                  : draft.shift_type_ids?.length
                    ? `${draft.shift_type_ids.length} services`
                    : "All services"}{" "}
                ·{" "}
                {draft.job_ids?.length === 1
                  ? (model.jobs.find((item) => item.id === draft.job_ids![0])
                      ?.name ?? "1 position")
                  : draft.job_ids?.length
                    ? `${draft.job_ids.length} positions`
                    : "All positions"}
              </summary>
              <fieldset disabled={busy} className="lu-section-rule-fields">
                <ScopeChoices
                  label="Locations"
                  options={model.locations}
                  selected={draft.location_ids ?? []}
                  onChange={(ids) => change(index, { location_ids: ids })}
                />
                <ScopeChoices
                  label="Services"
                  options={model.shift_types}
                  selected={draft.shift_type_ids ?? []}
                  onChange={(ids) => change(index, { shift_type_ids: ids })}
                />
                <ScopeChoices
                  label="Positions"
                  options={model.jobs}
                  selected={draft.job_ids ?? []}
                  onChange={(ids) => change(index, { job_ids: ids })}
                />
              </fieldset>
            </details>
          </section>
        ))}
        <button
          className="nf-button secondary"
          ref={addButton}
          disabled={busy}
          onClick={() =>
            setDrafts((items) => [
              ...items,
              {
                clientKey: crypto.randomUUID(),
                id: null,
                revision: null,
                name: "",
                color: "#397A68",
                sort_order: (items.length + 1) * 10,
                location_ids: [],
                shift_type_ids: [],
                job_ids: [],
              },
            ])
          }
        >
          <Plus size={16} />
          Add section
        </button>
        {message ? (
          <p
            className={error ? "lu-error" : "lineup-section-message"}
            role={error ? "alert" : "status"}
          >
            {message}
          </p>
        ) : null}
        {undo ? (
          <button
            className="nf-button secondary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const saved = await onSave(undo.id, undo.revision, undo.value);
                setDrafts((items) =>
                  items.map((item) =>
                    item.id === saved.id
                      ? {
                          ...item,
                          ...valueOf(saved),
                          id: saved.id,
                          revision: saved.revision,
                        }
                      : item,
                  ),
                );
                setUndo(null);
              })
            }
          >
            <Undo2 size={16} />
            Undo section changes
          </button>
        ) : null}
      </div>
    </LineupDialog>
  );
}
