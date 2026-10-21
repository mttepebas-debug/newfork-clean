import type {
  ScheduleEditableShift,
  ScheduleReadModel,
  ScheduleShift,
} from "@newfork/shared/schedule";
import { LoaderCircle, MapPin } from "lucide-react";
import type {
  CSSProperties,
  MouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useEffect, useId, useRef } from "react";

import {
  formatAvailabilityWarning,
  formatScheduleBadgeAriaLabel,
  formatScheduleShiftWarningAria,
} from "../badgeAccessibility";
import { Tooltip } from "../../shell/Tooltip";
import {
  formatAvailabilityMarkLine,
  windowsDuringShift,
  type ScheduleAvailabilityMark,
} from "../lib/scheduleAvailabilityMark";
import { AvailabilityMarkButton } from "./AvailabilityMarkButton";
import type { TimeFormat } from "../timeInput";
import type { ScheduleShiftTypeLook } from "../lib/scheduleCatalogNames";
import type { ShiftPublicationState } from "./ScheduleContextMenu";
import type { EffectiveScheduleShift } from "../hooks/useEffectiveShifts";
import type { ScheduleSearchMark } from "../lib/scheduleSearch";
import "./schedule-shift-save.css";
import { useShiftNoteCorner } from "./ShiftNoteCorner";
import { useFirstLineMid } from "../hooks/useFirstLineMid";
import {
  SHIFT_CARD_MARK,
  SHIFT_CARD_STACK_REACH,
  shiftCardFirstLineEdges,
  shiftCardSideRoom,
} from "../lib/shiftCardRoom";

const SINGLE_CLICK_FOCUS_DELAY_MS = 250;

export function formatShiftLabelDisplay(labelNames: readonly string[]): {
  readonly fullText: string;
  readonly displayText: string;
} {
  const labels = labelNames.map((label) => label.trim()).filter(Boolean);
  const fullText = labels.join(" · ");
  return { fullText, displayText: fullText };
}

