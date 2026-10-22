import { useEffect, useRef, useState } from "react";

import type { LineupShift } from "../schedule/lineup";
import { lineupEditMessage, useLineupEdit, type LineupEdit } from "../schedule/lineup-data";
import { RequestError } from "../lib/request-error";
import { NOTE_FIELDS, type LineupEditing, type NoteKey } from "./LineupDesktopEdit";

/** How long typing rests before the notes save themselves, ms. */
export const NOTES_SAVE_MS = 800;
/** How long a save that didn't go through waits to try again, ms. */
export const NOTES_RETRY_MS = 3000;

type Notes = Record<NoteKey, string>;
const changedKeys = (values: Notes, saved: Notes): NoteKey[] =>
  NOTE_FIELDS.map(([key]) => key).filter((key) => values[key] !== saved[key]);

/**
 * The phone's notes on a draft (S-238, Mert 2026-10-21 ~6:40 PM): no Save or Cancel. What is typed saves itself
 * when typing rests or the box is left, only the notes that changed, and stays while another tab is shown (the
 * editor stays mounted, hidden) or the page goes (what waits is sent then). A save that doesn't go through keeps
 * what was typed and says so; a lost connection tries again by itself, a refusal (the lineup has gone out, the
 * shift has started) waits for the next change. Locked: the lineup can't change any more but has notes that
 * didn't save: they stay on screen, read only, with the refusal.
 */
export function PhoneNotesEditor({
  editing,
  shift,
  locked,
  hidden,
  onUnsaved,
}: {
  readonly editing: LineupEditing;
  readonly shift: LineupShift;
  readonly locked: boolean;
  readonly hidden: boolean;
  /** Whether some of what is typed isn't saved yet; false again once the editor goes. */
  readonly onUnsaved: (unsaved: boolean) => void;
}) {
  const edit = useLineupEdit(editing.workspaceId, editing.date);
  const [values, setValues] = useState<Notes>(() => ({ ...shift.publish.notes }));
  const [saved, setSaved] = useState<Notes>(() => ({ ...shift.publish.notes }));
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [refused, setRefused] = useState<string | null>(null);
  // What the timers and the last send read: always the latest, never a render's copy.
  const live = useRef({ values, saved, target: shift.publish.target, mutate: edit.mutateAsync });
  live.current = { ...live.current, values, target: shift.publish.target, mutate: edit.mutateAsync };
  const timer = useRef<number | undefined>(undefined);
  const busy = useRef(false);
  const again = useRef(false);
  const mounted = useRef(true);

  const flush = useRef(() => {
    window.clearTimeout(timer.current);
    if (busy.current) return void (again.current = true);
    const { values: now, saved: base, target, mutate } = live.current;
    const keys = changedKeys(now, base);
    if (!keys.length) return;
    const notes = Object.fromEntries(keys.map((key) => [key, now[key]])) as Partial<Notes>;
    busy.current = true;
    if (mounted.current) setState("saving");
    void mutate({ ...target, action: "set_notes", notes } as LineupEdit).then(
      () => {
        busy.current = false;
        const next = { ...live.current.saved, ...notes };
        live.current.saved = next;
        if (mounted.current) {
          setSaved(next);
          setRefused(null);
          setState("saved");
        }
        if (again.current || changedKeys(live.current.values, next).length) {
          again.current = false;
          flush.current();
        }
      },
      (error: unknown) => {
        busy.current = false;
        again.current = false;
        if (!mounted.current) return;
        setState("idle");
        const reason = error instanceof RequestError ? error.reason : undefined;
        const refusal = reason?.startsWith("lineup.") || reason?.startsWith("authz.");
        setRefused(refusal ? lineupEditMessage(error) : "Couldn't save. Trying again…");
        if (!refusal) timer.current = window.setTimeout(() => flush.current(), NOTES_RETRY_MS);
      },
    );
  });

  const unsaved = changedKeys(values, saved).length > 0;
  useEffect(() => onUnsaved(unsaved), [unsaved, onUnsaved]);
  // Taken back to draft with notes that didn't save: they go now.
  useEffect(() => {
    if (!locked) flush.current();
  }, [locked]);
  // Another tab shown: what waits goes now.
  useEffect(() => {
    if (hidden) flush.current();
  }, [hidden]);
  // The page goes (or the card folds): what waits is sent on its way.
  useEffect(() => {
    mounted.current = true;
    const send = flush.current;
    return () => {
      mounted.current = false;
      send();
      onUnsaved(false);
    };
  }, [onUnsaved]);

  return (
    <section className="lineup-notes lineup-edit-notes" aria-label="Edit notes" hidden={hidden}>
      {NOTE_FIELDS.map(([key, label, Icon, placeholder, max]) => (
        <label className={`lineup-note is-${key}`} key={key}>
          <h3>
            <Icon aria-hidden />
            {label}
          </h3>
          <textarea
            className="lineup-edit-ta"
            rows={key === "shift_notes" ? 3 : 2}
            placeholder={placeholder}
            maxLength={max}
            readOnly={locked}
            value={values[key]}
            onChange={(event) => {
              setValues({ ...values, [key]: event.target.value });
              setState("idle");
              window.clearTimeout(timer.current);
              timer.current = window.setTimeout(() => flush.current(), NOTES_SAVE_MS);
            }}
            onBlur={() => flush.current()}
          />
        </label>
      ))}
      <div className="lineup-edit-notes-acts">
        <span>Staff see the notes when you publish.</span>
        {refused ? (
          <span className="lineup-edit-msg lineup-notes-state" role="alert">
            {refused}
          </span>
        ) : (
          <span className="lineup-notes-state" role="status">
            {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : ""}
          </span>
        )}
      </div>
    </section>
  );
}
