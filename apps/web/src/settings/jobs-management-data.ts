import {
  departmentWithJobsInputSchema,
  jobDeletionResultSchema,
  departmentWithJobsResultSchema,
  organizationJobCountsSchema,
  jobAssignmentPageSchema,
  jobAssignmentTargetSchema,
  jobAssignmentResultSchema,
  jobAssignmentChangesSchema,
  jobDetailsChangesSchema,
  jobDetailsResultSchema,
  jobCreateWithAssignmentsSchema,
  jobCreateWithAssignmentsResultSchema,
  departmentJobsInputSchema,
  jobSchema,
  type DepartmentWithJobsInput,
  type JobAssignmentChange,
  type JobAssignmentQuery,
  type JobCreateWithAssignments,
  type JobDetailsChanges,
} from "@newfork/shared";
import { organizationRequest } from "./organization-data";

export async function createJobWithAssignments(
  workspaceId: string,
  input: JobCreateWithAssignments,
) {
  return jobCreateWithAssignmentsResultSchema.parse(
    await organizationRequest(workspaceId, "/organization/jobs", {
      method: "POST",
      body: JSON.stringify(jobCreateWithAssignmentsSchema.parse(input)),
    }),
  );
}

export async function saveJobDetails(
  workspaceId: string,
  jobId: string,
  input: JobDetailsChanges,
) {
  return jobDetailsResultSchema.parse(
    await organizationRequest(workspaceId, `/organization/jobs/${jobId}`, {
      method: "PATCH",
      body: JSON.stringify(jobDetailsChangesSchema.parse(input)),
    }),
  );
}

export async function deleteJob(workspaceId: string, jobId: string) {
  return jobDeletionResultSchema.parse(
    await organizationRequest(workspaceId, `/organization/jobs/${jobId}`, {
      method: "DELETE",
    }),
  );
}
export async function updateDepartmentWithJobs(
  workspaceId: string,
  departmentId: string,
  input: DepartmentWithJobsInput,
) {
  return departmentWithJobsResultSchema.parse(
    await organizationRequest(
      workspaceId,
      `/organization/departments/${departmentId}`,
      {
        method: "PATCH",
        body: JSON.stringify(departmentWithJobsInputSchema.parse(input)),
      },
    ),
  );
}

export async function createDepartmentJobs(
  workspaceId: string,
  departmentId: string,
  jobs: DepartmentWithJobsInput["jobs"],
) {
  return jobSchema.array().parse(
    await organizationRequest(
      workspaceId,
      `/organization/departments/${departmentId}/jobs`,
      {
        method: "POST",
        body: JSON.stringify(departmentJobsInputSchema.parse({ jobs })),
      },
    ),
  );
}

export async function createDepartmentWithJobs(
  workspaceId: string,
  input: DepartmentWithJobsInput,
) {
  return departmentWithJobsResultSchema.parse(
    await organizationRequest(workspaceId, "/organization/departments", {
      method: "POST",
      body: JSON.stringify(departmentWithJobsInputSchema.parse(input)),
    }),
  );
}
export async function loadJobCounts(workspaceId: string) {
  return organizationJobCountsSchema.parse(
    await organizationRequest(workspaceId, "/organization/job-counts"),
  );
}
function queryString(query: JobAssignmentQuery) {
  return new URLSearchParams({
    search: query.search,
    filter: query.filter,
    page: String(query.page),
    ...(query.location_id ? { location_id: query.location_id } : {}),
  }).toString();
}
export async function loadJobEmployees(
  workspaceId: string,
  jobId: string,
  query: JobAssignmentQuery,
) {
  return jobAssignmentPageSchema.parse(
    await organizationRequest(
      workspaceId,
      `/organization/jobs/${jobId}/assignments?${queryString(query)}`,
    ),
  );
}
export async function loadNewJobEmployees(
  workspaceId: string,
  query: JobAssignmentQuery,
) {
  return jobAssignmentPageSchema.parse(
    await organizationRequest(
      workspaceId,
      `/organization/jobs/new/assignments?${queryString(query)}`,
    ),
  );
}
export async function loadNewJobTargets(
  workspaceId: string,
  query: JobAssignmentQuery,
) {
  return jobAssignmentTargetSchema
    .array()
    .parse(
      await organizationRequest(
        workspaceId,
        `/organization/jobs/new/assignments/targets?${queryString(query)}`,
      ),
    );
}
export async function loadJobTargets(
  workspaceId: string,
  jobId: string,
  query: JobAssignmentQuery,
) {
  return jobAssignmentTargetSchema
    .array()
    .parse(
      await organizationRequest(
        workspaceId,
        `/organization/jobs/${jobId}/assignments/targets?${queryString(query)}`,
      ),
    );
}
export async function saveJobAssignments(
  workspaceId: string,
  jobId: string,
  changes: JobAssignmentChange[],
) {
  return jobAssignmentResultSchema.parse(
    await organizationRequest(
      workspaceId,
      `/organization/jobs/${jobId}/assignments`,
      {
        method: "PATCH",
        body: JSON.stringify(jobAssignmentChangesSchema.parse({ changes })),
      },
    ),
  );
}
