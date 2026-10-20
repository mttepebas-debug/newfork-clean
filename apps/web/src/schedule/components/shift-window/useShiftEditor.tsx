// What the Add / Edit / Paste shift window does, apart from how it looks:
// starting values, eligibility, the server's check, the rule box, save, delete
// and "changed by someone else". Both layouts (Form and Timeline) drive this
// one hook. The employee's own mark and a manager's note never ask: the shift
// is written and the page shows a short notice (KARARLAR "Müsaitlik tercih" 3).
import type { ScheduleReadModel, ScheduleShiftMutationInput } from "@newfork/shared/schedule";
import { scheduleShiftSchema } from "@newfork/shared/schedule";
import { SAME_START_END_TIME_MESSAGE, type ShiftAvailabilityAssessment } from "@newfork/shared";
import { useToast } from "@newfork/ui";
import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";

import { loadShiftAvailability } from "../../../availability/availability-data";
import { requestErrorText } from "../../../lib/request-error";
import { closedDayAlreadyAnswered, rememberClosedDayAnswer } from "../../lib/closedDayAnswer";
import {
  clampShiftEditorCount,
  getShiftEditorEligibleEmployees,
  getShiftEditorEligibleJobs,
  getShiftEditorSelectedEmployee,
  shouldDisableShiftEditorEmployeePicker,
  shouldShowShiftEditorCountStepper,
} from "../../lib/shiftEditorEligibility";
import {
  applyScheduleShiftTypeDefaults,
  buildScheduleShiftEditorInitialValue,
  type ScheduleShiftEditorState,
} from "../../lib/shiftEditorState";
import {
  evaluateScheduleShiftConflicts,
  formatScheduleConflictMessages,
  isAvailabilityReminder,
} from "../../schedule-conflicts";
import { SCHEDULE_CONFLICT_QUESTION, ScheduleConflictSheet } from "../ScheduleConflictSheet";
import { isShiftNoteOpen } from "../ShiftNoteCorner";

export interface ShiftEditorProps {
  readonly model: ScheduleReadModel;
  readonly sessionId?: string;
  readonly state: ScheduleShiftEditorState;
  readonly timeFormat: "12h" | "24h";
  readonly formatTime: (value: string) => string;
  readonly addDays: (iso: string, days: number) => string;
  readonly scheduleClosureCoversDate: (
    closure: ScheduleReadModel["closures"][number],
    date: string,
  ) => boolean;
  readonly onClose: () => void;
  readonly onDismiss?: (target?: Element) => void;
  readonly shouldSuppressDismissPointerDown?: (target: Element) => boolean;
  readonly onDirtyChange?: (dirty: boolean) => void;
  readonly onReload: () => void;
  readonly onBlockedSubmit?: (messages: readonly string[]) => void;
  readonly onDelete: (shiftId: string) => Promise<"saved" | "stale" | null>;
  readonly onSubmit: (
    shift: ScheduleShiftMutationInput,
    count: number,
  ) => Promise<"saved" | "stale" | null>;
}

/** An open list in the window marks itself so Escape closes the list, not the window. */
export const OPEN_FIELD_ATTRIBUTE = "data-shift-field-open";

const softConflictOverrideNote = "Manager acknowledged schedule warning.";
// One limit, the shared schema's (the database's CHECK says the same, 500).
export const shiftNoteMaxLength = scheduleShiftSchema.shape.note.maxLength ?? 0;

// BL-291: counts UTF-16 units like the shared schema's max(500), but never
// keeps the first half of an emoji cut at the limit (the database refuses it).
function clampShiftNote(note: string): string {
  const cut = note.slice(0, shiftNoteMaxLength);
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
}

export function formatShiftNoteRemaining(note: string): string {
  const left = Math.max(0, shiftNoteMaxLength - note.length);
  return `${left} ${left === 1 ? "character" : "characters"} left`;
}

