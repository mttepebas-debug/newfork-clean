-- BL-560 (Mert, 2026-10-19): the manager role a workspace starts with reads and decides the documents of
-- the people where it manages (KARARLAR M2, FB-6.6 D2); before, Ayşe in a new workspace saw no
-- Employees -> Documents until an owner ticked the boxes in Settings -> Roles. Scope stays the core's:
-- documents.read and documents.review are person-scoped actions. The Settings document catalog
-- (documents.read, documents.manage) is not granted here; it waits with the other catalogs (BL-680).
-- The managers that already exist get the two rights in the next migration.
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
 'notifications.read','notifications.read_own','notifications.preferences.write_own'))
 or (role_class = 'employee' and employee_eligible);
$function$;
