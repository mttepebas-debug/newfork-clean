-- Harbor & Vine demo content, part 2: announcements, important dates, documents.
-- Everything goes through the product's own *_service functions, as the right actor, with tests.settle() between steps.
-- Run once after world.sql / people.sql: psql -h 127.0.0.1 -p 55432 -U postgres -d app -f /srv/orig/data2.sql
-- Storage is stubbed: uploaded document files are recorded by path only, there is no file behind them.
\set ON_ERROR_STOP 1
begin;

-- 1. Announcements
create temp table demo_ann(key text primary key, id uuid, revision integer);

-- A: published, all locations, everyone; acknowledged by several employees
with s as (select public.save_announcement_audience_service(tests.user('hv:owner'), tests.id('hv'), null, null,
  'Updated uniform policy',
  E'Starting Monday, October 19, all front-of-house staff wear the new charcoal aprons with black button-downs, black pants and closed-toe non-slip shoes. Kitchen staff keep chef whites and hats. Pick up two aprons from your manager this week.\n\nPlease tap Acknowledge so we know you have read this.',
  'general', array['employee','manager','admin'], array[]::uuid[], null, null, null, '{}'::uuid[], '{}'::uuid[]) r)
insert into demo_ann select 'uniform', (r->>'announcement_id')::uuid, (r->>'revision')::int from s;
select tests.settle();
select public.publish_announcement_service(tests.user('hv:owner'), tests.id('hv'), id, revision) from demo_ann where key='uniform';
select tests.settle();
select public.acknowledge_announcement_service(tests.user('hv:' || who), tests.id('hv'), (select id from demo_ann where key='uniform'))
from unnest(array['maria','jake','carlos','emma']) who;
select tests.settle();

-- B: published, Downtown only, operations
with s as (select public.save_announcement_audience_service(tests.user('hv:owner'), tests.id('hv'), null, null,
  'Patio heaters are in',
  E'The four new propane heaters are installed on the Downtown patio. Openers: turn them on at 4:30 PM when it is below 60°F. Closers: shut the valves and cover them before you leave. Spare tanks are in the cage behind the dish pit.',
  'operations', array['employee','manager'], array[tests.id('hv:D')], null, null, null, '{}'::uuid[], '{}'::uuid[]) r)
insert into demo_ann select 'heaters', (r->>'announcement_id')::uuid, (r->>'revision')::int from s;
select tests.settle();
select public.publish_announcement_service(tests.user('hv:owner'), tests.id('hv'), id, revision) from demo_ann where key='heaters';
select tests.settle();

-- C: scheduled for a future date
with s as (select public.save_announcement_audience_service(tests.user('hv:owner'), tests.id('hv'), null, null,
  'Holiday party RSVP',
  E'Our team holiday party is Monday, December 14 at the Uptown location from 9 PM, after close. Food, drinks and a white-elephant gift swap ($25 limit). Plus-ones welcome. Please RSVP to Laura by December 4.',
  'general', array[]::text[], array[]::uuid[], (date '2026-11-02' + time '10:00') at time zone 'America/New_York', null, null, '{}'::uuid[], '{}'::uuid[]) r)
insert into demo_ann select 'party', (r->>'announcement_id')::uuid, (r->>'revision')::int from s;
select tests.settle();
select public.publish_announcement_service(tests.user('hv:owner'), tests.id('hv'), id, revision) from demo_ann where key='party';
select tests.settle();

-- D: owner draft
select public.save_announcement_audience_service(tests.user('hv:owner'), tests.id('hv'), null, null,
  'New fall menu tasting',
  E'We are rolling out the fall menu on November 2. Staff tasting is Sunday, October 25 at 3 PM at Downtown: braised short rib, butternut squash agnolotti, apple cider donuts and three new cocktails. Servers and bartenders, come hungry and bring questions.',
  'general', array['employee','manager'], array[]::uuid[], null, null, null, '{}'::uuid[], '{}'::uuid[]);
select tests.settle();

-- E: Hannah's draft (Downtown, kitchen)
select public.save_announcement_audience_service(tests.user('hv:hannah'), tests.id('hv'), null, null,
  'Inventory night',
  E'Full inventory count Sunday, October 25 after close at Downtown. Kitchen: walk-in, dry storage and freezer. Bar: liquor room and kegs. Plan on about 90 minutes; it is paid time. Pizza is on us.',
  'operations', array['employee'], array[tests.id('hv:D')], null, null, null, array[tests.id('hv:kitchen'), tests.id('hv:bar')], '{}'::uuid[]);
