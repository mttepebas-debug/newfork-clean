\echo == S4 owner reads all in bell; legacy rows (dashboard source) after
select 'legacy unread before', count(*) from public.notifications where workspace_id='c0100000-0000-4000-8000-000000000001' and recipient_user_id='c0000000-0000-4000-8000-000000000001' and read_at is null and dismissed_at is null;
select public.act_on_notification_inbox_item_v2_service('c0000000-0000-4000-8000-000000000001','c0100000-0000-4000-8000-000000000001',null,'read_all')->>'affected';
select 'bell after', public.get_notification_inbox_v2_service('c0000000-0000-4000-8000-000000000001','c0100000-0000-4000-8000-000000000001',null,null,null,null,null,30)->>'unread_count';
select 'legacy unread after', count(*) from public.notifications where workspace_id='c0100000-0000-4000-8000-000000000001' and recipient_user_id='c0000000-0000-4000-8000-000000000001' and read_at is null and dismissed_at is null;
