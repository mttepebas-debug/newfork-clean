// The 2026-10-09 time off rule, switchable from the Test page menu next to
// today's behaviour. Original: a time off cell is red but still opens the
// shift window; the server refuses an overlapping shift on save. New rule: a
// day fully covered by approved time off can't get a shift at all, so the
// cell does not open. A partly covered day still opens; the server refuses
// any shift that overlaps the time off by even a minute (both rules).
import { world } from "./mock/world";

export type TimeOffRule = "original" | "strict";
export const timeOffRuleNames: Record<TimeOffRule, string> = {
  original: "Original · today's app",
  strict: "New rule (Oct 9): cell locked",
};

const KEY = "newfork.scheduleTest.timeOffRule";
let rule: TimeOffRule = (() => {
  try {
    return window.localStorage.getItem(KEY) === "strict" ? "strict" : "original";
  } catch {
    return "original";
  }
})();

export function getTimeOffRule(): TimeOffRule {
  return rule;
}

export function setTimeOffRule(next: TimeOffRule): void {
  rule = next;
  try { window.localStorage.setItem(KEY, next); } catch { /* the choice lasts until reload */ }
  paint();
}

function fullDayTimeOff(employeeId: string, date: string) {
  return world.time_off.find((item) => item.employee_id === employeeId && item.status === "approved"
    && item.start_date <= date && date <= item.end_date && !item.from && !item.to);
}

function lockedCell(target: EventTarget | null): HTMLElement | null {
  if (rule !== "strict" || !(target instanceof Element)) return null;
  const cell = target.closest<HTMLElement>(".schedule-cell[data-availability-kind='time_off']");
  if (!cell?.dataset.employeeId || !cell.dataset.date || cell.querySelector(".schedule-shift-badge")) return null;
  return fullDayTimeOff(cell.dataset.employeeId, cell.dataset.date) ? cell : null;
}

function paint(): void {
  document.documentElement.dataset.stTimeOffRule = rule;
  document.querySelectorAll<HTMLElement>(".schedule-cell[data-st-locked]").forEach((cell) => {
    if (!lockedCell(cell)) cell.removeAttribute("data-st-locked");
  });
  if (rule !== "strict") return;
  document.querySelectorAll<HTMLElement>(".schedule-cell[data-availability-kind='time_off']").forEach((cell) => {
    if (lockedCell(cell)) cell.setAttribute("data-st-locked", "true");
  });
}

export function installTimeOffRule(notice: (text: string) => void): void {
  const style = document.createElement("style");
  style.textContent = `
    html[data-st-time-off-rule="strict"] .schedule-cell[data-st-locked] { cursor: not-allowed; }
    html[data-st-time-off-rule="strict"] .schedule-cell[data-st-locked]::before { content: "Time off · locked" !important; }
    html[data-st-time-off-rule="strict"] .schedule-cell[data-st-locked] [data-schedule-add-shift-control] { display: none !important; }
  `;
  document.head.append(style);
  const block = (event: Event) => {
    const cell = lockedCell(event.target);
    if (!cell) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.type !== "click") return;
    const employee = world.employees.find((item) => item.id === cell.dataset.employeeId)?.display_name ?? "This person";
    const day = new Date(`${cell.dataset.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    notice(`${employee} has approved time off on ${day}. Shorten the time off first to schedule a shift.`);
  };
  for (const type of ["pointerdown", "mousedown", "click", "dblclick", "contextmenu"]) {
    window.addEventListener(type, block, { capture: true });
  }
  let frame = 0;
  new MutationObserver(() => {
    if (frame) return;
    frame = window.requestAnimationFrame(() => { frame = 0; paint(); });
  }).observe(document.body, { childList: true, subtree: true });
  paint();
}
