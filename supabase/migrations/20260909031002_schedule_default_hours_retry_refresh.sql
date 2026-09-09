-- An identical retry must not restore an older client-side edit session after
-- another legitimate edit. Preserve immutable original evidence, return live state.
do $retry$ declare body text; anchor text:='return prior.result;'; begin
 body:=pg_get_functiondef('public.apply_schedule_default_hours_service(uuid,uuid,uuid,jsonb)'::regprocedure);
 if position(anchor in body)=0 then raise exception 'Default-hours retry implementation changed'; end if;
 execute replace(body,anchor,'return public.get_schedule_edit_session_service(actor,w,sid);');
end $retry$;
