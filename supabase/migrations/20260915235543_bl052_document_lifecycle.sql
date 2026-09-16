-- BL-052/001: additive lifecycle foundation. Existing files and decisions stay intact.
-- No deadline or suspension is assigned to an existing employee by this migration.
alter table public.document_types
  add column lifecycle_revision integer not null default 1 check (lifecycle_revision > 0),
  add column lifecycle_settings jsonb;
update public.document_types set lifecycle_settings = jsonb_build_object(
  'mode', case when required_at_onboarding then 'required' else 'optional' end,
  'target', jsonb_build_object('location_ids','[]'::jsonb,'department_ids','[]'::jsonb,'job_ids','[]'::jsonb,'employee_ids','[]'::jsonb),
  'assignment_scope','future_onboarding','period_days',null,'suspend_on_overdue',false,'extra_fields','[]'::jsonb);
alter table public.document_types alter column lifecycle_settings set not null;
alter table public.document_types alter column lifecycle_settings set default
 '{"mode":"optional","target":{"location_ids":[],"department_ids":[],"job_ids":[],"employee_ids":[]},"assignment_scope":"future_onboarding","period_days":null,"suspend_on_overdue":false,"extra_fields":[]}'::jsonb;

alter table public.employee_onboarding_requirements
  add column lifecycle_revision integer not null default 1 check (lifecycle_revision > 0),
  add column lifecycle_settings jsonb,
  add column lifecycle_user_id uuid references auth.users(id),
  add column deadline_at timestamptz,
  add column paused_remaining_seconds numeric check (paused_remaining_seconds >= 0),
  add column document_suspended_at timestamptz,
  add column lifecycle_closed_at timestamptz,
  add column lifecycle_close_reason text,
  add column lifecycle_exempt boolean not null default false,
  add column conditional_reason text,
  add column submitted_document_id uuid,
  add column approved_document_id uuid;

update public.employee_onboarding_requirements r set
 lifecycle_user_id = e.user_id,
 lifecycle_settings = jsonb_build_object(
  'mode',case when r.required then 'required' else 'optional' end,
  'target',jsonb_build_object('location_ids','[]'::jsonb,'department_ids','[]'::jsonb,'job_ids','[]'::jsonb,'employee_ids','[]'::jsonb),
  'assignment_scope','future_onboarding','period_days',null,'suspend_on_overdue',false,'extra_fields','[]'::jsonb)
from public.employee_profiles e where e.id=r.employee_id and e.workspace_id=r.workspace_id and r.kind in ('document','acknowledgement');

-- Composite references prevent a file/submission from crossing employee or tenant.
alter table public.employee_onboarding_requirements add constraint document_requirement_identity unique(id,workspace_id,employee_id);
alter table public.employee_documents add constraint document_file_identity unique(id,requirement_id,workspace_id,employee_id);
create table public.employee_document_submissions (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 employee_id uuid not null,
 requirement_id uuid not null,
 user_id uuid not null references auth.users(id),
 version integer not null check(version>0),
 state text not null check(state in ('draft','pending_review','accepted','rejected','superseded')),
 expiry_date date,
 metadata jsonb not null default '{}' check(jsonb_typeof(metadata)='object'),
 submitted_at timestamptz,
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id),
 rejection_reason text,
 created_at timestamptz not null default now(),
 foreign key(requirement_id,workspace_id,employee_id) references public.employee_onboarding_requirements(id,workspace_id,employee_id) on delete cascade,
 unique(requirement_id,version), unique(id,requirement_id,workspace_id,employee_id), unique(id,requirement_id),
 check(state<>'rejected' or nullif(btrim(rejection_reason),'') is not null),
 check(state='draft' or submitted_at is not null)
);
create unique index document_one_draft on public.employee_document_submissions(requirement_id) where state='draft';
create table public.employee_document_submission_files (
 submission_id uuid not null,
 file_id uuid not null,
 requirement_id uuid not null,
 workspace_id uuid not null,
 employee_id uuid not null,
 decision text not null default 'keep' check(decision in ('keep','discard')),
 note text not null default '' check(char_length(note)<=500),
 primary key(submission_id,file_id),
 foreign key(submission_id,requirement_id,workspace_id,employee_id) references public.employee_document_submissions(id,requirement_id,workspace_id,employee_id) on delete cascade,
 foreign key(file_id,requirement_id,workspace_id,employee_id) references public.employee_documents(id,requirement_id,workspace_id,employee_id) on delete restrict
);
alter table public.employee_document_submissions enable row level security;
alter table public.employee_document_submission_files enable row level security;
revoke all on public.employee_document_submissions,public.employee_document_submission_files from public,anon,authenticated;
grant all on public.employee_document_submissions,public.employee_document_submission_files to service_role;
-- Authenticated clients use authorized RPCs through the API, not unrestricted table reads.

