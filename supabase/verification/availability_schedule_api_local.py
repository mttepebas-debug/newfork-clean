"""Read-only availability assessments through real local Auth and API sessions."""
import json
from pathlib import Path
import sys
import urllib.error
import urllib.request
import uuid
from shift_exchange_api_local import env, login, sql


def assess(state, role, location, employee, workspace=None):
    token = login(state, role)
    workspace = workspace or state["workspace"]
    payload = {"shift": {"location_id": location, "employee_id": employee, "job_id": state["job"],
               "shift_type_id": state["service"], "scheduled_date": state["day"], "start_time": "12:00", "end_time": "16:00",
               "time_basis": "explicit", "hide_time_on_badge": False, "unpaid_break_minutes": 0, "note": ""}}
    request = urllib.request.Request("http://127.0.0.1:5556/v1/workspaces/"+workspace+"/availability/shift-assessment",
        headers={"Authorization": "Bearer "+token, "X-Newfork-Workspace-Id": workspace, "Content-Type": "application/json"}, data=json.dumps(payload).encode())
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            body = json.load(response)
            return {"status": response.status, "operation": body["operation"], "coverage": body["coverage"], "fingerprint_length": len(body["fingerprint"])}
    except urllib.error.HTTPError as error:
        return {"status": error.code, "error": json.load(error).get("error")}


def main(path):
    env()
    state = json.loads(path.read_text(encoding="utf-8"))
    assert state.get("exchange_fixture")
    assert sql(f"select name from public.workspaces where id='{uuid.UUID(state['workspace'])}'") == state["name"]
    results = {
      "manager": assess(state, "manager", state["location_a"], state["employee_a"]),
      "employee": assess(state, "employee", state["location_a"], state["employee_a"]),
      "applicant": assess(state, "drew", state["location_a"], state["employee_a"]),
      "other_workspace_manager": assess(state, "manager", state["location_b"], state["employee_b"], "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd"),
    }
    assert results["manager"]["status"] == 200, results
    assert results["manager"]["fingerprint_length"] == 64, results
    assert all(results[key]["status"] == 403 for key in ("employee", "applicant", "other_workspace_manager")), results
    output = path.parent / "availability-schedule-api-read.json"
    output.write_text(json.dumps(results, indent=2))
    print(json.dumps(results))


if __name__ == "__main__":
    main(Path(sys.argv[1]))
