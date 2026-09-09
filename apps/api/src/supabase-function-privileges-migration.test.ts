import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "../../supabase/migrations/20260908132000_harden_public_function_execute_privileges.sql",
  ),
  "utf8",
);
const rlsHelperMigration = readFileSync(
  resolve(
    process.cwd(),
    "../../supabase/migrations/20260908133000_move_rls_helpers_to_private_schema.sql",
  ),
  "utf8",
);

describe("supabase function privilege hardening migration", () => {
  it("removes inherited public and anon function execution in the public schema", () => {
    expect(migration).toMatch(
      /revoke execute on all functions in schema public from public/i,
    );
    expect(migration).toMatch(
      /revoke execute on all functions in schema public from anon/i,
    );
  });

  it("prevents future functions from becoming executable by default", () => {
    expect(migration).toMatch(
      /alter default privileges in schema public revoke execute on functions from public/i,
    );
    expect(migration).toMatch(
      /alter default privileges in schema public revoke execute on functions from anon/i,
    );
    expect(migration).toMatch(
      /alter default privileges in schema public revoke execute on functions from authenticated/i,
    );
  });

  it("does not remove existing explicit authenticated RPC grants in bulk", () => {
    expect(migration).not.toMatch(
      /revoke execute on all functions in schema public from authenticated/i,
    );
  });

  it("moves employee directory mutations and reads behind service-role wrappers", () => {
    expect(migration).toMatch(
      /create or replace function public\.list_employees_service/i,
    );
    expect(migration).toMatch(
      /create or replace function public\.terminate_employee_service/i,
    );
    expect(migration).toMatch(
      /perform set_config\('request\.jwt\.claim\.sub', actor_user_id::text, true\)/i,
    );
    expect(migration).toMatch(
      /revoke execute on function public\.list_employees\(uuid, boolean, text, text, integer, integer\)[\s\S]*from authenticated/i,
    );
    expect(migration).toMatch(
      /revoke execute on function public\.save_employee\(uuid, uuid, text, text, text, text, date, text, uuid\[\], uuid, uuid\[\], uuid, integer\)[\s\S]*from authenticated/i,
    );
    expect(migration).toMatch(
      /revoke execute on function public\.terminate_employee\(uuid, uuid, timestamp without time zone, text, text, text, uuid\)[\s\S]*from authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.list_employees_service\(uuid, uuid, boolean, text, text, integer, integer\)[\s\S]*to service_role/i,
    );
  });

  it("moves document type mutations behind service-role wrappers", () => {
    expect(migration).toMatch(
      /create or replace function public\.save_document_type_service/i,
    );
    expect(migration).toMatch(
      /create or replace function public\.reorder_document_types_service/i,
    );
    expect(migration).toMatch(
      /revoke execute on function public\.save_document_type\(uuid, uuid, text, text, boolean, boolean, text\[\], boolean, integer\)[\s\S]*from authenticated/i,
    );
    expect(migration).toMatch(
      /revoke execute on function public\.set_document_type_archived\(uuid, uuid, boolean\)[\s\S]*from authenticated/i,
    );
    expect(migration).toMatch(
      /revoke execute on function public\.reorder_document_types\(uuid, uuid\[\]\)[\s\S]*from authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.save_document_type_service\(uuid, uuid, uuid, text, text, boolean, boolean, text\[\], boolean, integer\)[\s\S]*to service_role/i,
    );
  });

  it("moves role mutations behind service-role wrappers", () => {
    expect(migration).toMatch(
      /create or replace function public\.save_workspace_role_service/i,
    );
    expect(migration).toMatch(
      /create or replace function public\.delete_workspace_role_service/i,
    );
    expect(migration).toMatch(
      /revoke execute on function public\.save_workspace_role\(uuid, uuid, text, text, public\.workspace_role, text\[\]\)[\s\S]*from authenticated/i,
    );
    expect(migration).toMatch(
      /revoke execute on function public\.delete_workspace_role\(uuid, uuid\)[\s\S]*from authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.save_workspace_role_service\(uuid, uuid, uuid, text, text, public\.workspace_role, text\[\]\)[\s\S]*to service_role/i,
    );
  });

  it("moves acknowledgement signature mutations behind service-role wrappers", () => {
    expect(migration).toMatch(
      /create or replace function public\.save_signature_retention_policy_service/i,
    );
    expect(migration).toMatch(
      /create or replace function public\.save_signature_template_draft_service/i,
    );
    expect(migration).toMatch(
      /revoke execute on function public\.save_signature_retention_policy\(uuid, uuid, text, text, integer, text, text\)[\s\S]*from authenticated/i,
    );
    expect(migration).toMatch(
      /revoke execute on function public\.publish_signature_template\(uuid, uuid\)[\s\S]*from authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.save_signature_template_draft_service\(uuid, uuid, uuid, text, text, text, text, text, date, boolean, boolean, uuid\)[\s\S]*to service_role/i,
    );
  });

  it("moves organization ordering mutations behind service-role wrappers", () => {
    expect(migration).toMatch(
      /create or replace function public\.reorder_organization_entities_service/i,
    );
    expect(migration).toMatch(
      /create or replace function public\.reorder_shift_types_service/i,
    );
    expect(migration).toMatch(
      /revoke execute on function public\.reorder_organization_entities\(uuid, text, uuid\[\]\)[\s\S]*from authenticated/i,
    );
    expect(migration).toMatch(
      /revoke execute on function public\.reorder_shift_types\(uuid, uuid\[\]\)[\s\S]*from authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.reorder_shift_types_service\(uuid, uuid, uuid\[\]\)[\s\S]*to service_role/i,
    );
  });

  it("moves workspace account RPCs behind service-role wrappers", () => {
    expect(migration).toMatch(
      /create or replace function public\.create_owner_workspace_service/i,
    );
    expect(migration).toMatch(
      /create or replace function public\.resolve_active_workspace_service/i,
    );
    expect(migration).toMatch(
      /revoke execute on function public\.create_owner_workspace\(text\)[\s\S]*from authenticated/i,
    );
    expect(migration).toMatch(
      /revoke execute on function public\.list_my_workspaces\(\)[\s\S]*from authenticated/i,
    );
    expect(migration).toMatch(
      /revoke execute on function public\.resolve_active_workspace\(\)[\s\S]*from authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.resolve_active_workspace_service\(uuid\)[\s\S]*to service_role/i,
    );
  });

  it("repairs the scheduling settings audit trigger target columns", () => {
    const auditFunction = migration.match(
      /create or replace function public\.audit_scheduling_settings_change\(\)[\s\S]*?\$\$;/i,
    )?.[0];
    expect(auditFunction).toBeDefined();
    expect(auditFunction).toMatch(/target_type/i);
    expect(auditFunction).toMatch(/target_id/i);
    expect(auditFunction).not.toMatch(/entity_type/i);
    expect(auditFunction).not.toMatch(/entity_id/i);
  });

  it("moves backend-only schedule helpers to service-role execution", () => {
    expect(migration).toMatch(
      /revoke execute on function public\.preview_schedule_publication_service\(uuid, uuid, uuid, uuid\[\]\)[\s\S]*from authenticated/i,
    );
    expect(migration).toMatch(
      /revoke execute on function public\.preview_schedule_publication_service\(uuid, uuid, uuid, uuid\[\], uuid\[\], boolean\)[\s\S]*from authenticated/i,
    );
    expect(migration).toMatch(
      /revoke execute on function public\.publish_schedule_draft_service_label_base\(uuid, uuid, uuid, uuid\[\], integer, text, jsonb\)[\s\S]*from authenticated/i,
    );
    expect(migration).toMatch(
      /revoke execute on function public\.schedule_shift_in_department_scope_service\(uuid, uuid\[\], boolean\)[\s\S]*from authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.preview_schedule_publication_service\(uuid, uuid, uuid, uuid\[\]\)[\s\S]*to service_role/i,
    );
  });

  it("moves RLS helper SECURITY DEFINER bodies out of the public API schema", () => {
    expect(rlsHelperMigration).toMatch(/create schema if not exists app_private/i);
    expect(rlsHelperMigration).toMatch(
      /create or replace function app_private\.workspace_has_permission[\s\S]*security definer/i,
    );
    expect(rlsHelperMigration).toMatch(
      /create or replace function public\.workspace_has_permission[\s\S]*security invoker/i,
    );
    expect(rlsHelperMigration).toMatch(
      /create or replace function public\.can_access_employee[\s\S]*app_private\.can_access_employee/i,
    );
    expect(rlsHelperMigration).toMatch(
      /revoke all on function public\.workspace_has_permission\(uuid, text\)[\s\S]*from public, anon/i,
    );
    expect(rlsHelperMigration).toMatch(
      /grant execute on function public\.workspace_has_permission\(uuid, text\)[\s\S]*to authenticated, service_role/i,
    );
  });
});
