// Windows, menus and notices every direction uses. The markup is shared and
// carries plain class names (pv-*); each direction's stylesheet, scoped under
// its own root class, gives them a look of their own.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, Copy, MapPin, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import type { Schedule } from "../engine/useSchedule";
import "./overlays.css";
import { BREAKS, monthGrid, useEditorForm } from "../engine/useEditorForm";
import { addDays, dayNumberOf, formatHours, formatRange, initialsOf, monthOf, shiftMinutes, weekdayOf } from "../engine/model";

const layer = { "data-proto-layer": true } as const;

/** Keeps a floating panel on screen near (x, y). */
function useFloating(x: number, y: number, gap = 8) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties>({ left: x + gap, top: y, visibility: "hidden" });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = x + gap;
    let top = y;
    if (left + r.width > window.innerWidth - 12) left = Math.max(12, x - r.width - gap);
    if (top + r.height > window.innerHeight - 12) top = Math.max(12, window.innerHeight - r.height - 12);
    setPos({ left, top });
  }, [x, y, gap]);
  return { ref, style: pos };
}

// ------------------------------------------------------------ shift window

export function ShiftWindow({ s, rootClass }: { s: Schedule; rootClass: string }) {
  const f = useEditorForm(s);
  const editor = s.editor!;
  const week = s.week!;
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const floating = useFloating(editor.anchor.x, editor.anchor.y - 40, 14);
  const startRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    startRef.current?.focus();
    startRef.current?.select();
  }, []);
  const location = week.locations.find((l) => l.id === editor.target.locationId);
  const dragHeader = (e: React.PointerEvent) => {
    if ((e.target as Element).closest("button")) return;
    const sx = e.clientX - offset.x;
    const sy = e.clientY - offset.y;
    const move = (ev: PointerEvent) => setOffset({ x: ev.clientX - sx, y: ev.clientY - sy });
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return createPortal(
    <div className={rootClass}>
      <div
        {...layer}
        className="pv-window"
        role="dialog"
        aria-label={f.title}
        ref={floating.ref}
        style={{ ...floating.style, transform: `translate(${offset.x}px, ${offset.y}px)` }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            s.setEditor(null);
          }
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            f.save();
          }
        }}
      >
        <header className="pv-window-head" onPointerDown={dragHeader}>
          <div>
            <div className="pv-kicker">{location?.name} · {weekdayOf(editor.target.date)} {monthOf(editor.target.date)} {dayNumberOf(editor.target.date)}</div>
            <h2>{f.title}</h2>
          </div>
          <button type="button" className="pv-icon" aria-label="Close" onClick={() => s.setEditor(null)}>
            <X size={16} />
          </button>
        </header>
        <div className="pv-window-body">
          <div className="pv-field">
            <span className="pv-label">Type</span>
            <div className="pv-segment">
              <button type="button" aria-pressed={!f.fields.typeId} onClick={() => f.setType(null)}>None</button>
              {week.shiftTypes.map((t) => (
                <button key={t.id} type="button" aria-pressed={f.fields.typeId === t.id} onClick={() => f.setType(t.id)}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>
          <div className="pv-field">
            <span className="pv-label">Time</span>
            <div className="pv-times">
              <input ref={startRef} aria-label="Start time" value={f.fields.startText} onChange={(e) => f.setStartText(e.target.value)} />
              <span aria-hidden>→</span>
              <input
                aria-label="End time"
                value={f.fields.endText}
                onChange={(e) => f.setEndText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    f.save();
                  }
                }}
              />
            </div>
            <div className="pv-hint">
              {f.timeError ?? `${formatHours(f.paid)} paid${f.overnight ? " · ends next day" : ""}`}
            </div>
          </div>
          <div className="pv-field">
            <span className="pv-label">Break</span>
            <div className="pv-segment">
              {BREAKS.map((b) => (
                <button key={b} type="button" aria-pressed={f.fields.breakMinutes === b} onClick={() => f.setBreak(b)}>
                  {b ? `${b}m` : "None"}
                </button>
              ))}
            </div>
          </div>
          <label className="pv-field">
            <span className="pv-label">Job</span>
            <select value={f.fields.jobId} onChange={(e) => f.setJob(e.target.value)}>
              {f.jobsForPerson.map((j) => (
                <option key={j.id} value={j.id}>{j.name}</option>
              ))}
            </select>
          </label>
          {f.showWho ? (
            <label className="pv-field">
              <span className="pv-label">Who</span>
              <select value={f.fields.who ?? ""} disabled={f.fields.count > 1} onChange={(e) => f.setWho(e.target.value || null)}>
                <option value="">{f.existing?.employeeId ? "Make open shift" : "Open"}</option>
                {f.people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {f.fields.count > 1 ? <span className="pv-hint">Several open shifts stay unassigned.</span> : null}
            </label>
          ) : null}
          {f.showCount ? (
            <div className="pv-field">
              <span className="pv-label">Count</span>
              <div className="pv-stepper">
                <button type="button" aria-label="Fewer" onClick={() => f.setCount(f.fields.count - 1)}>−</button>
                <output>{f.fields.count}</output>
                <button type="button" aria-label="More" onClick={() => f.setCount(f.fields.count + 1)}>+</button>
              </div>
            </div>
          ) : null}
          <label className="pv-field">
            <span className="pv-label">Note</span>
            <textarea
              value={f.fields.note}
              disabled={f.fields.count > 1}
              placeholder={f.fields.count > 1 ? "Notes go on one shift at a time." : "Visible to the employee"}
              onChange={(e) => f.setNote(e.target.value)}
              rows={2}
            />
            {f.noteLeft <= 80 ? <span className="pv-hint">{f.noteLeft} characters left</span> : null}
          </label>
          {f.check && f.check.status !== "allowed" ? (
            <div className="pv-check" data-status={f.check.status}>
              {f.check.messages[0]}
              {f.check.messages.length > 1 ? ` +${f.check.messages.length - 1} more` : ""}
            </div>
          ) : null}
        </div>
        <footer className="pv-window-foot">
          {f.existing ? (
            <button type="button" className="pv-danger" onClick={f.remove}>
              {f.confirmDelete ? "Confirm delete" : "Delete"}
            </button>
          ) : <span />}
          <div className="pv-foot-right">
            <button type="button" className="pv-ghost" onClick={() => s.setEditor(null)}>Cancel</button>
            <button type="button" className="pv-primary" disabled={!f.canSave && f.existing !== undefined ? !f.canSave : !f.canSave} onClick={f.save}>
              {f.saveLabel}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------ context menu

export function ContextMenu({ s, rootClass }: { s: Schedule; rootClass: string }) {
  const menu = s.menu!;
  const floating = useFloating(menu.x, menu.y, 2);
  useEffect(() => {
    const close = () => s.setMenu(null);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [s]);
  const act = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    fn();
    s.setMenu(null);
  };
  let items: ReactNode;
  if (menu.kind === "card") {
    const shift = s.shiftById(menu.shiftId);
    if (!shift) return null;
    items = (
      <>
        {!shift.removed ? (
          <button type="button" onMouseDown={act(() => s.openEditor({ mode: "edit", shiftId: shift.id, target: { employeeId: shift.employeeId, locationId: shift.locationId, date: shift.date }, anchor: { x: menu.x, y: menu.y } }))}>
            <Pencil size={14} /> Edit shift <kbd>↵</kbd>
          </button>
        ) : null}
        <button type="button" onMouseDown={act(() => s.copyShift(shift))}>
          <Copy size={14} /> Copy shift <kbd>⌃C</kbd>
        </button>
        <hr />
        {shift.removed ? (
          <button type="button" onMouseDown={act(() => s.restoreShift(shift.id))}>
            <RotateCcw size={14} /> Restore shift
          </button>
        ) : shift.origin === "live" ? (
          <button type="button" data-danger onMouseDown={act(() => s.removeShifts([shift.id]))}>
            <Trash2 size={14} /> Unpublish shift
          </button>
        ) : (
          <button type="button" data-danger onMouseDown={act(() => s.removeShifts([shift.id]))}>
            <Trash2 size={14} /> Delete shift <kbd>Del</kbd>
          </button>
        )}
      </>
    );
  } else {
    items = (
      <button type="button" disabled={!s.clipboard} onMouseDown={act(() => s.clipboard && s.pasteInto(menu.target))}>
        <Copy size={14} /> Paste shift
      </button>
    );
  }
  return createPortal(
    <div className={rootClass}>
      <div {...layer} className="pv-menu" role="menu" aria-label={menu.kind === "card" ? "Shift actions" : "Cell actions"} ref={floating.ref} style={floating.style}>
        {items}
      </div>
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------ person drawer

export function PersonDrawer({ s, rootClass }: { s: Schedule; rootClass: string }) {
  const week = s.week!;
  const person = week.employees.find((e) => e.id === s.drawer);
  if (!person) return null;
  const own = s.shifts.filter((x) => x.employeeId === person.id && !x.removed).sort((a, b) => (a.date + (a.start ?? "")).localeCompare(b.date + (b.start ?? "")));
  const minutes = own.reduce((sum, x) => sum + shiftMinutes(x), 0);
  return createPortal(
    <div className={rootClass}>
      <aside {...layer} className="pv-drawer" aria-label={`${person.name} profile`}>
        <header>
          <span className="pv-avatar" data-hue={person.id.charCodeAt(0) % 6}>{initialsOf(person.name)}</span>
          <div>
            <h2>{person.name}</h2>
            <p>{person.jobIds.map((id) => s.jobOf(id)?.name).filter(Boolean).join(" · ")}</p>
          </div>
          <button type="button" className="pv-icon" aria-label="Close" onClick={() => s.setDrawer(null)}>
            <X size={16} />
          </button>
        </header>
        <dl>
          <div><dt>This week</dt><dd>{formatHours(minutes)} · {own.length} shifts</dd></div>
          <div><dt>Works at</dt><dd>{person.locationIds.map((id) => week.locations.find((l) => l.id === id)?.name).filter(Boolean).join(", ")}</dd></div>
          {person.code ? <div><dt>Code</dt><dd>{person.code}</dd></div> : null}
        </dl>
        <ol className="pv-drawer-shifts">
          {own.map((x) => (
            <li key={x.id}>
              <span>{weekdayOf(x.date)} {dayNumberOf(x.date)}</span>
              <strong>{s.titleOf(x)}</strong>
              <em>{formatRange(x, week.timeFormat, true)}</em>
              <small><MapPin size={11} /> {week.locations.find((l) => l.id === x.locationId)?.shortName}</small>
            </li>
          ))}
          {!own.length ? <li className="pv-muted">No shifts this week.</li> : null}
        </ol>
      </aside>
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------ dialogs

function Dialog({ rootClass, title, children, actions, onEscape, onEnter }: { rootClass: string; title: string; children?: ReactNode; actions: ReactNode; onEscape: () => void; onEnter?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("[data-autofocus]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onEscape();
      }
      if (e.key === "Enter" && onEnter && !(e.target as Element).closest("button")) {
        e.preventDefault();
        onEnter();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onEscape, onEnter]);
  return createPortal(
    <div className={rootClass}>
      <div {...layer} className="pv-scrim" data-proto-modal>
        <div className="pv-dialog" role="alertdialog" aria-modal="true" aria-label={title} ref={ref}>
          <h2>{title}</h2>
          {children}
          <div className="pv-dialog-actions">{actions}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function Dialogs({ s, rootClass }: { s: Schedule; rootClass: string }) {
  return (
    <>
      {s.deleteAsk ? (
        <Dialog
          rootClass={rootClass}
          title="Delete selected shifts?"
          onEscape={() => s.setDeleteAsk(null)}
          onEnter={() => s.removeShifts(s.deleteAsk!)}
          actions={
            <>
              <button type="button" className="pv-ghost" onClick={() => s.setDeleteAsk(null)}>Cancel</button>
              <button type="button" className="pv-danger-solid" data-autofocus onClick={() => s.removeShifts(s.deleteAsk!)}>
                Delete {s.deleteAsk.length} {s.deleteAsk.length === 1 ? "shift" : "shifts"}
              </button>
            </>
          }
        >
          <p>Live shifts are taken off on the next publish and can be restored until then.</p>
        </Dialog>
      ) : null}
      {s.discardAsk ? (
        <Dialog
          rootClass={rootClass}
          title="Discard unsaved changes?"
          onEscape={() => s.setDiscardAsk(false)}
          actions={
            <>
              <button type="button" className="pv-ghost" data-autofocus onClick={() => s.setDiscardAsk(false)}>Keep editing</button>
              <button type="button" className="pv-danger-solid" onClick={() => s.leaveEdit()}>Discard</button>
            </>
          }
        >
          <p>This closes the edit session and returns to the live weekly schedule. Your changes in this edit are lost.</p>
        </Dialog>
      ) : null}
      {s.sheet ? (
        <Dialog
          rootClass={rootClass}
          title={s.sheet.title}
          onEscape={() => s.setSheet(null)}
          actions={
            s.sheet.kind === "drop" ? (
              <>
                <button type="button" className="pv-ghost" onClick={() => s.setSheet(null)}>Cancel</button>
                <button type="button" className="pv-primary" data-autofocus onClick={s.sheet.apply}>Place shift</button>
              </>
            ) : (
              <button type="button" className="pv-primary" data-autofocus onClick={() => s.setSheet(null)}>OK</button>
            )
          }
        >
          {s.sheet.kind === "paste" ? <p className="pv-muted">{s.sheet.context}</p> : null}
          <ul className="pv-reasons">
            {s.sheet.messages.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Dialog>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------ toasts

export function Toasts({ s, rootClass }: { s: Schedule; rootClass: string }) {
  return createPortal(
    <div className={rootClass}>
      <div {...layer} className="pv-toasts" role="status" aria-live="polite">
        {s.toasts.map((t) => (
          <div key={t.id} className="pv-toast" data-tone={t.tone}>
            <span className="pv-toast-mark">{t.tone === "error" ? "!" : <Check size={13} />}</span>
            <div>
              <strong>{t.title}</strong>
              {t.body ? <p>{t.body}</p> : null}
            </div>
            <button type="button" className="pv-icon" aria-label="Dismiss" onClick={() => s.dismissToast(t.id)}>
              <X size={13} />
            </button>
          </div>
        ))}
        {s.pasteNotice ? <div className="pv-toast" data-tone="info"><strong>{s.pasteNotice}</strong></div> : null}
      </div>
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------ top bar panels

export function CalendarPanel({ s }: { s: Schedule }) {
  const [anchor, setAnchor] = useState(s.date.slice(0, 8) + "01");
  const weeks = monthGrid(anchor);
  const shift = (n: number) => {
    const [y = 2000, m = 1] = anchor.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setAnchor(d.toISOString().slice(0, 10));
  };
  const weekStart = s.week?.weekStart ?? s.date;
  return (
    <div {...layer} className="pv-panel pv-calendar" data-proto-topmenu="calendar">
      <div className="pv-calendar-head">
        <button type="button" className="pv-icon" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft size={15} /></button>
        <strong>{new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${anchor}T12:00:00Z`))}</strong>
        <button type="button" className="pv-icon" aria-label="Next month" onClick={() => shift(1)}><ChevronRight size={15} /></button>
      </div>
      <div className="pv-calendar-grid">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i} className="pv-calendar-dow">{d}</span>)}
        {weeks.flat().map((d) => (
          <button
            key={d}
            type="button"
            data-outside={d.slice(0, 7) !== anchor.slice(0, 7) || undefined}
            data-today={d === s.today || undefined}
            data-inweek={s.url.view === "week" && d >= weekStart && d <= addDays(weekStart, 6) ? true : undefined}
            data-picked={s.url.view === "day" && d === s.date ? true : undefined}
            onClick={() => s.pickDate(d)}
          >
            {dayNumberOf(d)}
          </button>
        ))}
      </div>
      <button type="button" className="pv-ghost pv-wide" onClick={() => s.pickDate(s.today)}>Today</button>
    </div>
  );
}

type FilterKey = "locations" | "shiftTypes" | "jobs" | "employees";

export function FilterPanel({ s, filter }: { s: Schedule; filter: FilterKey }) {
  const week = s.week!;
  const selected = s.url[filter];
  const all = !selected.length;
  const item = (id: string, label: string, indent = false) => (
    <button key={id} type="button" role="checkbox" aria-checked={all ? false : selected.includes(id)} data-indent={indent || undefined} onClick={() => s.toggleFilter(filter, id)}>
      <span className="pv-check-box" aria-hidden>{!all && selected.includes(id) ? <Check size={11} /> : null}</span>
      {label}
    </button>
  );
  let body: ReactNode;
  if (filter === "jobs") {
    const byDept = new Map<string, typeof week.jobs>();
    for (const j of week.jobs) byDept.set(j.departmentName ?? "No department", [...(byDept.get(j.departmentName ?? "No department") ?? []), j]);
    body = [...byDept.entries()].sort(([a], [b]) => (a === "No department" ? 1 : b === "No department" ? -1 : a.localeCompare(b))).map(([dept, jobs]) => {
      const ids = jobs.map((j) => j.id);
      const on = ids.filter((id) => selected.includes(id)).length;
      return (
        <div key={dept} className="pv-filter-group">
          <button type="button" role="checkbox" aria-checked={!all && on === ids.length ? true : !all && on ? "mixed" : false} onClick={() => s.toggleFilterGroup("jobs", ids)}>
            <span className="pv-check-box" aria-hidden>{!all && on === ids.length ? <Check size={11} /> : !all && on ? "–" : null}</span>
            <strong>{dept}</strong>
          </button>
          {jobs.map((j) => item(j.id, j.name, true))}
        </div>
      );
    });
  } else {
    const entries =
      filter === "locations" ? week.locations.map((l) => [l.id, l.name] as const)
      : filter === "shiftTypes" ? week.shiftTypes.map((t) => [t.id, t.name] as const)
      : [...week.employees].sort((a, b) => a.name.localeCompare(b.name)).map((e) => [e.id, e.name] as const);
    body = entries.map(([id, label]) => item(id, label));
  }
  const noun = { locations: "locations", shiftTypes: "shifts", jobs: "jobs", employees: "employees" }[filter];
  return (
    <div {...layer} className="pv-panel pv-filter" data-proto-topmenu={filter}>
      {filter === "locations" ? (
        <div className="pv-merge">
          <span>Merge locations</span>
          <button type="button" role="switch" aria-checked={s.url.layout === "unified"} onClick={() => s.setLayout(s.url.layout === "unified" ? "separate" : "unified")}>
            <span />
          </button>
        </div>
      ) : null}
      <button type="button" role="checkbox" aria-checked={all} className="pv-filter-all" onClick={() => s.setFilter(filter, [])}>
        <span className="pv-check-box" aria-hidden>{all ? <Check size={11} /> : null}</span>
        All {noun}
      </button>
      <div className="pv-filter-list">{body}</div>
    </div>
  );
}

export function SettingsPanel({ s }: { s: Schedule }) {
  const d = s.display;
  const row = (label: string, on: boolean, flip: () => void, note?: string) => (
    <button type="button" role="switch" aria-checked={on} className="pv-setting" onClick={flip} disabled={Boolean(note)} title={note}>
      <span>{label}</span>
      <span className="pv-switch" aria-hidden><span /></span>
    </button>
  );
  return (
    <div {...layer} className="pv-panel pv-settings" data-proto-topmenu="settings">
      <div className="pv-label">Sort people</div>
      <div className="pv-segment">
        <button type="button" aria-pressed={d.sort === "az"} onClick={() => s.setDisplay({ sort: "az" })}>A–Z</button>
        <button type="button" aria-pressed={d.sort === "job"} onClick={() => s.setDisplay({ sort: "job" })}>Job / Position</button>
      </div>
      <div className="pv-label">On the cards</div>
      {row("Shift type", d.showType, () => s.setDisplay({ showType: !d.showType }))}
      {row("Labels", d.showLabels, () => s.setDisplay({ showLabels: !d.showLabels }))}
      {row("Clock in/out", d.showClock, () => s.setDisplay({ showClock: !d.showClock }))}
      <div className="pv-label">Grid</div>
      {row("Total hours", d.totals, () => s.setDisplay({ totals: !d.totals }))}
      {row("Role separators", d.separators, () => s.setDisplay({ separators: !d.separators }), d.sort !== "job" ? "Sort by Job/Position to use this." : undefined)}
    </div>
  );
}

export function NewSchedulePanel({ s }: { s: Schedule }) {
  const week = s.week!;
  const live = week.shifts.length;
  return (
    <div {...layer} className="pv-panel pv-surface" data-proto-surface="newSchedule">
      <div className="pv-surface-head">
        <strong>Schedules</strong>
        {!s.editing ? (
          <button type="button" className="pv-primary" disabled={s.pastWeek} onClick={() => s.startEdit("blank")}>Blank schedule</button>
        ) : null}
      </div>
      {s.pastWeek ? <p className="pv-muted">Past week: you can view it, not edit it.</p> : null}
      {s.editing ? <p className="pv-muted">You are editing this week. Save or discard it before you start another schedule.</p> : null}
      <div className="pv-surface-row">
        <span className="pv-live-dot" aria-hidden />
        <div>
          <strong>Live schedule</strong>
          <small>{live} shifts · {formatHours(week.shifts.reduce((m, x) => m + shiftMinutes(x), 0))}</small>
        </div>
        <button type="button" className="pv-icon" aria-label="Edit live schedule" disabled={s.pastWeek || s.editing} onClick={() => s.startEdit("live")}>
          <Pencil size={14} />
        </button>
      </div>
      <p className="pv-footnote">Drafts, templates and export are not part of this prototype.</p>
    </div>
  );
}

export function PublishPanel() {
  return (
    <div {...layer} className="pv-panel pv-surface" data-proto-surface="publish">
      <strong>Publish</strong>
      <p className="pv-muted">Publishing is not part of this prototype. Nothing here reaches the server.</p>
    </div>
  );
}

export { formatRange, initialsOf };
