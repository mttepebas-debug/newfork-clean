// The shift window's behavior, taken over line for line from main's
// ShiftQuickEditor (apps/web/src/schedule/components/ShiftQuickEditor.tsx):
// same starting values, eligibility, availability check, rule box, note card,
// save, delete and "changed by someone else". The variants only change how
// the window looks and how it is driven, so saving works exactly as in main.
import type { ScheduleReadModel, ScheduleShiftMutationInput } from "@newfork/shared/schedule";
import type { ShiftAvailabilityAssessment } from "@newfork/shared";
import { useToast } from "@newfork/ui";
import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { loadShiftAvailability } from "../../../src/availability/availability-data";
import { closedDayAlreadyAnswered, rememberClosedDayAnswer } from "../../../src/schedule/lib/closedDayAnswer";
import {
  assessmentAvailabilityWarnings,
  evaluateScheduleShiftConflicts,
  formatScheduleConflictMessages,
  isAvailabilityReminder,
} from "../../../src/schedule/schedule-conflicts";
import { formatNoteBy, formatNoteWhen } from "../../../src/schedule/lib/scheduleAvailabilityMark";
import { weeklyTargetNote } from "../../../src/schedule/lib/scheduleWeeklyAvailability";
import {
  clampShiftEditorCount,
  getShiftEditorEligibleEmployees,
  getShiftEditorEligibleJobs,
  getShiftEditorSelectedEmployee,
  shouldDisableShiftEditorEmployeePicker,
  shouldShowShiftEditorCountStepper,
} from "../../../src/schedule/lib/shiftEditorEligibility";
import {
  applyScheduleShiftTypeDefaults,
  buildScheduleShiftEditorInitialValue,
  type ScheduleShiftEditorState,
} from "../../../src/schedule/lib/shiftEditorState";
import { SCHEDULE_CONFLICT_QUESTION, ScheduleConflictSheet } from "../../../src/schedule/components/ScheduleConflictSheet";
import { ScheduleNoteConfirm } from "../../../src/schedule/components/ScheduleNoteConfirm";
import { isShiftNoteOpen } from "../../../src/schedule/components/ShiftNoteCorner";
import { shiftNoteMaxLength } from "../../../src/schedule/components/ShiftQuickEditor";
import { requestErrorText } from "../../../src/lib/request-error";

export interface EditorProps {
  readonly model: ScheduleReadModel;
  readonly sessionId?: string;
  readonly state: ScheduleShiftEditorState;
  readonly timeFormat: "12h" | "24h";
  readonly formatTime: (value: string) => string;
  readonly addDays: (iso: string, days: number) => string;
  readonly scheduleClosureCoversDate: (closure: ScheduleReadModel["closures"][number], date: string) => boolean;
  readonly presentation?: "floating" | "drawer";
  readonly onClose: () => void;
  readonly onDismiss?: (target?: Element) => void;
  readonly shouldSuppressDismissPointerDown?: (target: Element) => boolean;
  readonly onDirtyChange?: (dirty: boolean) => void;
  readonly onReload: () => void;
  readonly onBlockedSubmit?: (messages: readonly string[]) => void;
  readonly onDelete: (shiftId: string) => Promise<"saved" | "stale" | null>;
  readonly onSubmit: (shift: ScheduleShiftMutationInput, count: number) => Promise<"saved" | "stale" | null>;
}

export type WindowKind = "edit" | "add" | "addUnassigned" | "paste";

export function windowKind(state: ScheduleShiftEditorState): WindowKind {
  if (state.mode === "edit") return "edit";
  if (state.copy) return "paste";
  return state.employeeId === null ? "addUnassigned" : "add";
}

const softConflictOverrideNote = "Manager acknowledged schedule warning.";

export function clampShiftNote(note: string): string {
  const cut = note.slice(0, shiftNoteMaxLength);
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
}

