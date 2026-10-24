import type { EmployeeHubReadModel } from "@newfork/shared";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useNavigate } from "react-router";
import { formatTime } from "../schedule/lib/scheduleDateTime";
import { shiftMinutes, type HomeDay } from "./home-model";
import { shiftDate } from "./dashboard-model";

const base = "/app/employee-hub";

/**
 * Next 7 days. A tap opens that day in Schedule; dragging across the days, or
 * pressing and holding one, shows a preview of it above the strip.
 */
export function HomeWeekStrip({ model, week, today }: { model: EmployeeHubReadModel; week: HomeDay[]; today: string }) {
  const navigate = useNavigate();
  const strip = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; mode: "scrub" | "peek" | null; timer: number } | null>(null);
  const quietUntil = useRef(0);
  const [preview, setPreview] = useState<{ index: number; left: number } | null>(null);
  const format = model.settings.time_format;

  const show = (index: number) => {
    const el = strip.current;
    const day = el?.children[index] as HTMLElement | undefined;
    if (!el || !day) return;
    setPreview((current) => {
      if (current?.index === index) return current;
      navigator.vibrate?.(5);
      const tip = 250;
      const left = Math.min(Math.max(0, day.offsetLeft + day.offsetWidth / 2 - tip / 2), Math.max(0, el.offsetWidth - tip));
      return { index, left };
    });
  };
  const dayAt = (clientX: number) => {
    const days = Array.from(strip.current?.querySelectorAll<HTMLElement>(".dl-wk-d") ?? []);
    let best = 0;
    let distance = Infinity;
    days.forEach((day, index) => {
      const rect = day.getBoundingClientRect();
      const d = Math.abs(clientX - (rect.left + rect.width / 2));
      if (d < distance) {
        distance = d;
        best = index;
      }
    });
    return best;
  };
  const stop = () => {
    const g = gesture.current;
    if (!g) return;
    window.clearTimeout(g.timer);
    if (g.mode) quietUntil.current = performance.now() + 250;
    gesture.current = null;
    setPreview(null);
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const index = dayAt(event.clientX);
    const id = event.pointerId;
    const timer = window.setTimeout(() => {
      const g = gesture.current;
      if (g && !g.mode) {
        g.mode = "peek";
        strip.current?.setPointerCapture?.(id);
        show(index);
      }
    }, 360);
    gesture.current = { id, x: event.clientX, y: event.clientY, mode: null, timer };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    if (!g.mode) {
      if (Math.abs(dx) > 7 && Math.abs(dx) > Math.abs(dy)) {
        g.mode = "scrub";
        window.clearTimeout(g.timer);
        strip.current?.setPointerCapture?.(g.id);
      } else if (Math.abs(dy) > 7) {
        window.clearTimeout(g.timer);
        gesture.current = null;
        return;
      } else return;
    }
    show(dayAt(event.clientX));
  };
  // The strip lets the page pan up and down (touch-action: pan-y). Safari took a held or sideways slide's
  // slightest vertical part as a scroll, moved the page and cancelled the gesture (Mert 2026-10-24). Once the
  // strip owns the touch (held, or moving more sideways than up or down), its moves never scroll.
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const hold = (event: TouchEvent) => {
      const g = gesture.current;
      const touch = event.touches[0];
      if (!g || !touch || !event.cancelable) return;
      const dx = Math.abs(touch.clientX - g.x);
      const dy = Math.abs(touch.clientY - g.y);
      if (g.mode || dx >= dy) event.preventDefault();
    };
    el.addEventListener("touchmove", hold, { passive: false });
    return () => el.removeEventListener("touchmove", hold);
  }, []);
  const day = preview ? week[preview.index] : null;
  return (
    <div
      className={`dl-wk${preview ? " is-scrubbing" : ""}`}
      data-own-drag=""
      role="group"
      aria-label="Next 7 days. Choose a day to open it in Schedule."
      ref={strip}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onContextMenu={(event) => event.preventDefault()}
    >
      {week.map((item, index) => (
        <button
          type="button"
          key={item.date}
          className={`dl-wk-d${item.date === today ? " is-today" : ""}${item.shifts.length ? " has" : ""}${item.timeOff ? " is-to" : ""}${preview?.index === index ? " is-scrub" : ""}`}
          aria-label={`${shiftDate(item.date, true)}: ${
            item.shifts.length
              ? item.shifts.map((shift) => `${formatTime(shift.start_time, format, "long")} to ${formatTime(shift.end_time, format, "long")}`).join(", ")
              : item.timeOff
                ? "time off, approved"
                : item.posted
                  ? "day off"
                  : "schedule not posted yet"
          }`}
          onClick={() => {
            if (performance.now() < quietUntil.current) return;
            navigator.vibrate?.(6);
            void navigate(`${base}/schedule?date=${item.date}&view=day`);
          }}
        >
          <span className="dl-wk-n">{item.weekday}</span>
          <span className="dl-wk-num">{item.day}</span>
          {/* No hours here: a line per shift, earliest on top, in its type's colour and as long as it runs (a
              10-hour shift fills the box); a day off says Off; a day not posted yet a dashed line (Mert 2026-10-24). */}
          <span className="dl-wk-lines" aria-hidden>
            {item.shifts.length ? (
              item.shifts.map((shift) => (
                <i
                  key={shift.id}
                  className="dl-wk-line"
                  style={
                    {
                      "--w": Math.min(1, Math.max(0.2, (shiftMinutes(shift) ?? 240) / 600)).toFixed(3),
                      ...(shift.shift_type_color ? { "--c": shift.shift_type_color } : {}),
                    } as CSSProperties
                  }
                />
              ))
            ) : item.timeOff || item.posted ? (
              <span className="dl-wk-s">Off</span>
            ) : (
              <i className="dl-wk-line is-unposted" />
            )}
          </span>
        </button>
      ))}
      <div className="dl-wk-tip" aria-hidden style={{ "--tx": `${preview?.left ?? 0}px` } as CSSProperties}>
        {day ? (
          <>
            {/* The day, then each shift's hours and place, one line each; a long name ends in "…" (Mert 2026-10-24). */}
            <b className="dl-wk-tip-d">{day.date === today ? "Today" : shiftDate(day.date, true)}</b>
            {day.shifts.length ? (
              day.shifts.map((shift) => (
                <span className="dl-wk-tip-s" key={shift.id}>
                  <span className="dl-wk-tip-t">
                    {formatTime(shift.start_time, format, "long")} – {formatTime(shift.end_time, format, "long")}
                  </span>
                  <span className="dl-wk-tip-w">
                    {shift.location_name} · {shift.job_name}
                  </span>
                </span>
              ))
            ) : (
              <span className="dl-wk-tip-w">
                {day.timeOff
                  ? "Time off · Approved"
                  : !day.posted
                    ? "Schedule not posted yet"
                    : day.open
                      ? `Day off · ${day.open} open shift${day.open > 1 ? "s" : ""} you can pick up`
                      : "Day off"}
              </span>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
