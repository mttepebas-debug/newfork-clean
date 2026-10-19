import type {
  ScheduleEditableShift,
  ScheduleEditSession,
  ScheduleReadModel,
  ScheduleShift,
  ScheduleShiftMutationInput,
} from "@newfork/shared/schedule";
import { MousePointer2, PanelRightOpen, Rows3 } from "lucide-react";
import { useMemo, useState, type MouseEvent } from "react";

import { ScheduleGrid } from "../schedule/components/ScheduleGrid";
import type { CellContextMenuTarget } from "../schedule/components/ScheduleContextMenu";
import { ShiftQuickEditor } from "../schedule/components/ShiftQuickEditor";
import type { PresetCreateTarget } from "../schedule/components/SchedulePresetRows";
import { addDays, formatTime } from "../schedule/lib/scheduleDateTime";
import { scheduleClosureCoversDate } from "../schedule/lib/scheduleClosures";
import type { ScheduleShiftEditorState } from "../schedule/lib/shiftEditorState";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const mainLocationId = "11111111-1111-4111-8111-111111111111";
const patioLocationId = "22222222-2222-4222-8222-222222222222";
const serverJobId = "33333333-3333-4333-8333-333333333333";
const bartenderJobId = "44444444-4444-4444-8444-444444444444";
const dinnerShiftTypeId = "55555555-5555-4555-8555-555555555555";
const lunchShiftTypeId = "66666666-6666-4666-8666-666666666666";
const eventShiftTypeId = "77777777-7777-4777-8777-777777777777";
const alexEmployeeId = "88888888-8888-4888-8888-888888888888";
const mayaEmployeeId = "99999999-9999-4999-8999-999999999999";

const baseModel: ScheduleReadModel = {
  workspace_id: workspaceId,
  week_start: "2026-08-17",
  week_start_day: "monday",
  settings: { time_format: "12h" },
  locations: [
    {
      id: mainLocationId,
      name: "Main Dining",
      timezone: "America/Los_Angeles",
      sort_order: 0,
      publication_status: "published",
      published_at: "2026-08-17T12:00:00Z",
    },
    {
      id: patioLocationId,
      name: "Patio Bar",
      timezone: "America/Los_Angeles",
      sort_order: 1,
      publication_status: "unpublished",
      published_at: null,
    },
  ],
  departments: [],
  jobs: [
    {
      id: serverJobId,
      department_id: null,
      system_key: null,
      name: "Server",
      color: "#2563eb",
      
    },
    {
      id: bartenderJobId,
      department_id: null,
      system_key: null,
      name: "Bartender",
      color: "#059669",
      
    },
  ],
  referenced_jobs: [],
  referenced_shift_types: [],
  shift_types: [
    {
      id: lunchShiftTypeId,
      name: "Lunch",
      color: "#f97316",
      sort_order: 0,
      default_start_time: "11:00",
      default_end_time: "15:00",
    },
    {
      id: dinnerShiftTypeId,
      name: "Dinner",
      color: "#7c3aed",
      sort_order: 1,
      default_start_time: "16:00",
      default_end_time: "22:00",
    },
    {
      id: eventShiftTypeId,
      name: "Event",
      color: "#0f766e",
      sort_order: 2,
      default_start_time: "18:00",
      default_end_time: "23:30",
    },
  ],
  shift_labels: [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Training",
      color: "#0ea5e9",
      sort_order: 0,
    },
  ],
  employees: [
    {
      id: alexEmployeeId,
      employee_code: "NF-001",
      display_name: "Alex Rivera",
      location_ids: [mainLocationId, patioLocationId],
      job_ids: [serverJobId, bartenderJobId],
      primary_job_id: serverJobId,
      is_excluded_from_schedule: false,
    },
    {
      id: mayaEmployeeId,
      employee_code: "NF-002",
      display_name: "Maya Chen",
      location_ids: [mainLocationId],
      job_ids: [serverJobId],
      primary_job_id: serverJobId,
      is_excluded_from_schedule: false,
    },
  ],
  shifts: [
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      location_id: mainLocationId,
      employee_id: alexEmployeeId,
      job_id: serverJobId,
      shift_type_id: dinnerShiftTypeId,
      scheduled_date: "2026-08-17",
      start_time: "16:00",
      end_time: "22:30",
      crosses_midnight: false,
      unpaid_break_minutes: 30,
      hide_time_on_badge: false,
      label_ids: [],
      label_names: [],
      note: "Main service",
      warning_codes: [],
    },
    {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      location_id: mainLocationId,
      employee_id: null,
      job_id: serverJobId,
      shift_type_id: lunchShiftTypeId,
      scheduled_date: "2026-08-17",
      start_time: "11:00",
      end_time: "15:00",
      crosses_midnight: false,
      unpaid_break_minutes: 0,
      hide_time_on_badge: false,
      label_ids: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      label_names: ["Training"],
      note: "Open shift",
      warning_codes: [],
    },
    {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      location_id: patioLocationId,
      employee_id: null,
      job_id: bartenderJobId,
      shift_type_id: eventShiftTypeId,
      scheduled_date: "2026-08-18",
      start_time: "18:00",
      end_time: "23:30",
      crosses_midnight: false,
      unpaid_break_minutes: 0,
      hide_time_on_badge: false,
      label_ids: [],
      label_names: [],
      note: "",
      warning_codes: [],
    },
  ],
  closures: [],
  important_dates: [],
};