insert into public.employee_document_submissions(id,workspace_id,employee_id,requirement_id,user_id,version,state,expiry_date,submitted_at,reviewed_at,reviewed_by,rejection_reason,created_at)
select id,workspace_id,employee_id,requirement_id,uploaded_by,version_number,
 case review_status::text when 'awaiting_review' then 'pending_review' else review_status::text end,
 expiry_date,created_at,reviewed_at,reviewed_by,
 case when review_status='rejected' then coalesce(nullif(btrim(rejection_reason),''),'Legacy rejection') else rejection_reason end,created_at
from public.employee_documents;
insert into public.employee_document_submission_files(submission_id,file_id,requirement_id,workspace_id,employee_id)
select id,id,requirement_id,workspace_id,employee_id from public.employee_documents;
update public.employee_onboarding_requirements r set
 submitted_document_id=(select s.id from public.employee_document_submissions s where s.requirement_id=r.id and s.state<>'superseded' order by s.version desc limit 1),
 approved_document_id=(select s.id from public.employee_document_submissions s where s.requirement_id=r.id and s.state='accepted' order by s.version desc limit 1)
where r.kind='document';
alter table public.employee_onboarding_requirements
 add constraint requirement_submitted_document foreign key(submitted_document_id,id) references public.employee_document_submissions(id,requirement_id) deferrable initially deferred,
 add constraint requirement_approved_document foreign key(approved_document_id,id) references public.employee_document_submissions(id,requirement_id) deferrable initially deferred;

