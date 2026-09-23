-- trial patch (rolled back): pass every excluded id into the shared evaluator
do $p$ declare b text; begin
 b:=pg_get_functiondef('public.assess_weekly_shift_availability(uuid,uuid,jsonb)'::regprocedure);
 b:=replace(b,$o$(s.id is distinct from exclude_id and s.source_shift_id is distinct from exclude_id))$o$,
  $n$(s.id is distinct from exclude_id and s.source_shift_id is distinct from exclude_id
     and not (shift ? '_exclude_shift_ids' and (s.id::text in (select jsonb_array_elements_text(shift->'_exclude_shift_ids')) or s.source_shift_id::text in (select jsonb_array_elements_text(shift->'_exclude_shift_ids'))))))$n$);
 if position('_exclude_shift_ids' in b)=0 then raise exception 'anchor 1 missing'; end if;
 execute b;
 b:=pg_get_functiondef('public.weekly_assignment_candidate_base(uuid,uuid,jsonb,uuid[],integer)'::regprocedure);
 b:=replace(b,$o$target||jsonb_build_object('scheduled_date',d))$o$,$n$target||jsonb_build_object('scheduled_date',d,'_exclude_shift_ids',to_jsonb(excluded)))$n$);
 if position('_exclude_shift_ids' in b)=0 then raise exception 'anchor 2 missing'; end if;
 execute b;
end $p$;
