-- A catalog row stays in its workspace (GUVENLIK-A GA-1, BL-232).
-- The Settings forms still write departments, jobs, locations, shift types and
-- shift labels straight from the browser; Settings (screen 10) moves them to
-- the API. Until then a table-wide UPDATE grant let anyone who manages two
-- workspaces move an unused job, an empty department or any shift label from
-- one to the other, and rewrite a row's id and created_at. The browser now
-- updates only the columns the forms send (packages/shared input schemas,
-- apps/web/src/settings/organization-data.ts). Sort order goes through the API.

revoke update on public.departments, public.jobs, public.locations, public.shift_types, public.shift_labels
from authenticated;

grant update (name, color, archived_at, updated_at)
on public.departments to authenticated;

grant update (name, color, department_id, archived_at, updated_at)
on public.jobs to authenticated;

grant update (name, short_name, street_address, city, region, postal_code, country_code, timezone, phone, archived_at, updated_at)
on public.locations to authenticated;

grant update (name, color, default_start_time, default_end_time, archived_at, updated_at)
on public.shift_types to authenticated;

grant update (name, color, archived_at, updated_at)
on public.shift_labels to authenticated;
