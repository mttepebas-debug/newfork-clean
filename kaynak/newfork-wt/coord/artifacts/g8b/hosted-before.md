# G8b hosted backup (2026-10-01, before 20261003020000)
Hosted last migration: 20261003010000. Helper app_private.schedule_referenced_catalog: absent.
Bodies on hosted equal the repo's last definitions (nf-db and nf-guvenlik compared):
- public.get_schedule_read_model_service(uuid,uuid,date): supabase/migrations/20260928070000_reads_know_management_and_owner.sql (from line 64)
- public.get_employee_schedule_board_service(uuid,uuid,date): supabase/migrations/20260928090000_the_team_board_reads_like_the_schedule.sql (from line 12)
Grants (both): EXECUTE to service_role, postgres.
Rollback: forward migration re-creating both from those files, then
  drop function app_private.schedule_referenced_catalog(...);
