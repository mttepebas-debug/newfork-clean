// PRESET-SAAT (KARARLAR S-183, variant A): a preset dropped on a day whose
// shift type keeps several times holds the cell with a dashed "Pick a time…"
// card and opens a small list beside it. The primary is first and highlighted;
// a click or Enter writes that time, ↑↓ move, the "Other time" box takes typed
// hours ("5-11p"), Esc or a press outside writes nothing.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import {
  parsePresetRange,
  presetDuration,
  presetShortRange,
  presetTimeText,
  type PresetHours,
  type PresetTimeOption,
} from "../lib/presetTimes";
import { useCloseOnEscape } from "../lib/useCloseOnEscape";
import "./preset-time-picker.css";

export interface PresetPickCell {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** The grid cell under a drop point, or a small box around it. */
export function presetPickCellAt(point: { readonly x: number; readonly y: number } | undefined): PresetPickCell {
  const hit = point ? document.elementFromPoint(point.x, point.y)?.closest('[role="gridcell"]') : null;
  if (hit) {
    const rect = hit.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }
  const at = point ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  return { left: at.x - 60, top: at.y - 24, width: 120, height: 48 };
}

export function PresetTimePicker({
  name,
  color,
  where,
  options,
  cell,
  onPick,
  onCancel,
}: {
  readonly name: string;
  readonly color: string;
  readonly where: string;
  readonly options: readonly PresetTimeOption[];
  readonly cell: PresetPickCell;
  readonly onPick: (hours: PresetHours) => void;
  readonly onCancel: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const firstOption = useRef<HTMLButtonElement>(null);
  const [active, setActive] = useState(0);
  const [text, setText] = useState("");
  const [error, setError] = useState(false);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const typed = text.trim() ? parsePresetRange(text) : null;
  useCloseOnEscape(onCancel);

  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const right = cell.left + cell.width + 6;
    const left = right + width <= window.innerWidth - 8 ? right : Math.max(8, cell.left - width - 6);
    const top = Math.max(8, Math.min(cell.top, window.innerHeight - height - 8));
    setPlace({ left, top });
  }, [cell]);

  useEffect(() => {
    firstOption.current?.focus({ preventScroll: true });
    const away = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) onCancel();
    };
    window.addEventListener("mousedown", away, true);
    return () => window.removeEventListener("mousedown", away, true);
  }, [onCancel]);

  const commit = () => {
    if (text.trim()) {
      if (typed) onPick(typed);
      else setError(true);
      return;
    }
    const picked = options[active];
    if (picked) onPick(picked);
  };

  const keys = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown" && !text) {
      event.preventDefault();
      setActive((value) => Math.min(options.length - 1, value + 1));
    } else if (event.key === "ArrowUp" && !text) {
      event.preventDefault();
      setActive((value) => Math.max(0, value - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }
  };

  const colorStyle = { "--preset-pick-color": color } as CSSProperties;
  return createPortal(
    <>
      <div
        className="preset-pick-ghost"
        aria-hidden="true"
        style={{ ...colorStyle, left: cell.left + 3, top: cell.top + 3, width: Math.max(0, cell.width - 6), height: Math.max(36, cell.height - 6) }}
      >
        <strong>{name}</strong>
        <span>Pick a time…</span>
      </div>
      <div
        ref={box}
        className="preset-pick-list"
        role="dialog"
        aria-label={`Time for ${name}`}
        style={{ ...colorStyle, left: place?.left ?? -9999, top: place?.top ?? -9999 }}
        onKeyDown={keys}
      >
        <div className="preset-pick-head">
          <strong>{name}</strong>
          <small>{where}</small>
        </div>
        <div role="listbox" aria-label={`${name} times`}>
          {options.map((option, index) => (
            <button
              key={`${option.start}-${option.end}`}
              ref={index === 0 ? firstOption : undefined}
              type="button"
              role="option"
              aria-selected={index === active}
              className="preset-pick-option"
              data-active={index === active && !text.trim()}
              onMouseEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              onClick={() => onPick(option)}
            >
              <span>{presetTimeText(option)}</span>
              {option.primary ? <span className="preset-pick-primary">Primary</span> : null}
              {option.note ? <span className="preset-pick-note">{option.note}</span> : null}
              <span className="preset-pick-length">{presetDuration(option)}</span>
            </button>
          ))}
        </div>
        <label className="preset-pick-other" data-error={error || undefined}>
          <span className="preset-pick-sr">Other time</span>
          <input
            value={text}
            placeholder="Other time, e.g. 5-11p"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error || undefined}
            onChange={(event) => {
              setText(event.target.value);
              setError(false);
            }}
          />
          <span className="preset-pick-read" aria-live="polite">
            {error ? "Try 5-11p" : typed ? presetShortRange(typed) : ""}
          </span>
        </label>
        <div className="preset-pick-hint" aria-hidden="true">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> <kbd>Enter</kbd> place
          </span>
          <span>
            <kbd>Esc</kbd> cancel
          </span>
        </div>
      </div>
    </>,
    document.body,
  );
}