create function app_private.document_actor_can_read(actor uuid,w uuid,e uuid,owner_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select app_private.workspace_allows_interactive_access(w) and (
  exists(select 1 from public.employee_profiles p join public.workspace_memberships m on m.workspace_id=p.workspace_id and m.user_id=p.user_id
   where p.id=e and p.workspace_id=w and p.user_id=actor and owner_user=actor and p.archived_at is null
    and m.status in ('active','pending_activation'))
  or (public.service_actor_has_permission(actor,w,'employee_documents.read') and public.service_actor_can_access_employee(actor,w,e))
 );
$$;

-- Status is derived at the supplied instant; callers use server now() or shift start.
-- This supplies state to the existing Schedule engine, never severity decisions.
create function app_private.document_obligation_state(r public.employee_onboarding_requirements, at_time timestamptz)
returns text language plpgsql stable security definer set search_path='' as $$
declare approved public.employee_document_submissions%rowtype; submitted public.employee_document_submissions%rowtype;
begin
 if r.lifecycle_exempt then return 'exempt'; end if;
 if r.lifecycle_closed_at is not null or r.status='superseded' then return 'removed'; end if;
 select * into approved from public.employee_document_submissions where id=r.approved_document_id;
 select * into submitted from public.employee_document_submissions where id=r.submitted_document_id;
 -- Expiration is a date. Its zone is snapshotted on assignment; legacy uses UTC
 -- until an explicit org-zone Apply, never the session's TimeZone setting.
 if approved.id is not null and (approved.expiry_date is null or approved.expiry_date >= (at_time at time zone coalesce(r.source_snapshot->>'timezone','UTC'))::date) then return 'completed'; end if;
 if submitted.state='pending_review' then return 'pending_review'; end if;
 if submitted.state='rejected' then return 'rejected'; end if;
 if approved.id is not null then return 'expired'; end if;
 if r.kind='acknowledgement' and r.status='completed' then return 'completed'; end if;
 if r.lifecycle_settings->>'mode'='conditional' and r.deadline_at>at_time then return 'grace'; end if;
 return 'missing';
end;
$$;

create function app_private.document_obligation_blocked(r public.employee_onboarding_requirements, at_time timestamptz)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare state text; pending public.employee_document_submissions%rowtype;
begin
 state:=app_private.document_obligation_state(r,at_time);
 if state in ('completed','removed','exempt') or coalesce(r.lifecycle_settings->>'mode','optional')='optional'
  or not coalesce((r.lifecycle_settings->>'suspend_on_overdue')::boolean,false) then return false; end if;
 -- A past suspension cannot be undone by a fresh submission or rejection period.
 if r.document_suspended_at is not null then return true; end if;
 select * into pending from public.employee_document_submissions where id=r.submitted_document_id;
 if pending.state='pending_review' and (r.deadline_at is null or pending.submitted_at<=r.deadline_at) then return false; end if;
 return r.deadline_at is not null and r.deadline_at<=at_time;
end;
$$;

create function app_private.document_audit(r public.employee_onboarding_requirements, actor uuid, event_action text, event_metadata jsonb)
returns void language sql security definer set search_path='' as $$
 insert into public.onboarding_events(workspace_id,employee_id,case_id,actor_user_id,action,target_type,target_id,metadata)
 values(r.workspace_id,r.employee_id,r.case_id,actor,event_action,'onboarding_requirement',r.id::text,event_metadata);
$$;

create function public.submit_employee_document_lifecycle_service(actor_user_id uuid,target_requirement_id uuid,expected_revision integer,target_submission_id uuid,submission_expiry date,submission_metadata jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare r public.employee_onboarding_requirements%rowtype; s public.employee_document_submissions%rowtype; field jsonb; next_state text;
begin
 select * into r from public.employee_onboarding_requirements where id=target_requirement_id for update;
 if r.id is null or r.lifecycle_user_id is distinct from actor_user_id or not app_private.document_actor_can_read(actor_user_id,r.workspace_id,r.employee_id,r.lifecycle_user_id)
 then raise exception 'document unavailable' using errcode='P0002'; end if;
 if r.lifecycle_revision<>expected_revision then raise exception 'document changed; refresh required' using errcode='PT409'; end if;
 if r.lifecycle_closed_at is not null or r.lifecycle_exempt or r.status='superseded' then raise exception 'document obligation is closed' using errcode='22023'; end if;
 select * into s from public.employee_document_submissions where id=target_submission_id and requirement_id=r.id and user_id=actor_user_id and state='draft' for update;
 if s.id is null or not exists(select 1 from public.employee_document_submission_files where submission_id=s.id and decision='keep') then raise exception 'a draft with retained files is required' using errcode='22023'; end if;
 if coalesce((r.source_snapshot->>'tracks_expiry')::boolean,false) and submission_expiry is null then raise exception 'expiration date required' using errcode='22023'; end if;
 if submission_expiry < (now() at time zone coalesce(r.source_snapshot->>'timezone','UTC'))::date then raise exception 'expired documents cannot be submitted' using errcode='22023'; end if;
 if submission_metadata is null or jsonb_typeof(submission_metadata)<>'object' then raise exception 'document metadata required' using errcode='22023'; end if;
 for field in select value from jsonb_array_elements(coalesce(r.lifecycle_settings->'extra_fields','[]')) loop
  if (field->>'required')::boolean and nullif(btrim(submission_metadata->>(field->>'key')),'') is null then raise exception 'required document field missing' using errcode='22023'; end if;
  if nullif(submission_metadata->>(field->>'key'),'') is not null then
   if field->>'kind'='date' then perform (submission_metadata->>(field->>'key'))::date;
   elsif field->>'kind'='number' then perform (submission_metadata->>(field->>'key'))::numeric; end if;
  end if;
 end loop;
 -- Materialize overdue state before submission; cron delays cannot reopen access.
 if app_private.document_obligation_blocked(r,now()) then r.document_suspended_at:=coalesce(r.document_suspended_at,now()); end if;
 next_state:=case when r.requires_review then 'pending_review' else 'accepted' end;
 update public.employee_document_submissions set state='superseded' where id=r.submitted_document_id and state='pending_review';
 update public.employee_document_submissions set state=next_state,submitted_at=now(),expiry_date=submission_expiry,metadata=submission_metadata,
  reviewed_at=case when next_state='accepted' then now() end where id=s.id;
 update public.employee_onboarding_requirements set submitted_document_id=s.id,
  approved_document_id=case when next_state='accepted' then s.id else approved_document_id end,
  paused_remaining_seconds=case when r.paused_remaining_seconds is not null then r.paused_remaining_seconds when deadline_at is not null then greatest(0,extract(epoch from deadline_at-now())) end,
  document_suspended_at=case when next_state='accepted' then null else r.document_suspended_at end,
  status=case when next_state='accepted' then 'completed'::public.employee_onboarding_requirement_status else 'awaiting_review'::public.employee_onboarding_requirement_status end,
  rejection_reason=null,conditional_reason=null,lifecycle_revision=lifecycle_revision+1,updated_at=now()
 where id=r.id returning lifecycle_revision into expected_revision;
 perform app_private.document_audit(r,actor_user_id,'document.submitted',jsonb_build_object('submission_id',s.id,'revision',expected_revision,'state',next_state));
 return expected_revision;
end;
$$;

create function public.review_employee_document_lifecycle_service(actor_user_id uuid,target_workspace_id uuid,target_requirement_id uuid,expected_revision integer,target_submission_id uuid,review_decision text,review_reason text,correction_period text,file_decisions jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare r public.employee_onboarding_requirements%rowtype; s public.employee_document_submissions%rowtype; choice jsonb; next_deadline timestamptz; remaining numeric; suspended timestamptz;
begin
 select * into r from public.employee_onboarding_requirements where id=target_requirement_id and workspace_id=target_workspace_id for update;
 if r.id is null or not public.service_actor_has_permission(actor_user_id,target_workspace_id,'employee_documents.review')
  or not public.service_actor_can_access_employee(actor_user_id,target_workspace_id,r.employee_id)
  or not app_private.workspace_allows_interactive_access(target_workspace_id)
 then raise exception 'document review unavailable' using errcode='42501'; end if;
 if r.lifecycle_revision<>expected_revision or r.submitted_document_id is distinct from target_submission_id then raise exception 'document changed; refresh required' using errcode='PT409'; end if;
 if r.lifecycle_closed_at is not null or r.lifecycle_exempt or r.status='superseded' then raise exception 'document obligation is closed' using errcode='22023'; end if;
 select * into s from public.employee_document_submissions where id=target_submission_id and requirement_id=r.id and state in ('pending_review','accepted') for update;
 if s.id is null then raise exception 'submission changed; refresh required' using errcode='PT409'; end if;
 if review_decision is null or review_decision not in ('approve','reject') or correction_period is null or correction_period not in ('full','remaining')
  or (review_decision='reject' and (nullif(btrim(review_reason),'') is null or char_length(review_reason)>500)) then raise exception 'valid review decision and reason required' using errcode='22023'; end if;
 if file_decisions is null or jsonb_typeof(file_decisions)<>'array' then raise exception 'file decisions required' using errcode='22023'; end if;
 if jsonb_array_length(file_decisions)<>(select count(*) from public.employee_document_submission_files where submission_id=s.id)
  or (select count(distinct value->>'id') from jsonb_array_elements(file_decisions))<>jsonb_array_length(file_decisions)
 then raise exception 'decide every file exactly once' using errcode='22023'; end if;
 for choice in select value from jsonb_array_elements(file_decisions) loop
  if choice->>'decision' is null or choice->>'decision' not in ('keep','discard') or char_length(coalesce(choice->>'note',''))>500
   or not exists(select 1 from public.employee_document_submission_files where submission_id=s.id and file_id=(choice->>'id')::uuid)
  then raise exception 'invalid file decision' using errcode='22023'; end if;
 end loop;
 if review_decision='approve' and not exists(select 1 from jsonb_array_elements(file_decisions) f where f->>'decision'='keep') then raise exception 'keep a file to approve' using errcode='22023'; end if;
 if review_decision='approve' and s.expiry_date<(now() at time zone coalesce(r.source_snapshot->>'timezone','UTC'))::date then raise exception 'expired document cannot be approved' using errcode='22023'; end if;
 remaining:=coalesce(r.paused_remaining_seconds,case when r.deadline_at is not null then greatest(0,extract(epoch from r.deadline_at-now())) end);
 if review_decision='reject' and correction_period='remaining' and coalesce(remaining,0)<=0 then raise exception 'no correction time remains' using errcode='22023'; end if;
 suspended:=r.document_suspended_at;
 if app_private.document_obligation_blocked(r,now()) then suspended:=coalesce(suspended,now()); end if;
 next_deadline:=r.deadline_at;
 if review_decision='reject' then
  next_deadline:=case when correction_period='remaining' then now()+remaining*interval '1 second'
   when r.lifecycle_settings->>'period_days' is not null then now()+(r.lifecycle_settings->>'period_days')::integer*interval '24 hours' else null end;
 end if;
 for choice in select value from jsonb_array_elements(file_decisions) loop
  update public.employee_document_submission_files set decision=choice->>'decision',note=coalesce(choice->>'note','') where submission_id=s.id and file_id=(choice->>'id')::uuid;
 end loop;
 update public.employee_document_submissions set state=case when review_decision='approve' then 'accepted' else 'rejected' end,
  reviewed_at=now(),reviewed_by=actor_user_id,rejection_reason=case when review_decision='reject' then btrim(review_reason) end where id=s.id;
 update public.employee_onboarding_requirements set
  approved_document_id=case when review_decision='approve' then s.id when approved_document_id=s.id then null else approved_document_id end,
  deadline_at=next_deadline,paused_remaining_seconds=null,
  document_suspended_at=case when review_decision='approve' then null else suspended end,
  status=case when review_decision='approve' then 'completed'::public.employee_onboarding_requirement_status else 'rejected'::public.employee_onboarding_requirement_status end,
  rejection_reason=case when review_decision='reject' then btrim(review_reason) end,
  lifecycle_revision=lifecycle_revision+1,updated_at=now() where id=r.id returning lifecycle_revision into expected_revision;
 perform app_private.document_audit(r,actor_user_id,'document.'||review_decision,
  jsonb_build_object('submission_id',s.id,'revision',expected_revision,'reason',review_reason,'correction_period',correction_period,'old_deadline',r.deadline_at,'new_deadline',next_deadline,'files',file_decisions));
 return expected_revision;
end;
$$;

-- Explicit grants on every function, including private helpers. Public RPCs bind
-- the actor supplied by the server's verified token, and are service-role only.
revoke all on function app_private.document_actor_can_read(uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function app_private.document_obligation_state(public.employee_onboarding_requirements,timestamptz) from public,anon,authenticated;
revoke all on function app_private.document_obligation_blocked(public.employee_onboarding_requirements,timestamptz) from public,anon,authenticated;
revoke all on function app_private.document_audit(public.employee_onboarding_requirements,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.submit_employee_document_lifecycle_service(uuid,uuid,integer,uuid,date,jsonb) from public,anon,authenticated;
revoke all on function public.review_employee_document_lifecycle_service(uuid,uuid,uuid,integer,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.submit_employee_document_lifecycle_service(uuid,uuid,integer,uuid,date,jsonb) to service_role;
grant execute on function public.review_employee_document_lifecycle_service(uuid,uuid,uuid,integer,uuid,text,text,text,jsonb) to service_role;

create function public.save_employee_document_draft_file_service(actor_user_id uuid,target_requirement_id uuid,expected_revision integer,storage_object_path text,upload_filename text,upload_media_type text,upload_size_bytes bigint)
returns integer language plpgsql security definer set search_path='' as $$
declare r public.employee_onboarding_requirements%rowtype; s public.employee_document_submissions%rowtype; file_id uuid; next_version integer; format text;
begin
 select * into r from public.employee_onboarding_requirements where id=target_requirement_id and kind='document' for update;
 if r.id is null or r.lifecycle_user_id is distinct from actor_user_id or not app_private.document_actor_can_read(actor_user_id,r.workspace_id,r.employee_id,r.lifecycle_user_id)
 then raise exception 'document unavailable' using errcode='P0002'; end if;
 if r.lifecycle_revision<>expected_revision then raise exception 'document changed; refresh required' using errcode='PT409'; end if;
 if r.lifecycle_closed_at is not null or r.lifecycle_exempt or r.status='superseded' then raise exception 'document obligation is closed' using errcode='22023'; end if;
 format:=case upload_media_type when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpeg' when 'image/png' then 'png' when 'image/webp' then 'webp' end;
 if format is null or not coalesce(r.source_snapshot->'accepted_formats' ? format,false)
  or upload_size_bytes is null or upload_size_bytes not between 1 and 10485760
  or nullif(btrim(upload_filename),'') is null or char_length(upload_filename)>240
  or not app_private.is_employee_onboarding_document_path(storage_object_path,r.workspace_id,r.employee_id,r.id)
 then raise exception 'invalid private document upload' using errcode='22023'; end if;
 select * into s from public.employee_document_submissions where requirement_id=r.id and state='draft' for update;
 if s.id is null then
  select coalesce(max(version),0)+1 into next_version from public.employee_document_submissions where requirement_id=r.id;
  insert into public.employee_document_submissions(workspace_id,employee_id,requirement_id,user_id,version,state)
   values(r.workspace_id,r.employee_id,r.id,actor_user_id,next_version,'draft') returning * into s;
 end if;
 select coalesce(max(version_number),0)+1 into next_version from public.employee_documents where requirement_id=r.id;
 insert into public.employee_documents(workspace_id,employee_id,requirement_id,version_number,object_path,original_filename,media_type,size_bytes,review_status,uploaded_by)
 values(r.workspace_id,r.employee_id,r.id,next_version,storage_object_path,upload_filename,upload_media_type,upload_size_bytes,'superseded',actor_user_id) returning id into file_id;
 insert into public.employee_document_submission_files(submission_id,file_id,requirement_id,workspace_id,employee_id) values(s.id,file_id,r.id,r.workspace_id,r.employee_id);
 update public.employee_onboarding_requirements set lifecycle_revision=lifecycle_revision+1,updated_at=now() where id=r.id returning lifecycle_revision into expected_revision;
 perform app_private.document_audit(r,actor_user_id,'document.draft_file_added',jsonb_build_object('submission_id',s.id,'file_id',file_id,'revision',expected_revision));
 return expected_revision;
end;
$$;

create function app_private.document_obligation_json(r public.employee_onboarding_requirements)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'id',r.id,'workspace_id',r.workspace_id,'employee_id',r.employee_id,'employee_name',concat_ws(' ',e.first_name,e.last_name),
  'title',r.title,'source_id',r.source_id,'kind',r.kind,'mode',r.lifecycle_settings->>'mode',
  'status',case when not r.lifecycle_exempt and r.lifecycle_closed_at is null and r.status<>'superseded'
    and exists(select 1 from public.employee_document_submissions s where s.id=r.submitted_document_id and s.state='pending_review')
    then 'pending_review' else app_private.document_obligation_state(r,now()) end,'revision',r.lifecycle_revision,'requires_review',r.requires_review,
  'deadline_at',r.deadline_at,'remaining_seconds',coalesce(r.paused_remaining_seconds,case when r.deadline_at is not null then greatest(0,extract(epoch from r.deadline_at-now())) end),
  'rejection_reason',r.rejection_reason,'suspended',app_private.document_obligation_blocked(r,now()),
  'submitted_id',r.submitted_document_id,'approved_id',r.approved_document_id,
  'location_ids',coalesce((select jsonb_agg(l.id order by l.name) from public.employee_location_assignments a join public.locations l on l.id=a.location_id and l.workspace_id=a.workspace_id where a.employee_id=r.employee_id and a.workspace_id=r.workspace_id and a.ended_at is null),'[]'),
  'location_names',coalesce((select jsonb_agg(l.name order by l.name) from public.employee_location_assignments a join public.locations l on l.id=a.location_id and l.workspace_id=a.workspace_id where a.employee_id=r.employee_id and a.workspace_id=r.workspace_id and a.ended_at is null),'[]'),
  'timezone',r.source_snapshot->>'timezone','settings',r.lifecycle_settings,
  'accepted_formats',coalesce(r.source_snapshot->'accepted_formats','[]'), 'tracks_expiry',coalesce((r.source_snapshot->>'tracks_expiry')::boolean,false))
 from public.employee_profiles e where e.id=r.employee_id and e.workspace_id=r.workspace_id;
$$;

create function public.list_employee_document_lifecycle_service(actor_user_id uuid,target_workspace_id uuid,self_only boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if self_only is null then raise exception 'document audience required' using errcode='22023'; end if;
 if not self_only and not public.service_actor_has_permission(actor_user_id,target_workspace_id,'employee_documents.read') then raise exception 'employee document access required' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(app_private.document_obligation_json(r) order by r.sort_order,r.id),'[]')
 from public.employee_onboarding_requirements r where r.workspace_id=target_workspace_id and r.kind in ('document','acknowledgement')
 and (not self_only or r.lifecycle_user_id=actor_user_id)
 and app_private.document_actor_can_read(actor_user_id,r.workspace_id,r.employee_id,r.lifecycle_user_id));
end;
$$;

create function public.get_employee_document_lifecycle_service(actor_user_id uuid,target_workspace_id uuid,target_requirement_id uuid,self_only boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.employee_onboarding_requirements%rowtype; submissions jsonb; history jsonb;
begin
 select * into r from public.employee_onboarding_requirements where id=target_requirement_id and workspace_id=target_workspace_id and kind in ('document','acknowledgement');
 if r.id is null or self_only is null or (self_only and r.lifecycle_user_id is distinct from actor_user_id)
  or (not self_only and not public.service_actor_has_permission(actor_user_id,target_workspace_id,'employee_documents.read'))
  or not app_private.document_actor_can_read(actor_user_id,r.workspace_id,r.employee_id,r.lifecycle_user_id)
 then raise exception 'document unavailable' using errcode='P0002'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'version',s.version,'state',s.state,'submitted_at',s.submitted_at,
  'reviewed_at',s.reviewed_at,'expiry_date',s.expiry_date,'metadata',s.metadata,'rejection_reason',s.rejection_reason,
  'files',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'filename',f.original_filename,'media_type',f.media_type,'size_bytes',f.size_bytes,'decision',sf.decision,'note',sf.note) order by f.created_at,f.id)
   from public.employee_document_submission_files sf join public.employee_documents f on f.id=sf.file_id where sf.submission_id=s.id),'[]')) order by s.version desc),'[]')
 into submissions from public.employee_document_submissions s where s.requirement_id=r.id and (self_only or s.state<>'draft');
 select coalesce(jsonb_agg(jsonb_build_object('id',ev.id,'action',ev.action,'occurred_at',ev.occurred_at,'metadata',ev.metadata) order by ev.occurred_at desc),'[]') into history
 from public.onboarding_events ev where ev.workspace_id=r.workspace_id and ev.employee_id=r.employee_id and ev.target_id=r.id::text;
 return jsonb_build_object('obligation',app_private.document_obligation_json(r),'submissions',submissions,'history',history);
