-- JOIN-002: the plan keeps a workspace's state in one field, so the lifecycle
-- enum has to carry the states it was missing, and a membership has to be
-- able to say someone was removed rather than only suspended.
--
-- Only two states were actually missing. The plan's "closed" already exists
-- under the name 'deleted', which seven functions write and read, so it keeps
-- that name: a difference in wording is not a difference in behaviour.
--
-- This migration adds nothing but labels, on purpose: a value added by
-- ALTER TYPE cannot be used in the same transaction, so everything that reads
-- or writes them lives in the next migration. The type itself is not swapped —
-- 72 functions name these two types, and the unused 'invited' label produces no
-- behaviour. A pgTAP test bans it instead.
alter type public.workspace_lifecycle_status add value if not exists 'draft' before 'active';
alter type public.workspace_lifecycle_status add value if not exists 'suspended' after 'active';
alter type public.membership_status add value if not exists 'removed';
