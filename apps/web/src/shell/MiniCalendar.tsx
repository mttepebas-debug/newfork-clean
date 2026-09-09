import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

export interface CalendarMarker {
  readonly date: string;
  readonly kind: "important" | "closed";
  readonly title: string;
  readonly color?: string;
}

interface MiniCalendarProps {
  readonly selectedDate: string | null;
  readonly weekStartDate: string;
  readonly weekStartDay?: "monday" | "sunday";
  readonly markers?: readonly CalendarMarker[];
  readonly onDayPick: (date: string) => void;
  readonly onWeekJump: (date: string) => void;
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
const mondayWeekdayLabels = ["M", "T", "W", "T", "F", "S", "S"] as const;
const sundayWeekdayLabels = ["S", "M", "T", "W", "T", "F", "S"] as const;

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

function startOfWeek(date: Date, weekStartDay: "monday" | "sunday"): Date {
  const offset =
    weekStartDay === "sunday"
      ? date.getUTCDay()
      : (date.getUTCDay() + 6) % 7;
  return addDays(date, -offset);
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

export function MiniCalendar({
  selectedDate,
  weekStartDate,
  weekStartDay = "monday",
  markers = [],
  onDayPick,
  onWeekJump,
}: MiniCalendarProps) {
  const today = new Date();
  const todayUtc = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 12),
  );
  const [viewMonth, setViewMonth] = useState(
    () =>
      new Date(
        Date.UTC(
          fromIso(selectedDate ?? toIso(todayUtc)).getUTCFullYear(),
          fromIso(selectedDate ?? toIso(todayUtc)).getUTCMonth(),
          1,
          12,
        ),
      ),
  );
  const rows = buildCalendarRows(viewMonth, weekStartDay);
  const markerMap = new Map(markers.map((marker) => [marker.date, marker]));
  const activeWeek = startOfWeek(fromIso(weekStartDate), weekStartDay);
  const weekdayLabels =
    weekStartDay === "sunday" ? sundayWeekdayLabels : mondayWeekdayLabels;

  const moveMonth = (offset: number): void => {
    setViewMonth(
      (current) =>
        new Date(
          Date.UTC(
            current.getUTCFullYear(),
            current.getUTCMonth() + offset,
            1,
            12,
          ),
        ),
    );
  };

  const jumpToday = (): void => {
    setViewMonth(
      new Date(
        Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), 1, 12),
      ),
    );
    onDayPick(toIso(todayUtc));
  };

  return (
    <div
      className="mini-calendar"
      id="sidebar-calendar-panel"
      aria-label="Schedule mini-calendar"
    >
      <div className="calendar-month">
        <button
          type="button"
          className="calendar-arrow"
          aria-label="Previous month"
          onClick={() => moveMonth(-1)}
        >
          <ChevronLeft size={15} aria-hidden />
        </button>
        <strong>
          {monthNames[viewMonth.getUTCMonth()]}{" "}
          <span>{viewMonth.getUTCFullYear()}</span>
        </strong>
        <button
          type="button"
          className="calendar-arrow"
          aria-label="Next month"
          onClick={() => moveMonth(1)}
        >
          <ChevronRight size={15} aria-hidden />
        </button>
      </div>
      <div
        className="calendar-grid"
        role="grid"
        aria-label={`${monthNames[viewMonth.getUTCMonth()]} ${viewMonth.getUTCFullYear()}`}
      >
        <span aria-hidden="true" />
        {weekdayLabels.map((label, index) => (
          <span className="weekday" key={`${label}-${index}`}>
            {label}
          </span>
        ))}
        {rows.map((row) => {
          const rowStart = startOfWeek(row[0]!, weekStartDay);
          const rowActive = toIso(rowStart) === toIso(activeWeek);
          return (
            <div className="calendar-row" role="row" key={toIso(rowStart)}>
              <button
                type="button"
                className={`week-jump${rowActive ? " active" : ""}`}
                aria-label={`Jump to week of ${monthNames[rowStart.getUTCMonth()]} ${rowStart.getUTCDate()}`}
                aria-pressed={rowActive}
                onClick={() => onWeekJump(toIso(rowStart))}
              >
                <span />
              </button>
              {row.map((date) => {
                const iso = toIso(date);
                const marker = markerMap.get(iso);
                const outside = date.getUTCMonth() !== viewMonth.getUTCMonth();
                const selected = selectedDate === iso;
                const current = toIso(todayUtc) === iso;
                const inWeek =
                  date >= rowStart && date <= addDays(rowStart, 6) && rowActive;
                return (
                  <button
                    type="button"
                    role="gridcell"
                    className={`calendar-day${outside ? " outside" : ""}${inWeek ? " in-week" : ""}${selected ? " selected" : ""}`}
                    key={iso}
                    aria-label={`${monthNames[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}${marker ? `, ${marker.title}` : ""}`}
                    aria-selected={selected}
                    aria-current={current ? "date" : undefined}
                    onClick={() => onDayPick(iso)}
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
      <button type="button" className="today-button" onClick={jumpToday}>
        Today
      </button>
    </div>
  );
}
