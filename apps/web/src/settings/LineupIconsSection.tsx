import { useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import { Plus, X } from "lucide-react";
import { lineupArtByKey, maxJobLineupIcons, suggestLineupArt } from "@newfork/shared";
import { useListPhoneWidth } from "../lib/usePhoneWidth";
import { LineupArt } from "../lineup-art/LineupArt";
import { LineupArtGrid, nextLineupArtSelection } from "../lineup-art/LineupArtGrid";
import "./lineup-icons.css";

// AVATAR-IKON: a job's Lineup icons in the job drawer, under Details (spec 4.2; Mert, 19 Oct:
// desktop B, the whole grid in the drawer; phone A, the chosen tiles and a sheet to choose in).
// The list is one of the job's details: the drawer's Save sends it, nothing here saves.

/** Two icon lists are the same when they hold the same keys in the same order. */
export function sameLineupIcons(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

const help = "Each person on this job gets one of these on the Lineup, unless they picked their own avatar.";
const empty = "No icons. People here get a team member icon on the Lineup.";
const full = `A job can have up to ${maxJobLineupIcons} icons.`;

function iconName(key: string): string {
  return lineupArtByKey.get(key)?.name ?? key;
}

export function LineupIconsSection({
  value,
  onChange,
  jobName,
  isNew,
  disabled = false,
}: {
  readonly value: readonly string[];
  readonly onChange: (next: string[]) => void;
  readonly jobName: string;
  readonly isNew: boolean;
  readonly disabled?: boolean;
}) {
  const phone = useListPhoneWidth();
  const headingId = useId();
  const [touched, setTouched] = useState(false);
  const [sheet, setSheet] = useState<string[] | null>(null);
  const choose = useRef<HTMLButtonElement>(null);
  const suggested = useMemo(() => suggestLineupArt(jobName), [jobName]);
  // A new job takes the suggestion for its name until the person touches the icons; then it stops,
  // whatever the name becomes (Mert, 3-A).
  const following = isNew && !touched;
  useEffect(() => {
    if (following && !sameLineupIcons(value, suggested)) onChange(suggested);
  }, [following, suggested, value, onChange]);

  function edit(next: string[]) {
    setTouched(true);
    onChange(next);
  }

  const name = jobName.trim();
  const note = !value.length
    ? empty
    : value.length >= maxJobLineupIcons
      ? full
      : following && name
        ? `Suggested for "${name}". Change them any time.`
        : null;

  return (
    <section className="lineup-icons-section" aria-labelledby={headingId}>
      <div className="lineup-icons-head">
        <h3 id={headingId}>Lineup icons</h3>
        <span className="lineup-icons-count">{value.length} selected</span>
      </div>
      <p className="lineup-icons-help">{help}</p>
      {phone ? (
        <>
          {value.length > 0 && (
            <ul className="lineup-icons-tiles">
              {value.map((key) => (
                <li key={key} className="lineup-icons-tile" aria-label={iconName(key)}>
                  <LineupArt artKey={key} name={iconName(key)} size={48} className="lineup-icons-tile-art" />
                  <button
                    type="button"
                    className="lineup-icons-tile-remove"
                    aria-label={`Remove ${iconName(key)}`}
                    disabled={disabled}
                    onClick={() => edit(value.filter((item) => item !== key))}
                  >
                    <X size={12} strokeWidth={3} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            ref={choose}
            type="button"
            className="job-secondary-button lineup-icons-choose"
            disabled={disabled}
            onClick={() => setSheet([...value])}
          >
            <Plus size={16} aria-hidden />
            Choose icons
          </button>
          {note && <p className="lineup-icons-note">{note}</p>}
          {sheet && (
            <LineupIconsSheet
              draft={sheet}
              suggested={suggested}
              returnFocus={choose}
              onToggle={(key) => setSheet((current) => current && nextLineupArtSelection("multi", current, key))}
              onCancel={() => setSheet(null)}
              onDone={() => {
                if (!sameLineupIcons(sheet, value)) edit(sheet);
                setSheet(null);
              }}
            />
          )}
        </>
      ) : (
        <>
          {note && <p className="lineup-icons-note">{note}</p>}
          <LineupArtGrid
            mode="multi"
            selected={value}
            suggested={suggested}
            max={maxJobLineupIcons}
            disabled={disabled}
            onToggle={(key) => edit(nextLineupArtSelection("multi", value, key))}
          />
        </>
      )}
    </section>
  );
}

/**
 * The phone's picker: a sheet from the bottom, as the app's other phone sheets (availability/DaySheet).
 * A modal <dialog>: the drawer behind is inert, Esc and a tap above the sheet cancel, focus comes back
 * to "Choose icons". It sits in the drawer's DOM, so the drawer's keys leave it alone.
 */
function LineupIconsSheet({
  draft,
  suggested,
  returnFocus,
  onToggle,
  onCancel,
  onDone,
}: {
  readonly draft: readonly string[];
  readonly suggested: readonly string[];
  readonly returnFocus: RefObject<HTMLButtonElement | null>;
  readonly onToggle: (key: string) => void;
  readonly onCancel: () => void;
  readonly onDone: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const back = returnFocus;
    dialog?.showModal?.();
    dialog?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    return () => {
      dialog?.close?.();
      // A tap does not focus a button in every browser: focus goes back to "Choose icons" itself.
      back.current?.focus({ preventScroll: true });
    };
    // Once per sheet: showModal again would replay the slide (and the focus).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <dialog
      ref={ref}
      className="lineup-icons-sheet"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="lineup-icons-sheet-inner">
        <div className="lineup-icons-sheet-head">
          <h2 id={titleId} tabIndex={-1}>
            Lineup icons
          </h2>
          <button type="button" className="lineup-icons-sheet-close" aria-label="Close" onClick={onCancel}>
            <X size={18} aria-hidden />
          </button>
        </div>
        {draft.length >= maxJobLineupIcons && <p className="lineup-icons-note">{full}</p>}
        <LineupArtGrid mode="multi" selected={draft} suggested={suggested} max={maxJobLineupIcons} onToggle={onToggle} />
        <footer className="lineup-icons-sheet-foot">
          <span className="lineup-icons-count">{draft.length} selected</span>
          <button type="button" className="job-secondary-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="job-primary-button" onClick={onDone}>
            Done
          </button>
        </footer>
      </div>
    </dialog>
  );
}
