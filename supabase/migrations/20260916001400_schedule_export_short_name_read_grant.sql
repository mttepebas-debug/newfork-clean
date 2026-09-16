-- Match the existing column-scoped service read grant for location enrichment.
-- Actor/workspace/location authorization still comes from the schedule read RPC.
grant select (short_name) on public.locations to service_role;
