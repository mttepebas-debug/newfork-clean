import type {
  ScheduleReadModel,
  ScheduleShiftMutationInput,
} from "@newfork/shared/schedule";
import { useToast } from "@newfork/ui";
import type { ShiftAvailabilityAssessment } from "@newfork/shared";
import { loadShiftAvailability } from "../../availability/availability-data";
import { ChevronDown, Minus, Plus, Trash2, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import {
  evaluateScheduleShiftConflicts,
  formatScheduleConflictMessages,
} from "../schedule-conflicts";
import {
  clampShiftEditorCount,
  getShiftEditorEligibleEmployees,
  getShiftEditorEligibleJobs,
  getShiftEditorSelectedEmployee,
  shouldDisableShiftEditorEmployeePicker,
  shouldShowShiftEditorCountStepper,
} from "../lib/shiftEditorEligibility";
import {
  applyScheduleShiftTypeDefaults,
  buildScheduleShiftEditorInitialValue,
  type ScheduleShiftEditorState,
} from "../lib/shiftEditorState";
import {
  clampQuickEditorPosition,
  formatUnpaidBreakOption,
  getQuickEditorInitialPosition,
  unpaidBreakMinuteOptions,
} from "../lib/shiftEditorView";
import { ScheduleConflictNotice } from "./ScheduleConflictNotice";
import { ScheduleConflictSheet } from "./ScheduleConflictSheet";
import { TimeInput } from "./TimeInput";

const clockOffFallbackStartTime = "";
const clockOffFallbackEndTime = "";
const softConflictOverrideNote = "Manager acknowledged schedule warning.";

interface QuickEditorSelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

function QuickEditorSelect({
  label,
  value,
  options,
  disabled = false,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly QuickEditorSelectOption[];
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((option) => option.value === value);
  const displayLabel = selectedOption?.label ?? options[0]?.label ?? "Select";

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root && event.target instanceof Node && root.contains(event.target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="schedule-quick-select"
      data-quick-editor-select="true"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          setOpen(false);
        }}
      >
        <span>{displayLabel}</span>
        <ChevronDown
          size={14}
          aria-hidden
          data-open={open ? "true" : undefined}
        />
      </button>
      {open && !disabled ? (
        <div role="listbox" aria-label={label}>
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={option.disabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (option.disabled) return;
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function QuickEditorLabelMultiSelect({
  labels,
  selectedIds,
  onChange,
}: {
  readonly labels: NonNullable<ScheduleReadModel["shift_labels"]>;
  readonly selectedIds: readonly string[];
  readonly onChange: (labelIds: string[], labelNames: string[]) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selectedSet = new Set(selectedIds);
  const selectedLabels = labels.filter((label) => selectedSet.has(label.id));
  const displayLabel = selectedLabels.length
    ? selectedLabels.map((label) => label.name).join(", ")
    : "No labels";

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root && event.target instanceof Node && root.contains(event.target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [open]);

  const updateSelection = (labelId: string): void => {
    const next = selectedSet.has(labelId)
      ? selectedIds.filter((id) => id !== labelId)
      : [...selectedIds, labelId];
    const ordered = labels.filter((label) => next.includes(label.id));
    onChange(
      ordered.map((label) => label.id),
      ordered.map((label) => label.name),
    );
  };

  return (
    <div
      ref={rootRef}
      className="schedule-quick-select schedule-quick-label-select"
      data-quick-editor-select="true"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        role="combobox"
        aria-label="Labels"
        aria-expanded={open}
        aria-haspopup="listbox"
        title={displayLabel}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          setOpen(false);
        }}
      >
        <span>{displayLabel}</span>
        <ChevronDown
          size={14}
          aria-hidden
          data-open={open ? "true" : undefined}
        />
      </button>
      {open ? (
        <div role="listbox" aria-label="Labels" aria-multiselectable="true">
          {labels.map((label) => {
            const selected = selectedSet.has(label.id);
            return (
              <button
                key={label.id}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  updateSelection(label.id);
                  setOpen(false);
                }}
              >
                <span className="schedule-quick-label-option">
                  <span
                    className="schedule-quick-label-swatch"
                    style={{ backgroundColor: label.color }}
                    aria-hidden
                  />
                  <span>{label.name}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function ShiftQuickEditor({
  model,
  sessionId,
  state,
  timeFormat,
  formatTime: _formatTime,
  addDays: _addDays,
  scheduleClosureCoversDate: _scheduleClosureCoversDate,
  presentation = "floating",
  onClose,
  onDismiss,
  shouldSuppressDismissPointerDown,
  onDirtyChange,
  onReload,
  onBlockedSubmit,
  onDelete,
  onSubmit,
}: {
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
  readonly presentation?: "floating" | "drawer";
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
}) {
  const toast = useToast();
  const editorRef = useRef<HTMLDivElement>(null);
  const startTimeInputRef = useRef<HTMLInputElement>(null);
  const endTimeInputRef = useRef<HTMLInputElement>(null);
  const title =
    state.mode === "edit"
      ? "Edit shift"
      : state.copy
        ? "Paste shift"
        : "Add shift";
  const fallbackX =
    typeof window === "undefined" ? 8 : window.innerWidth / 2 - 140;
  const fallbackY =
    typeof window === "undefined" ? 8 : window.innerHeight / 2 - 220;
  const initialPosition = getQuickEditorInitialPosition(
    typeof state.x === "number" && Number.isFinite(state.x)
      ? state.x
      : fallbackX,
    typeof state.y === "number" && Number.isFinite(state.y)
      ? state.y
      : fallbackY,
  );
  const [position, setPosition] = useState(initialPosition);
  const dragRef = useRef<{
    readonly pointerId: number;
    readonly startX: number;
    readonly startY: number;
    readonly originX: number;
    readonly originY: number;
  } | null>(null);
  const initialValueRef = useRef<ScheduleShiftMutationInput | null>(null);
  const [value, setValue] = useState<ScheduleShiftMutationInput>(() => {
    const initial = buildScheduleShiftEditorInitialValue({ state, model });
    initialValueRef.current = initial;
    return initial;
  });
  const explicitTimesEdited = useRef(
    state.mode === "edit" || (state.mode === "create" && Boolean(state.copy)),
  );
  const [count, setCount] = useState(1);
  const [stale, setStale] = useState(false);
  const [conflictSheetOpen, setConflictSheetOpen] = useState(false);
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
  const assessment =
    assessmentState?.key === valueKey ? assessmentState.value : null;
  useEffect(() => { setConflictSheetOpen(false); }, [valueKey]);
  const selectedEmployee = getShiftEditorSelectedEmployee(
    model.employees,
    value.employee_id,
  );
  const initialValue = initialValueRef.current;
  const editorHasUserChanges = initialValue
    ? JSON.stringify(value) !== JSON.stringify(initialValue) || count !== 1
    : false;
  const headerPrimary = selectedEmployee?.display_name ?? "Unassigned";
  const headerSecondary =
    state.mode === "edit" ? state.shift.scheduled_date : state.date;
  const eligibleEmployees = getShiftEditorEligibleEmployees({
    employees: model.employees,
    locationId: value.location_id,
    jobId: value.job_id,
    model,
    shifts: model.shifts,
    value,
    excludeShiftId: state.mode === "edit" ? state.shift.id : null,
  });
  const eligibleJobs = getShiftEditorEligibleJobs({
    jobs: model.jobs,
    selectedEmployee,
    employeeId: value.employee_id,
  });
  const localConflictReasons = evaluateScheduleShiftConflicts(
    model,
    model.shifts,
    value,
    state.mode === "edit" ? state.shift.id : null,
  ).filter(
    (reason) =>
      typeof reason === "string" ||
      !["availability", "time_off"].includes(String(reason.type)),
  );
  const assessmentReasons = (result: ShiftAvailabilityAssessment | null) => {
    if (result?.conflict_severity) {
      if (result.operation === "allowed" || result.override_recorded || result.responsibility_retained) return [];
      return result.reasons.map(reason => ({ type: "availability_assessment", severity: reason.severity === "block" ? "hard" : "soft", message: reason.message }));
    }
    if (result?.warning_policy) {
      if (result.operation === "allowed") return [];
      if (result.operation === "warning_requires_override") {
        if (result.override_recorded || result.responsibility_retained || localConflictReasons.some(isHardScheduleConflictReason)) return [];
        return [{ type: "availability_assessment", severity: "soft", message: "This shift overlaps unavailable hours." }];
      }
      const blockers = result.reasons.filter((reason) => reason.code !== "availability");
      return (blockers.length ? blockers : [{ message: "This assignment could not be verified. Reload and try again." }])
        .map((reason) => ({ type: "availability_assessment", severity: "hard", message: reason.message }));
    }
    return [];
  };
  const rawConflictReasons = [
    ...(assessment?.conflict_severity ? [] : localConflictReasons),
    ...assessmentReasons(assessment),
  ];
  const conflictReasons =
    editorHasUserChanges || conflictSheetOpen || conflictValidationArmed
      ? rawConflictReasons
      : [];
  const conflictMessages = formatScheduleConflictMessages(conflictReasons);
  const hasConflictMessages = conflictMessages.length > 0;
  const hardConflict = conflictReasons.some(isHardScheduleConflictReason);
  const conflictCanContinue = hasConflictMessages && !hardConflict;
  const timeValidationMessage = getShiftTimeValidationMessage(
    value.start_time,
    value.end_time,
  );
  const saveButtonLabel =
    state.mode === "edit"
      ? "Save"
      : count > 1
        ? `Add ${count} shifts`
        : "Add shift";
  const submitPayload = (
    reason?: string,
    checked?: ShiftAvailabilityAssessment | null,
  ) => {
    const trimmedReason = reason?.trim();
    // Badge visibility cannot change the interval checked above.
    const basePayload = {
      ...value,
      ...(checked?.warning_policy && checked.operation === "warning_requires_override"
        ? { availability_assessment_fingerprint: checked.fingerprint }
        : {}),
    };
    const payload =
      trimmedReason && trimmedReason.length >= 10
        ? {
            ...basePayload,
            conflict_override_note: trimmedReason,
            ...(checked?.operation === "warning_requires_override"
              ? { availability_assessment_fingerprint: checked.fingerprint }
              : {}),
          }
        : basePayload;
    void onSubmit(payload, count).then((result) => {
      if (result === "stale") setStale(true);
    });
  };
  const attemptSubmit = async (confirmed = false) => {
    if (checkingRef.current) return;
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
        checked = await loadShiftAvailability(
          model.workspace_id,
          value,
          state.mode === "edit" ? state.shift.id : undefined,
          sessionId,
        );
        if (JSON.stringify(valueRef.current) !== submittedKey) return;
        setAssessmentState({ key: submittedKey, value: checked });
      } catch (error) {
        toast.error("Availability could not be checked", {
          dedupeKey: "schedule-quick-editor-availability-check-failed",
          description: error instanceof Error ? error.message : "Please retry.",
        });
        return;
      } finally {
        checkingRef.current = false;
        setCheckingAvailability(false);
      }
    }
    const effectiveLocalReasons = checked?.conflict_severity ? [] : localConflictReasons.filter(reason => typeof reason === "string" || reason.type !== "assessment_unknown");
    const reasons = [...effectiveLocalReasons, ...assessmentReasons(checked)];
    const messages = formatScheduleConflictMessages(reasons);
    const weeklyWarning = !!checked?.warning_policy && checked.operation === "warning_requires_override" &&
      !checked.override_recorded && !checked.responsibility_retained;
    const canConfirm =
      confirmed &&
      !reasons.some(isHardScheduleConflictReason) &&
      (!weeklyWarning || checked?.warning_policy === "warn" || checked?.fingerprint === assessment?.fingerprint);
    const warnOnly = weeklyWarning && checked?.warning_policy === "warn" && effectiveLocalReasons.length === 0;
    if (messages.length > 0 && !canConfirm && !warnOnly) {
      setConflictValidationArmed(true);
      setConflictSheetOpen(true);
      onBlockedSubmit?.(messages);
      if (!checked?.warning_policy) {
        const summary = summarizeEditorConflictToast(
          messages,
          !reasons.some(isHardScheduleConflictReason),
        );
        toast[summary.tone](summary.title, {
          description: summary.description,
        });
      }
      return;
    }
    setConflictSheetOpen(false);
    if (warnOnly) {
      toast.warning("Shift saved with a warning", {
        dedupeKey: "schedule-quick-editor-availability-warning",
        description: messages.join(" "),
      });
    }
    submitPayload(
      confirmed && localConflictReasons.length
        ? softConflictOverrideNote
        : undefined,
      checked,
    );
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void attemptSubmit();
  };
  const showCountStepper = shouldShowShiftEditorCountStepper({
    mode: state.mode,
    targetEmployeeId: state.mode === "create" ? state.employeeId : null,
    valueEmployeeId: value.employee_id,
  });
  const showEmployeePicker =
    presentation === "floating" &&
    ((state.mode === "create" && state.employeeId === null) ||
      (state.mode === "edit" && state.shift.employee_id === null));
  const employeePickerDisabled = shouldDisableShiftEditorEmployeePicker({
    showCountStepper,
    count,
  });
  const updateCount = (nextCount: number) =>
    setCount(clampShiftEditorCount(nextCount));
  useEffect(() => {
    setPosition(initialPosition);
  }, [initialPosition.x, initialPosition.y]);
  useEffect(() => {
    onDirtyChange?.(editorHasUserChanges);
  }, [editorHasUserChanges, onDirtyChange]);
  useEffect(() => {
    if (!showEmployeePicker) return;
    if (
      value.employee_id === null ||
      eligibleEmployees.some((employee) => employee.id === value.employee_id)
    ) {
      return;
    }
    setValue((current) => ({ ...current, employee_id: null }));
  }, [eligibleEmployees, showEmployeePicker, value.employee_id]);
  useEffect(() => {
    setConflictSheetOpen(false);
    setConflictValidationArmed(false);
  }, [count, value]);
  useEffect(() => {
    if (!value.job_id || eligibleJobs.some((job) => job.id === value.job_id)) {
      return;
    }
    setValue((current) => ({
      ...current,
      job_id: eligibleJobs[0]?.id ?? "",
    }));
  }, [eligibleJobs, value.job_id]);
  useDismissFloatingMenu(
    presentation === "floating",
    editorRef,
    onDismiss ?? onClose,
    {
      dismissOnScroll: false,
      shouldSuppressPointerDown: shouldSuppressDismissPointerDown,
    },
  );
  const beginDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (presentation !== "floating" || event.button > 0) return;
    if (
      event.target instanceof Element &&
      event.target.closest("button, input, select, textarea, [role='combobox']")
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };
  const updateDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
      return;
    }
    event.preventDefault();
    setPosition(
      clampQuickEditorPosition(
        drag.originX + event.clientX - drag.startX,
        drag.originY + event.clientY - drag.startY,
      ),
    );
  };
  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (
      typeof event.currentTarget.hasPointerCapture === "function" &&
      typeof event.currentTarget.releasePointerCapture === "function" &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  if (stale) {
    return (
      <div
        ref={editorRef}
        className={`schedule-quick-editor schedule-quick-editor--${presentation}`}
        data-shift-quick-editor-content="true"
        role={presentation === "floating" ? "dialog" : undefined}
        aria-label={presentation === "floating" ? title : undefined}
        style={
          presentation === "floating"
            ? { top: position.y, left: position.x }
            : undefined
        }
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.stopPropagation()}
      >
        {presentation === "floating" ? (
          <header
            onPointerDown={beginDrag}
            onPointerMove={updateDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <span>
              <strong>{title}</strong>
              <small>
                {headerPrimary} / {headerSecondary}
              </small>
            </span>
            <button type="button" onClick={onClose} aria-label="Close editor">
              <X size={15} aria-hidden />
            </button>
          </header>
        ) : null}
        <div className="schedule-stale-editor">
          <ScheduleConflictNotice
            title="Shift changed"
            description="Shift changed"
            messages={[
              "This shift was changed by someone else. Reload to see the current version before editing.",
            ]}
            tone="warning"
          />
          <button type="button" className="primary" onClick={onReload}>
            Close & reload
          </button>
        </div>
      </div>
    );
  }
  return (
    <>
      <div
        ref={editorRef}
        className={`schedule-quick-editor schedule-quick-editor--${presentation}`}
        data-shift-quick-editor-content="true"
        role={presentation === "floating" ? "dialog" : undefined}
        aria-label={presentation === "floating" ? title : undefined}
        style={
          presentation === "floating"
            ? { top: position.y, left: position.x }
            : undefined
        }
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.stopPropagation()}
      >
        {presentation === "floating" ? (
          <header
            onPointerDown={beginDrag}
            onPointerMove={updateDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <strong>{title}</strong>
            <button type="button" onClick={onClose} aria-label="Close editor">
              <X size={15} aria-hidden />
            </button>
          </header>
        ) : null}
        <form
          className="schedule-shift-form"
          data-presentation={presentation}
          onSubmit={submit}
        >
          <section
            className="schedule-shift-form-section schedule-shift-form-section--details"
            aria-label="Shift details"
          >
            {showEmployeePicker ? (
              <div className="schedule-shift-field">
                <span>Employee</span>
                <QuickEditorSelect
                  label="Employee"
                  value={value.employee_id ?? ""}
                  disabled={employeePickerDisabled}
                  options={[
                    { value: "", label: "Unassigned" },
                    ...eligibleEmployees.map((employee) => ({
                      value: employee.id,
                      label: employee.display_name,
                    })),
                  ]}
                  onChange={(employeeId) =>
                    setValue({
                      ...value,
                      employee_id: employeeId || null,
                    })
                  }
                />
              </div>
            ) : null}
            <div className="schedule-shift-type-picker">
              <span>Shift type</span>
              <div role="group" aria-label="Shift type">
                {model.shift_types.length ? (
                  model.shift_types.map((shiftType) => {
                    const selected = value.shift_type_id === shiftType.id;
                    return (
                      <button
                        key={shiftType.id}
                        type="button"
                        aria-pressed={selected}
                        style={
                          {
                            "--shift-type-color": shiftType.color,
                          } as CSSProperties
                        }
                        onClick={() => {
                          setValue(
                            applyScheduleShiftTypeDefaults({
                              value,
                              shiftType,
                              shiftTypeId: shiftType.id,
                              clockOffFallbackStartTime,
                              clockOffFallbackEndTime,
                              preserveTimes: explicitTimesEdited.current,
                            }),
                          );
                        }}
                      >
                        {shiftType.name}
                      </button>
                    );
                  })
                ) : (
                  <small>No shift types</small>
                )}
              </div>
            </div>
            <div className="schedule-shift-field">
              <span>Job</span>
              <QuickEditorSelect
                label="Job"
                value={value.job_id}
                options={eligibleJobs.map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
                onChange={(job_id) => setValue({ ...value, job_id })}
              />
              {value.job_id && eligibleEmployees.length === 0 ? (
                <small>No employees qualified for this job.</small>
              ) : null}
            </div>
            {(model.shift_labels ?? []).length > 0 ? (
              <div className="schedule-shift-field">
                <span>Labels</span>
                <QuickEditorLabelMultiSelect
                  labels={model.shift_labels ?? []}
                  selectedIds={value.label_ids ?? []}
                  onChange={(labelIds, labelNames) =>
                    setValue({
                      ...value,
                      label_ids: labelIds,
                      label_names: labelNames,
                    })
                  }
                />
              </div>
            ) : null}
            {showCountStepper ? (
              <label>
                Count
                <span className="schedule-count-stepper">
                  <button
                    type="button"
                    aria-label="Decrease count"
                    onClick={() => updateCount(count - 1)}
                  >
                    <Minus size={14} aria-hidden />
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    aria-label="Shift count"
                    value={count}
                    onChange={(event) => {
                      const next = Number.parseInt(event.target.value, 10);
                      if (!Number.isNaN(next)) updateCount(next);
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Increase count"
                    onClick={() => updateCount(count + 1)}
                  >
                    <Plus size={14} aria-hidden />
                  </button>
                </span>
              </label>
            ) : null}
          </section>
          <section
            className="schedule-shift-form-section schedule-shift-form-section--time"
            aria-label="Time and break"
          >
            <div className="schedule-shift-form-section-title">
              <strong>Time and break</strong>
            </div>
            <div className="schedule-time-fields">
              <label>
                Start
                <TimeInput
                  ref={startTimeInputRef}
                  value={value.start_time}
                  ariaLabel="Start time"
                  timeFormat={timeFormat}
                  density="compact"
                  onAutoAdvance={() => {
                    if (endTimeInputRef.current) {
                      endTimeInputRef.current.dataset.autoSelectSegment =
                        "hour";
                      endTimeInputRef.current.focus();
                    }
                  }}
                  onChange={(start_time) => {
                    explicitTimesEdited.current = true;
                    setValue({
                      ...value,
                      start_time,
                      time_basis: "explicit",
                      time_snapshot: null,
                      hide_time_on_badge: false,
                    });
                  }}
                />
              </label>
              <label>
                End
                <TimeInput
                  ref={endTimeInputRef}
                  value={value.end_time}
                  ariaLabel="End time"
                  timeFormat={timeFormat}
                  density="compact"
                  onAutoRetreat={() => {
                    if (startTimeInputRef.current) {
                      startTimeInputRef.current.dataset.autoSelectSegment =
                        "period";
                      startTimeInputRef.current.focus();
                    }
                  }}
                  onBoundaryEnter={
                    timeFormat === "12h" && !value.hide_time_on_badge
                      ? () => {
                          void attemptSubmit();
                        }
                      : undefined
                  }
                  onChange={(end_time) => {
                    explicitTimesEdited.current = true;
                    setValue({
                      ...value,
                      end_time,
                      time_basis: "explicit",
                      time_snapshot: null,
                      hide_time_on_badge: false,
                    });
                  }}
                />
              </label>
            </div>
            {timeValidationMessage ? (
              <p className="schedule-field-error" role="alert">
                {timeValidationMessage}
              </p>
            ) : null}
            <fieldset className="schedule-break-options">
              <legend>Unpaid break</legend>
              <div>
                {unpaidBreakMinuteOptions.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    aria-pressed={value.unpaid_break_minutes === minutes}
                    onClick={() =>
                      setValue({ ...value, unpaid_break_minutes: minutes })
                    }
                  >
                    {formatUnpaidBreakOption(minutes)}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="schedule-checkbox-row">
              <input
                type="checkbox"
                checked={!value.hide_time_on_badge}
                onChange={(event) =>
                  setValue({
                    ...value,
                    hide_time_on_badge: !event.target.checked,
                  })
                }
              />
              Show times on badge
            </label>
          </section>
          <div className="schedule-dialog-actions schedule-quick-editor-actions">
            {state.mode === "edit" ? (
              <button
                type="button"
                className="danger"
                aria-label="Delete shift"
                onClick={() =>
                  void onDelete(state.shift.id).then((result) => {
                    if (result === "stale") setStale(true);
                  })
                }
              >
                <Trash2 size={14} aria-hidden />
                Delete
              </button>
            ) : null}
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="primary"
              disabled={
                !!timeValidationMessage ||
                checkingAvailability ||
                (state.mode === "edit" && !editorHasUserChanges)
              }
            >
              {checkingAvailability
                ? "Checking availability…"
                : saveButtonLabel}
            </button>
          </div>
        </form>
      </div>
      <ScheduleConflictSheet
        open={conflictSheetOpen}
        messages={conflictMessages}
        tone={conflictCanContinue ? "warning" : "blocker"}
        description={
          assessment?.warning_policy
            ? conflictCanContinue ? "Do you want to assign this shift anyway?" : "Resolve this conflict before saving."
            : undefined
        }
        submitLabel={
          conflictCanContinue
            ? assessment?.conflict_severity ? "Place shift" : `${state.mode === "edit" ? "Save" : "Add"} anyway`
            : undefined
        }
        submitDisabled={checkingAvailability}
        onSubmit={
          conflictCanContinue
            ? () => {
                void attemptSubmit(true);
              }
            : undefined
        }
        onDismiss={() => setConflictSheetOpen(false)}
      />
    </>
  );
}

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
    description:
      concise.length > 96 ? `${concise.slice(0, 93).trim()}...` : concise,
    tone: canContinue ? "warning" : "error",
  };
}

// The same two sentences the database refuses a shift with.
function getShiftTimeValidationMessage(
  startTime: string,
  endTime: string,
): string | null {
  const canonicalTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!canonicalTime.test(startTime) || !canonicalTime.test(endTime)) {
    return "Enter start and end time.";
  }
  if (startTime === endTime) {
    return "Start and end time cannot be the same.";
  }
  return null;
}

function useDismissFloatingMenu(
  open: boolean,
  menuRef: RefObject<HTMLElement | null>,
  onDismiss: (target?: Element) => void,
  options: {
    readonly dismissOnScroll?: boolean;
    readonly shouldSuppressPointerDown?: (target: Element) => boolean;
  } = {},
) {
  useEffect(() => {
    if (!open) return undefined;
    const dismissOnScroll = options.dismissOnScroll ?? true;
    const shouldSuppressPointerDown =
      options.shouldSuppressPointerDown ?? (() => true);
    const suppressedPointerDownTarget = { current: null as Element | null };
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      const target = event.target instanceof Element ? event.target : undefined;
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
        (target !== suppressed &&
          !target.contains(suppressed) &&
          !suppressed.contains(target))
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onDismiss();
    };
    const handleScroll = () => onDismiss();
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("click", handleClick, true);
    window.addEventListener("keydown", handleKeyDown, true);
    if (dismissOnScroll) {
      window.addEventListener("scroll", handleScroll, true);
    }
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("click", handleClick, true);
      window.removeEventListener("keydown", handleKeyDown, true);
      if (dismissOnScroll) {
        window.removeEventListener("scroll", handleScroll, true);
      }
    };
  }, [
    menuRef,
    onDismiss,
    open,
    options.dismissOnScroll,
    options.shouldSuppressPointerDown,
  ]);
}
