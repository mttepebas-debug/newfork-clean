-- FB-6.1.9: Settings > Roles reads through the API
-- (read_role_workspace_service, 20260927100000). The browser RPC it replaced
-- was the last SECURITY DEFINER function the browser could call; it goes, so
-- the role catalog has one read path (no twin).
drop function public.read_role_workspace(uuid);
