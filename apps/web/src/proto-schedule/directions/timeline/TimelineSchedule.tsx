// Direction B — "Timeline". Swiss information design: no corners, black and
// white with one red, a visible grid. Every card carries a micro track of its
// hours on the day's clock; each day header carries a coverage histogram;
// day view becomes a true timeline with bars on a shared hour axis.
import { ArrowLeft, ArrowRight, Lock, Plus, X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type { Column, Row } from "../../engine/derive";
import { cellKey } from "../../engine/derive";
import type { Shift } from "../../engine/model";
import { dayNumberOf, formatHours, formatRange, minutesOf, monthOf, weekdayOf } from "../../engine/model";
import type { Schedule } from "../../engine/useSchedule";
import { CalendarPanel, ContextMenu, Dialogs, FilterPanel, NewSchedulePanel, PersonDrawer, PublishPanel, SettingsPanel, ShiftWindow, Toasts } from "../../shared/Overlays";
import { toneOf } from "../../shared/tone";
import "./timeline.css";

const ROOT = "dir-b";

/** The hour axis every track shares: the week's earliest start to latest end. */
function axisOf(s: Schedule): [number, number] {
  let lo = 24 * 60;
  let hi = 0;
  for (const x of s.shifts) {
    const a = minutesOf(x.start);
    const b = minutesOf(x.end);
    if (a === null || b === null) continue;
    lo = Math.min(lo, a);
    hi = Math.max(hi, b > a ? b : b + 24 * 60);
  }
  if (lo >= hi) return [9 * 60, 24 * 60];
  return [Math.floor(lo / 60) * 60 - 60, Math.ceil(hi / 60) * 60 + 60];
}

function spanPct(shift: Pick<Shift, "start" | "end">, axis: [number, number]) {
  const a = minutesOf(shift.start);
  const b0 = minutesOf(shift.end);
  if (a === null || b0 === null) return null;
  const b = b0 > a ? b0 : b0 + 24 * 60;
  const total = axis[1] - axis[0];
  return { left: ((a - axis[0]) / total) * 100, width: ((b - a) / total) * 100 };
}

const hourLabel = (minutes: number) => {
  const h = Math.floor(minutes / 60) % 24;
  return h === 0 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`;
};

export function TimelineSchedule({ s }: { s: Schedule }) {
  const axis = axisOf(s);
  return (
    <div className={`${ROOT} b-root`}>
      <main className="b-page" data-proto-page>
        <TopBar s={s} />
        {s.editing ? <EditBar s={s} /> : null}
        <Body s={s} axis={axis} />
        <Dock s={s} />
      </main>
      {s.editor && s.week ? <ShiftWindow s={s} rootClass={ROOT} key={`${s.editor.shiftId}-${s.editor.target.date}-${s.editor.target.employeeId}`} /> : null}
      {s.menu ? <ContextMenu s={s} rootClass={ROOT} /> : null}
      {s.drawer && s.week ? <PersonDrawer s={s} rootClass={ROOT} /> : null}
      <Dialogs s={s} rootClass={ROOT} />
      <Toasts s={s} rootClass={ROOT} />
      {s.drag ? <DragGhost s={s} axis={axis} /> : null}
    </div>
  );
}

// ------------------------------------------------------------ top

function TopBar({ s }: { s: Schedule }) {
  const week = s.week;
  const first = week?.weekStart ?? s.date;
  const last = s.grid?.dates.at(-1) ?? first;
  const big = s.url.view === "day" ? String(dayNumberOf(s.date)).padStart(2, "0") : `${String(dayNumberOf(first)).padStart(2, "0")}—${String(dayNumberOf(last)).padStart(2, "0")}`;
  const sub = s.url.view === "day" ? `${weekdayOf(s.date)} ${monthOf(s.date)} ${s.date.slice(0, 4)}` : `${monthOf(first)}${monthOf(first) !== monthOf(last) ? `/${monthOf(last)}` : ""} ${first.slice(0, 4)}`;
  const filter = (key: "locations" | "shiftTypes" | "jobs" | "employees", label: string) => (
    <div className="b-pop" data-proto-topmenu={key}>
      <button type="button" className="b-filter" data-active={s.url[key].length ? true : undefined} aria-expanded={s.topMenu === key} onClick={() => s.setTopMenu(s.topMenu === key ? null : key)}>
        <span className="b-filter-label">{label}</span>
        <span className="b-filter-value">{s.filterSummary(key)}</span>
      </button>
      {s.topMenu === key && week ? <FilterPanel s={s} filter={key} /> : null}
    </div>
  );
  return (
    <header className="b-top" data-proto-topbar>
      <div className="b-masthead">
        <div className="b-pop b-date" data-proto-topmenu="calendar">
          <button type="button" className="b-big" onClick={s.datePress} aria-label={s.onCurrentPeriod ? "Open calendar" : "Go to today"}>
            {big}
          </button>
          <div className="b-date-sub">
            <span>{sub}</span>
            {s.onCurrentPeriod ? <span className="b-now">Now</span> : <button type="button" className="b-back" onClick={s.datePress}>Return to {s.url.view === "day" ? "today" : "this week"}</button>}
          </div>
          {s.topMenu === "calendar" ? <CalendarPanel s={s} /> : null}
        </div>
        <div className="b-controls">
          <div className="b-arrows">
            <button type="button" aria-label={s.url.view === "day" ? "Previous day" : "Previous week"} onClick={() => s.step(-1)}><ArrowLeft size={16} /></button>
            <button type="button" aria-label={s.url.view === "day" ? "Next day" : "Next week"} onClick={() => s.step(1)}><ArrowRight size={16} /></button>
          </div>
          <div className="b-switch" role="group" aria-label="View">
            <button type="button" aria-pressed={s.url.view === "week"} onClick={() => s.setView("week")}>Week</button>
            <button type="button" aria-pressed={s.url.view === "day"} onClick={() => s.setView("day")}>Day</button>
          </div>
        </div>
        <label className="b-search">
          <span>Search</span>
          <input ref={s.searchInput} type="search" placeholder="People, jobs, shifts" aria-label="Search the schedule" value={s.searchText} onChange={(e) => s.setSearchText(e.target.value)} onKeyDown={s.searchKeyDown} />
          <kbd>/</kbd>
        </label>
        <div className="b-actions">
          <div className="b-pop" data-proto-surface-trigger="newSchedule">
            <button type="button" className="b-btn" onClick={() => s.setTopSurface(s.topSurface === "newSchedule" ? null : "newSchedule")}>{s.editing ? "Live schedule" : "New Schedule"}</button>
            {s.topSurface === "newSchedule" && week ? <NewSchedulePanel s={s} /> : null}
          </div>
          <div className="b-pop" data-proto-surface-trigger="publish">
            <button type="button" className="b-btn b-btn-ink" onClick={() => s.setTopSurface(s.topSurface === "publish" ? null : "publish")}>Publish</button>
            {s.topSurface === "publish" ? <PublishPanel /> : null}
          </div>
        </div>
      </div>
      <div className="b-filters">
        {filter("locations", "Location")}
        {filter("shiftTypes", "Shift")}
        {filter("jobs", "Job")}
        {filter("employees", "People")}
        <button type="button" className="b-filter" data-active={s.url.hideUnscheduled || undefined} onClick={s.toggleHideUnscheduled}>
          <span className="b-filter-label">Unscheduled</span>
          <span className="b-filter-value">{s.url.hideUnscheduled ? "Hidden" : "Shown"}</span>
        </button>
        <div className="b-chips" data-proto-interactive>
          {s.chips.map((c) => (
            <button key={`${c.key}:${c.id}`} type="button" className="b-chip" aria-label={`Remove ${c.label}`} onClick={() => s.removeChip(c.key, c.id)}>
              {c.label} <X size={11} />
            </button>
          ))}
        </div>
        <div className="b-pop" data-proto-topmenu="settings">
          <button type="button" className="b-filter b-filter-end" aria-expanded={s.topMenu === "settings"} onClick={() => s.setTopMenu(s.topMenu === "settings" ? null : "settings")}>
            <span className="b-filter-label">Display</span>
            <span className="b-filter-value">{s.display.sort === "job" ? "By job" : "A–Z"}</span>
          </button>
          {s.topMenu === "settings" ? <SettingsPanel s={s} /> : null}
        </div>
      </div>
    </header>
  );
}

function EditBar({ s }: { s: Schedule }) {
  return (
    <div className="b-editbar" data-proto-toolbar>
      <strong>Editing</strong>
      <span>Live schedule · this tab only</span>
      <span className="b-gap" />
      {s.selected.length ? <button type="button" onClick={() => s.requestDelete()}>Delete {s.selected.length}</button> : null}
      <button type="button" disabled={!s.canUndo} onClick={s.undo}>Undo</button>
      {s.clipboard ? <button type="button" aria-pressed={s.pasteArmed} onClick={s.togglePaste}>Paste mode {s.pasteArmed ? "on" : "off"}</button> : null}
      <button type="button" onClick={s.requestDiscard}>Discard</button>
      <button type="button" className="b-editbar-save" onClick={() => s.toast({ tone: "info", title: "Saving drafts is not part of this prototype" })}>Save draft</button>
    </div>
  );
}

// ------------------------------------------------------------ grid

function Body({ s, axis }: { s: Schedule; axis: [number, number] }) {
  if (s.error) return <div className="b-state">The schedule didn't load. {s.error}</div>;
  if (!s.week || !s.grid) return <div className="b-state b-loading">Loading the week<span>…</span></div>;
  const grid = s.grid;
  if (grid.noLocations) {
    return (
      <div className="b-state">
        <strong>No locations match.</strong>
        <button type="button" className="b-btn" onClick={() => s.setFilter("locations", [])}>Clear the location filter</button>
      </div>
    );
  }
  const day = s.url.view === "day";
  const colWidth = day ? 420 : 150;
  const totals = Boolean(grid.totals);
  const template = `200px repeat(${grid.columns.length}, minmax(${colWidth}px, 1fr))${totals ? " 64px" : ""}`;
  const style = { "--b-cols": template, width: `max(100%, ${200 + grid.columns.length * colWidth + (totals ? 64 : 0)}px)` } as CSSProperties;
  return (
    <div className="b-scroll" ref={(el) => { s.scrollerRef.current = el; }} data-proto-grid data-day={day || undefined}>
      <div className="b-grid" role="grid" style={style}>
        <div className="b-row b-band">
          <div className="b-corner">
            <span>{grid.rows.filter((r) => r.kind === "person").length}</span> people
          </div>
          {grid.groups.map((g) => (
            <div key={g.id} className="b-location" style={{ gridColumn: `span ${g.columns.length}` }} {...s.locationHeaderProps(g)}>
              <span className="b-location-name"><i aria-hidden /> {g.name}</span>
            </div>
          ))}
          {totals ? <div className="b-total-head">Σ</div> : null}
        </div>
        <div className="b-row b-days">
          <div className="b-corner b-corner-axis">{day ? <AxisTicks axis={axis} /> : <span>Hours on the day's clock</span>}</div>
          {grid.columns.map((c) => (
            <DayHeader key={c.key} s={s} column={c} axis={axis} />
          ))}
          {totals ? <div className="b-total-head" /> : null}
        </div>
        {grid.rows.map((row) => (
          <GridRow key={row.key} s={s} row={row} axis={axis} totals={totals} />
        ))}
        {totals && grid.totals ? (
          <div className="b-row b-total-row">
            <div className="b-person"><strong>Total</strong></div>
            {grid.columns.map((c) => <div key={c.key} className="b-total-cell">{formatHours(grid.totals!.byDate.get(c.date) ?? 0)}</div>)}
            <div className="b-total-cell"><strong>{formatHours(grid.totals.week)}</strong></div>
          </div>
        ) : null}
        <div className="b-filler" data-proto-gridbg />
      </div>
      {grid.searchEmpty ? (
        <div className="b-state b-state-float">
          <strong>No one matches “{grid.searchEmpty.term}”.</strong>
          {grid.searchEmpty.outside ? <span>Someone matches outside your filters.</span> : null}
          <div>
            <button type="button" className="b-btn" onClick={s.clearSearch}>Clear search</button>
            {grid.searchEmpty.outside ? <button type="button" className="b-btn" onClick={s.showAllFilters}>Show all filters</button> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AxisTicks({ axis }: { axis: [number, number] }) {
  const ticks: number[] = [];
  for (let m = Math.ceil(axis[0] / 180) * 180; m <= axis[1]; m += 180) ticks.push(m);
  return (
    <div className="b-axis">
      {ticks.map((m) => (
        <span key={m} style={{ left: `${((m - axis[0]) / (axis[1] - axis[0])) * 100}%` }}>{hourLabel(m)}</span>
      ))}
    </div>
  );
}

function DayHeader({ s, column, axis }: { s: Schedule; column: Column; axis: [number, number] }) {
  const week = s.week!;
  const closed = column.locationIds.every((id) => week.closures.some((c) => c.locationId === id && c.date === column.date && c.kind === "closed"));
  const posts = week.posts.filter((p) => column.date >= p.from && column.date <= p.to && (!p.locationId || column.locationIds.includes(p.locationId)));
  const titles = [...new Set(posts.map((p) => (p.day === "closed" ? `Closed · ${p.title}` : p.day === "short" ? `Short hours · ${p.title}` : p.title)))];
  // Coverage: people at work in each hour of the axis.
  const shifts = (s.grid?.rows ?? []).flatMap((r) =>
    (s.grid?.cells.get(cellKey(r.key, column.key)) ?? []).flatMap((c) => (c.ghost || c.shift.removed ? [] : [c.shift])),
  );
  const hours = Math.round((axis[1] - axis[0]) / 60);
  const counts = Array.from({ length: hours }, (_, i) => {
    const t = axis[0] + i * 60 + 30;
    return shifts.filter((x) => {
      const a = minutesOf(x.start);
      const b0 = minutesOf(x.end);
      if (a === null || b0 === null) return false;
      const b = b0 > a ? b0 : b0 + 24 * 60;
      return t >= a && t < b;
    }).length;
  });
  const peak = Math.max(1, ...counts);
  return (
    <div className="b-day" data-today={column.date === s.today || undefined} data-closed={closed || undefined} data-first={column.dayIndex === 0 || undefined} aria-label={`View ${weekdayOf(column.date)} ${monthOf(column.date)} ${dayNumberOf(column.date)}`} {...s.dayHeaderProps(column)}>
      <div className="b-day-top">
        <span className="b-dnum">{String(dayNumberOf(column.date)).padStart(2, "0")}</span>
        <span className="b-dow">{weekdayOf(column.date)}{closed ? <Lock size={10} /> : null}</span>
        <span className="b-staff">{Math.max(0, ...counts)} peak</span>
      </div>
      <div className="b-hist" aria-hidden>
        {counts.map((n, i) => <i key={i} style={{ height: `${(n / peak) * 100}%` }} data-zero={n === 0 || undefined} />)}
      </div>
      {titles.length ? <span className="b-post" title={titles.join("\n")}>{titles[0]}{titles.length > 1 ? ` +${titles.length - 1}` : ""}</span> : null}
    </div>
  );
}

function GridRow({ s, row, axis, totals }: { s: Schedule; row: Row; axis: [number, number]; totals: boolean }) {
  const grid = s.grid!;
  if (row.kind === "group") {
    return (
      <div className="b-row b-group">
        <div className="b-group-label">{row.label}</div>
      </div>
    );
  }
  const person = row.kind === "person" ? row.employee : null;
  const minutes = person && grid.totals ? (grid.totals.byEmployee.get(person.id) ?? 0) : null;
  return (
    <div className="b-row" data-open={row.kind === "open" || undefined}>
      <div className="b-person">
        {person ? (
          <>
            <button className="b-name" {...s.nameProps(person)}>{person.name}</button>
            <span className="b-job">{s.jobOf(s.scheduleJobOf(person))?.name ?? "—"}</span>
          </>
        ) : (
          <>
            <strong className="b-name">Open shifts</strong>
            <span className="b-job">Unassigned</span>
          </>
        )}
      </div>
      {grid.columns.map((c) => <Cell key={c.key} s={s} row={row} column={c} axis={axis} />)}
      {totals ? <div className="b-total-cell">{minutes !== null ? formatHours(minutes) : ""}</div> : null}
    </div>
  );
}

function Cell({ s, row, column, axis }: { s: Schedule; row: Row; column: Column; axis: [number, number] }) {
  const items = s.grid!.cells.get(cellKey(row.key, column.key)) ?? [];
  return (
    <div className="b-cell" role="gridcell" data-first={column.dayIndex === 0 || undefined} data-today={column.date === s.today || undefined} data-armed={s.pasteArmed || undefined} {...s.cellProps(row, column)}>
      {items.map((item) =>
        item.ghost ? (
          <div key={item.id} className="b-ghost" title={`${item.title} at ${item.locationName}`}>
            <span>→ {item.locationName}</span>
            <Track span={spanPct(item, axis)} ghost />
          </div>
        ) : (
          <Card key={item.shift.id} s={s} shift={item.shift} axis={axis} mark={item.mark} />
        ),
      )}
      {s.editing ? (
        <button className="b-add" {...s.addProps(row, column)}>
          <Plus size={12} /> {s.pasteArmed ? "Paste here" : ""}
        </button>
      ) : null}
    </div>
  );
}

function Track({ span, ghost, children }: { span: { left: number; width: number } | null; ghost?: boolean; children?: ReactNode }) {
  return (
    <span className="b-track" data-ghost={ghost || undefined}>
      {span ? <i style={{ left: `${span.left}%`, width: `${span.width}%` }}>{children}</i> : null}
    </span>
  );
}

function Card({ s, shift, axis, mark, preview }: { s: Schedule; shift: Shift; axis: [number, number]; mark?: "match" | "dim" | null; preview?: boolean }) {
  const week = s.week!;
  const type = s.typeOf(shift.shiftTypeId);
  const job = s.jobOf(shift.jobId);
  const span = spanPct(shift, axis);
  const props = preview ? {} : s.cardProps(shift);
  const time = s.display.showClock && !shift.hideTime ? formatRange(shift, week.timeFormat, true) : null;
  const day = s.url.view === "day";
  return (
    <div className="b-card" data-tone={toneOf(week, shift)} data-mark={mark ?? undefined} data-day={day || undefined} {...props}>
      <div className="b-card-head">
        {s.display.showType && type ? <span className="b-type">{type.name}</span> : null}
        <span className="b-card-job">{job?.name}</span>
        {s.editing && !preview ? (shift.origin === "new" || shift.edited ? <span className="b-mark b-mark-new">New</span> : !shift.removed ? <span className="b-mark">Live</span> : null) : null}
        {shift.note ? <span className="b-note" title={shift.note}>*</span> : null}
        {time && !day ? <span className="b-card-time">{time}</span> : null}
      </div>
      <Track span={span}>{day && time ? <b>{time}</b> : null}</Track>
      {s.display.showLabels && shift.labels.length ? <span className="b-labels">{shift.labels.join(" · ")}</span> : null}
    </div>
  );
}

function DragGhost({ s, axis }: { s: Schedule; axis: [number, number] }) {
  const drag = s.drag!;
  const shift = s.shiftById(drag.shiftId);
  if (!shift) return null;
  const a = drag.assessment;
  return (
    <div className="dir-b">
      <div className="b-drag" data-proto-layer style={{ left: drag.x - drag.offsetX, top: drag.y - drag.offsetY, width: drag.width }}>
        <Card s={s} shift={shift} axis={axis} preview />
        <div className="b-drag-tags">
          {drag.copy ? <span>+ Copy</span> : null}
          {a && a.status !== "allowed" ? <span data-status={a.status}>{a.reason}</span> : null}
        </div>
      </div>
    </div>
  );
}

function Dock({ s }: { s: Schedule }) {
  if (!s.editing) return null;
  if (s.pasteArmed && s.clipboard) {
    return (
      <div className="b-dock" data-proto-toolbar>
        <strong>Paste mode</strong>
        <span>{s.titleOf(s.clipboard)} · {s.week ? formatRange(s.clipboard, s.week.timeFormat, true) : ""}</span>
        <span className="b-gap" />
        <span>{s.pasteBlocked ? `Blocked: ${s.pasteBlocked}` : "Click a cell to place a copy"}</span>
        <button type="button" onClick={s.togglePaste}>Stop (Esc)</button>
      </div>
    );
  }
  if (!s.selected.length) return null;
  return (
    <div className="b-dock" data-proto-toolbar>
      <strong>{String(s.selected.length).padStart(2, "0")} selected</strong>
      <span className="b-gap" />
      <button type="button" disabled={s.selected.length !== 1} onClick={() => { const x = s.shiftById(s.selected[0] ?? null); if (x) s.copyShift(x); }}>Copy (Ctrl C)</button>
      <button type="button" onClick={() => s.requestDelete()}>Delete (Del)</button>
      <span>Esc clears</span>
    </div>
  );
}
