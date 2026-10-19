-- AVATAR-IKON 3.1, second part: the old avatar fields and services go (design §6 "Silinecekler").
-- Live only after Vercel serves the web and API that no longer read them: today's web reads
-- user_profiles.avatar_object_path whenever it loads a signed-in profile. What replaces them is in
-- 20261019144601_member_avatars.sql.
--
-- The account-profile-photos bucket and its objects stay: deleting live objects is a separate step on
-- the product owner's yes. Only the browser's four write policies on it go here.

-- What goes --------------------------------------------------------------------------------------------

drop function public.get_employee_avatar_path_service(uuid, uuid, uuid);
drop function public.get_own_employee_avatar_path_service(uuid, uuid);
drop function public.remove_employee_avatar_service(uuid, uuid, uuid);

-- The two old fields, with their checks and comments; no old value is kept (CLAUDE.md §3.A.5). The
-- browser's own write to user_profiles (profiles_manage_own) no longer reaches an avatar.
alter table public.employee_private_profiles drop column avatar_object_path;
alter table public.user_profiles drop column avatar_object_path;

-- The browser no longer writes or reads the account photo bucket; the bucket and its objects stay.
drop policy account_profile_photos_select_own on storage.objects;
drop policy account_profile_photos_insert_own on storage.objects;
drop policy account_profile_photos_update_own on storage.objects;
drop policy account_profile_photos_delete_own on storage.objects;
