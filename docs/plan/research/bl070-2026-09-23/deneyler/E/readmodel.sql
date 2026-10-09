CREATE OR REPLACE FUNCTION public.get_schedule_read_model_service(actor_user_id uuid, target_workspace_id uuid, target_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  base jsonb;
  patched_employees jsonb;
begin
  base := public.get_schedule_read_model_service_employee_exclusion_base(
    actor_user_id,
    target_workspace_id,
    target_date
  );

  select coalesce(
    jsonb_agg(
      employee_payload || jsonb_build_object(
        'is_excluded_from_schedule',
        coalesce(employee.is_excluded_from_schedule, false)
      )
      order by source.ordinality
    ),
    '[]'::jsonb
  )
  into patched_employees
  from jsonb_array_elements(coalesce(base->'employees', '[]'::jsonb))
    with ordinality as source(employee_payload, ordinality)
  left join public.employee_profiles employee
    on employee.id = (employee_payload->>'id')::uuid
    and employee.workspace_id = target_workspace_id;

  base:=jsonb_set(base,'{settings}',coalesce(base->'settings','{}')||
   (select jsonb_build_object('conflict_rules',conflict_rules,'minimum_travel_minutes',minimum_travel_minutes,'minimum_rest_minutes',minimum_rest_minutes)
    from public.workspace_scheduling_settings where workspace_id=target_workspace_id));
  return jsonb_set(base, '{employees}', patched_employees, true);
end;
$function$

