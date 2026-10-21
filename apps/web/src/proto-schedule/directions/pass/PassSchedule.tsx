// Direction A — "Pass". A quiet, keyboard-first tool: hairlines, one green
// accent, people with faces, slim cards with a time-of-day dot and mono
// times, a black action dock that rises when something is selected.
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock3, Copy, EyeOff, Lock, MapPin, Pencil, Plus, Search, Send, SlidersHorizontal, Trash2, Undo2, Users, X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type { Column, Row } from "../../engine/derive";
import { cellKey } from "../../engine/derive";
import type { Shift } from "../../engine/model";
import { dayNumberOf, formatHours, formatRange, initialsOf, isWeekend, monthOf, weekdayOf } from "../../engine/model";
import type { Schedule } from "../../engine/useSchedule";
import { CalendarPanel, ContextMenu, Dialogs, FilterPanel, NewSchedulePanel, PersonDrawer, PublishPanel, SettingsPanel, ShiftWindow, Toasts } from "../../shared/Overlays";
import { hueOf, toneOf } from "../../shared/tone";
import "./pass.css";

const ROOT = "dir-a";

export function PassSchedule({ s }: { s: Schedule }) {
  return (
    <div className={`${ROOT} a-root`}>
      <aside className="a-rail" aria-label="App">
        <span className="a-mark">N</span>
        <span className="a-rail-item" data-on><CalendarDays size={18} /></span>
        <span className="a-rail-item"><Users size={18} /></span>
        <span className="a-rail-item"><Clock3 size={18} /></span>
      </aside>
      <main className="a-page" data-proto-page>
        <TopBar s={s} />
        {s.editing ? <EditBar s={s} /> : null}
        <Body s={s} />
        <Dock s={s} />
      </main>
      {s.editor && s.week ? <ShiftWindow s={s} rootClass={ROOT} key={`${s.editor.shiftId}-${s.editor.target.date}-${s.editor.target.employeeId}`} /> : null}
      {s.menu ? <ContextMenu s={s} rootClass={ROOT} /> : null}
      {s.drawer && s.week ? <PersonDrawer s={s} rootClass={ROOT} /> : null}
      <Dialogs s={s} rootClass={ROOT} />
      <Toasts s={s} rootClass={ROOT} />
      {s.drag ? <DragGhost s={s} /> : null}
    </div>
  );
}

// ------------------------------------------------------------ top bar