end;
$$;

create function public.get_employee_document_lifecycle_path_service(actor_user_id uuid,target_workspace_id uuid,target_requirement_id uuid,target_submission_id uuid,target_file_id uuid,self_only boolean)
returns text language plpgsql stable security definer set search_path='' as $$
declare detail jsonb; path text;
begin
 detail:=public.get_employee_document_lifecycle_service(actor_user_id,target_workspace_id,target_requirement_id,self_only);
 select f.object_path into path from public.employee_document_submission_files sf
 join public.employee_document_submissions s on s.id=sf.submission_id join public.employee_documents f on f.id=sf.file_id
 where sf.requirement_id=target_requirement_id and sf.workspace_id=target_workspace_id and sf.submission_id=target_submission_id and sf.file_id=target_file_id and sf.decision='keep'
 and (self_only or s.state<>'draft');
 if path is null then raise exception 'document file unavailable' using errcode='P0002'; end if;
 return path;
end;
$$;

revoke all on function public.save_employee_document_draft_file_service(uuid,uuid,integer,text,text,text,bigint) from public,anon,authenticated;
revoke all on function app_private.document_obligation_json(public.employee_onboarding_requirements) from public,anon,authenticated;
revoke all on function public.list_employee_document_lifecycle_service(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.get_employee_document_lifecycle_service(uuid,uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.get_employee_document_lifecycle_path_service(uuid,uuid,uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.save_employee_document_draft_file_service(uuid,uuid,integer,text,text,text,bigint) to service_role;
grant execute on function public.list_employee_document_lifecycle_service(uuid,uuid,boolean) to service_role;
grant execute on function public.get_employee_document_lifecycle_service(uuid,uuid,uuid,boolean) to service_role;
grant execute on function public.get_employee_document_lifecycle_path_service(uuid,uuid,uuid,uuid,uuid,boolean) to service_role;
