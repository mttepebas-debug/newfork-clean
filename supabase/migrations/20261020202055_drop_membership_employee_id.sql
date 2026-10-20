-- UYELIK-BAG (Mert 2026-10-20, "Silinsin"): workspace_memberships.employee_id was filled once, by the backfill in
-- 20260921100100_join_lifecycle_model.sql, and never written again: no setup, invitation, rehire or onboarding
-- sets it, so every newer membership has it null. Nothing reads it; a membership finds its employee record by its
-- account (employee_profiles.user_id = workspace_memberships.user_id, as has_app and the lineup reads do). A column
-- that says "the employee record this membership is" and is null for new people misleads whoever trusts it.

alter table public.workspace_memberships drop constraint workspace_memberships_employee_id_fkey;
alter table public.workspace_memberships drop column employee_id;
