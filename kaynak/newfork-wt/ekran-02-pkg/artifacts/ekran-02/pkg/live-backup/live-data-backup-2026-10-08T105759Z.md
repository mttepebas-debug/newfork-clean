# Live backup before the EKRAN-02 data package (hvyvyisrqyathtliyyyv), 2026-10-08 10:57:59Z
Only SELECTs. Full text of every function the package replaces: functions-before.sql (taken from the
local DB; live md5s equal the local ones for all 31 existing functions, live-md5.txt = local-md5.txt).

- role_permissions_to_delete (K-S3 delete in 020200): 0
- app_private.time_off_sweep_failures exists: false (created by 020200)
- cron job time-off-deadlines: '*/5 * * * *' -> select app_private.time_off_sweep()
- app_private.role_permission_dependencies: 33 rows; the package adds
  ('schedule.time_off_requests.read' requires 'schedule.time_off_requests.manage'); undo = delete that row
- app_private.authz_actions rows the package changes (before):
  exchange.approve: effect write, no_self true, rank_below true, scope_class place, permission_key schedule.shift_change_requests.manage
  exchange.read:    effect read, scope_class place, permission_key schedule.shift_change_requests.read
  requests.read:    effect read, no_self true, rank_below true, scope_class person, permission_key schedule.time_off_requests.read
  (columns owner_target_ok and documents_ok do not exist yet; 020100 / 020200 add them)
