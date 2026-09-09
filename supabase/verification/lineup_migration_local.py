"""Replay the complete Line Up migration inside a rollback-only local transaction."""
from pathlib import Path
import re
import subprocess

CONTAINER = "supabase_db_newfork-clean"
migration = Path(__file__).resolve().parents[1] / "migrations/20260909000000_lineup_operations_v1.sql"
source = migration.read_text(encoding="utf-8")
new_functions = re.findall(r"^create function public\.(\w+)\(", source, re.M)
new_tables = re.findall(r"^create table public\.(\w+) \(", source, re.M)
new_columns = re.findall(r"^alter table public\.(\w+) add column (\w+) ", source, re.M)
assert len(new_functions) >= 20 and len(new_tables) == 6
names = ",".join("'" + name + "'" for name in new_functions)
prelude = f"""begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ declare fn record; begin
 if to_regprocedure('public.get_schedule_lineup_operations_base(uuid,uuid,date,uuid[],uuid[])') is null
 or to_regprocedure('public.upsert_schedule_lineup_entry_operations_base(uuid,uuid,uuid,date,uuid,integer,jsonb)') is null then
 raise exception 'Expected local Line Up base functions are missing'; end if;
 for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ({names}) loop
 execute 'drop function if exists '||fn.signature||' cascade'; end loop;
end $$;
alter function public.get_schedule_lineup_operations_base(uuid,uuid,date,uuid[],uuid[]) rename to get_schedule_lineup_service;
alter function public.upsert_schedule_lineup_entry_operations_base(uuid,uuid,uuid,date,uuid,integer,jsonb) rename to upsert_schedule_lineup_entry_service;
"""
prelude += "\n".join(f"drop table public.{table} cascade;" for table in reversed(new_tables))
prelude += "\n" + "\n".join(f"alter table public.{table} drop column {column} cascade;" for table, column in new_columns)
result = subprocess.run(
    ["docker", "exec", "-i", CONTAINER, "psql", "-X", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
    input=prelude + "\n" + source + "\nrollback;",
    text=True, encoding="utf-8", capture_output=True, timeout=60,
)
if result.returncode:
    print(result.stderr)
    raise SystemExit(result.returncode)
print(f"PASS: complete migration replayed and rolled back ({len(new_functions)} new functions, {len(new_tables)} tables, {len(new_columns)} columns).")
