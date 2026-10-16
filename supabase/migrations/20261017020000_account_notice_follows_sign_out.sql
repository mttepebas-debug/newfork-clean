-- BILDIRIM-U1 review (nf-guvenlik LOW 1): the password notice said "Your other devices were signed out"
-- even when signing them out failed, and the sign-out that follows a password change was told apart from
-- one on its own by a two-minute window. The API now says what happened, in the audit row's metadata:
--   * account.password_changed {others_signed_out}: the notice says the other devices were signed out
--     only when they were;
--   * account.sessions_revoked {with_password_change}: the password's notice already says it, so there is
--     no second notice (S-95). No window, no guess.
-- record_account_security_event_service takes the metadata as a third argument; its two-argument form goes
-- (retired_objects_stay_gone).

drop function public.record_account_security_event_service(uuid, text);

create function public.record_account_security_event_service(actor_user_id uuid, target_event text,
  target_metadata jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  audit_id uuid;
  said jsonb := coalesce(target_metadata, '{}'::jsonb);
begin
 if target_event is null or target_event not in ('account.email_change_requested','account.password_changed','account.sessions_revoked') then
  raise exception 'unsupported account security event' using errcode='22023';
 end if;
 if actor_user_id is null or not exists(select 1 from auth.users u where u.id=actor_user_id and u.deleted_at is null) then
  raise exception 'account session required' using errcode='42501', hint='authz.not_active';
 end if;
 -- Only what each event can say, as true or false.
 if jsonb_typeof(said) <> 'object' or exists (
   select 1 from jsonb_each(said) x
   where x.key <> case target_event when 'account.password_changed' then 'others_signed_out'
                                    when 'account.sessions_revoked' then 'with_password_change' else '' end
      or jsonb_typeof(x.value) <> 'boolean'
 ) then
  raise exception 'unsupported account security event details' using errcode='22023';
 end if;
 audit_id := app_private.record_security_audit_event_service(actor_user_id,null,target_event,'account.security','auth_user',actor_user_id::text,said);
 perform app_private.notify_account_security(actor_user_id, target_event, audit_id);
 return audit_id;
end; $$;

revoke all on function public.record_account_security_event_service(uuid, text, jsonb) from public;
grant all on function public.record_account_security_event_service(uuid, text, jsonb) to service_role;

create or replace function app_private.notify_account_security(target_user uuid, target_event text, target_audit_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  said jsonb := coalesce((select e.metadata from app_private.security_audit_events e where e.id = target_audit_id), '{}'::jsonb);
  kind text;
  heading text;
  body text;
begin
  case target_event
    when 'account.password_changed' then
      kind := 'account.password_changed';
      heading := 'Your password was changed';
      body := case when (said ->> 'others_signed_out')::boolean
        then 'Your other devices were signed out. If this wasn''t you, reset your password now.'
        else 'If this wasn''t you, reset your password now.' end;
    when 'account.sessions_revoked' then
      -- Signed out as part of a password change: that notice says so.
      if coalesce((said ->> 'with_password_change')::boolean, false) then
        return 0;
      end if;
      kind := 'account.signed_out_elsewhere';
      heading := 'You signed out everywhere else';
      body := 'Your other devices were signed out. If this wasn''t you, change your password now.';
    when 'account.email_change_requested' then
      kind := 'account.sign_in_email_changed';
      heading := 'A sign-in email change was asked for';
      body := 'Confirm it from the link sent to the new address. If this wasn''t you, cancel it on the Security page.';
    when 'account.email_change_cancelled' then
      kind := 'account.sign_in_email_changed';
      heading := 'Your sign-in email change was cancelled';
      body := 'You still sign in with the same email.';
    else
      return 0;
  end case;
  return app_private.notify(
    kind, null, array[target_user], 'security:' || target_audit_id::text, heading, body, '/account/security',
    target_user, 'account', target_user
  );
end;
$$;
