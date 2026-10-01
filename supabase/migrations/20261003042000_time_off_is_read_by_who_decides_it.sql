-- FB-6.3.8c (user decisions 2026-10-01, KARARLAR "İzin"): a time-off request,
-- waiting or closed, and a request to cancel approved time off, are read in
-- Requests and counted on Workspace home only by the people who decide them:
-- one rank up, nobody their own. Ayşe and Hande manage Kadıköy; Hande's request
-- is read by an admin and the owner, not by Ayşe. The person follows their own
-- on Employee hub. Approved time off stays on the Schedule for everybody in
-- scope (M2), and the Publish note still mentions a waiting request.
--
-- Both readers (get_schedule_requests_service, get_workspace_dashboard_service)
-- already ask the core person by person with requests.read; the rule now
-- carries the same rank as time_off.revoke. Who reads is measured on the
-- person's locations today, as revoke is; the vote stays on the locations
-- fixed when the request was sent.
update app_private.authz_actions
set rank_below = true, no_self = true
where key = 'requests.read';