function createEditSession(model: ScheduleReadModel): ScheduleEditSession {
  return {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    workspace_id: model.workspace_id,
    week_start: model.week_start,
    source_kind: "published",
    source_draft_id: null,
    source_revision: 1,
    holder_user_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    location_ids: [mainLocationId, patioLocationId],
    holder_name: "Design Review",
    revision: 1,
    dirty: false,
    last_heartbeat: "2026-08-17T12:00:00Z",
    expires_at: "2026-08-17T12:04:00Z",
    shifts: model.shifts.map((shift) => ({ ...shift, revision: 1 })),
  };
}

function mutationToShift(
  id: string,
  mutation: ScheduleShiftMutationInput,
): ScheduleShift {
  return {
    id,
    location_id: mutation.location_id,
    employee_id: mutation.employee_id,
    job_id: mutation.job_id,
    shift_type_id: mutation.shift_type_id,
    scheduled_date: mutation.scheduled_date,
    start_time: mutation.start_time,
    end_time: mutation.end_time,
    crosses_midnight: mutation.end_time <= mutation.start_time,
    unpaid_break_minutes: mutation.unpaid_break_minutes ?? 0,
    hide_time_on_badge: mutation.hide_time_on_badge ?? false,
    label_ids: mutation.label_ids ?? [],
    label_names: mutation.label_names ?? [],
    note: mutation.note,
    warning_codes: [],
  };
}

function editableShift(shift: ScheduleShift): ScheduleEditableShift {
  return { ...shift, revision: 1 };
}

