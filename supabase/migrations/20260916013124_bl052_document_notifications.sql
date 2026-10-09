-- This slice delivers in_app only. Existing email delivery_unavailable remains.
insert into public.notification_catalog(type_key,schema_version,category,severity,sensitivity,supported_channels,default_cadence,audience_contract,action_route_contract,dedupe_policy,retention_class,template_key,lifecycle)
select 'people.documents.'||kind,1,'people',case when kind in ('review','missing','rejected','restricted') then 'action_required' else 'info' end,'confidential',array['in_app'],'immediate',
 case when kind='review' then 'document_reviewers' else 'document_employee' end,
 jsonb_build_object('route',case when kind='review' then '/app/settings/documents' else '/app/account/documents' end,'allowed_query_keys',jsonb_build_array('workspace','requirement','kind')),
 '{"strategy":"keep_first","scope":"event_recipient","key_fields":["event_id","recipient_user_id"]}'::jsonb,'sensitive_30d','people.documents.'||kind||'.v1','active'
from unnest(array['review','missing','expiry','approved','rejected','restricted','restored','assigned','activated']) kind;
insert into public.notification_template_versions(type_key,schema_version,channel,locale,template_version,template_key,content,status,published_at)
select type_key,1,'in_app','en',1,template_key,jsonb_build_object('title','Document update','body','Review your document requests.','safe_preview','A document update is available.','action_url',action_route_contract->>'route'),'published',now()
from public.notification_catalog where type_key like 'people.documents.%';
insert into public.notification_producer_registry(type_key,schema_version,producer_id,source_migration,source_function)
select type_key,1,'document-lifecycle','20260916013124_bl052_document_notifications.sql','app_private.enqueue_document_notification'
from public.notification_catalog where type_key like 'people.documents.%';

create table app_private.document_notification_dedup (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 employee_id uuid not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 notification_key text not null,
 event_id uuid not null default gen_random_uuid(),
 created_at timestamptz not null default now(),
 primary key(workspace_id,employee_id,user_id,notification_key),
 foreign key(employee_id,workspace_id) references public.employee_profiles(id,workspace_id) on delete cascade
);
alter table app_private.document_notification_dedup enable row level security;
revoke all on app_private.document_notification_dedup from public,anon,authenticated,service_role;
alter table public.employee_onboarding_cases add column document_notification_checked_at timestamptz;
alter table public.employee_onboarding_cases add column document_notified_restricted boolean not null default false;