export function useShiftEditorBrain(props: EditorProps) {
  const { model, sessionId, state, timeFormat, onSubmit, onDelete, onClose } = props;
  const toast = useToast();
  const kind = windowKind(state);
  const editorRef = useRef<HTMLDivElement>(null);
  const title = state.mode === "edit" ? "Edit shift" : state.mode === "create" && state.copy ? "Paste shift" : "Add shift";
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
  const [noteCardOpen, setNoteCardOpen] = useState(false);
  const submitRef = useRef<HTMLButtonElement>(null);
  const closeQuestion = () => {
    setConflictSheetOpen(false);
    setNoteCardOpen(false);
    submitRef.current?.focus();
  };
  const [conflictValidationArmed, setConflictValidationArmed] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const checkingRef = useRef(false);
  const valueKey = JSON.stringify(value);
  const valueRef = useRef(value);
  valueRef.current = value;
  const [assessmentState, setAssessmentState] = useState<{ key: string; value: ShiftAvailabilityAssessment } | null>(null);
  const assessment = assessmentState?.key === valueKey ? assessmentState.value : null;
  useEffect(() => { setConflictSheetOpen(false); setNoteCardOpen(false); }, [valueKey]);
  const selectedEmployee = getShiftEditorSelectedEmployee(model.employees, value.employee_id);
  const initialValue = initialValueRef.current;
  const editorHasUserChanges = initialValue ? JSON.stringify(value) !== JSON.stringify(initialValue) || count !== 1 : false;
  const eligibleEmployees = getShiftEditorEligibleEmployees({
    employees: model.employees,
    locationId: value.location_id,
    jobId: value.job_id,
    model,
    shifts: model.shifts,
    value,
    excludeShiftId: state.mode === "edit" ? state.shift.id : null,
  });
  const eligibleJobs = getShiftEditorEligibleJobs({ jobs: model.jobs, selectedEmployee, employeeId: value.employee_id });
  const localConflictReasons = evaluateScheduleShiftConflicts(
    model,
    model.shifts,
    value,
    state.mode === "edit" ? state.shift.id : null,
  ).filter((reason) => typeof reason === "string" || reason.type !== "time_off");
  const noteText = selectedEmployee ? weeklyTargetNote(selectedEmployee, value)?.text ?? "" : "";
  const noteProjection = selectedEmployee?.weekly_availability?.find((item) => item.location_id === value.location_id);
  const assessmentReasons = (result: ShiftAvailabilityAssessment | null) => {
    if (!result) return [];
    const reminders = assessmentAvailabilityWarnings(result)
      .map((reason) => (typeof reason !== "string" && reason.type === "note" ? { ...reason, note: noteText } : reason));
    if (result.operation === "allowed" || result.override_recorded || result.responsibility_retained
      || closedDayAlreadyAnswered(result, sessionId)) return reminders;
    return [...result.reasons.filter((reason) => reason.code !== "availability" && reason.code !== "note")
      .map((reason) => ({ type: "availability_assessment", severity: reason.severity === "block" ? "hard" : "soft", message: reason.message })), ...reminders];
  };
  const rawConflictReasons = [...(assessment ? [] : localConflictReasons), ...assessmentReasons(assessment)];
  const conflictReasons = editorHasUserChanges || conflictSheetOpen || conflictValidationArmed ? rawConflictReasons : [];
  const conflictMessages = formatScheduleConflictMessages(conflictReasons);
  const hasConflictMessages = conflictMessages.length > 0;
  const hardConflict = conflictReasons.some(isHardScheduleConflictReason);
  const conflictCanContinue = hasConflictMessages && !hardConflict;
  const timeValidationMessage = getShiftTimeValidationMessage(value.start_time, value.end_time);
  const saveButtonLabel = state.mode === "edit" ? "Save" : count > 1 ? `Add ${count} shifts` : "Add shift";
  const submitPayload = (reason?: string, checked?: ShiftAvailabilityAssessment | null) => {
    const trimmedReason = reason?.trim();
    const basePayload = {
      ...value,
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
    if (state.mode === "edit" && !editorHasUserChanges && !confirmed) {
      onClose();
      return;
    }
    if (timeValidationMessage) {
      toast.error("Enter a valid shift time", { dedupeKey: "schedule-quick-editor-invalid-time", description: timeValidationMessage });
      return;
    }
    const submittedKey = valueKey;
    let checked: ShiftAvailabilityAssessment | null = null;
    if (model.settings.conflict_rules || value.employee_id) {
      checkingRef.current = true;
      setCheckingAvailability(true);
      try {
        checked = await loadShiftAvailability(model.workspace_id, value, state.mode === "edit" ? state.shift.id : undefined, sessionId);
        if (JSON.stringify(valueRef.current) !== submittedKey) return;
        setAssessmentState({ key: submittedKey, value: checked });
      } catch (error) {
        toast.error("Availability could not be checked", {
          dedupeKey: "schedule-quick-editor-availability-check-failed",
          description: requestErrorText(error, "Please retry."),
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
    const reminders = reasons.filter(isAvailabilityReminder);
    const warnOnly = weeklyWarning && checked?.warning_policy === "warn" && effectiveLocalReasons.length === 0 && !reminders.length;
    if (messages.length > 0 && !canConfirm && !warnOnly) {
      setConflictValidationArmed(true);
      if (reasons.every((reason) => typeof reason !== "string" && reason.type === "note")) setNoteCardOpen(true);
      else setConflictSheetOpen(true);
      props.onBlockedSubmit?.(messages);
      if (!checked?.warning_policy && reminders.length < reasons.length) {
        const summary = summarizeEditorConflictToast(messages, !reasons.some(isHardScheduleConflictReason));
        toast[summary.tone](summary.title, { description: summary.description });
      }
      return;
    }
    setConflictSheetOpen(false);
    setNoteCardOpen(false);
    if (weeklyWarning && checked?.warning_policy === "confirm") rememberClosedDayAnswer(checked, sessionId);
    if (warnOnly) {
      toast.warning("Shift saved with a warning", { dedupeKey: "schedule-quick-editor-availability-warning", description: messages.join(" ") });
    }
    submitPayload(confirmed && localConflictReasons.length ? softConflictOverrideNote : undefined, checked);
  };
  // Enter in a time box saves after the typed times land in state.
  const [submitTick, setSubmitTick] = useState(0);
  useEffect(() => {
    if (submitTick) void attemptSubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const showEmployeePicker = (state.mode === "create" && state.employeeId === null) || (state.mode === "edit" && state.shift.employee_id === null);
  const employeePickerDisabled = shouldDisableShiftEditorEmployeePicker({ showCountStepper, count });
  const updateCount = (nextCount: number) => setCount(clampShiftEditorCount(nextCount));
  useEffect(() => {
    props.onDirtyChange?.(editorHasUserChanges);
  }, [editorHasUserChanges, props.onDirtyChange]);
  useEffect(() => {
    if (!showEmployeePicker) return;
    if (value.employee_id === null || eligibleEmployees.some((employee) => employee.id === value.employee_id)) return;
    setValue((current) => ({ ...current, employee_id: null }));
  }, [eligibleEmployees, showEmployeePicker, value.employee_id]);
  useEffect(() => {
    setConflictSheetOpen(false);
    setNoteCardOpen(false);
    setConflictValidationArmed(false);
  }, [count, value]);
  useEffect(() => {
    if (!value.job_id || eligibleJobs.some((job) => job.id === value.job_id)) return;
    setValue((current) => ({ ...current, job_id: eligibleJobs[0]?.id ?? "" }));
  }, [eligibleJobs, value.job_id]);
  useDismissFloatingMenu(true, editorRef, props.onDismiss ?? onClose, {
    dismissOnScroll: false,
    shouldSuppressPointerDown: props.shouldSuppressDismissPointerDown,
  });

  const setTimes = (start_time: string, end_time: string) => {
    explicitTimesEdited.current = true;
    setValue((current) => (current.start_time === start_time && current.end_time === end_time
      ? current
      : { ...current, start_time, end_time, time_basis: "explicit", time_snapshot: null, hide_time_on_badge: false }));
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
    <>
      <ScheduleConflictSheet
        open={conflictSheetOpen}
        messages={conflictMessages}
        tone={conflictCanContinue ? "warning" : "blocker"}
        description={conflictCanContinue ? SCHEDULE_CONFLICT_QUESTION : assessment?.warning_policy ? "Resolve this conflict before saving." : undefined}
        submitLabel={conflictCanContinue ? (assessment ? "Place shift" : `${state.mode === "edit" ? "Save" : "Add"} anyway`) : undefined}
        submitDisabled={checkingAvailability}
        onSubmit={conflictCanContinue ? () => { void attemptSubmit(true); } : undefined}
        onDismiss={closeQuestion}
      />
      {noteCardOpen && selectedEmployee ? (
        <ScheduleNoteConfirm
          cell={{ locationId: value.location_id, employeeId: selectedEmployee.id, date: value.scheduled_date }}
          when={formatNoteWhen(noteProjection, value.scheduled_date, timeFormat)}
          by={formatNoteBy(noteProjection)}
          employeeName={selectedEmployee.display_name}
          text={noteText}
          disabled={checkingAvailability}
          onPlace={() => void attemptSubmit(true)}
          onCancel={closeQuestion}
        />
      ) : null}
    </>
  );

  return {
    kind,
    title,
    editorRef,
    submitRef,
    value,
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
    editorHasUserChanges,
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
    shiftId: state.mode === "edit" ? state.shift.id : null,
    clampNote: clampShiftNote,
    noteMaxLength: shiftNoteMaxLength,
  };
}

export type ShiftEditorBrain = ReturnType<typeof useShiftEditorBrain>;

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
    "employee_excluded", "location_assignment", "job_assignment", "shift_type_assignment", "named_duplicate",
    "named_shift_duplicate", "time_overlap", "reference_time_overlap", "time_off",
  ].includes(String(reason.type));
}

function summarizeEditorConflictToast(messages: readonly string[], canContinue: boolean) {
  const first = messages[0] ?? "Scheduling policy blocks this shift.";
  const concise = first.replace(/\s+Requested:.+$/i, "").replace(/\s+on\s+\d{4}-\d{2}-\d{2}\.?$/i, ".").replace(/\s+/g, " ").trim();
  return {
    title: canContinue ? "Review shift" : "Shift conflict",
    description: concise.length > 96 ? `${concise.slice(0, 93).trim()}...` : concise,
    tone: (canContinue ? "warning" : "error") as "warning" | "error",
  };
}

function getShiftTimeValidationMessage(startTime: string, endTime: string): string | null {
  const canonicalTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!canonicalTime.test(startTime) || !canonicalTime.test(endTime)) return "Enter start and end time.";
  if (startTime === endTime) return "Start and end time cannot be the same.";
  return null;
}

/** main's outside-click and Escape handling; an open time list keeps its own Escape. */
function useDismissFloatingMenu(
  open: boolean,
  menuRef: RefObject<HTMLElement | null>,
  onDismiss: (target?: Element) => void,
  options: { readonly dismissOnScroll?: boolean; readonly shouldSuppressPointerDown?: (target: Element) => boolean } = {},
) {
  useEffect(() => {
    if (!open) return undefined;
    const shouldSuppressPointerDown = options.shouldSuppressPointerDown ?? (() => true);
    const suppressedPointerDownTarget = { current: null as Element | null };
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      const target = event.target instanceof Element ? event.target : undefined;
      if (target?.closest("[data-schedule-conflict-toast-content]")) return;
      if (target?.closest("#schedule-test-panel")) return;
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
      if (!(target instanceof Element) || !suppressed ||
        (target !== suppressed && !target.contains(suppressed) && !suppressed.contains(target))) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isShiftNoteOpen()) return;
      if (document.querySelector("form[data-schedule-conflict-toast-content]")) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.closest("[data-st-own-escape='true']")) return;
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
  }, [menuRef, onDismiss, open, options.dismissOnScroll, options.shouldSuppressPointerDown]);
}
