"""BL-037 adapter: reuse the schema-only replay in a task-owned isolated DB.

No shared DB mutation, ports, network, bind mounts, user rows or secrets.
"""
import json
import availability_schedule_replay_local as replay

CONTAINER = "newfork-bl037-verify-20260915"
TASK = "01a0a427-3cff-73e1-83ac-69be6fa9d327"

def owned_container():
    meta = json.loads(replay.run(["docker", "inspect", CONTAINER]).stdout)[0]
    assert meta["Name"] == "/" + CONTAINER
    assert meta["Config"]["Labels"].get("newfork.verification") == "bl037-export"
    assert meta["Config"]["Labels"].get("newfork.task") == TASK
    assert meta["HostConfig"]["NetworkMode"] == "none"
    assert not meta["HostConfig"]["PortBindings"] and not meta["HostConfig"]["Binds"]
    return meta

if __name__ == "__main__":
    replay.CONTAINER = CONTAINER
    replay.OUTPUT = replay.ROOT / "supabase/.temp/bl037-export-replay"
    replay.owned_container = owned_container
    owned_container()
    # Supabase provider objects need the migration owner in this empty scratch
    # bootstrap. Individual RLS tests still switch to their real actor roles.
    replay.run(["docker", "exec", CONTAINER, "psql", "-X", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", "alter role postgres superuser"])
    # Match the local provider's postgres defaults (inspected metadata only).
    # A fresh image otherwise grants table-wide SELECT and hides column-grant bugs.
    replay.sql("""
      alter default privileges for role postgres in schema public revoke select,insert,update,delete on tables from anon,authenticated,service_role;
      alter default privileges for role postgres in schema public revoke select,usage on sequences from anon,authenticated,service_role;
      alter default privileges for role postgres in schema public revoke execute on functions from anon,authenticated,service_role;
    """)
    replay.main()
