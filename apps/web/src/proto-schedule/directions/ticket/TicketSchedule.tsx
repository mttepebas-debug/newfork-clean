// Direction C — "Ticket". An editorial page for the week: cream paper, a
// serif masthead, big day numerals, and every shift a kitchen ticket with a
// perforated edge. Tickets lift when dragged and land with a stamp.
import { Plus, X } from "lucide-react";
import type { CSSProperties } from "react";
import type { Column, Row } from "../../engine/derive";
import { cellKey } from "../../engine/derive";
import type { Shift } from "../../engine/model";
import { dayNumberOf, formatHours, formatRange, monthOf, weekdayOf } from "../../engine/model";
import type { Schedule } from "../../engine/useSchedule";
import { CalendarPanel, ContextMenu, Dialogs, FilterPanel, NewSchedulePanel, PersonDrawer, PublishPanel, SettingsPanel, ShiftWindow, Toasts } from "../../shared/Overlays";
import { toneOf } from "../../shared/tone";
import "./ticket.css";

const ROOT = "dir-c";

const isoWeek = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
};

export function TicketSchedule({ s }: { s: Schedule }) {
  return (
    <div className={`${ROOT} c-root`}>
      <main className="c-page" data-proto-page>
        <Masthead s={s} />
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

// ------------------------------------------------------------ masthead

function Masthead({ s }: { s: Schedule }) {
  const week = s.week;
  const first = week?.weekStart ?? s.date;
  const last = s.grid?.dates.at(-1) ?? first;
  const dek =
    s.url.view === "day"
      ? `${new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${s.date}T12:00:00Z`))}, ${monthOf(s.date)} ${dayNumberOf(s.date)}`
      : `${monthOf(first)} ${dayNumberOf(first)} to ${monthOf(last) !== monthOf(first) ? `${monthOf(last)} ` : ""}${dayNumberOf(last)}, ${first.slice(0, 4)}`;
  const kicker = (key: "locations" | "shiftTypes" | "jobs" | "employees", label: string) => (
    <div className="c-pop" data-proto-topmenu={key}>
      <button type="button" className="c-kicker-btn" data-active={s.url[key].length ? true : undefined} aria-expanded={s.topMenu === key} onClick={() => s.setTopMenu(s.topMenu === key ? null : key)}>
        <span>{label}</span> {s.filterSummary(key)}
      </button>
      {s.topMenu === key && week ? <FilterPanel s={s} filter={key} /> : null}
    </div>
  );
  return (
    <header className="c-mast" data-proto-topbar>
      <div className="c-mast-top">
        <span className="c-issue">Meyhouse · The Schedule · Week {isoWeek(first)}</span>
        <div className="c-mast-actions">
          <label className="c-search">
            <input ref={s.searchInput} type="search" placeholder="Search people, jobs, shifts" aria-label="Search the schedule" value={s.searchText} onChange={(e) => s.setSearchText(e.target.value)} onKeyDown={s.searchKeyDown} />
            <kbd>/</kbd>
          </label>
          <div className="c-pop" data-proto-surface-trigger="newSchedule">
            <button type="button" className="c-link" onClick={() => s.setTopSurface(s.topSurface === "newSchedule" ? null : "newSchedule")}>{s.editing ? "Live schedule" : "New schedule"}</button>
            {s.topSurface === "newSchedule" && week ? <NewSchedulePanel s={s} /> : null}
          </div>
          <div className="c-pop" data-proto-surface-trigger="publish">
            <button type="button" className="c-stamp-btn" onClick={() => s.setTopSurface(s.topSurface === "publish" ? null : "publish")}>Publish</button>
            {s.topSurface === "publish" ? <PublishPanel /> : null}
          </div>
        </div>
      </div>
      <div className="c-headline">
        <div className="c-pop" data-proto-topmenu="calendar">
          <h1>
            <button type="button" onClick={s.datePress} aria-label={s.onCurrentPeriod ? "Open calendar" : "Go to today"}>
              {s.url.view === "day" ? <>The <em>day</em></> : <>The <em>week</em></>}
            </button>
          </h1>
          {s.topMenu === "calendar" ? <CalendarPanel s={s} /> : null}
        </div>
        <p className="c-dek">
          {dek}
          {!s.onCurrentPeriod ? (
            <button type="button" className="c-link c-return" onClick={s.datePress}>— return to {s.url.view === "day" ? "today" : "this week"}</button>
          ) : null}
        </p>
        <div className="c-turn">
          <button type="button" className="c-link" aria-label={s.url.view === "day" ? "Previous day" : "Previous week"} onClick={() => s.step(-1)}>← Previous</button>
          <span className="c-tabs" role="group" aria-label="View">
            <button type="button" aria-pressed={s.url.view === "week"} onClick={() => s.setView("week")}>Week</button>
            <button type="button" aria-pressed={s.url.view === "day"} onClick={() => s.setView("day")}>Day</button>
          </span>
          <button type="button" className="c-link" aria-label={s.url.view === "day" ? "Next day" : "Next week"} onClick={() => s.step(1)}>Next →</button>
        </div>
      </div>
      <nav className="c-kickers" aria-label="Filters">
        {kicker("locations", "Where")}
        {kicker("shiftTypes", "Service")}
        {kicker("jobs", "Station")}
        {kicker("employees", "Who")}
        <button type="button" className="c-kicker-btn" data-active={s.url.hideUnscheduled || undefined} onClick={s.toggleHideUnscheduled}>
          <span>Off today</span> {s.url.hideUnscheduled ? "Hidden" : "Shown"}
        </button>
        <div className="c-pop" data-proto-topmenu="settings">
          <button type="button" className="c-kicker-btn" aria-expanded={s.topMenu === "settings"} onClick={() => s.setTopMenu(s.topMenu === "settings" ? null : "settings")}>
            <span>Layout</span> {s.display.sort === "job" ? "By station" : "A–Z"}
          </button>
          {s.topMenu === "settings" ? <SettingsPanel s={s} /> : null}
        </div>
        {s.chips.length ? (
          <span className="c-chips" data-proto-interactive>
            {s.chips.map((c) => (
              <button key={`${c.key}:${c.id}`} type="button" className="c-chip" aria-label={`Remove ${c.label}`} onClick={() => s.removeChip(c.key, c.id)}>
                {c.label} <X size={11} />
              </button>
            ))}
          </span>
        ) : null}
      </nav>
    </header>
  );
}

function EditBar({ s }: { s: Schedule }) {
  return (
    <div className="c-editbar" data-proto-toolbar>
      <span className="c-editbar-stamp">Proof</span>
      <em>You are marking up the live schedule. Nothing leaves this page.</em>
      <span className="c-gap" />
      {s.selected.length ? <button type="button" onClick={() => s.requestDelete()}>Strike {s.selected.length}</button> : null}
      <button type="button" disabled={!s.canUndo} onClick={s.undo}>Undo</button>
      {s.clipboard ? <button type="button" aria-pressed={s.pasteArmed} onClick={s.togglePaste}>Paste mode {s.pasteArmed ? "on" : "off"}</button> : null}
      <button type="button" onClick={s.requestDiscard}>Discard</button>
      <button type="button" className="c-editbar-save" onClick={() => s.toast({ tone: "info", title: "Saving drafts is not part of this prototype" })}>Save draft</button>
    </div>
  );
}

// ------------------------------------------------------------ the page

function Body({ s }: { s: Schedule }) {
  if (s.error) return <div className="c-state">The schedule didn't arrive. <em>{s.error}</em></div>;
  if (!s.week || !s.grid) return <div className="c-state"><em>Setting the type…</em></div>;
  const grid = s.grid;
  if (grid.noLocations) {
    return (
      <div className="c-state">
        No locations match. <button type="button" className="c-link" onClick={() => s.setFilter("locations", [])}>Clear the location filter</button>
      </div>
    );
  }
  const day = s.url.view === "day";
  const colWidth = day ? 280 : 156;
  const totals = Boolean(grid.totals);
  const template = `236px repeat(${grid.columns.length}, minmax(${colWidth}px, 1fr))${totals ? " 70px" : ""}`;
  const style = { "--c-cols": template, width: `max(100%, ${236 + grid.columns.length * colWidth + (totals ? 70 : 0)}px)` } as CSSProperties;
  return (
    <div className="c-scroll" ref={(el) => { s.scrollerRef.current = el; }} data-proto-grid data-drag={s.drag ? true : undefined}>
      <div className="c-grid" role="grid" style={style}>
        <div className="c-row c-band">
          <div className="c-corner">
            <span className="c-folio">{grid.rows.filter((r) => r.kind === "person").length} on the roll</span>
          </div>
          {grid.groups.map((g) => (
            <div key={g.id} className="c-location" style={{ gridColumn: `span ${g.columns.length}` }} {...s.locationHeaderProps(g)}>
              <span className="c-location-name"><span className="c-kick">Location</span> {g.name}</span>
            </div>
          ))}
          {totals ? <div className="c-total-head">Hours</div> : null}
        </div>
        <div className="c-row c-days">
          <div className="c-corner" />
          {grid.columns.map((c) => <DayHeader key={c.key} s={s} column={c} />)}
          {totals ? <div className="c-total-head" /> : null}
        </div>
        {grid.rows.map((row) => <GridRow key={row.key} s={s} row={row} totals={totals} />)}
        {totals && grid.totals ? (
          <div className="c-row c-total-row">
            <div className="c-person"><em>In total</em></div>
            {grid.columns.map((c) => <div key={c.key} className="c-total-cell">{formatHours(grid.totals!.byDate.get(c.date) ?? 0)}</div>)}
            <div className="c-total-cell"><strong>{formatHours(grid.totals.week)}</strong></div>
          </div>
        ) : null}
        <div className="c-filler" data-proto-gridbg />
      </div>
      {grid.searchEmpty ? (
        <div className="c-state c-state-float">
          <p>No one matches <em>“{grid.searchEmpty.term}”</em>.</p>
          {grid.searchEmpty.outside ? <p className="c-small">Someone matches outside your filters.</p> : null}
          <p>
            <button type="button" className="c-link" onClick={s.clearSearch}>Clear search</button>
            {grid.searchEmpty.outside ? <> · <button type="button" className="c-link" onClick={s.showAllFilters}>Show all filters</button></> : null}
          </p>
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
    <div className="c-day" data-today={column.date === s.today || undefined} data-closed={closed || undefined} data-first={column.dayIndex === 0 || undefined} aria-label={`View ${weekdayOf(column.date)} ${monthOf(column.date)} ${dayNumberOf(column.date)}`} {...s.dayHeaderProps(column)}>
      <span className="c-dow">{weekdayOf(column.date)}</span>
      <span className="c-dnum">{dayNumberOf(column.date)}</span>
      {closed ? <span className="c-closed-stamp">Closed</span> : null}
      {titles.length ? <span className="c-post" title={titles.join("\n")}><em>{titles[0]}</em>{titles.length > 1 ? ` +${titles.length - 1}` : ""}</span> : null}
    </div>
  );
}

function GridRow({ s, row, totals }: { s: Schedule; row: Row; totals: boolean }) {
  const grid = s.grid!;
  if (row.kind === "group") {
    return (
      <div className="c-row c-group">
        <div className="c-group-label"><span className="c-kick">Station</span> {row.label}</div>
      </div>
    );
  }
  const person = row.kind === "person" ? row.employee : null;
  const minutes = person && grid.totals ? (grid.totals.byEmployee.get(person.id) ?? 0) : null;
  return (
    <div className="c-row" data-open={row.kind === "open" || undefined}>
      <div className="c-person">
        {person ? (
          <>
            <button className="c-name" {...s.nameProps(person)}>{person.name}</button>
            <em className="c-role">{s.jobOf(s.scheduleJobOf(person))?.name ?? "No station"}</em>
          </>
        ) : (
          <>
            <strong className="c-name">Open tickets</strong>
            <em className="c-role">Waiting for a name</em>
          </>
        )}
      </div>
      {grid.columns.map((c) => <Cell key={c.key} s={s} row={row} column={c} />)}
      {totals ? <div className="c-total-cell">{minutes !== null ? formatHours(minutes) : ""}</div> : null}
    </div>
  );
}

function Cell({ s, row, column }: { s: Schedule; row: Row; column: Column }) {
  const items = s.grid!.cells.get(cellKey(row.key, column.key)) ?? [];
  return (
    <div className="c-cell" role="gridcell" data-first={column.dayIndex === 0 || undefined} data-today={column.date === s.today || undefined} data-armed={s.pasteArmed || undefined} {...s.cellProps(row, column)}>
      {items.map((item) =>
        item.ghost ? (
          <div key={item.id} className="c-ghost" title={`${item.title} at ${item.locationName}`}>
            <em>at {item.locationName}</em>
            {s.week && item.start ? <span>{formatRange(item, s.week.timeFormat, true)}</span> : null}
          </div>
        ) : (
          <Ticket key={item.shift.id} s={s} shift={item.shift} mark={item.mark} />
        ),
      )}
      {s.editing ? (
        <button className="c-add" {...s.addProps(row, column)}>
          <Plus size={12} /> <em>{s.pasteArmed ? "paste here" : "new ticket"}</em>
        </button>
      ) : null}
    </div>
  );
}

function Ticket({ s, shift, mark, preview }: { s: Schedule; shift: Shift; mark?: "match" | "dim" | null; preview?: boolean }) {
  const week = s.week!;
  const type = s.typeOf(shift.shiftTypeId);
  const job = s.jobOf(shift.jobId);
  const props = preview ? {} : s.cardProps(shift);
  const time = s.display.showClock && !shift.hideTime ? formatRange(shift, week.timeFormat, true) : null;
  return (
    <div className="c-ticket" data-tone={toneOf(week, shift)} data-mark={mark ?? undefined} {...props}>
      <span className="c-ticket-kick">
        {s.display.showType && type ? type.name : "Shift"}
        {s.editing && !preview ? (shift.origin === "new" || shift.edited ? <b className="c-new">new</b> : null) : null}
      </span>
      <span className="c-ticket-job">{job?.name}</span>
      {time ? <span className="c-ticket-time">{time}</span> : null}
      {s.display.showLabels && shift.labels.length ? <span className="c-ticket-labels">{shift.labels.join(" · ")}</span> : null}
      {shift.note ? <span className="c-ticket-note" title={shift.note}>note</span> : null}
    </div>
  );
}

function DragGhost({ s }: { s: Schedule }) {
  const drag = s.drag!;
  const shift = s.shiftById(drag.shiftId);
  if (!shift) return null;
  const a = drag.assessment;
  return (
    <div className="dir-c">
      <div className="c-drag" data-proto-layer style={{ left: drag.x - drag.offsetX, top: drag.y - drag.offsetY, width: drag.width }}>
        <Ticket s={s} shift={shift} preview />
        {drag.copy || (a && a.status !== "allowed") ? (
          <div className="c-drag-stamps">
            {drag.copy ? <span>Duplicate</span> : null}
            {a && a.status !== "allowed" ? <span data-status={a.status}>{a.reason}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Dock({ s }: { s: Schedule }) {
  if (!s.editing) return null;
  if (s.pasteArmed && s.clipboard) {
    return (
      <div className="c-dock" data-proto-toolbar>
        <span className="c-dock-stamp">Paste</span>
        <span><em>{s.titleOf(s.clipboard)}</em>, {s.week ? formatRange(s.clipboard, s.week.timeFormat, true) : ""}</span>
        <span className="c-small">{s.pasteBlocked ? `Last one blocked: ${s.pasteBlocked}` : "Click any cell to pin a copy."}</span>
        <button type="button" className="c-link" onClick={s.togglePaste}>Stop · Esc</button>
      </div>
    );
  }
  if (!s.selected.length) return null;
  return (
    <div className="c-dock" data-proto-toolbar>
      <span className="c-dock-stamp">{s.selected.length}</span>
      <span><em>ticket{s.selected.length === 1 ? "" : "s"} in hand</em></span>
      <button type="button" className="c-link" disabled={s.selected.length !== 1} onClick={() => { const x = s.shiftById(s.selected[0] ?? null); if (x) s.copyShift(x); }}>Copy</button>
      <button type="button" className="c-link" onClick={() => s.requestDelete()}>Strike</button>
      <span className="c-small">Esc to let go</span>
    </div>
  );
}
