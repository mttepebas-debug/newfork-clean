import { ChevronLeft, ChevronRight } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";

import { Skeleton } from "../shell/LoadState";
import { mountWheel } from "./lineup-wheel-engine";
import { WHEEL, monthEdges, wheelCell, wheelDateText, wheelIndex, wheelIso } from "./lineup-wheel";
import "./lineup-wheel.css";

// The Lineup's day picker (KARARLAR Lineup, Mert 2026-10-17: E · Çark tarih): the date row (‹ date ›, and
// whatever sits beside it, the location) over the turning day wheel. One picker for the manager's phone
// Lineup (views/LineupPhone.tsx) and the employee's Lineup (employee-hub/EmployeeLineup.tsx).

/** What the date row asks of the wheel. */
interface WheelControl {
  step(delta: number): void;
  seekIso(iso: string): void;
}

/**
 * The date row and the wheel, two siblings in the caller's layout (the manager's top folds them one by one).
 * The wheel stops on a day → `onDate`; a new `date` from outside (a link) turns it there.
 */
export function LineupDayPicker({
  date,
  today,
  onDate,
  barRef,
  wheelRef,
  days = 7,
  waiting = false,
  barSlot,
  children,
}: {
  readonly date: string;
  readonly today: string;
  readonly onDate: (iso: string) => void;
  /** Days the wheel shows at once: 7 on a phone, 15 on the desktop Lineup. */
  readonly days?: number;
  /** The day waits (the desktop's Publish window is publishing): ‹ › and the date say so and do nothing; the wheel
   * is inert. */
  readonly waiting?: boolean;
  readonly barRef?: RefObject<HTMLDivElement | null>;
  readonly wheelRef?: RefObject<HTMLDivElement | null>;
  /** Where the date row goes when not over the wheel (the desktop's heading); null until it mounts. */
  readonly barSlot?: HTMLElement | null;
  /** Beside the date: the location. */
  readonly children?: ReactNode;
}) {
  const wheel = useRef<WheelControl | null>(null);
  const preview = useRef<((iso: string) => void) | null>(null);
  const ownBox = useRef<HTMLDivElement | null>(null);
  const bar = (
      <div className="lineup-toolbar" ref={barRef}>
        <div className="lineup-date" role="group" aria-label="Day">
          <button
            type="button"
            className="lineup-step"
            aria-label="Previous day"
            aria-disabled={waiting || undefined}
            onClick={() => !waiting && wheel.current?.step(-1)}
          >
            <ChevronLeft size={16} aria-hidden />
          </button>
          <WheelDate
            date={date}
            today={today}
            preview={preview}
            waiting={waiting}
            onToday={() => !waiting && wheel.current?.seekIso(today)}
          />
          <button
            type="button"
            className="lineup-step"
            aria-label="Next day"
            aria-disabled={waiting || undefined}
            onClick={() => !waiting && wheel.current?.step(1)}
          >
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
        {children}
      </div>
  );
  return (
    <>
      {barSlot === undefined ? bar : barSlot ? createPortal(bar, barSlot) : null}
      <DayWheel
        boxRef={wheelRef ?? ownBox}
        visible={days}
        waiting={waiting}
        date={date}
        today={today}
        engine={wheel}
        onCommit={onDate}
        onMiddle={(iso) => preview.current?.(iso)}
      />
    </>
  );
}

/** The date button over the wheel: the middle day as it spins, amber away from today; a tap brings today back. */
function WheelDate({
  date,
  today,
  preview,
  waiting,
  onToday,
}: {
  readonly date: string;
  readonly today: string;
  readonly preview: RefObject<((iso: string) => void) | null>;
  readonly waiting: boolean;
  readonly onToday: () => void;
}) {
  const [shown, setShown] = useState(date);
  useEffect(() => {
    preview.current = setShown;
    return () => {
      preview.current = null;
    };
  }, [preview]);
  useEffect(() => setShown(date), [date]);
  const other = shown !== today;
  return (
    <button
      type="button"
      className="lineup-date-label"
      data-other-day={other ? "true" : undefined}
      aria-disabled={waiting || undefined}
      title={other ? "Back to today" : undefined}
      onClick={onToday}
    >
      {wheelDateText(shown, today)}
    </button>
  );
}

/**
 * The day wheel: every day ±span around its anchor as a button, rendered once; the engine moves them. It stops
 * on a day → `onCommit`; a new date from outside (a link, the date button) turns it there.
 */
