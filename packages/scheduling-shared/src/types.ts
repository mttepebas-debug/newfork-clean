export interface AvailabilityRule {
  readonly day_of_week: number; // 0=Sun..6=Sat
  readonly mode: "bucket" | "shift_type" | "time_range";
  readonly bucket: "morning" | "evening" | "night" | "all_day" | null;
  readonly shift_type_id: string | null;
  readonly is_available: boolean;
  readonly state: "preferred" | "available" | "limited" | "unavailable";
  readonly start_time?: string | null;
  readonly end_time?: string | null;
  readonly crosses_midnight?: boolean;
}

export interface AvailabilityVersion {
  readonly id: string;
  readonly effective_start_date: string; // YYYY-MM-DD
  readonly effective_end_date?: string | null; // inclusive end date while migrating old schedules
  readonly rules: readonly AvailabilityRule[];
}

export interface ConflictInput {
  readonly employee_id: string | null;
  readonly location_id: string;
  readonly shift_type_id: string | null;
  readonly scheduled_date: string; // YYYY-MM-DD
  readonly start_time: string; // HH:MM
  readonly end_time: string; // HH:MM
  readonly uses_clock_time?: boolean;
  readonly exclude_shift_id?: string;
}

export interface EmployeeShiftSummary {
  readonly id: string;
  readonly scheduled_date: string;
  readonly shift_type_id?: string | null;
  readonly start_time: string;
  readonly end_time: string;
  readonly crosses_midnight: boolean;
  readonly uses_clock_time?: boolean;
  readonly shift_type_label: string | null;
  readonly location_name: string;
}

export interface ApprovedTimeOffSegment {
  readonly id: string;
  readonly request_id: string;
  readonly date: string; // YYYY-MM-DD
  readonly status: "pending" | "approved" | "rejected" | "cancelled";
  readonly full_day: boolean;
  readonly start_time: string | null;
  readonly end_time: string | null;
  readonly reason_category?: string | null;
}

export interface ConflictContext {
  readonly employeeShifts: readonly EmployeeShiftSummary[];
  readonly availability: readonly AvailabilityRule[];
  readonly availabilityVersions?: readonly AvailabilityVersion[];
  readonly approvedTimeOff?: readonly ApprovedTimeOffSegment[];
  readonly closedDay: {
    is_all_day: boolean;
    shift_type_ids: readonly string[];
    reason?: string;
  } | null;
  readonly shiftTypeLabels: ReadonlyMap<string, string>;
}

export interface ScheduleCollisionShift {
  readonly id?: string;
  readonly employee_id: string | null;
  readonly location_id: string;
  readonly location_name?: string | null;
  readonly shift_type_id: string | null;
  readonly shift_type_label?: string | null;
  readonly scheduled_date: string;
  readonly start_time: string;
  readonly end_time: string;
  readonly crosses_midnight?: boolean;
  readonly uses_clock_time?: boolean;
}

export type ScheduleCollisionReason = "same_named_shift_type" | "time_overlap";

export interface ScheduleCollisionRules {
  readonly duplicateNamedShiftType?: boolean;
  readonly touchingIntervalsConflict?: boolean;
}

export type CollisionResult =
  | {
      readonly collides: false;
      readonly reason: null;
    }
  | {
      readonly collides: true;
      readonly reason: ScheduleCollisionReason;
    };

export type ConflictSeverity = "soft" | "hard" | "critical";
export type ConflictSource =
  | "assigned_shift"
  | "weekly_availability"
  | "approved_time_off"
  | "closed_day"
  | "employee_documents";

interface ConflictPolicy {
  readonly severity?: ConflictSeverity;
  readonly overrideable?: boolean;
  readonly requires_override_note?: boolean;
  readonly source?: ConflictSource;
}

export type ConflictWarning =
  | ({
      readonly type: "time_overlap";
      readonly conflicting_shifts: readonly {
        readonly id: string;
        readonly start_time: string;
        readonly end_time: string;
        readonly shift_type_label: string | null;
        readonly location_name: string;
      }[];
    } & ConflictPolicy)
  | ({
      readonly type: "named_shift_duplicate";
      readonly conflicting_shifts: readonly {
        readonly id: string;
        readonly shift_type_label: string | null;
        readonly location_name: string;
      }[];
    } & ConflictPolicy)
  | ({
      readonly type: "availability";
      readonly rule_kind: "bucket" | "shift_type" | "all_day" | "time_range";
      readonly bucket?: "morning" | "evening" | "night";
      readonly shift_type_label?: string;
      readonly start_time?: string;
      readonly end_time?: string;
      readonly day_of_week: number;
      readonly availability_version_id?: string;
    } & ConflictPolicy)
  | ({
      readonly type: "time_off";
      readonly segment_id: string;
      readonly request_id: string;
      readonly date: string;
      readonly full_day: boolean;
      readonly start_time?: string | null;
      readonly end_time?: string | null;
      readonly reason_category?: string | null;
    } & ConflictPolicy)
  | ({
      readonly type: "closed_day";
      readonly scope: "all_day" | "shift_type";
      readonly shift_type_label?: string;
      readonly reason?: string;
    } & ConflictPolicy)
  | ({
      readonly type: "availability_limited";
      readonly rule_kind: "bucket" | "shift_type" | "all_day" | "time_range";
      readonly bucket?: "morning" | "evening" | "night";
      readonly shift_type_label?: string;
      readonly start_time?: string;
      readonly end_time?: string;
      readonly day_of_week: number;
      readonly availability_version_id?: string;
    } & ConflictPolicy)
  | ({
      readonly type: "employee_document_expired";
      readonly message: string;
    } & ConflictPolicy);
