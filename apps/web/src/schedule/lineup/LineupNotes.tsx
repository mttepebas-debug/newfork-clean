import { useRef, useState } from "react";
import {
  ClipboardList,
  LockKeyhole,
  Pin,
  Plus,
  NotebookPen,
  ArrowUpRight,
} from "lucide-react";
import type {
  LineupNote,
  LineupNoteInput,
  LineupOperationsState,
  ScheduleLineupLocation,
  ScheduleLineupReadModel,
} from "@newfork/shared";
import { saveLineupNote } from "../lineup-data";
import { LineupDialog } from "./LineupDialog";
import { LineupSaveStatus, useLineupAutosave } from "./useLineupAutosave";

const labels = {
  priority: "Today's priorities",
  specials: "Specials",
  "86": "86 / out of stock",
  event: "Event / large party",
  instruction: "Section instruction",
  checklist: "Opening / closing",
  briefing: "Lead / briefing time",
};
export function LineupNotes({
  workspaceId,
  date,
  location,
  serviceId,
  model,
  state,
  error,
  canManage,
  refresh,
  onBrief,
}: {
  workspaceId: string;
  date: string;
  location: ScheduleLineupLocation;
  serviceId: string | null;
  model: ScheduleLineupReadModel;
  state?: LineupOperationsState;
  error?: string;
  canManage: boolean;
  refresh: () => Promise<void>;
  onBrief: () => void;
}) {
  const [editing, setEditing] = useState<LineupNote | "new" | null>(null);
  const notes =
    state?.notes.filter(
      (note) =>
        !serviceId || !note.shift_type_id || note.shift_type_id === serviceId,
    ) ?? [];
  const briefs = location.briefs.filter(
    (brief) => !serviceId || brief.shift_type_id === serviceId,
  );
  return (
    <section className="lu-notes">
      <header>
        <span className="lu-note-icon">
          <NotebookPen size={18} />
        </span>
        <div>
          <span className="lu-eyebrow">THE SERVICE ESSENTIALS</span>
          <h2>Daily brief</h2>
        </div>
        {canManage ? (
          <button aria-label="Add note" onClick={() => setEditing("new")}>
            <Plus size={18} />
          </button>
        ) : null}
      </header>
      <div className="lu-notes-body">
        {notes.map((note) => (
          <article
            className={`lu-note${note.pinned ? " lu-note-pinned" : ""}`}
            key={note.id}
          >
            <div>
              <span>{labels[note.category]}</span>
              {note.visibility === "managers" ? (
                <LockKeyhole size={13} aria-label="Managers only" />
              ) : note.pinned ? (
                <Pin size={13} aria-label="Pinned" />
              ) : null}
            </div>
            <p>{note.content}</p>
            <footer>
              <small>
                {note.section_id
                  ? model.sections.find(
                      (section) => section.id === note.section_id,
                    )?.name
                  : note.shift_type_id
                    ? model.shift_types.find(
                        (type) => type.id === note.shift_type_id,
                      )?.name
                    : note.location_id
                      ? location.name
                      : "All locations"}
              </small>
              {canManage ? (
                <button onClick={() => setEditing(note)}>Edit</button>
              ) : null}
            </footer>
          </article>
        ))}
        {briefs.map((brief) => (
          <div key={brief.shift_type_id} className="lu-legacy-brief">
            {[
              ["86 / out of stock", brief.out_of_stock],
              ["Specials", brief.specials],
              ["Pre-shift notes", brief.pre_shift_notes],
            ]
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <article className="lu-note" key={label}>
                  <div>
                    <span>{label}</span>
                  </div>
                  <p>{value}</p>
                </article>
              ))}
          </div>
        ))}
        {!notes.length &&
        !briefs.some(
          (brief) =>
            brief.out_of_stock || brief.specials || brief.pre_shift_notes,
        ) ? (
          <div className="lu-brief-empty">
            <ClipboardList size={25} />
            <h3>A little context goes a long way.</h3>
            <p>
              Share specials, service priorities and the details your team needs
              today.
            </p>
          </div>
        ) : null}
        {error ? (
          <p className="lu-error" role="alert">
            Notes could not load. {error}
          </p>
        ) : null}
        {canManage ? (
          <>
            <button className="lu-add-note" onClick={() => setEditing("new")}>
              <Plus size={15} /> Add a note
            </button>
            <button
              className="lu-edit-brief"
              disabled={!serviceId}
              onClick={onBrief}
            >
              {serviceId
                ? "Edit service brief"
                : "Select a service to edit its brief"}{" "}
              <ArrowUpRight size={14} />
            </button>
          </>
        ) : null}
      </div>
      {editing ? (
        <NoteEditor
          key={editing === "new" ? "new" : editing.id}
          workspaceId={workspaceId}
          date={date}
          locationId={location.id}
          serviceId={serviceId}
          model={model}
          note={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await refresh();
          }}
        />
      ) : null}
    </section>
  );
}

