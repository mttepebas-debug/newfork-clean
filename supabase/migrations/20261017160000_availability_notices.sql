-- BILDIRIM-U7 (KARARLAR S-133; Mert, 2026-10-17): availability raises no notification at all. Built on
-- hours-only availability (AVAIL-GUN-DB), whose save functions it leaves as they are.
--   * both availability types leave the catalog: availability.updated ("Somebody you manage changed their
--     availability") and availability.mode_changed ("The owner changed how availability works"; the entry
--     mode itself went with AVAIL-GUN-DB). Their notices, the deliveries of those (by cascade) and an
--     owner's mute of them go with them. No producer ever wrote either;
--   * no type can be filed under availability any more;
--   * the Team updates topic says what is left in it: new members and the invitations they answered.

delete from public.person_notifications where type_key in ('availability.updated', 'availability.mode_changed');
delete from public.notification_workspace_muted_types where type_key in ('availability.updated', 'availability.mode_changed');
delete from public.notification_types where key in ('availability.updated', 'availability.mode_changed');

alter table public.notification_types drop constraint notification_types_area_check;
alter table public.notification_types add constraint notification_types_area_check
  check (area in ('schedule', 'shift_changes', 'time_off', 'lineup', 'people', 'documents', 'announcements', 'account',
                  'workspace'));

update public.notification_topics set description = 'New members joining, and invitations declined or cancelled.'
where key = 'team';
