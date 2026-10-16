begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select is(
  (
    with fk as (
      select
        constraint_row.oid,
        constraint_row.conrelid,
        constraint_row.confrelid,
        pg_get_constraintdef(constraint_row.oid) as definition
      from pg_constraint constraint_row
      where constraint_row.contype = 'f'
        and constraint_row.connamespace = 'public'::regnamespace
    ),
    workspace_owned_tables as (
      select table_name
      from information_schema.columns
      where table_schema = 'public'
        and column_name = 'workspace_id'
    )
    select count(*)::integer
    from fk
    join workspace_owned_tables child
      on child.table_name = fk.conrelid::regclass::text
      or child.table_name = split_part(fk.conrelid::regclass::text, '.', 2)
    join workspace_owned_tables parent
      on parent.table_name = fk.confrelid::regclass::text
      or parent.table_name = split_part(fk.confrelid::regclass::text, '.', 2)
    where fk.confrelid <> 'public.workspaces'::regclass
      and fk.definition not like '%workspace_id%'
  ),
  0,
  'tenant-owned public table foreign keys include workspace_id when the referenced table is tenant-owned'
);

select is(
  (
    select count(*)::integer
    from pg_constraint
    where contype = 'u'
      and conname in (
        'schedule_edit_sessions_id_workspace_id_key',
        'schedule_location_publications_id_workspace_id_key',
        'schedule_published_shifts_id_workspace_id_key'
      )
  ),
  3,
  'parent tables expose explicit id/workspace_id keys for tenant-owned composite references'
);

select * from finish();
rollback;
