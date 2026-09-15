do $$
begin
  create type public.personal_time_format as enum ('system', '12h', '24h');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.personal_date_format as enum (
    'system',
    'MM-DD-YYYY',
    'DD-MM-YYYY',
    'YYYY-MM-DD'
  );
exception
  when duplicate_object then null;
end
$$;

alter table public.user_profiles
  add column if not exists phone_e164 text,
  add column if not exists avatar_object_path text;

alter table public.user_profiles
  drop constraint if exists user_profiles_phone_e164_check;
alter table public.user_profiles
  add constraint user_profiles_phone_e164_check
  check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$');

alter table public.user_profiles
  drop constraint if exists user_profiles_avatar_object_path_check;
alter table public.user_profiles
  add constraint user_profiles_avatar_object_path_check
  check (
    avatar_object_path is null
    or avatar_object_path ~* (
      '^'
      || user_id::text
      || '/profile/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    )
  );

alter table public.user_preferences
  add column if not exists time_format public.personal_time_format not null default 'system',
  add column if not exists date_format public.personal_date_format not null default 'system';

comment on column public.user_profiles.phone_e164 is
  'Normalized international account phone. The legacy phone column remains readable during backward-compatible migration.';
comment on column public.user_profiles.avatar_object_path is
  'Current private global account avatar path: user_id/profile/object_uuid.ext.';
comment on column public.user_preferences.time_format is
  'Personal display-only time format. It does not alter workspace scheduling timezones.';
comment on column public.user_preferences.date_format is
  'Personal display-only date format. It does not alter workspace week-start settings.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'account-profile-photos',
  'account-profile-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists account_profile_photos_select_own on storage.objects;
create policy account_profile_photos_select_own
on storage.objects for select to authenticated
using (
  bucket_id = 'account-profile-photos'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and (storage.foldername(name))[2] = 'profile'
);

drop policy if exists account_profile_photos_insert_own on storage.objects;
create policy account_profile_photos_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'account-profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and (storage.foldername(name))[2] = 'profile'
  and storage.extension(name) in ('jpg', 'png', 'webp')
);

drop policy if exists account_profile_photos_update_own on storage.objects;
create policy account_profile_photos_update_own
on storage.objects for update to authenticated
using (
  bucket_id = 'account-profile-photos'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and (storage.foldername(name))[2] = 'profile'
)
with check (
  bucket_id = 'account-profile-photos'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and (storage.foldername(name))[2] = 'profile'
  and storage.extension(name) in ('jpg', 'png', 'webp')
);

drop policy if exists account_profile_photos_delete_own on storage.objects;
create policy account_profile_photos_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'account-profile-photos'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and (storage.foldername(name))[2] = 'profile'
);