select tests.settle();

-- F: archived (published, then archived)
with s as (select public.save_announcement_audience_service(tests.user('hv:owner'), tests.id('hv'), null, null,
  'Summer patio hours',
  E'Through Labor Day the Downtown patio is open until 11 PM Friday and Saturday. Last seating outside is 10:15 PM.',
  'schedule', array['employee','manager'], array[tests.id('hv:D')], null, null, null, '{}'::uuid[], '{}'::uuid[]) r)
insert into demo_ann select 'summer', (r->>'announcement_id')::uuid, (r->>'revision')::int from s;
select tests.settle();
update demo_ann set revision = (public.publish_announcement_service(tests.user('hv:owner'), tests.id('hv'), id, revision)->>'revision')::int where key='summer';
select tests.settle();
select public.set_announcement_state_service(tests.user('hv:owner'), tests.id('hv'), id, revision, 'archive') from demo_ann where key='summer';
select tests.settle();


-- 2. Important dates and closed days (Settings -> Important dates)
select public.save_important_date_service(tests.user('hv:owner'), tests.id('hv'), null,
  'Halloween', 'holiday', date '2026-10-31', date '2026-10-31', 'annual',
  'Costumes welcome for staff (keep them kitchen-safe). Expect a late rush after 9 PM.', true, array[]::uuid[], null);
select tests.settle();
select public.save_important_date_service(tests.user('hv:owner'), tests.id('hv'), null,
  'Fall menu launch', 'event', date '2026-11-02', date '2026-11-02', 'none',
  'New fall menu goes live at both locations. All hands for lunch and dinner service.', true, array[]::uuid[], null);
select tests.settle();
select public.save_important_date_service(tests.user('hv:owner'), tests.id('hv'), null,
  'Private event: Hoffman rehearsal dinner', 'event', date '2026-11-14', date '2026-11-14', 'none',
  'Full buyout of Uptown from 5 PM, 80 guests, plated three-course menu and open bar. Extra servers and a second bartender needed.', true, array[tests.id('hv:U')], null);
select tests.settle();
select public.save_important_date_service(tests.user('hv:owner'), tests.id('hv'), null,
  'Thanksgiving Day', 'closed_day', date '2026-11-26', date '2026-11-26', 'none',
  'Both locations closed. Enjoy the day with your families.', true, array[]::uuid[], null);
select tests.settle();
select public.save_important_date_service(tests.user('hv:owner'), tests.id('hv'), null,
  'Christmas Day', 'closed_day', date '2026-12-25', date '2026-12-25', 'annual',
  'Both locations closed.', true, array[]::uuid[], null);
select tests.settle();
select public.save_important_date_service(tests.user('hv:owner'), tests.id('hv'), null,
  'New Year''s Eve time-off blackout', 'blackout', date '2026-12-28', date '2027-01-02', 'none',
  'Our busiest week of the year. Time off requests for these dates are not approved except for emergencies.', true, array[]::uuid[], null);
select tests.settle();


-- 3. Documents (Settings -> Documents)
create temp table demo_doc(key text primary key, id uuid);

-- Saves a document type draft as the owner, the way the API's save does.
create function pg_temp.doc_draft(k text, payload jsonb) returns uuid language plpgsql as $$
declare saved uuid;
begin
  saved := public.save_document_type_draft_service(tests.user('hv:owner'), tests.id('hv'), null, null, payload);
  insert into demo_doc values (k, saved);
  perform tests.settle();
  return saved;
end $$;

-- Publishes with the preview the owner was shown (Settings -> Documents -> Publish).
create function pg_temp.doc_publish(k text, reason text) returns jsonb language plpgsql as $$
declare preview jsonb; result jsonb; doc uuid := (select id from demo_doc where key = k);
begin
  preview := public.preview_document_publication_service(tests.user('hv:owner'), tests.id('hv'), doc);
  result := public.set_document_publication_service(tests.user('hv:owner'), tests.id('hv'), doc,
    (preview->>'revision')::int, (preview->>'publication_revision')::int, preview->>'preview_token', reason, 'published');
  perform tests.settle();
  return result;
