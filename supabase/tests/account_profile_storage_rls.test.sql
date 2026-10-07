begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select is(
  (select public from storage.buckets where id = 'account-profile-photos'),
  false,
  'global account profile photo bucket is private'
);
select is(
  (select file_size_limit from storage.buckets where id = 'account-profile-photos'),
  5242880::bigint,
  'global account profile photos are capped at 5 MB'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'account-profile-photos'),
  array['image/jpeg', 'image/png', 'image/webp'],
  'global account profile photos restrict MIME types'
);
select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and (
        (table_name = 'user_profiles' and column_name in ('phone_e164', 'avatar_object_path'))
        or (table_name = 'user_preferences' and column_name in ('time_format', 'date_format'))
      )
  ),
  4,
  'account profile and display preference columns are present'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('71000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'avatar-one@example.test', '', '{}', '{}', now(), now()),
  ('71000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'avatar-two@example.test', '', '{}', '{}', now(), now());

insert into public.user_profiles (user_id, display_name, phone_e164)
values (
  '71000000-0000-4000-8000-000000000001',
  'Avatar One',
  '+14155550101'
);
insert into public.user_preferences (user_id)
values ('71000000-0000-4000-8000-000000000001');

select is(
  (select time_format::text from public.user_preferences where user_id = '71000000-0000-4000-8000-000000000001'),
  'system',
  'existing account preference writes default personal time format to System'
);
select is(
  (select date_format::text from public.user_preferences where user_id = '71000000-0000-4000-8000-000000000001'),
  'system',
  'existing account preference writes default personal date format to System'
);

select lives_ok(
  $$update public.user_profiles
    set avatar_object_path = '71000000-0000-4000-8000-000000000001/profile/71000000-0000-4000-8000-000000000011.jpg'
    where user_id = '71000000-0000-4000-8000-000000000001'$$,
  'account can reference its own profile avatar path'
);
select throws_ok(
  $$update public.user_profiles
    set avatar_object_path = '71000000-0000-4000-8000-000000000002/profile/71000000-0000-4000-8000-000000000012.jpg'
    where user_id = '71000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'account profile rejects an avatar path owned by another user'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'account_profile_photos_select_own',
        'account_profile_photos_insert_own',
        'account_profile_photos_update_own',
        'account_profile_photos_delete_own'
      )
      and roles::text like '%authenticated%'
  ),
  4,
  'private account profile bucket exposes only four own-user policies'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values (
      'account-profile-photos',
      '71000000-0000-4000-8000-000000000001/profile/71000000-0000-4000-8000-000000000011.jpg',
      '71000000-0000-4000-8000-000000000001'
    )$$,
  'account can insert metadata for its own private avatar path'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values (
      'account-profile-photos',
      '71000000-0000-4000-8000-000000000002/profile/71000000-0000-4000-8000-000000000012.jpg',
      '71000000-0000-4000-8000-000000000001'
    )$$,
  '42501',
  null,
  'account cannot insert an avatar under another user path'
);
select is(
  (
    select count(*)::integer
    from storage.objects
    where bucket_id = 'account-profile-photos'
  ),
  1,
  'account can read its own private avatar metadata'
);

select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000002', true);
select is(
  (
    select count(*)::integer
    from storage.objects
    where bucket_id = 'account-profile-photos'
  ),
  0,
  'another account cannot read private avatar metadata'
);

select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values (
      'account-profile-photos',
      '71000000-0000-4000-8000-000000000001/profile/71000000-0000-4000-8000-000000000013.gif',
      '71000000-0000-4000-8000-000000000001'
    )$$,
  '42501',
  null,
  'account cannot insert an unsupported avatar extension'
);

select * from finish();
rollback;
