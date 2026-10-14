// Item 1: while a name-cell "!" window is open, that person's unavailable
// cells are marked. A stylesheet keyed on the person's id does it, so no grid
// component has to re-render (and nothing is left behind when the grid does).
import { formatAvailabilityMarkDay } from "../../../src/schedule/lib/scheduleAvailabilityMark";

const STYLE_ID = "mi-spotlight-style";

function rules(id: string): string {
  const cell = `.schedule-cell[data-employee-id="${id}"]`;
  const unavailable = `${cell}[data-availability-kind="unavailable"]`;
  const name = `.schedule-employee-cell[data-schedule-employee-row="${id}"]`;
  return `
    /* A · Soft tint: a light orange wash, fading in. */
    html[data-v1="a"] ${unavailable},
    html[data-v1="b"] ${unavailable},
    html[data-v1="c"] ${unavailable} {
      background-color: #fff3e3;
      box-shadow: inset 0 0 0 1px #f3c58c;
      animation: mi-tint-in 0.18s ease-out;
    }
    /* B · Tint + hours: the day's unavailable hours as a bar and in words. */
    html[data-v1="b"] ${unavailable} .mi-unavailable-hours { display: flex; }
    html[data-v1="b"] ${unavailable} .mi-unavailable-bar { display: block; }
    /* C · Spotlight: the person's row stays bright, the rest steps back. */
    html[data-v1="c"] .schedule-cell:not([data-employee-id="${id}"]) > *:not(.schedule-cell-add-action),
    html[data-v1="c"] .schedule-employee-cell:not([data-schedule-employee-row="${id}"]) > * {
      opacity: 0.38;
      transition: opacity 0.18s ease-out;
    }
    html[data-v1="c"] ${name} { background-color: #fff8ef; }
    html[data-v1="c"] ${unavailable} { animation: mi-tint-in 0.18s ease-out, mi-pulse 0.9s ease-out 0.1s 1; }
    html[data-v1="c"] ${unavailable} .mi-unavailable-hours { display: flex; }
  `;
}

export function setSpotlight(employeeId: string | null): void {
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.append(style);
  }
  style.textContent = employeeId ? rules(CSS.escape(employeeId)) : "";
}

/** Variant C: a line in the window brings its cell into view and flashes it. */
export function flashDay(employeeId: string, line: string): void {
  const cells = [...document.querySelectorAll<HTMLElement>(
    `.schedule-cell[data-employee-id="${CSS.escape(employeeId)}"][data-availability-kind="unavailable"]`,
  )].filter((cell) => line.includes(formatAvailabilityMarkDay(cell.dataset.date ?? "")));
  cells[0]?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  for (const cell of cells) {
    cell.classList.remove("mi-flash");
    void cell.offsetWidth;
    cell.classList.add("mi-flash");
    window.setTimeout(() => cell.classList.remove("mi-flash"), 1400);
  }
}
