begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- Isolated records; the standard local seed supplies the workspace and its owner.
-- Location A is published from a named draft, location B by a publication with no draft.
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,timezone)
values
  ('T00041','db000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','Source name A','1 Main St','Los Angeles','CA','90001','America/Los_Angeles'),
  ('T00042','db000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','Source name B','2 Main St','Los Angeles','CA','90001','America/Los_Angeles');
insert into public.schedule_drafts(id,workspace_id,week_start,name,revision,created_by,updated_by)
values('db000000-0000-4000-8000-000000000003','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2031-03-03','Spring week final',1,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','d9f43e62-e099-48e1-bc6f-a5aabe8e87d5');
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by,source_draft_id)
values
  ('db000000-0000-4000-8000-000000000004','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','db000000-0000-4000-8000-000000000001','2031-03-03',1,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','db000000-0000-4000-8000-000000000003'),
  ('db000000-0000-4000-8000-000000000005','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','db000000-0000-4000-8000-000000000002','2031-03-03',1,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5',null);

create temp table status_for(location_id uuid, fields jsonb);
create function pg_temp.read_status() returns void language sql as $$
  delete from status_for;
  insert into status_for
  select (location->>'id')::uuid, location
    from jsonb_array_elements(
      public.get_schedule_publication_status_service(
        'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5',
        '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
        '2031-03-03'
      )->'locations'
    ) location;
$$;

select pg_temp.read_status();
select is(
  (select fields->>'source_draft_name' from status_for where location_id='db000000-0000-4000-8000-000000000001'),
  'Spring week final',
  'the status names the draft a location was published from'
);
select is(
  (select fields->>'source_draft_id' from status_for where location_id='db000000-0000-4000-8000-000000000001'),
  'db000000-0000-4000-8000-000000000003',
  'the status carries that draft''s id'
);
select ok(
  (select fields->'source_draft_id' = 'null'::jsonb and fields->'source_draft_name' = 'null'::jsonb
     from status_for where location_id='db000000-0000-4000-8000-000000000002'),
  'a publication with no draft leaves both fields null'
);

select public.delete_schedule_draft_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','db000000-0000-4000-8000-000000000003');
select pg_temp.read_status();
select is(
  (select fields->>'source_draft_name' from status_for where location_id='db000000-0000-4000-8000-000000000001'),
  'Spring week final',
  'a deleted (archived) draft keeps the name it was published under'
);

-- The menu says who published, never "Unknown" (BL-371).
select is(
  (select fields->>'published_by_name' from status_for where location_id='db000000-0000-4000-8000-000000000002'),
  'Local Owner',
  'the status names who published the location'
);

select * from finish();
rollback;