end $$;

-- An employee uploads one file (storage is not involved: the path is only recorded) and submits it.
create function pg_temp.doc_submit(person text, k text, filename text, expiry date) returns uuid language plpgsql as $$
declare
  r public.employee_onboarding_requirements;
  rev integer;
  ext text := case when filename like '%.pdf' then 'pdf' when filename like '%.png' then 'png' else 'jpg' end;
  media text := case ext when 'pdf' then 'application/pdf' when 'png' then 'image/png' else 'image/jpeg' end;
begin
  select * into r from public.employee_onboarding_requirements q
  where q.employee_id = tests.id('hv:' || person) and q.source_id = (select id from demo_doc where key = k) and q.kind = 'document';
  if r.id is null then raise exception 'no % requirement for %', k, person; end if;
  rev := public.save_employee_document_draft_file_service(tests.user('hv:' || person), r.id, r.lifecycle_revision,
    r.workspace_id || '/' || r.employee_id || '/' || r.id || '/' || gen_random_uuid() || '.' || ext,
    filename, media, 180000 + (abs(hashtext(person || k)) % 900000));
  perform tests.settle();
  perform public.submit_employee_document_lifecycle_service(tests.user('hv:' || person), r.id, rev,
    (select s.id from public.employee_document_submissions s where s.requirement_id = r.id and s.state = 'draft'), expiry, '{}'::jsonb);
  perform tests.settle();
  return r.id;
end $$;

-- An admin or the owner decides the submitted version (People -> profile -> Documents -> Review).
create function pg_temp.doc_review(reviewer text, person text, k text, decision text, reason text) returns integer language plpgsql as $$
declare r public.employee_onboarding_requirements; result integer;
begin
  select * into r from public.employee_onboarding_requirements q
  where q.employee_id = tests.id('hv:' || person) and q.source_id = (select id from demo_doc where key = k) and q.kind = 'document';
  result := public.review_employee_document_lifecycle_service(tests.user('hv:' || reviewer), r.workspace_id, r.id, r.lifecycle_revision,
    r.submitted_document_id, decision, reason, 'full',
    (select jsonb_agg(jsonb_build_object('id', f.file_id, 'decision', 'keep')) from public.employee_document_submission_files f where f.submission_id = r.submitted_document_id));
  perform tests.settle();
  return result;
end $$;

select pg_temp.doc_draft('food', jsonb_build_object(
  'title', 'Food Handler Card',
  'description', 'NYC food protection certificate or a ServSafe food handler card. Upload a clear photo or scan of the front.',
  'requires_review', true, 'accepted_formats', jsonb_build_array('pdf','jpeg','png'),
  'tracks_expiry', true, 'expiry_warning_days', 30,
  'lifecycle_settings', jsonb_build_object('mode', 'required', 'assignment_scope', 'all_active',
    'target', jsonb_build_object('operator', 'or', 'location_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
      'job_ids', jsonb_build_array(tests.id('hv:job:server'), tests.id('hv:job:bartender'), tests.id('hv:job:linecook')), 'employee_ids', '[]'::jsonb),
    'period_days', 21, 'suspend_on_overdue', false, 'extra_fields', '[]'::jsonb)));
select pg_temp.doc_draft('alcohol', jsonb_build_object(
  'title', 'Alcohol Server Permit',
  'description', 'New York ATAP (Alcohol Training Awareness Program) certificate. Required before your first bar shift.',
  'requires_review', true, 'accepted_formats', jsonb_build_array('pdf','jpeg','png'),
  'tracks_expiry', true, 'expiry_warning_days', 30,
  'lifecycle_settings', jsonb_build_object('mode', 'required', 'assignment_scope', 'all_active',
    'target', jsonb_build_object('operator', 'and', 'location_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
      'job_ids', jsonb_build_array(tests.id('hv:job:bartender')), 'employee_ids', '[]'::jsonb),
    'period_days', 14, 'suspend_on_overdue', false, 'extra_fields', '[]'::jsonb)));
