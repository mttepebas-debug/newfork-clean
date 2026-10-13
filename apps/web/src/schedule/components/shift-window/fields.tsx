// The shift window's lists and stepper. Every list works from the keyboard:
// arrows move, letters jump, Enter picks, Escape closes the list (not the
// window). The window has no scroll area, so a list is never cut by it; a
// list opens upward when the room below is too small and is never taller than
// the room it has.
import type { ScheduleReadModel } from "@newfork/shared/schedule";
import { Check, ChevronDown, Minus, Plus } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";

import { OPEN_FIELD_ATTRIBUTE, type ShiftEditor } from "./useShiftEditor";

export interface FieldOption {
  readonly value: string;
  readonly label: string;
  readonly hint?: string;
  readonly disabled?: boolean;
}

const LIST_MARGIN = 12;
const LIST_MIN_HEIGHT = 96;

function useCloseOnOutsidePointer(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return undefined;
    const handle = (event: PointerEvent) => {
      if (ref.current && event.target instanceof Node && ref.current.contains(event.target)) return;
      close();
    };
    document.addEventListener("pointerdown", handle, true);
    return () => document.removeEventListener("pointerdown", handle, true);
  }, [open, ref, close]);
}

export interface ListPlacement {
  readonly up: boolean;
  readonly maxHeight: number;
}

/** Below the box, or above when the list does not fit below and there is more room above. */
export function placeList(box: { readonly top: number; readonly bottom: number }, listHeight: number, screenHeight: number): ListPlacement {
  const below = screenHeight - box.bottom - LIST_MARGIN;
  const above = box.top - LIST_MARGIN;
  const up = listHeight > below && above > below;
  return { up, maxHeight: Math.max(LIST_MIN_HEIGHT, Math.min(listHeight, up ? above : below)) };
}

function useListPlacement(rootRef: RefObject<HTMLElement | null>, open: boolean): ListPlacement | null {
  const [place, setPlace] = useState<ListPlacement | null>(null);
  useLayoutEffect(() => {
    if (!open) {
      setPlace(null);
      return undefined;
    }
    const measure = () => {
      const root = rootRef.current;
      const list = root?.querySelector<HTMLElement>("[role='listbox']");
      if (!root || !list) return;
      setPlace(placeList(root.getBoundingClientRect(), list.scrollHeight + 2, window.innerHeight));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, rootRef]);
  return place;
}

/** Keeps the active option in view by scrolling the list only, never the page. */
function keepActiveInView(root: HTMLElement | null, active: number) {
  const list = root?.querySelector<HTMLElement>("[role='listbox']");
  const item = list?.querySelector<HTMLElement>(`[data-index="${active}"]`);
  if (!list || !item) return;
  if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop - 4;
  else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) {
    list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight + 4;
  }
}

function listStyle(place: ListPlacement | null): CSSProperties {
  return place ? { maxHeight: place.maxHeight } : { visibility: "hidden" };
}

