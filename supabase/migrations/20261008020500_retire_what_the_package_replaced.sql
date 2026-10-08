-- EKRAN-02 veri paketi: what the package replaced retires here, apart from what
-- it adds, so the live database takes it only after main's CI is green
-- (CLAUDE.md §5.1: a migration that removes goes once main CI is green).
-- Nothing calls these any more once 20261008020000-020400 are in.

-- A1: the five candidate checks are one engine now (CLAUDE.md §9: no twin system).
drop function public.weekly_exchange_candidate_check(uuid,uuid,jsonb,uuid[]);
drop function public.weekly_assignment_candidate_check(uuid,uuid,jsonb,uuid[],integer);
drop function public.weekly_assignment_candidate_base(uuid,uuid,jsonb,uuid[],integer);

-- A2, BL-179, BL-189: nothing asks the three Schedule helpers any more (FB-6.1 K-1).
drop function public.schedule_actor_can_manage_service(uuid,uuid,uuid);
drop function public.schedule_actor_can_publish_service(uuid,uuid,uuid);
drop function public.schedule_actor_has_capability_service(uuid,uuid,text,uuid);
