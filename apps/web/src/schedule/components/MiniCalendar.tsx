import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState, type KeyboardEvent } from "react";

import { todayIn } from "../../lib/today";

export interface CalendarMarker {
  readonly date: string;
  readonly endDate?: string | null;
  readonly kind: "important" | "closed";
  readonly title: string;
  readonly color?: string;
  readonly recurrence?: "none" | "annual";
}

interface MiniCalendarProps {
  readonly id?: string;
  readonly selectedDate: string | null;
  readonly weekStartDate: string;
  readonly weekStartDay: "monday" | "sunday";
  readonly markers?: readonly CalendarMarker[];
  readonly onDayPick: (date: string) => void;
  // Omit for a day-only calendar: no week-jump dots, no week highlight.
  readonly onWeekJump?: (date: string) => void;
  // The page's today, the location's (S-226); the device's calendar when omitted.
  readonly today?: string;
}

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
const monthShortNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
const mondayWeekdayLabels = ["M", "T", "W", "T", "F", "S", "S"] as const;
const sundayWeekdayLabels = ["S", "M", "T", "W", "T", "F", "S"] as const;
type PickerMode = "month-grid" | "month-pick" | "year-pick";

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function fromIso(iso: string): Date {
  return new Date(`${iso}T12:00:00.000Z`);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, 12),
  );
}

function startOfWeek(date: Date, weekStartDay: "monday" | "sunday"): Date {
  const offset =
    weekStartDay === "sunday"
      ? date.getUTCDay()
      : (date.getUTCDay() + 6) % 7;
  return addDays(date, -offset);
}

function sameMonth(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth()
  );
}

function buildCalendarRows(
  month: Date,
  weekStartDay: "monday" | "sunday",
): readonly (readonly Date[])[] {
  const first = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1, 12),
  );
  const gridStart = startOfWeek(first, weekStartDay);
  return Array.from({ length: 6 }, (_, row) =>
    Array.from({ length: 7 }, (__, column) =>
      addDays(gridStart, row * 7 + column),
    ),
  );
}

function markerCoversDate(marker: CalendarMarker, iso: string): boolean {
  const endDate = marker.endDate ?? marker.date;
  if (marker.recurrence === "annual") {
    const target = iso.slice(5, 10);
    const start = marker.date.slice(5, 10);
    const end = endDate.slice(5, 10);
    return start <= end
      ? start <= target && target <= end
      : target >= start || target <= end;
  }
  return marker.date <= iso && iso <= endDate;
}

function markerForDate(
  markers: readonly CalendarMarker[],
  iso: string,
): CalendarMarker | null {
  const matches = markers.filter((marker) => markerCoversDate(marker, iso));
  if (!matches.length) return null;
  return matches.reduce<CalendarMarker>(
    (combined, marker) => ({
      ...combined,
      kind:
        combined.kind === "closed" || marker.kind === "closed"
          ? "closed"
          : "important",
      title:
        combined.title === marker.title
          ? combined.title
          : `${combined.title}, ${marker.title}`,
      color: combined.color ?? marker.color,
    }),
    matches[0]!,
  );
}