function TopBar({ s }: { s: Schedule }) {
  const week = s.week;
  const range = (() => {
    if (!week) return "Schedule";
    if (s.url.view === "day") return `${weekdayOf(s.date)}, ${monthOf(s.date)} ${dayNumberOf(s.date)}`;
    const end = s.grid?.dates.at(-1) ?? week.weekStart;
    const sameMonth = monthOf(week.weekStart) === monthOf(end);
    return `${monthOf(week.weekStart)} ${dayNumberOf(week.weekStart)} – ${sameMonth ? "" : `${monthOf(end)} `}${dayNumberOf(end)}`;
  })();
  const menuButton = (key: "locations" | "shiftTypes" | "jobs" | "employees", icon: ReactNode) => (
    <div className="a-pop" data-proto-topmenu={key}>
      <button type="button" className="a-pill" data-active={s.url[key].length ? true : undefined} aria-expanded={s.topMenu === key} onClick={() => s.setTopMenu(s.topMenu === key ? null : key)}>
        {icon}
        {s.filterSummary(key)}
        <ChevronDown size={13} className="a-caret" />
      </button>
      {s.topMenu === key && week ? <FilterPanel s={s} filter={key} /> : null}
    </div>
  );
  return (
    <header className="a-top" data-proto-topbar>
      <div className="a-top-row">
        <div className="a-title">
          <span className="a-kicker">Schedule{s.editing ? " · Editing" : ""}</span>
          <div className="a-title-line">
            <div className="a-pop" data-proto-topmenu="calendar">
              <button type="button" className="a-range" onClick={s.datePress} aria-label={s.onCurrentPeriod ? "Open calendar" : "Go to today"}>
                {range}
              </button>
              {s.topMenu === "calendar" ? <CalendarPanel s={s} /> : null}
            </div>
            {!s.onCurrentPeriod ? (
              <button type="button" className="a-return" onClick={s.datePress}>Back to {s.url.view === "day" ? "today" : "this week"}</button>
            ) : null}
          </div>
        </div>
        <div className="a-nav">
          <button type="button" className="a-icon-btn" aria-label={s.url.view === "day" ? "Previous day" : "Previous week"} onClick={() => s.step(-1)}><ChevronLeft size={16} /></button>
          <button type="button" className="a-icon-btn" aria-label={s.url.view === "day" ? "Next day" : "Next week"} onClick={() => s.step(1)}><ChevronRight size={16} /></button>
          <div className="a-seg" role="group" aria-label="View">
            <button type="button" aria-pressed={s.url.view === "week"} onClick={() => s.setView("week")}>Week</button>
            <button type="button" aria-pressed={s.url.view === "day"} onClick={() => s.setView("day")}>Day</button>
          </div>
        </div>
        <label className="a-search">
          <Search size={15} />
          <input
            ref={s.searchInput}
            type="search"
            placeholder="Search people, jobs, shifts"
            aria-label="Search the schedule"
            value={s.searchText}
            onChange={(e) => s.setSearchText(e.target.value)}
            onKeyDown={s.searchKeyDown}
          />
          <kbd>/</kbd>
        </label>
        <div className="a-actions">
          <div className="a-pop" data-proto-surface-trigger="newSchedule">
            <button type="button" className="a-btn" aria-expanded={s.topSurface === "newSchedule"} onClick={() => s.setTopSurface(s.topSurface === "newSchedule" ? null : "newSchedule")}>
              {s.editing ? "Live schedule" : "New Schedule"} <ChevronDown size={13} />
            </button>
            {s.topSurface === "newSchedule" && week ? <NewSchedulePanel s={s} /> : null}
          </div>
          <div className="a-pop" data-proto-surface-trigger="publish">
            <button type="button" className="a-btn a-btn-solid" onClick={() => s.setTopSurface(s.topSurface === "publish" ? null : "publish")}>
              <Send size={14} /> Publish
            </button>
            {s.topSurface === "publish" ? <PublishPanel /> : null}
          </div>
        </div>
      </div>
      <div className="a-top-row a-filters">
        {menuButton("locations", <MapPin size={13} />)}
        {menuButton("shiftTypes", <Clock3 size={13} />)}
        {menuButton("jobs", <span className="a-glyph">J</span>)}
        {menuButton("employees", <Users size={13} />)}
        <button type="button" className="a-pill" data-active={s.url.hideUnscheduled || undefined} onClick={s.toggleHideUnscheduled}>
          <EyeOff size={13} /> {s.url.hideUnscheduled ? "Show Unscheduled" : "Hide Unscheduled"}
        </button>
        <span className="a-filters-gap" />
        {s.chips.length ? (
          <div className="a-chips" data-proto-interactive>
            {s.chips.map((c) => (
              <button key={`${c.key}:${c.id}`} type="button" className="a-chip" onClick={() => s.removeChip(c.key, c.id)} aria-label={`Remove ${c.label}`}>
                {c.label} <X size={11} />
              </button>
            ))}
          </div>
        ) : null}
        <div className="a-pop" data-proto-topmenu="settings">
          <button type="button" className="a-icon-btn" aria-label="Settings" aria-expanded={s.topMenu === "settings"} onClick={() => s.setTopMenu(s.topMenu === "settings" ? null : "settings")}>
            <SlidersHorizontal size={15} />
          </button>
          {s.topMenu === "settings" ? <SettingsPanel s={s} /> : null}
        </div>
      </div>
    </header>
  );
}