export function ShiftCard({
  shift,
  job,
  type,
  locationName,
  employeeName = null,
  availabilityMark = null,
  editing = false,
  showShiftType,
  showShiftLabels,
  showClockTimes,
  timeFormat = "12h",
  showJobColorDot: _showJobColorDot,
  selected = false,
  focused = false,
  stackCount = 1,
  rowKey,
  badgeHeight,
  searchMark,
  dragging,
  publicationState,
  onSelect,
  onFocus,
  onEdit,
  onCopy,
  onContextMenu,
  onPointerDown,
  onMouseDown,
}: {
  readonly shift: ScheduleShift & Pick<EffectiveScheduleShift, "optimistic" | "saving_state">;
  readonly job: string;
  readonly type: ScheduleShiftTypeLook | undefined;
  readonly locationName?: string | null;
  /** The row's person, named in the availability warning. */
  readonly employeeName?: string | null;
  /** The cell's availability (G14): the hours behind the card's "!". */
  readonly availabilityMark?: ScheduleAvailabilityMark | null;
  readonly editing?: boolean;
  readonly showShiftType: boolean;
  readonly showShiftLabels: boolean;
  readonly showClockTimes: boolean;
  readonly timeFormat?: TimeFormat;
  readonly showJobColorDot: boolean;
  readonly selected?: boolean;
  readonly focused?: boolean;
  readonly stackCount?: number;
  readonly rowKey: string;
  readonly badgeHeight: number;
  /** Framed or faded by the top bar search (S-228). */
  readonly searchMark?: ScheduleSearchMark;
  readonly dragging?: boolean;
  readonly publicationState: ShiftPublicationState | null;
  readonly onSelect?: (id: string, additive: boolean) => void;
  readonly onFocus?: (shift: ScheduleShift) => void;
  readonly onEdit?: (
    shift: ScheduleEditableShift,
    point?: { readonly x: number; readonly y: number },
  ) => void;
  readonly onCopy?: (shift: ScheduleEditableShift) => void;
  readonly onContextMenu?: (
    shift: ScheduleEditableShift,
    event: MouseEvent<HTMLElement>,
  ) => void;
  readonly onPointerDown?: (
    shiftId: string,
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
  readonly onMouseDown?: (
    shiftId: string,
    event: MouseEvent<HTMLElement>,
  ) => void;
}) {
  const title = formatScheduleShiftBadgeTitle(type, job, showShiftType);
  const showClockRow = showClockTimes && !shift.hide_time_on_badge;
  const timeText = formatScheduleBadgeTimeRange(
    shift.start_time,
    shift.end_time,
    timeFormat,
  );
  const labelText = formatShiftLabelDisplay(shift.label_names ?? []);
  const warningText = formatScheduleShiftWarningAria(shift.warning_codes, employeeName);
  const availabilityWarning = shift.warning_codes.includes("availability")
    ? formatAvailabilityWarning(employeeName)
    : null;
  // Publication marks while editing (Mert, 2026-10-12): a live shift says
  // LIVE top right, and its "!" moves to the row's name cell (ScheduleRow); an
  // edited live shift says NEW like a new one, with no stripe or pencil; a
  // shift staged for removal carries no icon. Saving is a spinner top right.
  const showLiveMark = editing && publicationState === "locked";
  const showAvailabilityCorner = Boolean(availabilityWarning) && !showLiveMark;
  const showNewMark = editing && !shift.optimistic &&
    (!publicationState || publicationState === "unlocked-modified");
  const showSpinner = Boolean(shift.saving_state);
  const note = shift.note.trim();
  const noteReach = note ? SHIFT_CARD_MARK.note : 0;
  const topMarks = [
    ...(showAvailabilityCorner ? [SHIFT_CARD_MARK.availability] : []),
    ...(showLiveMark ? [SHIFT_CARD_MARK.live] : []),
    ...(showSpinner ? [SHIFT_CARD_MARK.spinner] : []),
  ];
  const sideRoom = shiftCardSideRoom({
    // While editing, every card keeps room for the saving spinner.
    top: topMarks.length ? topMarks : editing ? [SHIFT_CARD_MARK.spinner] : [],
    bottom: showNewMark ? SHIFT_CARD_MARK.newLabel : 0,
    stack: stackCount > 1,
    note: noteReach,
  });
  // The marks beside the first line: the note and "x2" on the left, the
  // top-right row on the right.
  const firstLine = shiftCardFirstLineEdges({
    left: [noteReach, stackCount > 1 ? SHIFT_CARD_STACK_REACH : 0],
    right: topMarks,
  });
  const badgeRef = useRef<HTMLButtonElement>(null);
  useFirstLineMid(badgeRef);
  const availabilityDescriptionId = useId();
  // The card's "!" window says the hours this shift runs into (KARARLAR Schedule, 2026-10-06).
  const availabilityLines = availabilityWarning && availabilityMark?.kind === "unavailable"
    ? windowsDuringShift(availabilityMark.windows, shift.start_time, shift.end_time)
        .map((window) => formatAvailabilityMarkLine(shift.scheduled_date, window, timeFormat))
        // M11: a mark that came after the first publish says so.
        .concat(shift.availability_changed_after_publish ? ["Changed after publishing"] : [])
    : [];
  // The manager's note (BL-199): a paperclip in the top left, the note on a
  // mouse hover of it, and the text as the card's description for screen readers.
  const noteDescriptionId = useId();
  const noteCorner = useShiftNoteCorner(note, Boolean(dragging));
  const modifierSelectionHandledRef = useRef(false);
  const pendingSingleClickRef = useRef<number | null>(null);
  const cancelPendingSingleClick = () => {
    if (pendingSingleClickRef.current === null) return;
    window.clearTimeout(pendingSingleClickRef.current);
    pendingSingleClickRef.current = null;
  };
  useEffect(
    () => () => {
      if (pendingSingleClickRef.current !== null) {
        window.clearTimeout(pendingSingleClickRef.current);
      }
    },
    [],
  );
  const handleModifierSelectionStart = (
    event: ReactPointerEvent<HTMLElement> | MouseEvent<HTMLElement>,
    phase: "pointer" | "mouse",
  ) => {
    if (!editing || !(event.shiftKey || event.ctrlKey || event.metaKey)) {
      return false;
    }
    if (phase === "pointer" || !modifierSelectionHandledRef.current) {
      modifierSelectionHandledRef.current = true;
      onSelect?.(shift.id, true);
    }
    event.preventDefault();
    event.stopPropagation();
    return true;
  };

  return (
    <>
    <button
      ref={badgeRef}
      type="button"
      className="schedule-shift-badge"
      style={
        {
          "--shift-color": type?.color ?? "#54736a",
          "--schedule-row-badge-height": `${badgeHeight}px`,
          "--shift-card-side": `${sideRoom}px`,
          "--shift-card-line1-left": `${firstLine.left}px`,
          "--shift-card-line1-right": `${firstLine.right}px`,
        } as CSSProperties
      }
      aria-label={formatScheduleBadgeAriaLabel({
        title: stackCount > 1 ? `${title}, ${stackCount} open shifts` : title,
        labelText: showShiftLabels ? labelText.fullText : "",
        timeText: showClockRow ? timeText : "",
        locationText: locationName ?? "",
        warningText,
      }) + (note ? ", has a manager note" : "")}
      aria-describedby={
        [note ? noteDescriptionId : null, availabilityWarning ? availabilityDescriptionId : null]
          .filter(Boolean)
          .join(" ") || undefined
      }
      data-has-note={note ? "true" : undefined}
      data-shift-badge="true"
      data-shift-id={shift.id}
      data-search-mark={searchMark}
      disabled={shift.optimistic}
      aria-busy={shift.optimistic || undefined}
      data-save-state={shift.saving_state ?? undefined}
      data-schedule-row-key={rowKey}
      data-selected={selected}
      data-dragging={dragging}
      data-job-color-dot={false}
      data-shift-labels-visible={showShiftLabels}
      data-publication-state={publicationState ?? undefined}
      // A narrow week while editing: the top marks keep a row of their own
      // above the words on every card (LIVE does not fit beside a name), NEW
      // one below (styles.css, data-card-band).
      data-mark-row={editing ? "true" : undefined}
      data-new-row={showNewMark ? "true" : undefined}
      data-availability-warning={availabilityWarning ? "true" : undefined}
      data-focused={focused}
      data-current={focused}
      data-stack-count={stackCount > 1 ? stackCount : undefined}
      aria-pressed={selected}
      onPointerEnter={noteCorner.badgeHandlers.onPointerEnter}
      onPointerLeave={noteCorner.badgeHandlers.onPointerLeave}
      onPointerDown={(event) => {
        if (!handleModifierSelectionStart(event, "pointer")) modifierSelectionHandledRef.current = false;
        onPointerDown?.(shift.id, event);
      }}
      onMouseDown={(event) => {
        if (!handleModifierSelectionStart(event, "mouse")) modifierSelectionHandledRef.current = false;
        onMouseDown?.(shift.id, event);
      }}
      onClick={(event) => {
        // BL-610: the drag start cancels the press, so the browser does not
        // move focus here; take it, so Enter and Ctrl+C reach this card.
        // Taken by the mouse: no keyboard ring (the browser would draw one,
        // having seen no press); Tab back to it draws it again.
        if (editing && event.currentTarget.dataset.mouseFocus !== "true") {
          const card = event.currentTarget;
          card.dataset.mouseFocus = "true";
          card.addEventListener("blur", () => delete card.dataset.mouseFocus, { once: true });
          if (document.activeElement !== card) card.focus({ preventScroll: true });
        }
        if (modifierSelectionHandledRef.current) {
          modifierSelectionHandledRef.current = false;
          cancelPendingSingleClick();
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (editing && event.detail > 1) {
          cancelPendingSingleClick();
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (event.shiftKey || event.ctrlKey || event.metaKey) {
          if (!editing) return;
          cancelPendingSingleClick();
          event.preventDefault();
          event.stopPropagation();
          onSelect?.(shift.id, true);
          return;
        }
        if (!editing) {
          onFocus?.(shift);
          return;
        }
        cancelPendingSingleClick();
        pendingSingleClickRef.current = window.setTimeout(() => {
          pendingSingleClickRef.current = null;
          onFocus?.(shift);
        }, SINGLE_CLICK_FOCUS_DELAY_MS);
      }}
      onDoubleClick={(event) => {
        cancelPendingSingleClick();
        event.preventDefault();
        event.stopPropagation();
        if (editing) {
          onEdit?.(shift as ScheduleEditableShift, {
            x: event.clientX,
            y: event.clientY,
          });
        }
      }}
      onKeyDown={(event) => {
        if (!editing) return;
        if (event.key === "Enter") {
          cancelPendingSingleClick();
          onEdit?.(shift as ScheduleEditableShift);
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
          event.preventDefault();
          event.stopPropagation();
          onCopy?.(shift as ScheduleEditableShift);
        }
      }}
      onContextMenu={(event) => {
        if (!editing) return;
        onContextMenu?.(shift as ScheduleEditableShift, event);
      }}
    >
      {selected || focused ? (
        <span
          className="schedule-shift-selection-ring"
          data-shift-selection-ring="true"
          data-multi-selected={selected}
          data-current={focused}
          aria-hidden="true"
        />
      ) : null}
      {note ? (
        <span id={noteDescriptionId} className="sr-only">
          {note}
        </span>
      ) : null}
      {availabilityWarning ? (
        <span id={availabilityDescriptionId} className="sr-only">
          {[availabilityWarning, ...availabilityLines].join(" ")}
        </span>
      ) : null}
      {noteCorner.corner}
      {showNewMark ? (
        <span
          className="schedule-shift-new-mark"
          title={
            publicationState === "unlocked-modified"
              ? "Edited - updates the live shift on next publish"
              : "Not published yet - goes live on next publish"
          }
        >
          New
        </span>
      ) : null}
      {topMarks.length ? (
        <span className="schedule-shift-badge-markers">
          {showAvailabilityCorner ? (
            <AvailabilityMarkButton
              insideButton
              className="schedule-availability-mark-card"
              label={`${employeeName ?? "This person"}: unavailable during this shift`}
              lines={availabilityLines.length ? availabilityLines : [availabilityWarning ?? ""]}
            />
          ) : null}
          {showLiveMark ? (
            <span className="schedule-shift-live-mark" title="Live - published to employees">
              Live
            </span>
          ) : null}
          {showSpinner ? (
            <span
              className="schedule-shift-save-spinner"
              role="status"
              data-delayed={shift.saving_state === "delayed" || undefined}
              title={shift.saving_state === "delayed" ? "Still saving. Wait for the result before trying again." : "Saving"}
            >
              <LoaderCircle size={12} strokeWidth={2.6} aria-hidden="true" />
              <span className="sr-only">
                {shift.saving_state === "delayed" ? "Still saving, please wait" : "Saving"}
              </span>
            </span>
          ) : null}
        </span>
      ) : null}
      {stackCount > 1 ? (
        <span className="schedule-shift-stack-count" aria-hidden="true">
          x{stackCount}
        </span>
      ) : null}
      <span
        className="schedule-shift-badge-content"
        data-shift-badge-content="true"
      >
        {/* A narrow day cuts these lines; hover shows them whole (QA 50). */}
        <strong title={title}>{title}</strong>
        {locationName ? (
          <span
            className="schedule-shift-location"
            data-shift-badge-location="true"
            title={locationName}
          >
            {locationName}
          </span>
        ) : null}
        {showShiftLabels && labelText.displayText ? (
          <span className="schedule-shift-labels" title={labelText.fullText}>
            {labelText.displayText}
          </span>
        ) : null}
        {showClockRow ? (
          <span className="schedule-shift-time">
            {timeText}
            {shift.crosses_midnight ? " +1" : ""}
          </span>
        ) : null}
      </span>
    </button>
    {noteCorner.card}
    </>
  );
}

export function GhostShiftCard({
  shift,
  job,
  type,
  locationName,
  showShiftType,
  showShiftLabels,
  showClockTimes,
  timeFormat = "12h",
  showJobColorDot: _showJobColorDot,
  rowKey,
  badgeHeight,
  employeeName = null,
}: {
  readonly shift: ScheduleShift;
  readonly job: string;
  readonly type: ScheduleShiftTypeLook | undefined;
  readonly locationName?: string | null;
  readonly employeeName?: string | null;
  readonly showShiftType: boolean;
  readonly showShiftLabels: boolean;
  readonly showClockTimes: boolean;
  readonly timeFormat?: TimeFormat;
  readonly showJobColorDot: boolean;
  readonly rowKey: string;
  readonly badgeHeight: number;
}) {
  const sourceLocation = ghostShiftLocation(shift);
  const displayedLocation = locationName ?? sourceLocation;
  // An out-of-scope ghost carries its own job and type names; the lists may not have them.
  const metadata = shift as ScheduleShift & GhostShiftMetadata;
  const carriedTypeName = metadata.ghost_shift_type_name?.trim();
  const title = formatScheduleShiftBadgeTitle(
    carriedTypeName ? { name: carriedTypeName } : type,
    metadata.ghost_job_name?.trim() || job,
    showShiftType,
  );
  const showClockRow = showClockTimes && !shift.hide_time_on_badge;
  const timeText = formatScheduleBadgeTimeRange(
    shift.start_time,
    shift.end_time,
    timeFormat,
  );
  const labelText = formatShiftLabelDisplay(shift.label_names ?? []);
  const warningText = formatScheduleShiftWarningAria(shift.warning_codes, employeeName);
  const otherLocationText = sourceLocation
    ? `also scheduled at ${sourceLocation}`
    : displayedLocation
      ? `also scheduled at ${displayedLocation}`
      : "";
  // The real card at half strength in its own type color (Mert, 2026-10-13);
  // the place sits behind a pin, not on a line, and the words keep clear of it.
  const pin = displayedLocation ? [SHIFT_CARD_MARK.pin] : [];
  const firstLine = shiftCardFirstLineEdges({ right: pin });
  const badgeRef = useRef<HTMLElement>(null);
  useFirstLineMid(badgeRef);
  return (
    <article
      ref={badgeRef}
      className="schedule-shift-badge"
      style={
        {
          "--shift-color": type?.color ?? "#54736a",
          "--schedule-row-badge-height": `${badgeHeight}px`,
          "--shift-card-side": `${shiftCardSideRoom({ top: pin })}px`,
          "--shift-card-line1-left": "0px",
          "--shift-card-line1-right": `${firstLine.right}px`,
        } as CSSProperties
      }
      aria-label={formatScheduleBadgeAriaLabel({
        title,
        labelText: showShiftLabels ? labelText.fullText : "",
        timeText: showClockRow ? timeText : "",
        locationText: otherLocationText,
        warningText,
      })}
      data-testid="ghost-shift-badge"
      data-shift-badge="true"
      data-shift-id={shift.id}
      data-schedule-row-key={rowKey}
      data-ghost="true"
      data-job-color-dot={false}
      data-shift-labels-visible={showShiftLabels}
      // The pin's own row only in a narrow week while editing (styles.css).
      data-mark-row={displayedLocation ? "true" : undefined}
    >
      {displayedLocation ? (
        <span className="schedule-shift-badge-markers">
          <Tooltip
            label={`Location: ${displayedLocation}`}
            content={displayedLocation}
            className="schedule-ghost-location"
          >
            {/* Bigger than the other corner icons (Mert, 2026-10-12 and 2026-10-13). */}
            <MapPin size={SHIFT_CARD_MARK.pin} strokeWidth={2.2} aria-hidden="true" />
          </Tooltip>
        </span>
      ) : null}
      <span
        className="schedule-shift-badge-content"
        data-shift-badge-content="true"
      >
        <strong title={title}>{title}</strong>
        {showShiftLabels && labelText.displayText ? (
          <span className="schedule-shift-labels" title={labelText.fullText}>
            {labelText.displayText}
          </span>
        ) : null}
        {showClockRow ? (
          <span className="schedule-shift-time">
            {timeText}
            {shift.crosses_midnight ? " +1" : ""}
          </span>
        ) : null}
      </span>
    </article>
  );
}

export function formatScheduleShiftBadgeTitle(
  type: Pick<ScheduleReadModel["shift_types"][number], "name"> | undefined,
  job: string,
  showShiftType = true,
): string {
  if (!showShiftType) return job;
  return type ? `${type.name}-${job}` : job;
}

export function formatScheduleBadgeTime(
  value: string,
  timeFormat: TimeFormat = "12h",
): string {
  const [hour, minute] = value.split(":").map(Number);
  const normalizedHour = hour ?? 0;
  const normalizedMinute = minute ?? 0;
  if (timeFormat === "24h") {
    return `${String(normalizedHour).padStart(2, "0")}:${String(normalizedMinute).padStart(2, "0")}`;
  }
  const suffix = normalizedHour >= 12 ? "PM" : "AM";
  const display = normalizedHour % 12 || 12;
  return `${display}:${String(normalizedMinute).padStart(2, "0")} ${suffix}`;
}

export function formatScheduleBadgeTimeRange(
  startTime: string,
  endTime: string,
  timeFormat: TimeFormat = "12h",
): string {
  return `${formatScheduleBadgeTime(startTime, timeFormat)} - ${formatScheduleBadgeTime(endTime, timeFormat)}`;
}

type GhostShiftMetadata = {
  readonly ghost?: boolean;
  readonly is_ghost?: boolean;
  readonly ghost_location_name?: string | null;
  readonly source_location_name?: string | null;
  readonly ghost_job_name?: string | null;
  readonly ghost_shift_type_name?: string | null;
};

export function ghostShiftLocation(shift: ScheduleShift): string | null {
  const metadata = shift as ScheduleShift & GhostShiftMetadata;
  return metadata.ghost_location_name ?? metadata.source_location_name ?? null;
}