export function FieldSelect({
  label,
  value,
  options,
  disabled = false,
  compact = false,
  placeholder = "Select",
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly FieldOption[];
  readonly disabled?: boolean;
  readonly compact?: boolean;
  readonly placeholder?: string;
  readonly onChange: (value: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const typed = useRef({ text: "", at: 0 });
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options.find((option) => option.value === value);
  const close = () => setOpen(false);
  useCloseOnOutsidePointer(rootRef, open, close);
  const place = useListPlacement(rootRef, open);
  useLayoutEffect(() => {
    if (open) keepActiveInView(rootRef.current, active);
  }, [open, active, place]);
  const openList = () => {
    setActive(selectedIndex);
    setOpen(true);
  };
  const pick = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
  };
  const move = (delta: number) => {
    let next = active;
    for (let step = 0; step < options.length; step += 1) {
      next = (next + delta + options.length) % options.length;
      if (!options[next]?.disabled) break;
    }
    setActive(next);
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) openList();
      else move(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Enter" || (event.key === " " && open)) {
      if (!open) return;
      event.preventDefault();
      pick(active);
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key === "Tab" && open) {
      pick(active);
      return;
    }
    if (event.key.length === 1 && /\S/.test(event.key) && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const now = Date.now();
      typed.current = {
        text: now - typed.current.at < 700 ? typed.current.text + event.key.toLowerCase() : event.key.toLowerCase(),
        at: now,
      };
      const index = options.findIndex((option) => !option.disabled && option.label.toLowerCase().startsWith(typed.current.text));
      if (index < 0) return;
      event.preventDefault();
      event.stopPropagation();
      if (open) setActive(index);
      else onChange(options[index]!.value);
    }
  };
  return (
    <div
      ref={rootRef}
      className="shift-field-select"
      data-compact={compact || undefined}
      {...{ [OPEN_FIELD_ATTRIBUTE]: open ? "true" : undefined }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span className="shift-field-select-text">{selected?.label ?? placeholder}</span>
        <ChevronDown size={14} aria-hidden data-open={open || undefined} />
      </button>
      {open && !disabled ? (
        <div role="listbox" id={listId} aria-label={label} className="shift-field-list" data-up={place?.up || undefined} style={listStyle(place)}>
          {options.map((option, index) => (
            <div
              key={option.value}
              role="option"
              data-index={index}
              aria-selected={option.value === value}
              aria-disabled={option.disabled || undefined}
              // The name is the person or job; how busy they are is its description.
              aria-label={option.hint ? option.label : undefined}
              aria-describedby={option.hint ? `${listId}-hint-${index}` : undefined}
              data-active={index === active || undefined}
              onPointerEnter={() => setActive(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(index)}
            >
              <span>{option.label}</span>
              {option.hint ? <small id={`${listId}-hint-${index}`}>{option.hint}</small> : null}
              {option.value === value ? <Check size={13} aria-hidden /> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function LabelsSelect({
  editor,
  labels,
}: {
  readonly editor: ShiftEditor;
  readonly labels: NonNullable<ScheduleReadModel["shift_labels"]>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selectedIds = editor.value.label_ids ?? [];
  const close = () => setOpen(false);
  useCloseOnOutsidePointer(rootRef, open, close);
  const place = useListPlacement(rootRef, open);
  useLayoutEffect(() => {
    if (open) keepActiveInView(rootRef.current, active);
  }, [open, active, place]);
  const toggle = (id: string) => {
    const next = selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id];
    const ordered = labels.filter((label) => next.includes(label.id));
    editor.update({ label_ids: ordered.map((label) => label.id), label_names: ordered.map((label) => label.name) });
  };
  const chosen = labels.filter((label) => selectedIds.includes(label.id));
  return (
    <div
      ref={rootRef}
      className="shift-field-select"
      {...{ [OPEN_FIELD_ATTRIBUTE]: open ? "true" : undefined }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        role="combobox"
        aria-label="Labels"
        aria-expanded={open}
        aria-haspopup="listbox"
        title={chosen.length ? chosen.map((label) => label.name).join(", ") : "No labels"}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) setOpen(true);
            else setActive((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + labels.length) % labels.length);
          } else if ((event.key === "Enter" || event.key === " ") && open) {
            // From the keyboard the list stays open, so several labels go on in one go.
            event.preventDefault();
            toggle(labels[active]!.id);
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <span className="shift-field-select-text">
          {chosen.length ? (
            chosen.map((label) => (
              <span key={label.id} className="shift-field-label-pill" style={{ "--label": label.color } as CSSProperties}>
                {label.name}
              </span>
            ))
          ) : (
            <span className="shift-field-placeholder">No labels</span>
          )}
        </span>
        <ChevronDown size={14} aria-hidden data-open={open || undefined} />
      </button>
      {open ? (
        <div role="listbox" aria-label="Labels" aria-multiselectable="true" className="shift-field-list" data-up={place?.up || undefined} style={listStyle(place)}>
          {labels.map((label, index) => {
            const on = selectedIds.includes(label.id);
            return (
              <div
                key={label.id}
                role="option"
                data-index={index}
                aria-selected={on}
                data-active={index === active || undefined}
                onPointerEnter={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  toggle(label.id);
                  setOpen(false);
                }}
              >
                <span className="shift-field-check" data-on={on || undefined} aria-hidden>
                  {on ? <Check size={11} /> : null}
                </span>
                <span className="shift-field-swatch" style={{ background: label.color }} aria-hidden />
                <span>{label.name}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function CountStepper({ editor }: { readonly editor: ShiftEditor }) {
  return (
    <span className="shift-field-stepper">
      <button type="button" aria-label="Decrease count" onClick={() => editor.updateCount(editor.count - 1)} disabled={editor.count <= 1}>
        <Minus size={13} aria-hidden />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label="Shift count"
        value={editor.count}
        onChange={(event) => {
          const next = Number.parseInt(event.target.value, 10);
          if (!Number.isNaN(next)) editor.updateCount(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") {
            event.preventDefault();
            editor.updateCount(editor.count + 1);
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            editor.updateCount(editor.count - 1);
          }
        }}
      />
      <button type="button" aria-label="Increase count" onClick={() => editor.updateCount(editor.count + 1)}>
        <Plus size={13} aria-hidden />
      </button>
    </span>
  );
}

export function initials(name: string | null | undefined): string {
  if (!name) return "";
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("");
}

/** "Mon, Aug 17" for an ISO date, read at noon so no time zone moves the day. */
export function formatDay(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