function DayWheel({
  boxRef,
  visible,
  waiting,
  date,
  today,
  engine,
  onCommit,
  onMiddle,
}: {
  readonly boxRef: RefObject<HTMLDivElement | null>;
  readonly visible: number;
  readonly waiting: boolean;
  readonly date: string;
  readonly today: string;
  readonly engine: RefObject<WheelControl | null>;
  readonly onCommit: (iso: string) => void;
  readonly onMiddle: (iso: string) => void;
}) {
  const span = WHEEL.span;
  // The wheel counts from today; a day near its end re-anchors it there.
  const [anchor, setAnchor] = useState(today);
  const far = Math.abs(wheelIndex(anchor, date)) > span - 30;
  useEffect(() => {
    if (far) setAnchor(date);
  }, [far, date]);
  const track = useRef<HTMLDivElement | null>(null);
  const seekRef = useRef<((iso: string) => void) | null>(null);
  const latest = useRef({ date, onCommit, onMiddle });
  latest.current = { date, onCommit, onMiddle };

  const cells = useMemo(
    () =>
      Array.from({ length: 2 * span + 1 }, (_, offset) => {
        const index = offset - span;
        const iso = wheelIso(anchor, index);
        const cell = wheelCell(iso);
        return (
          <button
            key={iso}
            type="button"
            className={`lineup-wheel-day${iso === today ? " is-today" : ""}${cell.first ? " is-first" : ""}`}
            data-i={index}
            tabIndex={-1}
            aria-label={cell.label}
            aria-pressed={false}
          >
            <span className="lineup-wheel-in">
              <span className="lineup-wheel-top">{cell.top}</span>
              <b>{cell.day}</b>
            </span>
          </button>
        );
      }),
    [anchor, today, span],
  );

  useLayoutEffect(() => {
    const box = boxRef.current;
    const strip = track.current;
    if (!box || !strip) return;
    const mounted = mountWheel(box, strip, {
      start: wheelIndex(anchor, latest.current.date),
      span,
      visible,
      edges: monthEdges(anchor, span),
      onStill: (index) => {
        const iso = wheelIso(anchor, index);
        if (iso !== latest.current.date) latest.current.onCommit(iso);
      },
      onMiddle: (index) => latest.current.onMiddle(wheelIso(anchor, index)),
    });
    const control: WheelControl = { step: mounted.step, seekIso: (iso) => mounted.seek(wheelIndex(anchor, iso)) };
    engine.current = control;
    seekRef.current = control.seekIso;
    return () => {
      mounted.destroy();
      if (engine.current === control) engine.current = null;
      seekRef.current = null;
    };
  }, [anchor, cells, span, visible, boxRef, engine]);

  // A date from outside: turn the wheel there (it stops on it, so nothing is committed twice).
  useEffect(() => {
    seekRef.current?.(date);
  }, [date]);

  return (
    <div
      className="lineup-wheel"
      role="group"
      aria-label="Day. Swipe or use the arrow keys."
      ref={boxRef}
      data-own-drag=""
      inert={waiting || undefined}
    >
      <div
        className="lineup-wheel-track"
        ref={track}
        style={{ "--lineup-wheel-days": 2 * span + 1, "--lineup-wheel-visible": visible } as CSSProperties}
      >
        {cells}
      </div>
    </div>
  );
}

/** A shift tab: its color dot, its name and how many people work it. */
export interface LineupShiftTab {
  readonly key: string;
  readonly name: string;
  readonly color: string | null;
  readonly count: number;
  /** Greyed out and not pressable (the employee's page: a shift she isn't on); `title` says why. */
  readonly disabled?: boolean;
  readonly title?: string;
}

/** The shift tabs under the wheel (one per shift; the chosen one underlined). */
export function LineupShiftTabs({
  shifts,
  chosen,
  onChoose,
}: {
  readonly shifts: readonly LineupShiftTab[];
  readonly chosen: string | null;
  readonly onChoose: (key: string) => void;
}) {
  return (
    <div className="catalog-toolbar lineup-shift-tabs">
      <div className="catalog-toolbar-status-row">
        <div className="catalog-status-tabs" role="group" aria-label="Shifts">
          {shifts.map((item) => (
            item.disabled ? (
              <button key={item.key} type="button" className="is-off" disabled title={item.title} aria-label={`${item.name}. ${item.title ?? ""}`.trim()}>
                <i style={{ background: item.color ?? "var(--theme-border-strong)" }} aria-hidden />
                {item.name}
              </button>
            ) : (
              <button
                key={item.key}
                type="button"
                className={item.key === chosen ? "active" : ""}
                aria-pressed={item.key === chosen}
                aria-label={`${item.name}, ${item.count ? `${item.count} ${item.count === 1 ? "person" : "people"}` : "no one"}`}
                onClick={() => onChoose(item.key)}
              >
                <i style={{ background: item.color ?? "var(--theme-border-strong)" }} aria-hidden />
                {item.name}
                {item.count ? <strong>{item.count}</strong> : null}
              </button>
            )
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The location beside the date: a skeleton while the day loads, nothing when there is no location. With `allLabel`
 * and more than one location, the list starts with All locations (Mert 2026-10-17 ~9:10 AM), its value "".
 */
export function LineupLocationSelect({
  loading,
  locations,
  value,
  allLabel,
  onChange,
}: {
  readonly loading: boolean;
  readonly locations: readonly { readonly id: string; readonly name: string }[];
  readonly value: string;
  readonly allLabel?: string;
  readonly onChange: (id: string) => void;
}) {
  if (loading) return <Skeleton width="auto" height={34} className="on-page lineup-location-select" />;
  if (!locations.length) return null;
  const all = allLabel && locations.length > 1 ? allLabel : null;
  return (
    <select
      className="toolbar-filter-select lineup-location-select"
      value={all ? value : value || locations[0]!.id}
      aria-label="Location"
      onChange={(event) => onChange(event.target.value)}
    >
      {all ? <option value="">{all}</option> : null}
      {locations.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </select>
  );
}
