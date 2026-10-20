-- DAVET-ERISIM part 2 of 2 (Tur 4 B; ROL-CIFT 6.1 and 6.3): once the code on main calls only the two-access
-- services (20261020130000), the one-role road goes: the role service behind PATCH /role, the one-role
-- invitation and create calls, place_single_role, and manages_follow_works. Nothing places one role into two
-- slots any more. Applied to the live database only after main's CI is green (CLAUDE.md: a dropping migration
-- goes after the code that no longer uses it).
drop function public.update_employee_membership_role_service(uuid, uuid, uuid, uuid);
drop function public.prepare_employee_invitation_service(uuid, uuid, uuid, text, uuid, text, timestamptz);
drop function public.create_employee_command_service(uuid, uuid, uuid, jsonb, uuid);
drop function app_private.place_single_role(uuid, uuid);
drop function app_private.manages_follow_works(uuid);