function NoteEditor({
  workspaceId,
  date,
  locationId,
  serviceId,
  model,
  note,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  date: string;
  locationId: string;
  serviceId: string | null;
  model: ScheduleLineupReadModel;
  note: LineupNote | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [value, setValue] = useState<LineupNoteInput>(
    note ?? {
      date,
      location_id: locationId,
      shift_type_id: serviceId,
      section_id: null,
      category: "priority",
      content: "",
      visibility: "team",
      pinned: false,
      expires_at: null,
    },
  );
  const identity = useRef({
    id: note?.id ?? null,
    revision: note?.revision ?? null,
  });
  const autosave = useLineupAutosave({
    value,
    validate: (draft) =>
      draft.content.trim() ? "" : "Enter a note before saving.",
    save: async (draft) => {
      const saved = await saveLineupNote(
        workspaceId,
        draft,
        identity.current.id,
        identity.current.revision,
      );
      identity.current = { id: saved.id, revision: saved.revision };
      await onSaved();
    },
  });
  const close = async () => {
    if (await autosave.flush()) onClose();
  };
  return (
    <LineupDialog
      title={note ? "Edit daily note" : "Add a daily note"}
      onClose={() => void close()}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void close();
        }}
      >
        <fieldset className="lu-editor-fields">
          <div className="lu-form-grid">
            <label>
              Category
              <select
                value={value.category}
                onChange={(event) =>
                  setValue({
                    ...value,
                    category: event.target.value as LineupNoteInput["category"],
                  })
                }
              >
                {Object.entries(labels).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Visible to
              <select
                value={value.visibility}
                onChange={(event) =>
                  setValue({
                    ...value,
                    visibility: event.target.value as "team" | "managers",
                  })
                }
              >
                <option value="team">Team</option>
                <option value="managers">Managers only</option>
              </select>
            </label>
          </div>
          <label>
            Note
            <textarea
              required
              maxLength={2000}
              rows={5}
              placeholder="What should the team know?"
              value={value.content}
              onChange={(event) =>
                setValue({ ...value, content: event.target.value })
              }
            />
          </label>
          <div className="lu-form-grid">
            <label>
              Location
              <select
                value={value.location_id ?? ""}
                onChange={(event) =>
                  setValue({
                    ...value,
                    location_id: event.target.value || null,
                  })
                }
              >
                <option value="">All locations (full access required)</option>
                {model.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Service
              <select
                value={value.shift_type_id ?? ""}
                onChange={(event) =>
                  setValue({
                    ...value,
                    shift_type_id: event.target.value || null,
                  })
                }
              >
                <option value="">All day</option>
                {model.shift_types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Section
            <select
              value={value.section_id ?? ""}
              onChange={(event) =>
                setValue({ ...value, section_id: event.target.value || null })
              }
            >
              <option value="">All sections</option>
              {model.sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Expires at (your device time)
            <input
              type="datetime-local"
              value={
                value.expires_at
                  ? new Date(
                      new Date(value.expires_at).getTime() -
                        new Date(value.expires_at).getTimezoneOffset() * 60000,
                    )
                      .toISOString()
                      .slice(0, 16)
                  : ""
              }
              onChange={(event) =>
                setValue({
                  ...value,
                  expires_at: event.target.value
                    ? new Date(event.target.value).toISOString()
                    : null,
                })
              }
            />
          </label>
          <label className="lu-checkbox">
            <input
              type="checkbox"
              checked={value.pinned}
              onChange={(event) =>
                setValue({ ...value, pinned: event.target.checked })
              }
            />{" "}
            Pin as important
          </label>
          <p className="lu-field-help">
            This note applies to {date} only. Team notes appear after sharing;
            manager notes stay private.
          </p>
        </fieldset>
        <LineupSaveStatus state={autosave} onDiscard={onClose} />
        <footer className="lu-dialog-footer">
          <button
            type="button"
            className="nf-button secondary"
            onClick={() => void close()}
            disabled={autosave.saving}
          >
            Done
          </button>
          <button className="nf-button lu-primary" disabled={autosave.saving}>
            {autosave.saving ? "Saving…" : "Save note"}
          </button>
        </footer>
      </form>
    </LineupDialog>
  );
}