export default function ScheduleShiftDesignPage() {
  const [model, setModel] = useState(baseModel);
  const [editor, setEditor] = useState<ScheduleShiftEditorState | null>({
    mode: "create",
    locationId: mainLocationId,
    employeeId: null,
    date: "2026-08-17",
    x: 620,
    y: 96,
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [focusedShiftId, setFocusedShiftId] = useState<string | null>(null);
  const [unassignedFrozen, setUnassignedFrozen] = useState(true);
  const [showUnassignedShifts, setShowUnassignedShifts] = useState(true);
  const [view, setView] = useState<"week" | "day">("week");
  const [log, setLog] = useState<string[]>(["Design surface ready."]);
  const [createdShiftCount, setCreatedShiftCount] = useState(0);
  const session = useMemo(() => createEditSession(model), [model]);

  const pushLog = (message: string) => {
    setLog((current) => [message, ...current].slice(0, 6));
  };

  const openCreate = (
    locationId: string,
    employeeId: string | null,
    date: string,
    point?: { readonly x: number; readonly y: number },
  ) => {
    setEditor({
      mode: "create",
      locationId,
      employeeId,
      date,
      x: point?.x ?? 620,
      y: point?.y ?? 96,
    });
    pushLog(`Opened Add shift: ${employeeId ? "assigned" : "unassigned"}`);
  };

  const openEdit = (
    shift: ScheduleEditableShift,
    point?: { readonly x: number; readonly y: number },
  ) => {
    setFocusedShiftId(shift.id);
    setEditor({
      mode: "edit",
      shift,
      x: point?.x ?? 620,
      y: point?.y ?? 96,
    });
    pushLog("Opened Edit shift.");
  };

  const handleSubmit = async (
    mutation: ScheduleShiftMutationInput,
    count: number,
  ): Promise<"saved"> => {
    setModel((current) => {
      const editId = editor?.mode === "edit" ? editor.shift.id : null;
      if (editId) {
        return {
          ...current,
          shifts: current.shifts.map((shift) =>
            shift.id === editId ? mutationToShift(editId, mutation) : shift,
          ),
        };
      }
      const additions = Array.from({ length: count }, (_, index) => {
        const next = createdShiftCount + index + 1;
        // The editor's payload as it is: a bulk add carries no note (BL-199).
        return mutationToShift(
          `10000000-0000-4000-8000-${String(next).padStart(12, "0")}`,
          mutation,
        );
      });
      return { ...current, shifts: [...current.shifts, ...additions] };
    });
    if (editor?.mode !== "edit") {
      setCreatedShiftCount((current) => current + count);
    }
    pushLog(`${editor?.mode === "edit" ? "Updated" : "Created"} ${count} shift.`);
    return "saved";
  };

  const handleDelete = async (shiftId: string): Promise<"saved"> => {
    setModel((current) => ({
      ...current,
      shifts: current.shifts.filter((shift) => shift.id !== shiftId),
    }));
    pushLog("Deleted shift.");
    setEditor(null);
    return "saved";
  };

  const handleShiftContextMenu = (
    shift: ScheduleEditableShift,
    event: MouseEvent<HTMLElement>,
  ) => {
    event.preventDefault();
    openEdit(shift, { x: event.clientX, y: event.clientY });
  };

  const handleCellContextMenu = (
    target: Omit<CellContextMenuTarget, "x" | "y">,
    event: MouseEvent<HTMLElement>,
  ) => {
    event.preventDefault();
    openCreate(target.locationId, target.employeeId, target.date, {
      x: event.clientX,
      y: event.clientY,
    });
  };

  return (
    <main className="schedule-design-surface">
      <section className="schedule-design-toolbar" aria-label="Design controls">
        <div>
          <h1>Schedule Shift Design</h1>
          <p>Production ScheduleGrid and ShiftQuickEditor with local fixture data.</p>
        </div>
        <div className="schedule-design-actions" aria-label="Editor presets">
          <button
            type="button"
            onClick={() => openCreate(mainLocationId, alexEmployeeId, "2026-08-17")}
          >
            <MousePointer2 size={15} aria-hidden />
            Assigned add
          </button>
          <button
            type="button"
            onClick={() => openCreate(mainLocationId, null, "2026-08-17")}
          >
            <Rows3 size={15} aria-hidden />
            Unassigned add
          </button>
          <button
            type="button"
            onClick={() => openEdit(editableShift(model.shifts[0]!))}
          >
            <PanelRightOpen size={15} aria-hidden />
            Edit shift
          </button>
        </div>
        <div className="schedule-design-toggles" aria-label="Grid controls">
          <label>
            <input
              type="checkbox"
              checked={showUnassignedShifts}
              onChange={(event) => setShowUnassignedShifts(event.target.checked)}
            />
            Show unassigned row
          </label>
          <label>
            <input
              type="checkbox"
              checked={unassignedFrozen}
              onChange={(event) => setUnassignedFrozen(event.target.checked)}
            />
            Freeze unassigned row
          </label>
          <button
            type="button"
            aria-pressed={view === "day"}
            onClick={() => setView((current) => (current === "week" ? "day" : "week"))}
          >
            {view === "week" ? "Week view" : "Day view"}
          </button>
        </div>
      </section>

      <section className="schedule-design-grid" aria-label="Schedule grid preview">
        <ScheduleGrid
          model={model}
          search={new URLSearchParams()}
          selectedDate="2026-08-17"
          view={view}
          layout="separate"
          hideUnscheduled={false}
          showShiftType
          showShiftLabels
          showClockTimes
          showTotalHours
          showUnassignedShifts={showUnassignedShifts}
          unassignedFrozen={unassignedFrozen}
          showJobColorDot
          showRoleSeparators
          showPresetShiftBadges
          employeeSortMode="byJob"
          session={session}
          activeEditorTarget={
            editor?.mode === "create"
              ? {
                  locationId: editor.locationId,
                  employeeId: editor.employeeId,
                  date: editor.date,
                }
              : editor?.mode === "edit"
                ? {
                    locationId: editor.shift.location_id,
                    employeeId: editor.shift.employee_id,
                    date: editor.shift.scheduled_date,
                    shiftId: editor.shift.id,
                  }
                : null
          }
          focusedShiftId={focusedShiftId}
          selectedIds={selectedIds}
          clipboard={null}
          pasteArmed={false}
          organizationName="Meyhouse Jazz"
          organizationLogoUrl={null}
          organizationLogoPlacement={null}
          onClearSelection={() => setSelectedIds([])}
          onSelect={(id, additive) =>
            setSelectedIds((current) =>
              additive
                ? current.includes(id)
                  ? current.filter((item) => item !== id)
                  : [...current, id]
                : [id],
            )
          }
          onFocusShift={(shift) => setFocusedShiftId(shift.id)}
          onEdit={openEdit}
          onCreate={openCreate}
          onPresetCreate={(target: PresetCreateTarget) =>
            openCreate(target.locationId, target.employeeId, target.date)
          }
          onCopy={(shift) => pushLog(`Copied ${shift.id}`)}
          onShiftContextMenu={handleShiftContextMenu}
          onCellContextMenu={handleCellContextMenu}
          onPaste={openCreate}
          onMove={() => pushLog("Move gesture captured.")}
          onCopyMove={() => pushLog("Copy-move gesture captured.")}
          onOpenEmployeeCard={(employeeId) => pushLog(`Open employee ${employeeId}`)}
          onDayHeaderClick={() => setView("day")}
          onLocationHeaderClick={(locationIds) =>
            pushLog(`Location header clicked: ${locationIds.join(", ")}`)
          }
        />
      </section>

      {editor ? (
        <ShiftQuickEditor
          model={model}
          state={editor}
          timeFormat="12h"
          formatTime={formatTime}
          addDays={addDays}
          scheduleClosureCoversDate={scheduleClosureCoversDate}
          onClose={() => setEditor(null)}
          onDismiss={() => setEditor(null)}
          onReload={() => pushLog("Reload requested.")}
          onDelete={handleDelete}
          onSubmit={handleSubmit}
        />
      ) : null}

      <aside className="schedule-design-log" aria-label="Action log">
        {log.map((entry, index) => (
          <p key={`${entry}-${index}`}>{entry}</p>
        ))}
      </aside>
    </main>
  );
}
