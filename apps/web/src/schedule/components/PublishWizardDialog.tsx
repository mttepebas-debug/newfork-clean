import type {
  ScheduleDraftSummary,
  ScheduleEmployee,
  ScheduleLocation,
  SchedulePublicationPreflightAck,
  SchedulePublishResult,
  ScheduleReadModel,
} from "@newfork/shared/schedule";

import { previewSchedulePublication } from "../schedule-data";
import {
  PublishScheduleDialog,
  type SchedulePublicationDepartmentScope,
} from "./PublishScheduleDialog";

interface LegacyDraft {
  readonly id: string;
  readonly organization_id?: string;
  readonly workspace_id?: string;
  readonly week_start: string;
  readonly name: string;
  readonly revision?: number;
  readonly created_by?: string;
  readonly updated_by?: string;
  readonly created_at?: string;
  readonly updated_at?: string;
}

interface LegacyLocation {
  readonly id: string;
  readonly name: string;
  readonly color?: string | null;
  readonly timezone?: string | null;
  readonly sort_order?: number | null;
  readonly publication_status?: "published" | "unpublished";
  readonly published_at?: string | null;
}

interface LegacyEmployee {
  readonly id: string;
  readonly employee_code?: string | null;
  readonly display_name: string;
  readonly color?: string | null;
  readonly location_ids?: readonly string[];
  readonly job_ids?: readonly string[];
  readonly shift_type_ids?: readonly string[];
  readonly primary_job_id?: string | null;
  readonly is_excluded_from_schedule?: boolean;
  readonly availability?: ScheduleEmployee["availability"];
}

type LegacyDepartment = ScheduleReadModel["departments"][number];

interface PublishWizardDialogProps {
  readonly open: boolean;
  readonly orgId: string | null;
  readonly workspaceId?: string | null;
  readonly weekStart: string;
  readonly draft: LegacyDraft | null;
  readonly locations: readonly LegacyLocation[];
  readonly departments?: readonly LegacyDepartment[];
  readonly employees: readonly LegacyEmployee[];
  readonly initialLocationIds: readonly string[];
  readonly isPublishing?: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onPublish: (input: {
    readonly locationIds: string[];
    readonly notifyEmployeeIds: string[];
    readonly expectedPublicationId?: string | null;
    readonly liveFingerprint?: string;
    readonly preflightAck?: SchedulePublicationPreflightAck;
    readonly departmentIds?: readonly string[];
    readonly includeNoDepartment?: boolean;
  }) => Promise<SchedulePublishResult>;
}

const FALLBACK_UUID = "11111111-1111-4111-8111-111111111111";

function normalizeDraft(
  draft: LegacyDraft | null,
  workspaceId: string | null,
): ScheduleDraftSummary | null {
  if (!draft || !workspaceId) return null;
  return {
    id: draft.id,
    workspace_id: draft.workspace_id ?? draft.organization_id ?? workspaceId,
    week_start: draft.week_start,
    name: draft.name,
    revision: draft.revision ?? 1,
    created_by: draft.created_by ?? FALLBACK_UUID,
    updated_by: draft.updated_by ?? draft.created_by ?? FALLBACK_UUID,
    created_at: draft.created_at ?? `${draft.week_start}T00:00:00.000Z`,
    updated_at: draft.updated_at ?? `${draft.week_start}T00:00:00.000Z`,
  };
}

function normalizeLocation(
  location: LegacyLocation,
): ScheduleLocation & { readonly color?: string | null } {
  return {
    id: location.id,
    name: location.name,
    color: location.color ?? null,
    timezone: location.timezone ?? "America/Los_Angeles",
    sort_order: location.sort_order ?? 0,
    publication_status: location.publication_status ?? "unpublished",
    published_at: location.published_at ?? null,
  };
}

function normalizeEmployee(
  employee: LegacyEmployee,
): ScheduleEmployee & { readonly color?: string | null } {
  return {
    id: employee.id,
    employee_code: employee.employee_code ?? employee.display_name,
    display_name: employee.display_name,
    color: employee.color ?? null,
    location_ids: [...(employee.location_ids ?? [])],
    job_ids: [...(employee.job_ids ?? [])],
    ...(employee.shift_type_ids
      ? { shift_type_ids: [...employee.shift_type_ids] }
      : {}),
    primary_job_id: employee.primary_job_id ?? null,
    is_excluded_from_schedule: employee.is_excluded_from_schedule ?? false,
    availability: employee.availability ?? null,
  };
}

export function PublishWizardDialog({
  open,
  orgId,
  workspaceId,
  draft,
  locations,
  departments = [],
  employees,
  initialLocationIds,
  isPublishing = false,
  onOpenChange,
  onPublish,
}: PublishWizardDialogProps) {
  if (!open) return null;

  const resolvedWorkspaceId = workspaceId ?? orgId;
  const normalizedDraft = normalizeDraft(draft, resolvedWorkspaceId);
  const normalizedLocations = locations.map(normalizeLocation);
  const normalizedEmployees = employees.map(normalizeEmployee);
  const normalizedDepartments = departments.map((department) => ({
    ...department,
  }));

  return (
    <PublishScheduleDialog
      drafts={normalizedDraft ? [normalizedDraft] : []}
      activeDraftId={normalizedDraft?.id ?? null}
      locations={normalizedLocations}
      departments={normalizedDepartments}
      employees={normalizedEmployees}
      initialLocationIds={initialLocationIds}
      isPublishing={isPublishing}
      onClose={() => onOpenChange(false)}
      onPreview={(draftId, locationIds, departmentScope) => {
        if (!resolvedWorkspaceId) throw new Error("Organization is not ready");
        return previewSchedulePublication(
          resolvedWorkspaceId,
          draftId,
          locationIds,
          departmentScope,
        );
      }}
      onPublish={async (
        preview,
        _overrides,
        notifyEmployeeIds,
        preflightAck,
        departmentScope: SchedulePublicationDepartmentScope = {},
      ) => {
        const result = await onPublish({
          locationIds: preview.locations.map(
            (location) => location.location_id,
          ),
          notifyEmployeeIds,
          ...(preview.locations[0]?.active_publication_id !== undefined
            ? {
                expectedPublicationId:
                  preview.locations[0]?.active_publication_id ?? null,
              }
            : {}),
          ...(preflightAck ? { preflightAck } : {}),
          ...(departmentScope.departmentIds
            ? { departmentIds: departmentScope.departmentIds }
            : {}),
          ...(departmentScope.includeNoDepartment !== undefined
            ? { includeNoDepartment: departmentScope.includeNoDepartment }
            : {}),
        });
        if (result.status === "published") onOpenChange(false);
        return result;
      }}
    />
  );
}
