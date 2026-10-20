-- BL-680 (KARARLAR K14 S1, S-214 (3), Mert 2026-10-20): the manager role a workspace starts with reads
-- the Settings catalog and changes none of it: jobs and departments (settings.jobs.read), shift types
-- and labels (settings.shift_catalog.read), conflict and swap rules (settings.schedule_rules.read),
-- document types and acknowledgements (documents.read, S-191 left it for this decision). Before,
-- Ayşe in a new workspace saw no Settings at all until an owner ticked the boxes in Settings -> Roles.
-- Every *.manage stays with owners and admins (custom_grantable = false); so do Locations (BL-176)
-- and General. The managers that already exist get the four rights in the next migration.
CREATE OR REPLACE FUNCTION app_private.role_default_permissions(role_class public.workspace_role)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(array_agg(key order by key), '{}'::text[]) from public.permissions where
 role_class in ('owner', 'admin')
 or (role_class = 'manager' and key in (
 'workspace.read','schedule.read','schedule.manage','schedule.publish','schedule.templates.read','schedule.templates.manage','schedule.export',
 'schedule.time_off_requests.read','schedule.time_off_requests.manage','schedule.shift_change_requests.read','schedule.shift_change_requests.manage',
 'availability.read','availability.manage','employees.read','employees.manage','employees.archive','employee_onboarding.review','announcements.read','announcements.manage','important_dates.read','important_dates.manage',
 'employee_documents.read','employee_documents.review',
 'settings.jobs.read','settings.shift_catalog.read','settings.schedule_rules.read','documents.read',
 'notifications.read','notifications.read_own','notifications.preferences.write_own'))
 or (role_class = 'employee' and employee_eligible);
$function$;