export function useShiftEditor(props: ShiftEditorProps) {
  const { model, sessionId, state, onSubmit, onDelete, onClose, onBlockedSubmit, onDirtyChange } = props;
  const toast = useToast();
  const editorRef = useRef<HTMLDivElement>(null);
  const title = state.mode === "edit" ? "Edit shift" : state.copy ? "Paste shift" : "Add shift";
  const initialValueRef = useRef<ScheduleShiftMutationInput | null>(null);
  const [value, setValue] = useState<ScheduleShiftMutationInput>(() => {
    const initial = buildScheduleShiftEditorInitialValue({ state, model });
    initialValueRef.current = initial;
    return initial;
  });
  const explicitTimesEdited = useRef(state.mode === "edit" || (state.mode === "create" && Boolean(state.copy)));
  const [count, setCount] = useState(1);
  const [stale, setStale] = useState(false);
  const [conflictSheetOpen, setConflictSheetOpen] = useState(false);
  // Answering the rule box hands focus back to the window's own save button
  // (it was disabled, so unfocused, while the server checked).
  const submitRef = useRef<HTMLButtonElement>(null);
  const closeQuestion = () => {
    setConflictSheetOpen(false);
    submitRef.current?.focus();
  };
  const [conflictValidationArmed, setConflictValidationArmed] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const checkingRef = useRef(false);
  const valueKey = JSON.stringify(value);
  const valueRef = useRef(value);
  valueRef.current = value;
  const [assessmentState, setAssessmentState] = useState<{
    key: string;
    value: ShiftAvailabilityAssessment;
  } | null>(null);
  const assessment = assessmentState?.key === valueKey ? assessmentState.value : null;
  useEffect(() => {
    setConflictSheetOpen(false);
  }, [valueKey]);
  const selectedEmployee = getShiftEditorSelectedEmployee(model.employees, value.employee_id);
  const initialValue = initialValueRef.current;
  const editorHasUserChanges = initialValue
    ? JSON.stringify(value) !== JSON.stringify(initialValue) || count !== 1
    : false;
  const shiftId = state.mode === "edit" ? state.shift.id : null;
  const eligibleEmployees = getShiftEditorEligibleEmployees({
    employees: model.employees,
    locationId: value.location_id,
    jobId: value.job_id,
    model,
    shifts: model.shifts,
    value,
    excludeShiftId: shiftId,
  });
  const eligibleJobs = getShiftEditorEligibleJobs({
    jobs: model.jobs,
    selectedEmployee,
    employeeId: value.employee_id,
  });
  // The employee's own mark and a manager's note are no conflict and never ask.
  const localConflictReasons = evaluateScheduleShiftConflicts(model, model.shifts, value, shiftId)
    .filter((reason) => typeof reason === "string" || (reason.type !== "time_off" && !isAvailabilityReminder(reason)));
  const assessmentReasons = (result: ShiftAvailabilityAssessment | null) => {
    if (!result || result.operation === "allowed" || result.override_recorded || result.responsibility_retained
      || closedDayAlreadyAnswered(result, sessionId)) return [];
    return result.reasons.filter((reason) => reason.code !== "availability" && reason.code !== "note")
      .map((reason) => ({ type: "availability_assessment", severity: reason.severity === "block" ? "hard" : "soft", message: reason.message }));
  };
  const rawConflictReasons = [...(assessment ? [] : localConflictReasons), ...assessmentReasons(assessment)];
  const conflictReasons = editorHasUserChanges || conflictSheetOpen || conflictValidationArmed ? rawConflictReasons : [];
  const conflictMessages = formatScheduleConflictMessages(conflictReasons);
  const conflictCanContinue = conflictMessages.length > 0 && !conflictReasons.some(isHardScheduleConflictReason);
  const timeValidationMessage = getShiftTimeValidationMessage(value.start_time, value.end_time);
  const saveButtonLabel = state.mode === "edit" ? "Save" : count > 1 ? `Add ${count} shifts` : "Add shift";
  const submitPayload = (reason?: string, checked?: ShiftAvailabilityAssessment | null) => {
    const trimmedReason = reason?.trim();
    // Badge visibility cannot change the interval checked above.
    const basePayload = {
      ...value,
      // Blank means no note: spaces alone never reach the shift.
      // A note goes on one shift only (user, 2026-09-28): none on a bulk add.
      note: count > 1 ? "" : value.note.trim(),
      ...(checked?.warning_policy && checked.operation === "warning_requires_override"
        ? { availability_assessment_fingerprint: checked.fingerprint }
        : {}),
    };
    const payload = trimmedReason && trimmedReason.length >= 10
      ? {
          ...basePayload,
          conflict_override_note: trimmedReason,
          ...(checked?.operation === "warning_requires_override" ? { availability_assessment_fingerprint: checked.fingerprint } : {}),
        }
      : basePayload;
    void onSubmit(payload, count).then((result) => {
      if (result === "stale") setStale(true);
    });
  };
  const attemptSubmit = async (confirmed = false) => {
    if (checkingRef.current) return;
    // Enter on an unchanged shift closes the window, as Save would have nothing to send.
    if (state.mode === "edit" && !editorHasUserChanges && !confirmed) {
      onClose();
      return;
    }
    if (timeValidationMessage) {
      toast.error("Enter a valid shift time", {
        dedupeKey: "schedule-quick-editor-invalid-time",
        description: timeValidationMessage,
      });
      return;
    }
    const submittedKey = valueKey;
    let checked: ShiftAvailabilityAssessment | null = null;
    if (model.settings.conflict_rules || value.employee_id) {
      checkingRef.current = true;
      setCheckingAvailability(true);
      try {
        checked = await loadShiftAvailability(model.workspace_id, value, shiftId ?? undefined, sessionId);
        if (JSON.stringify(valueRef.current) !== submittedKey) return;
        setAssessmentState({ key: submittedKey, value: checked });
      } catch (error) {
        const refusal = availabilityRefusal(error);
        toast.error(refusal?.title ?? "Availability could not be checked", {
          dedupeKey: "schedule-quick-editor-availability-check-failed",
          description: refusal ? refusal.description : requestErrorText(error, "Please retry."),
        });
        return;
      } finally {
        checkingRef.current = false;
        setCheckingAvailability(false);
      }
    }
    const effectiveLocalReasons = checked ? [] : localConflictReasons.filter((reason) => typeof reason === "string" || reason.type !== "assessment_unknown");
    const reasons = [...effectiveLocalReasons, ...assessmentReasons(checked)];
    const messages = formatScheduleConflictMessages(reasons);
    const weeklyWarning = !!checked?.warning_policy && checked.operation === "warning_requires_override" &&
      !checked.override_recorded && !checked.responsibility_retained && !closedDayAlreadyAnswered(checked, sessionId);
    const canConfirm = confirmed && !reasons.some(isHardScheduleConflictReason) &&
      (!weeklyWarning || checked?.warning_policy === "warn" || checked?.fingerprint === assessment?.fingerprint);
    const warnOnly = weeklyWarning && checked?.warning_policy === "warn" && effectiveLocalReasons.length === 0;
    if (messages.length > 0 && !canConfirm && !warnOnly) {
      setConflictValidationArmed(true);
      setConflictSheetOpen(true);
      onBlockedSubmit?.(messages);
      if (!checked?.warning_policy) {
        const summary = summarizeEditorConflictToast(messages, !reasons.some(isHardScheduleConflictReason));
        toast[summary.tone](summary.title, { description: summary.description });
      }
      return;
    }
    setConflictSheetOpen(false);
    if (weeklyWarning && checked?.warning_policy === "confirm") rememberClosedDayAnswer(checked, sessionId);
    if (warnOnly) {
      toast.warning("Shift saved with a warning", {
        dedupeKey: "schedule-quick-editor-availability-warning",
        description: messages.join(" "),
      });
    }
    submitPayload(confirmed && localConflictReasons.length ? softConflictOverrideNote : undefined, checked);
  };
  // Enter on the time line saves after the dragged times have landed in state.
  const [submitTick, setSubmitTick] = useState(0);
  const attemptSubmitRef = useRef(attemptSubmit);
  attemptSubmitRef.current = attemptSubmit;
  useEffect(() => {
    if (submitTick) void attemptSubmitRef.current();
  }, [submitTick]);
  const requestSubmit = () => setSubmitTick((tick) => tick + 1);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void attemptSubmit();
  };
  const showCountStepper = shouldShowShiftEditorCountStepper({
    mode: state.mode,
    targetEmployeeId: state.mode === "create" ? state.employeeId : null,
    valueEmployeeId: value.employee_id,
  });
  const showEmployeePicker = (state.mode === "create" && state.employeeId === null) ||
    (state.mode === "edit" && state.shift.employee_id === null);
  const employeePickerDisabled = shouldDisableShiftEditorEmployeePicker({ showCountStepper, count });
  const updateCount = (nextCount: number) => setCount(clampShiftEditorCount(nextCount));
  useEffect(() => {
    onDirtyChange?.(editorHasUserChanges);
  }, [editorHasUserChanges, onDirtyChange]);
  useEffect(() => {
    if (!showEmployeePicker) return;
    if (value.employee_id === null || eligibleEmployees.some((employee) => employee.id === value.employee_id)) return;
    setValue((current) => ({ ...current, employee_id: null }));
  }, [eligibleEmployees, showEmployeePicker, value.employee_id]);
  useEffect(() => {
    setConflictSheetOpen(false);
    setConflictValidationArmed(false);
  }, [count, value]);
  useEffect(() => {
    if (!value.job_id || eligibleJobs.some((job) => job.id === value.job_id)) return;
    setValue((current) => ({ ...current, job_id: eligibleJobs[0]?.id ?? "" }));
  }, [eligibleJobs, value.job_id]);
  useDismissShiftWindow(editorRef, props.onDismiss ?? onClose, props.shouldSuppressDismissPointerDown);

  const setTimes = (start_time: string, end_time: string) => {
    // A time box gives back the same time when the cursor leaves it untouched;
    // only a real change keeps a later shift type from setting the hours.
    if (valueRef.current.start_time === start_time && valueRef.current.end_time === end_time) return;
    explicitTimesEdited.current = true;
    setValue((current) => ({ ...current, start_time, end_time, time_basis: "explicit", time_snapshot: null, hide_time_on_badge: false }));
  };
  const selectShiftType = (shiftTypeId: string) => {
    const shiftType = model.shift_types.find((item) => item.id === shiftTypeId);
    setValue((current) => applyScheduleShiftTypeDefaults({
      value: current,
      shiftType,
      shiftTypeId,
      clockOffFallbackStartTime: "",
      clockOffFallbackEndTime: "",
      preserveTimes: explicitTimesEdited.current,
    }));
  };
  const update = (patch: Partial<ScheduleShiftMutationInput>) => setValue((current) => ({ ...current, ...patch }));
  const deleteShift = () => {
    if (state.mode !== "edit") return;
    void onDelete(state.shift.id).then((result) => {
      if (result === "stale") setStale(true);
    });
  };

  const questions: ReactNode = (
    <ScheduleConflictSheet
      open={conflictSheetOpen}
      messages={conflictMessages}
      tone={conflictCanContinue ? "warning" : "blocker"}
      description={conflictCanContinue
        ? SCHEDULE_CONFLICT_QUESTION
        : assessment?.warning_policy ? "Resolve this conflict before saving." : undefined}
      submitLabel={conflictCanContinue
        ? assessment ? "Place shift" : `${state.mode === "edit" ? "Save" : "Add"} anyway`
        : undefined}
      submitDisabled={checkingAvailability}
      onSubmit={conflictCanContinue ? () => { void attemptSubmit(true); } : undefined}
      onDismiss={closeQuestion}
    />
  );

  return {
    kind: state.mode === "edit" ? ("edit" as const) : ("add" as const),
    title,
    editorRef,
    submitRef,
    value,
    initial: initialValue,
    update,
    setTimes,
    selectShiftType,
    count,
    updateCount,
    stale,
    showCountStepper,
    showEmployeePicker,
    employeePickerDisabled,
    eligibleEmployees,
    eligibleJobs,
    selectedEmployee,
    // What the rule box would say, shown early once the manager changed something;
    // a time the database refuses is said under the time instead.
    previewMessages: editorHasUserChanges && !timeValidationMessage
      ? formatScheduleConflictMessages(localConflictReasons.filter((reason) => typeof reason === "string" || reason.type !== "assessment_unknown"))
      : [],
    timeValidationMessage,
    saveButtonLabel,
    checkingAvailability,
    saveDisabled: !!timeValidationMessage || checkingAvailability || (state.mode === "edit" && !editorHasUserChanges),
    attemptSubmit,
    requestSubmit,
    submit,
    deleteShift,
    questions,
    date: state.mode === "edit" ? state.shift.scheduled_date : state.date,
    shiftId,
    clampNote: clampShiftNote,
  };
}