function EditBar({ s }: { s: Schedule }) {
  return (
    <div className="a-editbar" data-proto-toolbar>
      <span className="a-edit-dot" aria-hidden />
      <strong>Editing the live schedule</strong>
      <span className="a-editbar-note">Changes stay in this tab. Nothing is sent.</span>
      <span className="a-filters-gap" />
      {s.selected.length ? (
        <button type="button" className="a-tool" onClick={() => s.requestDelete()}><Trash2 size={14} /> Delete {s.selected.length}</button>
      ) : null}
      <button type="button" className="a-tool" disabled={!s.canUndo} onClick={s.undo}><Undo2 size={14} /> Undo <kbd>⌃Z</kbd></button>
      {s.clipboard ? (
        <button type="button" className="a-tool" aria-pressed={s.pasteArmed} onClick={s.togglePaste}><Copy size={14} /> Paste mode {s.pasteArmed ? "on" : "off"}</button>
      ) : null}
      <button type="button" className="a-tool" onClick={s.requestDiscard}><X size={14} /> Discard</button>
      <button type="button" className="a-tool a-tool-solid" onClick={() => s.toast({ tone: "info", title: "Saving drafts is not part of this prototype" })}>Save draft</button>
    </div>
  );
}

// ------------------------------------------------------------ grid

