-- OPS-014 follow-up: on the hosted deployment only /api, /v1, /schedule and
-- /health reach the API function; everything else falls through to the web app
-- (vercel.json rewrites). A post to /internal/... would have quietly received
-- HTML, so the scheduled call goes through the /api prefix instead.
select cron.unschedule(jobid)
from cron.job
where jobname = 'notification-outbox';

select cron.schedule(
  'notification-outbox',
  '* * * * *',
  $$select app_private.dispatch_cron_endpoint('/api/internal/cron/notification-outbox');$$
);
