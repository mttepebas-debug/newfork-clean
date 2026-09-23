do $p$ declare body text; anchor text; begin
 body:=pg_get_functiondef('public.assess_weekly_shift_availability(uuid,uuid,jsonb)'::regprocedure);
 anchor:=$a$operation:=case conflict_severity when 'block' then 'blocked' when 'allow' then 'allowed' else 'warning_requires_override' end;$a$;
 if position(anchor in body)=0 then raise exception 'anchor1'; end if;
 body:=replace(body,anchor,$n$operation:=case when conflict_severity='block' then 'blocked' when missing_time then 'verification_required' when conflict_severity='allow' then 'allowed' else 'warning_requires_override' end;$n$);
 execute body;
 body:=pg_get_functiondef('public.prepare_weekly_schedule_assignment(uuid,uuid,jsonb,jsonb)'::regprocedure);
 anchor:=$a$if a->>'operation' in ('blocked','verification_required') then$a$;
 if position(anchor in body)=0 then raise exception 'anchor2'; end if;
 body:=replace(body,anchor,$n$if a->>'operation'='blocked' then$n$);
 execute body;
end $p$;
