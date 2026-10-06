// The Schedule screen's parts, drawn as in apps/web/src/schedule (toolbar,
// location and day headers, rows, shift cards). Compose them freely; every
// part passes extra attributes through, so scenes can add data-at /
// data-until and style variables.

import { type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { SHIFT_TYPES, type ShiftTypeName } from "./data";
import { Icon } from "./icons";

type Div = HTMLAttributes<HTMLDivElement>;

function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

export type ShiftState = "live" | "edited" | "staged";

type ShiftCardProps = Div & {
  readonly type: ShiftTypeName;
  readonly job: string;
  readonly time: string;
  readonly labels?: string;
  /** Merged layout shows the location on the card. */
  readonly location?: string;
  readonly state?: ShiftState;
  /** Manager note (blue corner). */
  readonly note?: boolean;
  /** Clashes with the person's availability (orange "!"). */
  readonly unavailable?: boolean;
  /** Same person, another location: gray hatched, not editable. */
  readonly ghost?: string;
  /** Stacked identical open shifts. */
  readonly count?: number;
  readonly overlap?: boolean;
  readonly selected?: boolean;
  readonly lifted?: boolean;
};

const STATE_MARKER = {
  live: { icon: "Check", label: "Live - published to employees" },
  edited: { icon: "Pencil", label: "Edited - updates the live shift on next publish" },
  staged: { icon: "CloudOff", label: "Staged for removal" },
} as const;

export function ShiftCard({
  type,
  job,
  time,
  labels,
  location,
  state,
  note,
  unavailable,
  ghost,
  count,
  overlap,
  selected,
  lifted,
  className,
  style,
  ...rest
}: ShiftCardProps) {
  const marker = state ? STATE_MARKER[state] : null;
  return (
    <div
      className={cx(
        "shift",
        state === "edited" && "shift--edited",
        state === "staged" && "shift--staged",
        note && "shift--note",
        ghost && "shift--ghost",
        overlap && "shift--overlap",
        selected && "shift--selected",
        lifted && "shift--lifted",
        className,
      )}
      style={{ "--type": SHIFT_TYPES[type], ...style } as CSSProperties}
      title={ghost ? `Also scheduled at ${ghost}` : marker?.label}
      {...rest}
    >
      <span className="shift__title">
        {type}-{job}
      </span>
      {labels ? <span className="shift__labels">{labels}</span> : null}
      <span className="shift__time">{time}</span>
      {location ? <span className="shift__location">{location}</span> : null}
      {ghost ? (
        <Icon name="MapPin" className="shift__marker" />
      ) : marker ? (
        <Icon name={marker.icon} className="shift__marker" />
      ) : null}
      {count ? <span className="shift__count">x{count}</span> : null}
      {unavailable ? <span className="sched-flag">!</span> : null}
    </div>
  );
}

export function AvailabilityFlag(props: Div) {
  return (
    <span className="sched-flag" title="Marked unavailable" {...props}>
      !
    </span>
  );
}

type PublishState = "none" | "partial" | "all";

type ToolbarProps = {
  readonly week: string;
  readonly draftName?: string;
  readonly publish?: PublishState;
  /** Extra content on the right (e.g. layered publish states for scenes). */
  readonly publishSlot?: ReactNode;
  readonly compact?: boolean;
};

export function PublishButton({ state = "none", ...rest }: Div & { readonly state?: PublishState }) {
  return (
    <span
      className={cx(
        "sched-control",
        state === "none" && "sched-control--black",
        state === "partial" && "sched-control--partial",
        state === "all" && "sched-control--published",
      )}
      {...rest}
    >
      <Icon name={state === "all" ? "Check" : "Send"} />
      {state === "all" ? "Published" : "Publish"}
      {state === "all" ? <Icon name="ChevronDown" /> : null}
    </span>
  );
}

export function ScheduleToolbar({ week, draftName, publish = "none", publishSlot, compact }: ToolbarProps) {
  return (
    <div className="sched-toolbar" aria-hidden="true">
      <span className="sched-control sched-control--icon">
        <Icon name="ChevronLeft" />
      </span>
      <span className="sched-control">
        <Icon name="Calendar" />
        {week}
      </span>
      <span className="sched-control sched-control--icon">
        <Icon name="ChevronRight" />
      </span>
      {compact ? null : (
        <>
          <span className="sched-control">
            <Icon name="SlidersHorizontal" />
            Settings
          </span>
          <span className="sched-control">
            <Icon name="MapPin" />
            All locations - Separate
          </span>
          <span className="sched-control">
            <Icon name="Briefcase" />
            All jobs
          </span>
        </>
      )}
      <span className="sched-toolbar__spacer" />
      {compact ? null : (
        <>
          <span className="sched-control sched-control--black">
            <Icon name="FileDown" />
            Export
          </span>
          <span className="sched-control sched-control--black">
            <Icon name="LayoutTemplate" />
            Templates
          </span>
        </>
      )}
      <span className="sched-control sched-control--black">
        {draftName ?? "New Schedule"}
        <Icon name="ChevronDown" />
      </span>
      {publishSlot ?? <PublishButton state={publish} />}
    </div>
  );
}

export function ScheduleEditBar({ label, children }: { readonly label?: ReactNode; readonly children?: ReactNode }) {
  return (
    <div className="sched-editbar" aria-hidden="true">
      {label ? <span className="sched-editbar__label">{label}</span> : null}
      {children ?? (
        <>
          <span className="sched-editbar__btn">
            <Icon name="Undo2" />
            Undo
          </span>
          <span className="sched-editbar__btn">
            <Icon name="Eye" />
            Availability on
          </span>
          <span className="sched-editbar__btn">
            <Icon name="WandSparkles" />
            Auto-fill
          </span>
          <span className="sched-editbar__btn">
            <Icon name="X" />
            Discard
          </span>
        </>
      )}
    </div>
  );
}

type GridProps = Div & {
  /** Number of day columns after the name column. */
  readonly cols: number;
  readonly nameWidth?: number;
};

export function ScheduleGrid({ cols, nameWidth, className, style, children, ...rest }: GridProps) {
  return (
    <div
      className={cx("sched-grid", className)}
      style={
        {
          "--cols": cols,
          ...(nameWidth ? { "--name-col": `calc(${nameWidth} * var(--u))` } : null),
          ...style,
        } as CSSProperties
      }
      {...rest}
    >
      {children}
    </div>
  );
}

export function GridCorner({ children, ...rest }: Div) {
  return (
    <div className="sched-corner" {...rest}>
      {children ?? "Employees"}
    </div>
  );
}

type LocationHeaderProps = Div & {
  readonly name: string;
  readonly span: number;
  readonly status?: "unpublished" | "live" | "deadline";
  readonly boundary?: boolean;
  readonly note?: ReactNode;
};

export function LocationHeader({ name, span, status = "unpublished", boundary, note, className, style, ...rest }: LocationHeaderProps) {
  return (
    <div
      className={cx("sched-location", boundary && "sched-boundary", className)}
      style={{ "--span": span, ...style } as CSSProperties}
      {...rest}
    >
      <span
        className={cx(
          "sched-status-dot",
          status === "live" && "sched-status-dot--live",
          status === "deadline" && "sched-status-dot--deadline",
        )}
        title={status === "live" ? "Published - Live" : status === "deadline" ? "Deadline approaching" : "Unpublished"}
      />
      {name}
      {note ? <span className="sched-location__state">{note}</span> : null}
    </div>
  );
}

type DayHeaderProps = Div & {
  readonly name: string;
  readonly date: number;
  readonly today?: boolean;
  readonly closed?: boolean;
  readonly important?: boolean;
  readonly boundary?: boolean;
};

export function DayHeader({ name, date, today, closed, important, boundary, className, ...rest }: DayHeaderProps) {
  return (
    <div
      className={cx(
        "sched-day",
        today && "sched-day--today",
        closed && "sched-day--closed",
        important && "sched-day--important",
        boundary && "sched-boundary",
        className,
      )}
      {...rest}
    >
      <span className="sched-day__name">
        {closed ? <Icon name="Lock" /> : important ? <Icon name="CalendarDays" /> : null}
        {name}
      </span>
      <span className="sched-day__date">{date}</span>
    </div>
  );
}

type NameCellProps = Div & {
  readonly name: ReactNode;
  readonly sub?: ReactNode;
  readonly unassigned?: boolean;
  readonly unavailable?: boolean;
};

export function NameCell({ name, sub, unassigned, unavailable, className, ...rest }: NameCellProps) {
  return (
    <div className={cx("sched-name", unassigned && "sched-name--unassigned", className)} {...rest}>
      <span style={{ minWidth: 0 }}>
        {name}
        {sub ? <small>{sub}</small> : null}
      </span>
      {unavailable ? <span className="sched-flag" style={{ position: "static" }}>!</span> : null}
    </div>
  );
}

export type CellKind = "default" | "unassigned" | "time-off" | "closed" | "allowed" | "warning" | "blocked" | "editing";

type CellProps = Div & {
  readonly kind?: CellKind;
  readonly boundary?: boolean;
};

export function Cell({ kind = "default", boundary, className, children, ...rest }: CellProps) {
  return (
    <div
      className={cx(
        "sched-cell",
        kind !== "default" && `sched-cell--${kind}`,
        boundary && "sched-boundary",
        className,
      )}
      {...rest}
    >
      {kind === "time-off" && children === undefined ? "Time off" : children}
    </div>
  );
}

export function AddShiftButton(props: Div) {
  return (
    <span className="sched-add" {...props}>
      <Icon name="Plus" />
      Add shift
    </span>
  );
}

export function SeparatorRow({ label, color, ...rest }: Div & { readonly label: string; readonly color: string }) {
  return (
    <div className="sched-separator" {...rest}>
      <i style={{ "--dot": color } as CSSProperties} />
      {label}
    </div>
  );
}