function Body({ s }: { s: Schedule }) {
  if (s.error) return <div className="a-state">The schedule didn't load. {s.error}</div>;
  if (!s.week || !s.grid) return <Skeleton />;
  const grid = s.grid;
  if (grid.noLocations) {
    return (
      <div className="a-state">
        <strong>No locations match</strong>
        <span>Clear the location filter to see the schedule.</span>
        <button type="button" className="a-btn" onClick={() => s.setFilter("locations", [])}>Clear location filter</button>
      </div>
    );
  }
  const dayWidth = s.url.view === "day" ? 240 : 132;
  const totals = Boolean(grid.totals);
  const template = `228px repeat(${grid.columns.length}, minmax(${dayWidth}px, 1fr))${totals ? " 72px" : ""}`;
  const minWidth = 228 + grid.columns.length * dayWidth + (totals ? 72 : 0);
  const style = { "--a-cols": template, width: `max(100%, ${minWidth}px)` } as CSSProperties;
  return (
    <div className="a-scroll" ref={(el) => { s.scrollerRef.current = el; }} data-proto-grid data-drag={s.drag ? true : undefined}>
      <div className="a-grid" role="grid" style={style}>
        <div className="a-row a-head-row a-band">
          <div className="a-corner">
            <span className="a-ws">Meyhouse</span>
          </div>
          {grid.groups.map((g) => (
            <div key={g.id} className="a-location" style={{ gridColumn: `span ${g.columns.length}` }} {...s.locationHeaderProps(g)}>
              <span className="a-location-name"><span className="a-live" aria-hidden /> {g.name} <span className="a-location-meta">Live</span></span>
            </div>
          ))}
          {totals ? <div className="a-total-head">Week</div> : null}
        </div>
        <div className="a-row a-head-row a-days">
          <div className="a-corner a-corner-label">
            {grid.rows.filter((r) => r.kind === "person").length} people
          </div>
          {grid.columns.map((c) => (
            <DayHeader key={c.key} s={s} column={c} />
          ))}
          {totals ? <div className="a-total-head" /> : null}
        </div>
        {grid.rows.map((row) => (
          <GridRow key={row.key} s={s} row={row} totals={totals} />
        ))}
        {totals && grid.totals ? (
          <div className="a-row a-total-row">
            <div className="a-person a-total-label">Total</div>
            {grid.columns.map((c) => (
              <div key={c.key} className="a-total-cell">{formatHours(grid.totals!.byDate.get(c.date) ?? 0)}</div>
            ))}
            <div className="a-total-cell a-total-week">{formatHours(grid.totals.week)}</div>
          </div>
        ) : null}
        <div className="a-filler" data-proto-gridbg />
      </div>
      {grid.searchEmpty ? (
        <div className="a-state a-state-float">
          <strong>No one matches “{grid.searchEmpty.term}”.</strong>
          {grid.searchEmpty.outside ? <span>Someone matches outside your filters.</span> : null}
          <div className="a-state-actions">
            <button type="button" className="a-btn" onClick={s.clearSearch}>Clear search</button>
            {grid.searchEmpty.outside ? <button type="button" className="a-btn" onClick={s.showAllFilters}>Show all filters</button> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DayHeader({ s, column }: { s: Schedule; column: Column }) {
  const week = s.week!;
  const closed = column.locationIds.every((id) => week.closures.some((c) => c.locationId === id && c.date === column.date && c.kind === "closed"));
  const posts = week.posts.filter((p) => column.date >= p.from && column.date <= p.to && (!p.locationId || column.locationIds.includes(p.locationId)));
  const titles = [...new Set(posts.map((p) => (p.day === "closed" ? `Closed · ${p.title}` : p.day === "short" ? `Short hours · ${p.title}` : p.title)))];
  return (
    <div
      className="a-day"
      data-today={column.date === s.today || undefined}
      data-viewed={s.url.view === "day" || undefined}
      data-weekend={isWeekend(column.date) || undefined}
      data-closed={closed || undefined}
      data-first={column.dayIndex === 0 || undefined}
      aria-label={`View ${weekdayOf(column.date)} ${monthOf(column.date)} ${dayNumberOf(column.date)}`}
      {...s.dayHeaderProps(column)}
    >
      <span className="a-dow">{weekdayOf(column.date)}{closed ? <Lock size={10} /> : null}</span>
      <span className="a-dnum">{dayNumberOf(column.date)}</span>
      {titles.length ? (
        <span className="a-post" title={titles.join("\n")}>
          {titles[0]}
          {titles.length > 1 ? <em>+{titles.length - 1}</em> : null}
        </span>
      ) : null}
    </div>
  );
}

function GridRow({ s, row, totals }: { s: Schedule; row: Row; totals: boolean }) {
  const grid = s.grid!;
  if (row.kind === "group") {
    const count = grid.rows.filter((r) => r.kind === "person" && s.scheduleJobOf(r.employee) === row.jobId).length;
    return (
      <div className="a-row a-group-row">
        <div className="a-group-label">{row.label} <span>{count}</span></div>
      </div>
    );
  }
  const person = row.kind === "person" ? row.employee : null;
  const minutes = person && grid.totals ? (grid.totals.byEmployee.get(person.id) ?? 0) : null;
  const openCount = row.kind === "open" ? s.shifts.filter((x) => !x.employeeId && grid.dates.includes(x.date) && !x.removed).length : 0;
  return (
    <div className="a-row" data-open={row.kind === "open" || undefined}>
      <div className="a-person">
        {person ? (
          <>
            <span className="a-avatar" style={{ "--h": hueOf(person.id) } as CSSProperties}>{initialsOf(person.name)}</span>
            <span className="a-person-text">
              <button className="a-name" {...s.nameProps(person)}>{person.name}</button>
              <span className="a-sub">{s.jobOf(s.scheduleJobOf(person))?.name ?? "No job"}</span>
            </span>
          </>
        ) : (
          <>
            <span className="a-avatar a-avatar-open"><Plus size={13} /></span>
            <span className="a-person-text">
              <strong className="a-name">Open shifts</strong>
              <span className="a-sub">{openCount} open shift{openCount === 1 ? "" : "s"}</span>
            </span>
          </>
        )}
      </div>
      {grid.columns.map((column) => (
        <Cell key={column.key} s={s} row={row} column={column} />
      ))}
      {totals ? <div className="a-total-cell">{minutes !== null ? formatHours(minutes) : ""}</div> : null}
    </div>
  );
}

function Cell({ s, row, column }: { s: Schedule; row: Row; column: Column }) {
  const items = s.grid!.cells.get(cellKey(row.key, column.key)) ?? [];
  const props = s.cellProps(row, column);
  return (
    <div
      className="a-cell"
      role="gridcell"
      data-weekend={isWeekend(column.date) || undefined}
      data-today={column.date === s.today || undefined}
      data-first={column.dayIndex === 0 || undefined}
      data-armed={s.pasteArmed || undefined}
      {...props}
    >
      {items.map((item) =>
        item.ghost ? (
          <div key={item.id} className="a-ghost" title={`${item.title} at ${item.locationName}`}>
            <MapPin size={10} />
            <span>{item.locationName}</span>
            <em>{s.week && item.start ? formatRange(item, s.week.timeFormat, true) : ""}</em>
          </div>
        ) : (
          <Card key={item.shift.id} s={s} shift={item.shift} mark={item.mark} />
        ),
      )}
      {s.editing ? (
        <button className="a-add" {...s.addProps(row, column)}>
          <Plus size={13} /> {s.pasteArmed ? "Paste" : items.length ? "" : "Add"}
        </button>
      ) : null}
    </div>
  );
}

function Card({ s, shift, mark, preview }: { s: Schedule; shift: Shift; mark?: "match" | "dim" | null; preview?: boolean }) {
  const week = s.week!;
  const type = s.typeOf(shift.shiftTypeId);
  const job = s.jobOf(shift.jobId);
  const tone = toneOf(week, shift);
  const props = preview ? {} : s.cardProps(shift);
  const showTime = s.display.showClock && !shift.hideTime;
  return (
    <div className="a-card" data-tone={tone} data-mark={mark ?? undefined} {...props}>
      <span className="a-card-line">
        <span className="a-dot" aria-hidden />
        <span className="a-card-title">
          {s.display.showType && type ? <b>{type.name}</b> : null}
          {job?.name}
        </span>
        {s.editing && !preview ? (
          shift.origin === "new" || shift.edited ? <span className="a-badge a-badge-new" title={shift.edited ? "Edited - updates the live shift on next publish" : "Not published yet - goes live on next publish"}>New</span>
          : !shift.removed ? <span className="a-badge">Live</span> : null
        ) : null}
        {shift.note ? <span className="a-note" title={shift.note} aria-label="Has a note" /> : null}
      </span>
      {showTime ? <span className="a-time">{formatRange(shift, week.timeFormat, true)}</span> : null}
      {s.display.showLabels && shift.labels.length ? <span className="a-labels">{shift.labels.join(" · ")}</span> : null}
      {s.url.layout === "unified" ? <span className="a-labels">{week.locations.find((l) => l.id === shift.locationId)?.shortName}</span> : null}
    </div>
  );
}

function DragGhost({ s }: { s: Schedule }) {
  const drag = s.drag!;
  const shift = s.shiftById(drag.shiftId);
  if (!shift) return null;
  const a = drag.assessment;
  return (
    <div className="dir-a">
      <div className="a-drag" data-proto-layer style={{ left: drag.x - drag.offsetX, top: drag.y - drag.offsetY, width: drag.width }}>
        <Card s={s} shift={shift} preview />
        <div className="a-drag-tags">
          {drag.copy ? <span className="a-drag-tag">Copy</span> : null}
          {a && a.status !== "allowed" ? <span className="a-drag-tag" data-status={a.status}>{a.reason}</span> : null}
        </div>
      </div>
    </div>
  );
}

function Dock({ s }: { s: Schedule }) {
  if (!s.editing) return null;
  const clip = s.clipboard;
  if (s.pasteArmed && clip) {
    return (
      <div className="a-dock" data-proto-toolbar data-kind="paste">
        <span className="a-dock-pulse" aria-hidden />
        <span>Paste mode</span>
        <strong>{s.titleOf(clip)} · {s.week ? formatRange(clip, s.week.timeFormat, true) : ""}</strong>
        <span className="a-dock-hint">{s.pasteBlocked ? `Last paste blocked: ${s.pasteBlocked}` : "Click any cell to place a copy"}</span>
        <button type="button" onClick={s.togglePaste}>Stop <kbd>Esc</kbd></button>
      </div>
    );
  }
  if (!s.selected.length) return null;
  return (
    <div className="a-dock" data-proto-toolbar>
      <strong>{s.selected.length} selected</strong>
      <button type="button" disabled={s.selected.length !== 1} onClick={() => { const x = s.shiftById(s.selected[0] ?? null); if (x) s.copyShift(x); }}><Copy size={13} /> Copy <kbd>⌃C</kbd></button>
      <button type="button" onClick={() => s.requestDelete()}><Trash2 size={13} /> Delete <kbd>Del</kbd></button>
      {s.selected.length === 1 ? (
        <button type="button" onClick={() => { const x = s.shiftById(s.selected[0] ?? null); if (x) s.openEditor({ mode: "edit", shiftId: x.id, target: { employeeId: x.employeeId, locationId: x.locationId, date: x.date }, anchor: { x: window.innerWidth / 2, y: window.innerHeight / 2 } }); }}><Pencil size={13} /> Edit <kbd>↵</kbd></button>
      ) : null}
      <span className="a-dock-hint">Esc to clear</span>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="a-scroll a-skeleton" aria-busy="true" aria-label="Loading schedule">
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className="a-skel-row" style={{ animationDelay: `${i * 60}ms` }} />
      ))}
    </div>
  );
}
