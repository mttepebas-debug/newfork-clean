-- OPS-014 follow-up: the other three cron endpoints lost their trigger with the
-- Vercel cron entry, so they run from Postgres too. Same dispatcher, same Vault
-- secrets, so a database without them stays quiet.
-- Cadence (user decision, 2026-09-19): lifecycle workers daily, exports every
-- five minutes because users schedule them at a chosen time of day.
select cron.unschedule(jobid)
from cron.job
where jobname in ('account-deletion', 'workspace-retention', 'scheduled-exports');

select cron.schedule(
  'account-deletion',
  '15 3 * * *',
  $$select app_private.dispatch_cron_endpoint('/api/internal/cron/account-deletion');$$
);

select cron.schedule(
  'workspace-retention',
  '30 3 * * *',
  $$select app_private.dispatch_cron_endpoint('/api/internal/cron/workspace-retention');$$
);

select cron.schedule(
  'scheduled-exports',
  '*/5 * * * *',
  $$select app_private.dispatch_cron_endpoint('/api/internal/cron/scheduled-exports');$$
);