select pg_temp.doc_draft('handbook', jsonb_build_object(
  'title', 'Employee Handbook',
  'description', 'Read the Harbor & Vine handbook and upload the signed acknowledgement page (last page).',
  'requires_review', false, 'accepted_formats', jsonb_build_array('pdf','jpeg','png'),
  'tracks_expiry', false, 'expiry_warning_days', 30,
  'lifecycle_settings', jsonb_build_object('mode', 'required', 'assignment_scope', 'all_active',
    'target', jsonb_build_object('operator', 'and', 'location_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
      'job_ids', '[]'::jsonb, 'employee_ids', '[]'::jsonb),
    'period_days', 30, 'suspend_on_overdue', false, 'extra_fields', '[]'::jsonb)));
select pg_temp.doc_draft('allergen', jsonb_build_object(
  'title', 'Allergen Awareness Training',
  'description', 'Certificate from the 30-minute online allergen awareness course (big 9 allergens, cross-contact, guest communication).',
  'requires_review', true, 'accepted_formats', jsonb_build_array('pdf'),
  'tracks_expiry', true, 'expiry_warning_days', 30,
  'lifecycle_settings', jsonb_build_object('mode', 'optional', 'assignment_scope', 'all_active',
    'target', jsonb_build_object('operator', 'or', 'location_ids', '[]'::jsonb, 'department_ids', jsonb_build_array(tests.id('hv:foh'), tests.id('hv:kitchen')),
      'job_ids', '[]'::jsonb, 'employee_ids', '[]'::jsonb),
    'period_days', null, 'suspend_on_overdue', false, 'extra_fields', '[]'::jsonb)));

select pg_temp.doc_publish('food', 'Required for everyone who handles food or drinks');
select pg_temp.doc_publish('alcohol', 'Required by the SLA for anyone pouring');
select pg_temp.doc_publish('handbook', 'Fall 2026 handbook');

-- Food Handler Card
select pg_temp.doc_submit('maria', 'food', 'maria-food-handler.pdf', date '2027-08-31');
select pg_temp.doc_review('laura', 'maria', 'food', 'approve', '');
select pg_temp.doc_submit('carlos', 'food', 'carlos-servsafe.jpg', current_date + 18);   -- approved, expiring soon
select pg_temp.doc_review('laura', 'carlos', 'food', 'approve', '');
select pg_temp.doc_submit('marcus', 'food', 'marcus-food-protection.pdf', date '2028-03-15');
select pg_temp.doc_review('owner', 'marcus', 'food', 'approve', '');
select pg_temp.doc_submit('jake', 'food', 'jake-food-card.png', date '2027-05-20');      -- waiting for review
select pg_temp.doc_submit('emma', 'food', 'emma-food-handler.pdf', date '2028-01-10');   -- waiting for review
select pg_temp.doc_submit('noah', 'food', 'IMG_4471.jpg', date '2027-11-02');
select pg_temp.doc_review('laura', 'noah', 'food', 'reject', 'The photo is blurry and the expiration date is cut off. Please upload a clear photo of the whole card.');
-- Alcohol Server Permit
select pg_temp.doc_submit('sophie', 'alcohol', 'sophie-atap-certificate.pdf', date '2028-06-30');
select pg_temp.doc_review('laura', 'sophie', 'alcohol', 'approve', '');
select pg_temp.doc_submit('grace', 'alcohol', 'grace-atap.pdf', date '2027-09-12');      -- waiting for review
select pg_temp.doc_submit('jake', 'alcohol', 'jake-atap.pdf', current_date + 25);        -- approved, expiring soon
select pg_temp.doc_review('laura', 'jake', 'alcohol', 'approve', '');
-- Employee Handbook (no review: accepted on submit)
select pg_temp.doc_submit(p, 'handbook', p || '-handbook-signature.pdf', null)
from unnest(array['hannah','ryan','laura','maria','priya','carlos','sophie','emma','marcus','olivia','tom']) p;

select public.sync_expiring_document_todos_service(tests.id('hv'));
select tests.settle();


-- Summary
select status, archived_at is not null as archived, count(*) from public.announcements where workspace_id = tests.id('hv') group by 1, 2 order by 1, 2;
select type, count(*) from public.important_dates where workspace_id = tests.id('hv') group by 1 order by 1;
select d.title, d.publication_status, count(r.id) as assigned from public.document_types d left join public.employee_onboarding_requirements r on r.source_id = d.id and r.kind = 'document' where d.workspace_id = tests.id('hv') group by d.id, d.title, d.publication_status, d.sort_order order by d.sort_order;
commit;