export type ShiftEditor = ReturnType<typeof useShiftEditor>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isHardScheduleConflictReason(reason: unknown): boolean {
  if (typeof reason === "string") return true;
  if (!isRecord(reason)) return true;
  if (reason.severity === "hard") return true;
  if (reason.severity === "block") return true;
  if (["allow", "warn", "confirm"].includes(String(reason.severity))) return false;
  return [
    "employee_excluded",
    "location_assignment",
    "job_assignment",
    "shift_type_assignment",
    "named_duplicate",
    "named_shift_duplicate",
    "time_overlap",
    "reference_time_overlap",
    "time_off",
  ].includes(String(reason.type));
}

function summarizeEditorConflictToast(
  messages: readonly string[],
  canContinue: boolean,
): {
  readonly title: string;
  readonly description: string;
  readonly tone: "warning" | "error";
} {
  const first = messages[0] ?? "Scheduling policy blocks this shift.";
  const concise = first
    .replace(/\s+Requested:.+$/i, "")
    .replace(/\s+on\s+\d{4}-\d{2}-\d{2}\.?$/i, ".")
    .replace(/\s+/g, " ")
    .trim();
  return {
    title: canContinue ? "Review shift" : "Shift conflict",
    description: concise.length > 96 ? `${concise.slice(0, 93).trim()}...` : concise,
    tone: canContinue ? "warning" : "error",
  };
}

