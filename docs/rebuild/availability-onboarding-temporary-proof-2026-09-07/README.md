# Onboarding activation and temporary replacement acceptance

## Actual local browser flow

Continued the slice 30 fixture: workspace `e2afe393-c45d-4537-b984-114300cf568e`, employee `f4dd02f1-937e-4915-92ac-2619994eac55` (E-995712). Existing manager and employee sessions remained separate by localhost / 127.0.0.1 origins. The previous development processes were confirmed absent from ports 5555/5556 before starting the repository's dev-with-api script; existing databases and sessions were retained.

1. During onboarding the employee proposed a temporary Monday 12:00–15:00 pattern for January 15–28, 2035, in America/Los_Angeles. Request `d75500b4-eeef-4d7b-aa71-f48600efb738` was pending_review with source onboarding. Only the two previously approved weekly versions existed at this point.
2. The employee completed the required Profile step using synthetic QA contact details and submitted onboarding. The optional availability request was still pending. The canonical case became approved (revision 8 at this point), membership became active, and the browser navigated to Employee Hub without another sign-in. My Availability retained the pending onboarding request and previous approved versions. No organization policy or privacy-sharing setting was changed.
3. Manager reviewed the temporary request, checked draft impact (no affected drafts in this synthetic future fixture), and approved it. Refreshing the employee page showed the approved temporary request. Canonical version 3 retained source onboarding and its original January 15–28 bounds.
4. In My Availability, the now-active employee proposed January 22–24 with Monday 13:00–14:00. The replacement picker showed active January 15–28, selected overlap January 22–24, and retained January 15–21 / January 25–28. Submission stayed disabled until revision 3 was explicitly selected.
5. Request `66731a62-d69e-441f-ac1f-213b0c79fb76` was pending_review, source employee, explicitly targeting temporary version `b7f75682-cd18-4cfb-9f51-872b18ddc744`. Only three approved versions existed. Canonical capacity still returned 12:00–15:00 for January 22 while this request waited.
6. Manager reviewed the requested 13:00–14:00 against the current 12:00–15:00, checked draft impact, and approved with a local QA explanation. The mobile manager review was visually inspected at 390 px with document width 390 px. Approval produced version 4; it did not modify version 3's stored dates or source.
7. Employee refresh showed the approved replacement and manager explanation. The January 22 calendar displayed 13:00–14:00. The January 29 calendar displayed the restored weekly 11:00–16:00 pattern, visually checked at 390 and 320 px; document widths matched both viewport widths.

## Canonical result

| Date | Before replacement approval | After approval | Source after approval |
| --- | --- | --- | --- |
| January 15 | 12:00–15:00 | 12:00–15:00 | Original temporary, revision 3 |
| January 22 | 12:00–15:00 | 13:00–14:00 | Replacement, revision 4 |
| January 25 | Unavailable | Unavailable | Original temporary, revision 3 |
| January 29 | 11:00–16:00 | 11:00–16:00 | Weekly, revision 2 |

All times above are America/Los_Angeles. Physical SQL ranges were checked in UTC (UTC−8 on these dates). January 25's source assertion proves the retained right-hand portion even though this fixture has no available Thursday hours.

## Verification

The named-fixture assertions in [availability_onboarding_browser_state.sql](../../../supabase/verification/availability_onboarding_browser_state.sql) passed **12/12** against the main local database. They verify activation, all four immutable versions and effective requests, preserved/new provenance, original temporary bounds, the explicit replacement reference, physical capacity on three Mondays, the retained right-hand source and zero outstanding requests. The harness installs pgTAP inside its transaction when absent and rolls everything back; it does not update application data. It is acceptance evidence for this named browser fixture, not a clean-seed migration test.

```powershell
Get-Content -Raw supabase/verification/availability_onboarding_browser_state.sql | docker exec -i supabase_db_newfork-clean psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -A -t
```

No application implementation or migration changed in this slice; the previous 48 focused web tests/typecheck are not presented as a new run. No Schedule was published, no assignment was released, and no email was sent. The synthetic employee is now active, with four approved availability versions and no outstanding availability request. Viewport overrides were reset after checks.

## Remaining scope

This proves the actual optional-onboarding activation, employee in-app transition, temporary submission/approval and partial replacement lifecycle for the hybrid/narrowing policy in this workspace. Other ownership/initial-review policies, temporary replacement entered before onboarding activation, populated draft conflicts, broad concurrent changes, DST and cancellation coverage, notification delivery and hosted/release checks remain subject to the full acceptance plan. The full goal remains active.
