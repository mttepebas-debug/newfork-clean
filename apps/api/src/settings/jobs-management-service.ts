import {
  departmentWithJobsResultSchema,
  jobDeletionResultSchema,
  organizationJobCountsSchema,
  jobAssignmentPageSchema,
  jobAssignmentTargetSchema,
  jobAssignmentResultSchema,
  jobDetailsResultSchema,
  jobCreateWithAssignmentsResultSchema,
  jobSchema,
  type JobDetailsChanges,
  type JobCreateWithAssignments,
  type DepartmentWithJobsInput,
  type JobAssignmentChange,
  type JobAssignmentQuery,
} from "@newfork/shared";

export interface JobsRpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: { message: string; code?: string } | null;
  }>;
}
type Actor = { actorUserId: string; workspaceId: string };
export function createJobsManagementService(client: JobsRpcClient) {
  async function rpc(
    name: string,
    actor: Actor,
    args: Record<string, unknown> = {},
  ) {
    const { data, error } = await client.rpc(name, {
      actor_user_id: actor.actorUserId,
      target_workspace_id: actor.workspaceId,
      ...args,
    });
    if (error)
      throw Object.assign(new Error(error.message), { code: error.code });
    return data;
  }
  function readArgs(
    jobId: string,
    query: JobAssignmentQuery,
    targets: boolean,
  ) {
    return {
      target_job_id: jobId,
      search_text: query.search,
      location_filter: query.location_id ?? null,
      assignment_filter: query.filter,
      page_number: query.page,
      targets_only: targets,
    };
  }
  return {
    async createJobWithAssignments(
      actor: Actor,
      input: JobCreateWithAssignments,
    ) {
      return jobCreateWithAssignmentsResultSchema.parse(
        await rpc("create_job_with_assignments_service", actor, {
          job_input: input.job,
          assignment_changes: input.changes,
        }),
      );
    },
    async saveJobDetails(
      actor: Actor,
      jobId: string,
      input: JobDetailsChanges,
    ) {
      return jobDetailsResultSchema.parse(
        await rpc("update_job_details_and_assignments_service", actor, {
          target_job_id: jobId,
          job_input: input.job ?? null,
          expected_job: input.expected_job ?? null,
          assignment_changes: input.changes,
        }),
      );
    },
    async deleteCatalogEntity(
      actor: Actor,
      kind: string,
      id: string,
      departmentJobs: "keep" | "delete",
    ) {
      return jobDeletionResultSchema.parse(
        await rpc("delete_catalog_entity_service", actor, {
          entity_kind: kind,
          target_entity_id: id,
          department_jobs: departmentJobs,
        }),
      );
    },
    async deleteJob(actor: Actor, jobId: string) {
      return jobDeletionResultSchema.parse(
        await rpc("delete_job_with_assignments_service", actor, {
          target_job_id: jobId,
        }),
      );
    },
    async updateDepartment(
      actor: Actor,
      departmentId: string,
      input: DepartmentWithJobsInput,
    ) {
      return departmentWithJobsResultSchema.parse(
        await rpc("update_department_with_jobs_service", actor, {
          target_department_id: departmentId,
          department_input: input.department,
          jobs_input: input.jobs,
        }),
      );
    },
    async createDepartmentJobs(
      actor: Actor,
      departmentId: string,
      jobs: DepartmentWithJobsInput["jobs"],
    ) {
      return jobSchema.array().parse(
        await rpc("create_department_jobs_service", actor, {
          target_department_id: departmentId,
          jobs_input: jobs,
        }),
      );
    },
    async createDepartment(actor: Actor, input: DepartmentWithJobsInput) {
      return departmentWithJobsResultSchema.parse(
        await rpc("create_department_with_jobs_service", actor, {
          department_input: input.department,
          jobs_input: input.jobs,
        }),
      );
    },
    async counts(actor: Actor) {
      return organizationJobCountsSchema.parse(
        await rpc("organization_job_counts_service", actor),
      );
    },
    async employees(actor: Actor, jobId: string, query: JobAssignmentQuery) {
      return jobAssignmentPageSchema.parse(
        await rpc(
          "read_job_assignments_service",
          actor,
          readArgs(jobId, query, false),
        ),
      );
    },
    async newJobEmployees(actor: Actor, query: JobAssignmentQuery) {
      return jobAssignmentPageSchema.parse(
        await rpc("read_new_job_assignments_service", actor, {
          search_text: query.search,
          location_filter: query.location_id ?? null,
          assignment_filter: query.filter,
          page_number: query.page,
          targets_only: false,
        }),
      );
    },
    async newJobTargets(actor: Actor, query: JobAssignmentQuery) {
      return jobAssignmentTargetSchema.array().parse(
        await rpc("read_new_job_assignments_service", actor, {
          search_text: query.search,
          location_filter: query.location_id ?? null,
          assignment_filter: query.filter,
          page_number: query.page,
          targets_only: true,
        }),
      );
    },
    async targets(actor: Actor, jobId: string, query: JobAssignmentQuery) {
      return jobAssignmentTargetSchema
        .array()
        .parse(
          await rpc(
            "read_job_assignments_service",
            actor,
            readArgs(jobId, query, true),
          ),
        );
    },
    async saveAssignments(
      actor: Actor,
      jobId: string,
      changes: JobAssignmentChange[],
    ) {
      return jobAssignmentResultSchema.parse(
        await rpc("update_job_assignments_service", actor, {
          target_job_id: jobId,
          assignment_changes: changes,
        }),
      );
    },
  };
}
export type JobsManagementService = ReturnType<
  typeof createJobsManagementService
>;
