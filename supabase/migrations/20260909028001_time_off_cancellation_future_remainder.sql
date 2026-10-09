-- A started approved interval can still contain cancellable future hours.
-- Submission and approval retain their exact future-only UTC checks.
do $remainder$ declare body text; anchor text:='s.time_timezone is not null and lower(span)>now()'; begin
 body:=pg_get_functiondef('public.time_off_cancellation_context(uuid,uuid)'::regprocedure);
 if length(body)-length(replace(body,anchor,''))<>length(anchor) then raise exception 'Cancellation eligibility context changed'; end if;
 execute replace(body,anchor,'s.time_timezone is not null and upper(span)>now()');
end $remainder$;