export function MiniCalendar({
  id,
  selectedDate,
  weekStartDate,
  weekStartDay,
  markers = [],
  onDayPick,
  onWeekJump,
  today,
}: MiniCalendarProps) {
  const todayUtc = fromIso(today ?? todayIn());
  const initialIso = selectedDate ?? weekStartDate ?? toIso(todayUtc);
  const [viewMonth, setViewMonth] = useState(
    () =>
      new Date(
        Date.UTC(
          fromIso(initialIso).getUTCFullYear(),
          fromIso(initialIso).getUTCMonth(),
          1,
          12,
        ),
      ),
  );
  const [pickerMode, setPickerMode] = useState<PickerMode>("month-grid");
  const [focusedDate, setFocusedDate] = useState(() => fromIso(initialIso));
  const [yearPageStart, setYearPageStart] = useState(
    () => Math.floor(fromIso(initialIso).getUTCFullYear() / 12) * 12,
  );
  const rows = useMemo(
    () => buildCalendarRows(viewMonth, weekStartDay),
    [viewMonth, weekStartDay],
  );
  const markerMap = useMemo(
    () =>
      new Map(
        rows.flatMap((row) =>
          row
            .map((date) => {
              const iso = toIso(date);
              const marker = markerForDate(markers, iso);
              return marker ? ([[iso, marker]] as const) : [];
            })
            .flat(),
        ),
      ),
    [markers, rows],
  );
  const activeWeek = startOfWeek(fromIso(weekStartDate), weekStartDay);
  const weekdayLabels =
    weekStartDay === "sunday" ? sundayWeekdayLabels : mondayWeekdayLabels;

  const moveMonth = (offset: number): void => {
    setViewMonth((current) => addMonths(current, offset));
  };

  const jumpToday = (): void => {
    setViewMonth(
      new Date(
        Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), 1, 12),
      ),
    );
    setFocusedDate(todayUtc);
    setPickerMode("month-grid");
    onDayPick(toIso(todayUtc));
  };

  const pickMonth = (monthIndex: number): void => {
    setViewMonth(
      (current) => new Date(Date.UTC(current.getUTCFullYear(), monthIndex, 1, 12)),
    );
    setPickerMode("month-grid");
  };

  const pickYear = (year: number): void => {
    setViewMonth(
      (current) => new Date(Date.UTC(year, current.getUTCMonth(), 1, 12)),
    );
    setPickerMode("month-grid");
  };

  const openYearPicker = (): void => {
    setYearPageStart(Math.floor(viewMonth.getUTCFullYear() / 12) * 12);
    setPickerMode("year-pick");
  };

  const handleDayClick = (date: Date): void => {
    setFocusedDate(date);
    if (!sameMonth(date, viewMonth)) {
      setViewMonth(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12)));
    }
    onDayPick(toIso(date));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (pickerMode !== "month-grid") {
      if (event.key === "Escape") {
        event.preventDefault();
        setPickerMode("month-grid");
      }
      return;
    }

    let nextDate: Date | null = null;
    switch (event.key) {
      case "ArrowLeft":
        nextDate = addDays(focusedDate, -1);
        break;
      case "ArrowRight":
        nextDate = addDays(focusedDate, 1);
        break;
      case "ArrowUp":
        nextDate = addDays(focusedDate, -7);
        break;
      case "ArrowDown":
        nextDate = addDays(focusedDate, 7);
        break;
      case "PageUp":
        setViewMonth((current) => addMonths(current, -1));
        event.preventDefault();
        return;
      case "PageDown":
        setViewMonth((current) => addMonths(current, 1));
        event.preventDefault();
        return;
      case "Home": {
        const offset =
          weekStartDay === "sunday"
            ? focusedDate.getUTCDay()
            : (focusedDate.getUTCDay() + 6) % 7;
        nextDate = addDays(focusedDate, -offset);
        break;
      }
      case "End": {
        const offset =
          weekStartDay === "sunday"
            ? focusedDate.getUTCDay()
            : (focusedDate.getUTCDay() + 6) % 7;
        nextDate = addDays(focusedDate, 6 - offset);
        break;
      }
      case "Enter":
      case " ":
        event.preventDefault();
        handleDayClick(focusedDate);
        return;
      default:
        return;
    }

    if (!nextDate) return;
    event.preventDefault();
    setFocusedDate(nextDate);
    if (!sameMonth(nextDate, viewMonth)) {
      setViewMonth(
        new Date(Date.UTC(nextDate.getUTCFullYear(), nextDate.getUTCMonth(), 1, 12)),
      );
    }
  };

  return (
    <div
      className="mini-calendar"
      id={id}
      aria-label="Schedule mini-calendar"
      onKeyDown={handleKeyDown}
    >
      <div className="calendar-month">
        <button
          type="button"
          className="calendar-arrow"
          aria-label={
            pickerMode === "year-pick"
              ? "Previous years"
              : pickerMode === "month-pick"
                ? "Previous year"
                : "Previous month"
          }
          onClick={() => {
            if (pickerMode === "year-pick") setYearPageStart((year) => year - 12);
            else if (pickerMode === "month-pick") moveMonth(-12);
            else moveMonth(-1);
          }}
        >
          <ChevronLeft size={15} aria-hidden />
        </button>
        {pickerMode === "year-pick" ? (
          <strong>
            {yearPageStart} <span>{yearPageStart + 11}</span>
          </strong>
        ) : pickerMode === "month-pick" ? (
          <button
            type="button"
            className="calendar-title-button"
            aria-label="Pick year"
            onClick={openYearPicker}
          >
            {viewMonth.getUTCFullYear()}
          </button>
        ) : (
          <strong>
            <button
              type="button"
              className="calendar-title-button"
              aria-label="Pick month"
              onClick={() => setPickerMode("month-pick")}
            >
              {monthNames[viewMonth.getUTCMonth()]}
            </button>{" "}
            <button
              type="button"
              className="calendar-title-button muted"
              aria-label="Pick year"
              onClick={openYearPicker}
            >
              {viewMonth.getUTCFullYear()}
            </button>
          </strong>
        )}
        <button
          type="button"
          className="calendar-arrow"
          aria-label={
            pickerMode === "year-pick"
              ? "Next years"
              : pickerMode === "month-pick"
                ? "Next year"
                : "Next month"
          }
          onClick={() => {
            if (pickerMode === "year-pick") setYearPageStart((year) => year + 12);
            else if (pickerMode === "month-pick") moveMonth(12);
            else moveMonth(1);
          }}
        >
          <ChevronRight size={15} aria-hidden />
        </button>
      </div>
      {pickerMode === "month-grid" ? (
        <div
          className={`calendar-grid${onWeekJump ? "" : " days-only"}`}
          role="grid"
          aria-label={`${monthNames[viewMonth.getUTCMonth()]} ${viewMonth.getUTCFullYear()}`}
        >
          {onWeekJump ? <span aria-hidden="true" /> : null}
          {weekdayLabels.map((label, index) => (
            <span className="weekday" key={`${label}-${index}`}>
              {label}
            </span>
          ))}
          {rows.map((row) => {
            const rowStart = startOfWeek(row[0]!, weekStartDay);
            const rowActive =
              Boolean(onWeekJump) && toIso(rowStart) === toIso(activeWeek);
            return (
              <div className="calendar-row" role="row" key={toIso(rowStart)}>
                {onWeekJump ? (
                  <button
                    type="button"
                    className={`week-jump${rowActive ? " active" : ""}`}
                    aria-label={`Jump to week of ${monthNames[rowStart.getUTCMonth()]} ${rowStart.getUTCDate()}`}
                    aria-pressed={rowActive}
                    onClick={() => onWeekJump(toIso(rowStart))}
                  >
                    <span />
                  </button>
                ) : null}
                {row.map((date) => {
                  const iso = toIso(date);
                  const marker = markerMap.get(iso);
                  const outside = date.getUTCMonth() !== viewMonth.getUTCMonth();
                  const selected = selectedDate === iso;
                  const current = toIso(todayUtc) === iso;
                  const focused = toIso(focusedDate) === iso;
                  const inWeek =
                    date >= rowStart && date <= addDays(rowStart, 6) && rowActive;
                  return (
                    <button
                      type="button"
                      role="gridcell"
                      tabIndex={focused ? 0 : -1}
                      className={`calendar-day${outside ? " outside" : ""}${inWeek ? " in-week" : ""}${selected ? " selected" : ""}`}
                      key={iso}
                      aria-label={`${monthNames[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}${marker ? `, ${marker.title}` : ""}`}
                      aria-selected={selected}
                      aria-current={current ? "date" : undefined}
                      onFocus={() => setFocusedDate(date)}
                      onClick={() => handleDayClick(date)}
                    >
                      <span>{date.getUTCDate()}</span>
                      {current && !selected ? (
                        <i className="today-indicator" aria-hidden />
                      ) : null}
                      {marker ? (
                        <i
                          className={`date-marker ${marker.kind}`}
                          style={
                            marker.color
                              ? { backgroundColor: marker.color }
                              : undefined
                          }
                          aria-hidden
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : null}
      {pickerMode === "month-pick" ? (
        <div
          className="calendar-picker-grid"
          role="grid"
          aria-label={`Month picker for ${viewMonth.getUTCFullYear()}`}
        >
          {monthShortNames.map((label, index) => (
            <button
              key={label}
              type="button"
              role="gridcell"
              aria-selected={index === viewMonth.getUTCMonth()}
              className="calendar-picker-cell"
              onClick={() => pickMonth(index)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {pickerMode === "year-pick" ? (
        <div
          className="calendar-picker-grid"
          role="grid"
          aria-label={`Years ${yearPageStart} to ${yearPageStart + 11}`}
        >
          {Array.from({ length: 12 }, (_, index) => yearPageStart + index).map(
            (year) => (
              <button
                key={year}
                type="button"
                role="gridcell"
                aria-selected={year === viewMonth.getUTCFullYear()}
                className="calendar-picker-cell"
                onClick={() => pickYear(year)}
              >
                {year}
              </button>
            ),
          )}
        </div>
      ) : null}
      <button type="button" className="today-button" onClick={jumpToday}>
        Today
      </button>
    </div>
  );
}
