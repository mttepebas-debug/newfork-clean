import type { ScheduleReadModel } from "@newfork/shared/schedule";

import type { ShiftClipboardSnapshot } from "./shiftClipboard";

// K8: a shift keeps its job's and shift type's name after they are archived.
// The read sends live ones in jobs / shift_types (the pickers) and the archived
// ones the week still points at in referenced_*. Every name on a shift reads here.
export type ScheduleCatalog = Pick<
  ScheduleReadModel,
  "jobs" | "shift_types" | "referenced_jobs" | "referenced_shift_types"
>;

// An archived type arrives by name only, so its color is the card's default.
export type ScheduleShiftTypeLook = Pick<
  ScheduleReadModel["shift_types"][number],
  "id" | "name"
> & { readonly color?: string };

export function scheduleJobName(
  catalog: ScheduleCatalog,
  jobId: string,
): string | undefined {
  return (
    catalog.jobs.find((job) => job.id === jobId) ??
    catalog.referenced_jobs.find((job) => job.id === jobId)
  )?.name;
}

export function scheduleShiftTypeOf(
  catalog: ScheduleCatalog,
  shiftTypeId: string | null | undefined,
): ScheduleShiftTypeLook | undefined {
  if (!shiftTypeId) return undefined;
  return (
    catalog.shift_types.find((type) => type.id === shiftTypeId) ??
    catalog.referenced_shift_types.find((type) => type.id === shiftTypeId)
  );
}

// The line under "Paste blocked": type / job / person / place / date.
export function formatSchedulePasteConflictContext(
  model: ScheduleCatalog & {
    readonly employees: readonly { readonly id: string; readonly display_name: string }[];
    readonly locations: readonly { readonly id: string; readonly name: string }[];
  },
  target: {
    readonly snapshot: Pick<ShiftClipboardSnapshot, "job_id" | "shift_type_id"> | undefined;
    readonly employeeId: string | null;
    readonly locationId: string;
    readonly date: string;
  },
): string {
  const shiftTypeLabel =
    scheduleShiftTypeOf(model, target.snapshot?.shift_type_id)?.name ?? "Shift";
  const jobLabel =
    (target.snapshot && scheduleJobName(model, target.snapshot.job_id)) ?? "Job";
  const employeeLabel =
    model.employees.find((employee) => employee.id === target.employeeId)
      ?.display_name ?? "Open shift";
  const locationLabel =
    model.locations.find((location) => location.id === target.locationId)
      ?.name ?? "Selected location";
  return `${shiftTypeLabel} / ${jobLabel} / ${employeeLabel} / ${locationLabel} / ${target.date}`;
}