create function app_private.enqueue_document_notification(w uuid,e uuid,u uuid,k text,kind text,title text,body text,requirement uuid default null,actor uuid default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare event uuid; recipients uuid[]; route text; requirement_kind text; submission uuid;
begin
 if u is null or not app_private.workspace_allows_interactive_access(w)
  or not exists(select 1 from public.employee_profiles p join public.workspace_memberships m on m.workspace_id=p.workspace_id and m.user_id=p.user_id where p.id=e and p.workspace_id=w and p.user_id=u and p.archived_at is null and m.status in ('active','pending_activation')) then return false; end if;
 if requirement is not null then
  select r.kind::text,case when enqueue_document_notification.kind='expiry' then r.approved_document_id else r.submitted_document_id end into requirement_kind,submission from public.employee_onboarding_requirements r where r.id=requirement and r.workspace_id=w and r.employee_id=e and r.lifecycle_user_id=u and r.lifecycle_retired_at is null and r.lifecycle_closed_at is null and not r.lifecycle_exempt;
  if requirement_kind is null then return false; end if;
 end if;
 if kind='review' then
  select coalesce(array_agg(m.user_id),'{}'::uuid[]) into recipients from public.workspace_memberships m where m.workspace_id=w and m.status='active'
   and public.service_actor_has_permission(m.user_id,w,'employee_documents.review') and public.service_actor_can_access_employee(m.user_id,w,e);
  route:='/app/settings/documents?requirement='||requirement::text;
 else recipients:=array[u]; route:='/app/account/documents?workspace='||w::text||case when requirement is null then '' else '&requirement='||requirement::text||'&kind='||requirement_kind end; end if;
 insert into app_private.document_notification_dedup(workspace_id,employee_id,user_id,notification_key) values(w,e,u,k) on conflict do nothing returning event_id into event;
 if event is null then return false; end if;
 perform public.enqueue_notification_outbox_service(w,event,'people.documents.'||kind,1,actor,'employee_documents',e::text,
  jsonb_build_object('correlation_id',event,'employee_id',e,'requirement_id',requirement,'submission_id',submission,'recipient_user_ids',to_jsonb(recipients),'audience_contract',case when kind='review' then 'document_reviewers' else 'document_employee' end,
   'title',title,'body',body,'safe_preview','A document update is available.','action_url',route,'group_key','documents:'||e::text),now());
 return true;
end;
$$;
revoke all on function app_private.enqueue_document_notification(uuid,uuid,uuid,text,text,text,text,uuid,uuid) from public,anon,authenticated,service_role;

create function app_private.document_notify_access(w uuid,e uuid,u uuid)
returns void language plpgsql security definer set search_path='' as $$
declare c public.employee_onboarding_cases%rowtype; blocked boolean;
begin
 select * into c from public.employee_onboarding_cases where workspace_id=w and employee_id=e for update;
 if c.id is null then return; end if;
 blocked:=app_private.document_actor_blocked(u,w);
 if blocked is distinct from c.document_notified_restricted then
  update public.employee_onboarding_cases set document_notified_restricted=blocked where id=c.id;
  perform app_private.enqueue_document_notification(w,e,u,'access:'||gen_random_uuid()::text,case when blocked then 'restricted' else 'restored' end,
   case when blocked then 'Documents need attention' else 'Workspace access restored' end,
   case when blocked then 'Complete the outstanding document requests to restore workspace access.' else 'Your document access requirements are resolved.' end);
 end if;
end;
$$;
revoke all on function app_private.document_notify_access(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function app_private.notify_document_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.employee_onboarding_requirements%rowtype; u uuid; kind text; title text;
begin
 if new.action not like 'document.%' and new.action<>'employee.activated' then return new; end if;
 select user_id into u from public.employee_profiles where id=new.employee_id and workspace_id=new.workspace_id;
 if new.action='employee.activated' then
  perform app_private.enqueue_document_notification(new.workspace_id,new.employee_id,u,'audit:'||new.id::text,'activated','Onboarding complete','Your onboarding has been approved.',null,new.actor_user_id); return new;
 end if;
 select * into r from public.employee_onboarding_requirements where id=new.target_id::uuid and workspace_id=new.workspace_id;
 if r.id is null or r.lifecycle_retired_at is not null then return new; end if;
 case
 when new.action='document.submitted' and new.metadata->>'state'='pending_review' then kind:='review'; title:='Document ready for review';
 when new.action='document.approve' or (new.action='document.submitted' and new.metadata->>'state'='accepted') then kind:='approved'; title:='Document approved';
 when new.action='document.reject' then kind:='rejected'; title:='Document needs correction';
 when new.action in ('document.assignment_reopened','document.exemption_removed') then kind:='assigned'; title:='Document request reopened';
 else kind:=null;
 end case;
 if kind is not null then perform app_private.enqueue_document_notification(r.workspace_id,r.employee_id,r.lifecycle_user_id,'audit:'||new.id::text,kind,title,
  case when kind='review' then 'A document is ready for your review.' else 'Open Documents to review this request and its current status.' end,r.id,new.actor_user_id); end if;
 return new;
end;
$$;
revoke all on function app_private.notify_document_audit() from public,anon,authenticated,service_role;
create trigger document_notification_audit after insert on public.onboarding_events for each row execute function app_private.notify_document_audit();

-- Bound work by employee case, in least-recently checked order. Cases are locked
-- first, matching Submit/review lock order; SKIP LOCKED permits another worker.
create function public.documents_maintain_service(target_batch_size integer default 100,at_time timestamptz default now())
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.employee_onboarding_cases%rowtype; r public.employee_onboarding_requirements%rowtype; u uuid; tz text; local_now timestamp;
 checked integer:=0; enqueued integer:=0; missing_count integer; days_left integer; expiry date;
begin
 if target_batch_size not between 1 and 500 or at_time is null then raise exception 'valid maintenance batch required' using errcode='22023'; end if;
 for c in select oc.* from public.employee_onboarding_cases oc
  join public.employee_profiles p on p.id=oc.employee_id and p.workspace_id=oc.workspace_id and p.archived_at is null
  join public.workspace_memberships m on m.id=oc.membership_id and m.user_id=p.user_id and m.status in ('active','pending_activation')
  where app_private.workspace_allows_interactive_access(oc.workspace_id)
   and exists(select 1 from public.employee_onboarding_requirements q where q.case_id=oc.id and q.kind in ('document','acknowledgement') and q.lifecycle_retired_at is null)
  order by oc.document_notification_checked_at nulls first,oc.id limit target_batch_size for update of oc skip locked loop
  checked:=checked+1;
  select user_id into u from public.employee_profiles where id=c.employee_id;
  update public.employee_onboarding_cases set document_notification_checked_at=at_time where id=c.id;
  -- Current access is always evaluated with server time, independent of reminder test time.
  update public.employee_onboarding_requirements q set document_suspended_at=now()
   where q.case_id=c.id and q.document_suspended_at is null and q.lifecycle_retired_at is null and app_private.document_obligation_blocked(q,now());
  perform app_private.document_notify_access(c.workspace_id,c.employee_id,u);
  tz:=app_private.document_employee_timezone(c.workspace_id,c.employee_id);
  if tz is null then continue; end if;
  local_now:=at_time at time zone tz;
  if local_now::time<'09:00'::time then continue; end if;
  select count(*) into missing_count from public.employee_onboarding_requirements q
   where q.case_id=c.id and q.lifecycle_user_id=u and q.kind in ('document','acknowledgement') and q.lifecycle_retired_at is null
    and q.lifecycle_settings->>'mode'<>'optional' and not q.lifecycle_exempt and q.lifecycle_closed_at is null and q.status<>'superseded'
    and app_private.document_obligation_state(q,at_time) in ('missing','grace','rejected','expired')
    and not exists(select 1 from public.employee_document_submissions s where s.id=q.submitted_document_id and s.state='pending_review');
  if missing_count>0 and app_private.enqueue_document_notification(c.workspace_id,c.employee_id,u,'missing:'||local_now::date::text,'missing','Documents need attention',format('%s outstanding document request(s). Open Documents for details.',missing_count)) then enqueued:=enqueued+1; end if;
  for r in select q.* from public.employee_onboarding_requirements q where q.case_id=c.id and q.lifecycle_user_id=u and q.lifecycle_retired_at is null
   and q.kind='document' and q.lifecycle_settings->>'mode'<>'optional' and not q.lifecycle_exempt and q.lifecycle_closed_at is null and q.status<>'superseded' and q.approved_document_id is not null
   and not exists(select 1 from public.employee_document_submissions s where s.id=q.submitted_document_id and s.state='pending_review') loop
   select expiry_date into expiry from public.employee_document_submissions where id=r.approved_document_id and state='accepted';
   days_left:=expiry-local_now::date;
   if days_left in (30,7,1) and app_private.enqueue_document_notification(r.workspace_id,r.employee_id,u,'expiry:'||r.approved_document_id::text||':'||days_left::text,'expiry','Document expires soon',format('A document expires in %s day(s). Open Documents to renew it.',days_left),r.id) then enqueued:=enqueued+1; end if;
  end loop;
 end loop;
 return jsonb_build_object('checked',checked,'enqueued',enqueued);
end;
$$;
revoke all on function public.documents_maintain_service(integer,timestamptz) from public,anon,authenticated;
grant execute on function public.documents_maintain_service(integer,timestamptz) to service_role;

-- Keep policy preferences; extend only the onboarding membership eligibility.
-- Revalidate document owner/reviewer scope at processing time, after queue delay.
create function app_private.document_notification_policy(outbox_id uuid,u uuid,snapshot jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.notification_outbox%rowtype; valid boolean; e uuid;
begin
 select * into o from public.notification_outbox where id=outbox_id;
 if o.type_key not like 'people.documents.%' then return snapshot; end if;
 e:=(o.payload->>'employee_id')::uuid;
 if o.type_key='people.documents.review' then valid:=public.service_actor_has_permission(u,o.workspace_id,'employee_documents.review') and public.service_actor_can_access_employee(u,o.workspace_id,e);
 else valid:=exists(select 1 from public.employee_profiles where id=e and workspace_id=o.workspace_id and user_id=u and archived_at is null); end if;
 if o.payload->>'requirement_id' is not null then valid:=valid and exists(select 1 from public.employee_onboarding_requirements r where r.id=(o.payload->>'requirement_id')::uuid and r.workspace_id=o.workspace_id and r.employee_id=e and r.lifecycle_retired_at is null and r.lifecycle_closed_at is null and not r.lifecycle_exempt); end if;
 if o.type_key='people.documents.missing' then valid:=valid and exists(select 1 from public.employee_onboarding_requirements r where r.workspace_id=o.workspace_id and r.employee_id=e and r.lifecycle_user_id=u and r.lifecycle_retired_at is null and r.lifecycle_closed_at is null and not r.lifecycle_exempt and r.lifecycle_settings->>'mode'<>'optional' and app_private.document_obligation_state(r,now()) in ('missing','grace','rejected','expired') and not exists(select 1 from public.employee_document_submissions s where s.id=r.submitted_document_id and s.state='pending_review')); end if;
 if o.type_key in ('people.documents.review','people.documents.expiry') then valid:=valid and exists(select 1 from public.employee_onboarding_requirements r join public.employee_document_submissions s on s.id=(o.payload->>'submission_id')::uuid where r.id=(o.payload->>'requirement_id')::uuid and r.workspace_id=o.workspace_id and s.requirement_id=r.id and (case when o.type_key='people.documents.review' then r.submitted_document_id=s.id and s.state='pending_review' else r.approved_document_id=s.id and s.state='accepted' end)); end if;
 if not coalesce(valid,false) then return snapshot||jsonb_build_object('decision','deny','eligible',false,'reason_chain',coalesce(snapshot->'reason_chain','[]'::jsonb)||'"document_audience_changed"'::jsonb); end if;
 return snapshot;
end;
$$;
revoke all on function app_private.document_notification_policy(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
do $$
declare body text;
begin
 body:=pg_get_functiondef('public.resolve_notification_policy_v1_service(uuid,uuid,text,text,uuid,uuid,jsonb)'::regprocedure);
 body:=replace(body,'membership.status <> ''active''','(membership.status <> ''active'' and not (target_type_key like ''people.documents.%'' and target_type_key<>''people.documents.review'' and membership.status=''pending_activation''))');
 execute body;
 body:=pg_get_functiondef('public.project_notification_recipients_service(uuid)'::regprocedure);
 body:=replace(body,'public.shift_exchange_notification_policy_service(outbox.id, candidate.user_id,','app_private.document_notification_policy(outbox.id, candidate.user_id, public.shift_exchange_notification_policy_service(outbox.id, candidate.user_id,');
 body:=replace(body,')) snapshot','))) snapshot');
 execute body;
end;
$$;
