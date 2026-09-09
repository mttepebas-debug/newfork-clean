"""Read-only local probe of request JSON accumulation. Temporary clone rolls back."""
from pathlib import Path
import json
import uuid
from lineup_role_fixture_local import sql

root = Path(__file__).resolve().parents[2]
state = json.loads((root / "supabase/.temp/shift-exchange-role.json").read_text(encoding="utf-8"))
workspace = str(uuid.UUID(state["workspace"]))
actor = str(uuid.UUID(state["users"]["manager"]["id"]))
assert state.get("exchange_fixture") and state["name"] == "Line Up role verification " + workspace
body = sql("select pg_get_functiondef('public.shift_exchanges_read_service(uuid,uuid,boolean,date,date,uuid)'::regprocedure)")
changes = {
    "CREATE OR REPLACE FUNCTION public.shift_exchanges_read_service": "CREATE OR REPLACE FUNCTION pg_temp.shift_exchanges_read_array",
    "cases jsonb:='[]'": "case_items jsonb[]:='{}'",
    "cases:=cases||jsonb_build_array(jsonb_build_object(": "case_items:=array_append(case_items,jsonb_build_object(",
    "'cases',cases": "'cases',to_jsonb(case_items)",
}
for old, new in changes.items():
    assert body.count(old) == 1, "Reader changed: inspect before probing"
    body = body.replace(old, new)
statements = "begin; create temp table read_probe(iteration integer, variant text, elapsed_ms numeric, value jsonb);" + body.rstrip().rstrip(";") + ";"
statements += """
do $probe$
declare pass integer; variant text; started timestamptz; result jsonb; elapsed numeric;
begin
 for pass in 1..8 loop
  foreach variant in array case when pass%2=0 then array['array','current'] else array['current','array'] end loop
   started:=clock_timestamp();
   if variant='current' then
    result:=public.shift_exchanges_read_service('ACTOR','WORKSPACE',true,'2026-12-08','2026-12-15',null);
   else
    result:=pg_temp.shift_exchanges_read_array('ACTOR','WORKSPACE',true,'2026-12-08','2026-12-15',null);
   end if;
   elapsed:=extract(epoch from clock_timestamp()-started)*1000;
   insert into read_probe values(pass,variant,elapsed,result);
  end loop;
 end loop;
end;
$probe$;
select jsonb_agg(jsonb_build_object('iteration',p.iteration,'variant',p.variant,'elapsedMs',round(p.elapsed_ms,3),'cases',jsonb_array_length(p.value->'cases'),'jsonBytes',octet_length(p.value::text),'matchesCurrent',p.value=(select q.value from read_probe q where q.iteration=p.iteration and q.variant='current')) order by p.iteration,p.variant) from read_probe p;
rollback;
""".replace("ACTOR",actor).replace("WORKSPACE",workspace)
result = json.loads(sql(statements))
assert all(row["matchesCurrent"] for row in result)
out = root / "supabase/.temp/exchange-refresh/array-profile.json"
out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result))
