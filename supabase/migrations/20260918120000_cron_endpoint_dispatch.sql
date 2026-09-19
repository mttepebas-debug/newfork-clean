-- OPS-014: Vercel Hobby has no minute cron, so Postgres calls the API instead.
-- pg_net posts to the internal endpoints; the URL and the shared secret live in
-- Vault, never in this file. Without both secrets every job is a no-op, which is
-- what local and fresh databases get.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function app_private.dispatch_cron_endpoint(endpoint_path text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_url text;
  cron_secret text;
begin
  select decrypted_secret into base_url
  from vault.decrypted_secrets where name = 'app_api_url';
  select decrypted_secret into cron_secret
  from vault.decrypted_secrets where name = 'cron_secret';

  -- No configuration means no call: local databases stay quiet and a restored
  -- backup never posts to someone else's deployment.
  if base_url is null or cron_secret is null then
    return null;
  end if;

  return net.http_post(
    url := rtrim(base_url, '/') || endpoint_path,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
end;
$$;

revoke all on function app_private.dispatch_cron_endpoint(text)
from public, anon, authenticated;

-- Idempotent scheduling: re-running the migration re-points the same job name.
select cron.unschedule(jobid)
from cron.job
where jobname = 'notification-outbox';

select cron.schedule(
  'notification-outbox',
  '* * * * *',
  $$select app_private.dispatch_cron_endpoint('/internal/cron/notification-outbox');$$
);