// The same two sentences the database refuses a shift with.
function getShiftTimeValidationMessage(startTime: string, endTime: string): string | null {
  const canonicalTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!canonicalTime.test(startTime) || !canonicalTime.test(endTime)) return "Enter start and end time.";
  if (startTime === endTime) return SAME_START_END_TIME_MESSAGE;
  return null;
}

/** A click outside or Escape leaves the window; an open list keeps its own Escape. */
function useDismissShiftWindow(
  windowRef: RefObject<HTMLElement | null>,
  onDismiss: (target?: Element) => void,
  shouldSuppressPointerDownProp?: (target: Element) => boolean,
) {
  useEffect(() => {
    const shouldSuppressPointerDown = shouldSuppressPointerDownProp ?? (() => true);
    const suppressedPointerDownTarget = { current: null as Element | null };
    const handlePointerDown = (event: PointerEvent) => {
      if (windowRef.current?.contains(event.target as Node)) return;
      const target = event.target instanceof Element ? event.target : undefined;
      // The window's own rule box and note card sit in a portal; answering them is not leaving.
      if (target?.closest("[data-schedule-conflict-toast-content]")) return;
      const suppress = !target || shouldSuppressPointerDown(target);
      if (suppress && target) suppressedPointerDownTarget.current = target;
      onDismiss(target);
      if (suppress) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    };
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      const suppressed = suppressedPointerDownTarget.current;
      suppressedPointerDownTarget.current = null;
      if (
        !(target instanceof Element) ||
        !suppressed ||
        (target !== suppressed && !target.contains(suppressed) && !suppressed.contains(target))
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      // An open shift note, rule box or note card is the top layer: its Escape closes only it.
      if (event.key !== "Escape" || isShiftNoteOpen()) return;
      if (document.querySelector("form[data-schedule-conflict-toast-content]")) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.closest(`[${OPEN_FIELD_ATTRIBUTE}]`)) return;
      event.stopPropagation();
      onDismiss();
    };
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("click", handleClick, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("click", handleClick, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [windowRef, onDismiss, shouldSuppressPointerDownProp]);
}

/**
 * A check refused because of the location says so in its heading (bug 24).
 * The not-assigned refusal comes without a reason key; its sentence is the
 * one schedule-conflicts.ts already knows.
 */
function availabilityRefusal(error: unknown): { title: string; description?: string } | null {
  if (!(error instanceof Error)) return null;
  const { reason } = error as { reason?: unknown };
  if (reason === "authz.out_of_scope") return { title: "You can't edit this location's schedule" };
  if (error.message.trim() === "Employee is not assigned to this location")
    return { title: "Not assigned to this location", description: "Add them to this location first, or pick someone else." };
  return null;
}
