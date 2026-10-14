// Fields the five window variants share. Every list here works from the
// keyboard: arrows move, letters jump, Enter picks, Escape closes the list
// (not the window).
import { ConfirmButton } from "@newfork/ui";
import { Check, ChevronDown, Minus, Plus, Trash2, X } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type { ShiftEditorBrain } from "./brain";
import type { ClockFormat } from "./store";
import { formatClock, formatSpan, spanMinutes, toMinutes } from "./time";

export interface Option {
  readonly value: string;
  readonly label: string;
  readonly hint?: string;
  readonly color?: string;
  readonly disabled?: boolean;
}

function useOutside(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
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

/** A select that never needs the mouse. */
export function Select({
  label,
  value,
  options,
  disabled = false,
  onChange,
  buttonRef,
  compact = false,
  placeholder = "Select",
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly Option[];
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
  readonly buttonRef?: RefObject<HTMLButtonElement | null>;
  readonly compact?: boolean;
  readonly placeholder?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const typed = useRef({ text: "", at: 0 });
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options.find((option) => option.value === value);
  const close = () => setOpen(false);
  useOutside(rootRef, open, close);
  useLayoutEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);
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
      typed.current = { text: now - typed.current.at < 700 ? typed.current.text + event.key.toLowerCase() : event.key.toLowerCase(), at: now };
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
      className="stx-select"
      data-compact={compact || undefined}
      data-st-own-escape={open ? "true" : undefined}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        ref={buttonRef}
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
        {selected?.color ? <span className="stx-swatch" style={{ background: selected.color }} aria-hidden /> : null}
        <span className="stx-select-text">{selected?.label ?? placeholder}</span>
        <ChevronDown size={14} aria-hidden data-open={open || undefined} />
      </button>
      {open && !disabled ? (
        <div role="listbox" id={listId} aria-label={label} className="stx-list">
          {options.map((option, index) => (
            <div
              key={option.value}
              role="option"
              data-index={index}
              aria-selected={option.value === value}
              aria-disabled={option.disabled || undefined}
              data-active={index === active || undefined}
              onPointerEnter={() => setActive(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(index)}
            >
              {option.color ? <span className="stx-swatch" style={{ background: option.color }} aria-hidden /> : null}
              <span>{option.label}</span>
              {option.hint ? <small>{option.hint}</small> : null}
              {option.value === value ? <Check size={13} aria-hidden /> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function LabelsSelect({ brain, labels }: { readonly brain: ShiftEditorBrain; readonly labels: ReadonlyArray<{ id: string; name: string; color: string }> }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selectedIds = brain.value.label_ids ?? [];
  useOutside(rootRef, open, () => setOpen(false));
  const toggle = (id: string) => {
    const next = selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id];
    const ordered = labels.filter((label) => next.includes(label.id));
    brain.update({ label_ids: ordered.map((label) => label.id), label_names: ordered.map((label) => label.name) });
  };
  const chosen = labels.filter((label) => selectedIds.includes(label.id));
  return (
    <div ref={rootRef} className="stx-select" data-st-own-escape={open ? "true" : undefined} onPointerDown={(event) => event.stopPropagation()}>
      <button
        type="button"
        role="combobox"
        aria-label="Labels"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) setOpen(true);
            else setActive((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + labels.length) % labels.length);
          } else if ((event.key === "Enter" || event.key === " ") && open) {
            event.preventDefault();
            toggle(labels[active]!.id);
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <span className="stx-select-text">
          {chosen.length ? (
            chosen.map((label) => (
              <span key={label.id} className="stx-label-pill" style={{ "--label": label.color } as CSSProperties}>{label.name}</span>
            ))
          ) : (
            <span className="stx-placeholder">No labels</span>
          )}
        </span>
        <ChevronDown size={14} aria-hidden data-open={open || undefined} />
      </button>
      {open ? (
        <div role="listbox" aria-label="Labels" aria-multiselectable="true" className="stx-list">
          {labels.map((label, index) => (
            <div
              key={label.id}
              role="option"
              aria-selected={selectedIds.includes(label.id)}
              data-active={index === active || undefined}
              onPointerEnter={() => setActive(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => toggle(label.id)}
            >
              <span className="stx-check" data-on={selectedIds.includes(label.id) || undefined} aria-hidden>
                {selectedIds.includes(label.id) ? <Check size={11} /> : null}
              </span>
              <span className="stx-swatch" style={{ background: label.color }} aria-hidden />
              <span>{label.name}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TypeChips({
  brain,
  shiftTypes,
  keys = false,
  layout = "row",
}: {
  readonly brain: ShiftEditorBrain;
  readonly shiftTypes: ReadonlyArray<{ id: string; name: string; color: string; default_start_time: string | null; default_end_time: string | null }>;
  readonly keys?: boolean;
  readonly layout?: "row" | "grid";
}) {
  if (!shiftTypes.length) return <small className="stx-muted">No shift types</small>;
  return (
    <div className="stx-types" data-layout={layout} role="group" aria-label="Shift type">
      {shiftTypes.map((type, index) => (
        <button
          key={type.id}
          type="button"
          aria-pressed={brain.value.shift_type_id === type.id}
          style={{ "--type": type.color } as CSSProperties}
          onClick={() => brain.selectShiftType(type.id)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
            event.preventDefault();
            const buttons = [...(event.currentTarget.parentElement?.querySelectorAll("button") ?? [])];
            const next = buttons[(index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length];
            next?.focus();
          }}
        >
          {keys ? <kbd>{index + 1}</kbd> : <span className="stx-dot" aria-hidden />}
          {type.name}
        </button>
      ))}
    </div>
  );
}

export const breakOptions = [0, 15, 30, 45, 60] as const;
export const breakLabel = (minutes: number) => (minutes === 0 ? "None" : `${minutes}m`);

export function BreakPicker({ brain, compact = false }: { readonly brain: ShiftEditorBrain; readonly compact?: boolean }) {
  return (
    <div className="stx-segments" data-compact={compact || undefined} role="group" aria-label="Unpaid break">
      {breakOptions.map((minutes, index) => (
        <button
          key={minutes}
          type="button"
          aria-pressed={brain.value.unpaid_break_minutes === minutes}
          onClick={() => brain.update({ unpaid_break_minutes: minutes })}
          onKeyDown={(event) => {
            if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
            event.preventDefault();
            const next = breakOptions[(index + (event.key === "ArrowRight" ? 1 : -1) + breakOptions.length) % breakOptions.length]!;
            brain.update({ unpaid_break_minutes: next });
            const buttons = event.currentTarget.parentElement?.querySelectorAll("button");
            (buttons?.[breakOptions.indexOf(next)] as HTMLButtonElement | undefined)?.focus();
          }}
        >
          {breakLabel(minutes)}
        </button>
      ))}
    </div>
  );
}

export function CountStepper({ brain }: { readonly brain: ShiftEditorBrain }) {
  return (
    <span className="stx-stepper">
      <button type="button" aria-label="Decrease count" onClick={() => brain.updateCount(brain.count - 1)} disabled={brain.count <= 1}>
        <Minus size={13} aria-hidden />
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label="Shift count"
        value={brain.count}
        onChange={(event) => {
          const next = Number.parseInt(event.target.value, 10);
          if (!Number.isNaN(next)) brain.updateCount(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") { event.preventDefault(); brain.updateCount(brain.count + 1); }
          if (event.key === "ArrowDown") { event.preventDefault(); brain.updateCount(brain.count - 1); }
        }}
      />
      <button type="button" aria-label="Increase count" onClick={() => brain.updateCount(brain.count + 1)}>
        <Plus size={13} aria-hidden />
      </button>
    </span>
  );
}

export function NoteField({ brain, rows = 2, autoFocus = false }: { readonly brain: ShiftEditorBrain; readonly rows?: number; readonly autoFocus?: boolean }) {
  const id = useId();
  const left = Math.max(0, brain.noteMaxLength - brain.value.note.length);
  return (
    <div className="stx-note">
      <div className="stx-note-head">
        <label htmlFor={id}>Note</label>
        <small>{brain.count > 1 ? "Notes go on one shift at a time." : `${left} ${left === 1 ? "character" : "characters"} left`}</small>
      </div>
      <textarea
        id={id}
        rows={rows}
        autoFocus={autoFocus}
        maxLength={brain.noteMaxLength}
        placeholder="Add a note for this shift"
        disabled={brain.count > 1}
        value={brain.count > 1 ? "" : brain.value.note}
        onChange={(event) => brain.update({ note: brain.clampNote(event.target.value) })}
        onKeyDown={(event) => {
          // Ctrl/Cmd+Enter saves from the note too.
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            void brain.attemptSubmit();
          }
        }}
      />
    </div>
  );
}

export function ShowTimesToggle({ brain }: { readonly brain: ShiftEditorBrain }) {
  return (
    <label className="stx-checkbox">
      <input
        type="checkbox"
        checked={!brain.value.hide_time_on_badge}
        onChange={(event) => brain.update({ hide_time_on_badge: !event.target.checked })}
      />
      Show times on badge
    </label>
  );
}

export function Actions({ brain, onClose, compact = false, hint }: { readonly brain: ShiftEditorBrain; readonly onClose: () => void; readonly compact?: boolean; readonly hint?: ReactNode }) {
  return (
    <div className="stx-actions" data-compact={compact || undefined}>
      {brain.kind === "edit" ? (
        <ConfirmButton
          unstyled
          className="stx-danger"
          aria-label="Delete shift"
          confirmLabel={<><Trash2 size={14} aria-hidden />Confirm delete</>}
          confirmName="Confirm delete"
          onConfirm={brain.deleteShift}
        >
          <Trash2 size={14} aria-hidden />
          {compact ? null : "Delete"}
        </ConfirmButton>
      ) : null}
      {hint ? <span className="stx-actions-hint">{hint}</span> : <span className="stx-actions-space" />}
      <button type="button" className="stx-secondary" onClick={onClose}>Cancel</button>
      <button ref={brain.submitRef} type="submit" className="stx-primary" disabled={brain.saveDisabled}>
        {brain.checkingAvailability ? "Checking availability…" : brain.saveButtonLabel}
      </button>
    </div>
  );
}

export function CloseButton({ onClose }: { readonly onClose: () => void }) {
  return (
    <button type="button" className="stx-close" onClick={onClose} aria-label="Close editor">
      <X size={15} aria-hidden />
    </button>
  );
}

export function initials(name: string | null | undefined): string {
  if (!name) return "";
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("");
}

export function formatDay(iso: string, style: "short" | "long" = "short"): string {
  const date = new Date(`${iso}T12:00:00`);
  return date.toLocaleDateString("en-US", style === "short"
    ? { weekday: "short", month: "short", day: "numeric" }
    : { weekday: "long", month: "long", day: "numeric" });
}

/** "8h · 7h 30m paid", or nothing while the times are incomplete. */
export function durationText(brain: ShiftEditorBrain): string {
  const start = toMinutes(brain.value.start_time);
  const end = toMinutes(brain.value.end_time);
  if (start === null || end === null || start === end) return "";
  const span = spanMinutes(start, end);
  const paid = Math.max(0, span - (brain.value.unpaid_break_minutes ?? 0));
  return `${formatSpan(span)}${brain.value.unpaid_break_minutes ? ` · ${formatSpan(paid)} paid` : ""}${end < start ? " · ends next day" : ""}`;
}

export function timeText(brain: ShiftEditorBrain, format: ClockFormat): string {
  const start = toMinutes(brain.value.start_time);
  const end = toMinutes(brain.value.end_time);
  if (start === null || end === null) return "No time";
  return `${formatClock(start, format)} – ${formatClock(end, format)}`;
}

/** The badge (edit) or the cell (add) the window belongs to, on screen. */
export function useAnchorRect(brain: ShiftEditorBrain, fallback: { x?: number; y?: number }): DOMRect {
  const read = () => {
    const element = brain.shiftId
      ? document.querySelector(`[data-shift-badge="true"][data-shift-id="${brain.shiftId}"]:not([data-ghost="true"])`)
      : document.querySelector('.schedule-cell[data-shift-editor-active-cell="true"]');
    if (element) return element.getBoundingClientRect();
    const x = fallback.x ?? window.innerWidth / 2;
    const y = fallback.y ?? window.innerHeight / 3;
    return new DOMRect(x, y, 1, 1);
  };
  const [rect, setRect] = useState<DOMRect>(read);
  useLayoutEffect(() => {
    setRect(read());
    const frame = window.requestAnimationFrame(() => setRect(read()));
    const onResize = () => setRect(read());
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brain.shiftId]);
  return rect;
}

/** Beside the anchor: right when it fits, else left; never off screen. */
export function placeBeside(rect: DOMRect, width: number, height: number, gap = 12) {
  const pad = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let side: "right" | "left" = "right";
  let left = rect.right + gap;
  if (left + width > vw - pad) {
    side = "left";
    left = rect.left - gap - width;
  }
  if (left < pad) {
    left = Math.max(pad, Math.min(vw - width - pad, rect.left));
  }
  const top = Math.max(pad, Math.min(vh - height - pad, rect.top + rect.height / 2 - 60));
  const arrowTop = Math.max(14, Math.min(height - 24, rect.top + rect.height / 2 - top));
  return { left, top, side, arrowTop };
}

/** Drag by the header, as main's window allows. */
export function useDragOffset() {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ id: number; x: number; y: number; ox: number; oy: number } | null>(null);
  return {
    offset,
    handlers: {
      onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
        if (event.button > 0) return;
        if (event.target instanceof Element && event.target.closest("button, input, select, textarea, [role='combobox']")) return;
        event.preventDefault();
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      },
      onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
        const current = drag.current;
        if (!current || current.id !== event.pointerId) return;
        setOffset({ x: current.ox + event.clientX - current.x, y: current.oy + event.clientY - current.y });
      },
      onPointerUp: (event: React.PointerEvent<HTMLElement>) => {
        if (drag.current?.id === event.pointerId) drag.current = null;
      },
    },
  };
}

export function StaleNotice({ onReload }: { readonly onReload: () => void }) {
  return (
    <div className="stx-stale" role="alert">
      <strong>Shift changed</strong>
      <p>This shift was changed by someone else. Reload to see the current version before editing.</p>
      <button type="button" className="stx-primary" onClick={onReload}>Close & reload</button>
    </div>
  );
}
