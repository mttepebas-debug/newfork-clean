# Onboarding availability: local browser proof

## Changes verified

- The common availability panel awaits the asynchronous parent refresh/navigation callback. Editing and navigation remain busy until it settles. A rejected parent callback reports that the write succeeded and the next screen could not refresh, without encouraging another submission.
- Onboarding refuses to navigate from cached case data when its post-save refetch fails.
- The optional availability requirement is reachable from onboarding navigation and explicitly labelled optional. Required progress and activation rules are unchanged. The current initializer creates an optional availability requirement; this proof does not claim an organization setting for requiring that step.
- Explicit meridiem shorthand (`10am`, `5 pm`, `12am`) normalizes to canonical clock values. Invalid ranges, incomplete text and ambiguous bare hours still invalidate the parent value. Seconds remain supported.

## Actual local actor flow

Used separate browser origins to preserve the manager session: employee at `127.0.0.1:5555`, manager at `localhost:5555`. A local-only confirmed QA account has pending-activation membership; no invitation email was sent and no credentials were persisted.

- Workspace: `e2afe393-c45d-4537-b984-114300cf568e`.
- Employee: `f4dd02f1-937e-4915-92ac-2619994eac55`, code `E-995712`, Onboarding Availability QA.
- Onboarding case: `07e86d15-0ef2-43f1-a85b-23b13ec7e36f`.
- Period: January 8, 2035 onward, America/Los_Angeles, Monday-only availability. This is a synthetic unpublished future period.

1. Browser discovery exposed the hidden optional navigation item and rejection of `10am`. After the fixes, `10 AM` normalized to `10:00 AM`; submitting Monday 10:00–17:00 disabled the editor and routed to the required Profile and privacy step.
2. SQL confirmed request `b451f4ce-96b2-42b0-9d48-79d64efef388`, status effective, source onboarding, base revision 0, and canonical version 1 with Monday 10:00–17:00. Before its future start, the calendar still said hours need confirmation.
3. Employee reopened Availability (optional), entered `11am`–`4pm` for the same period and compared the proposal. The physical comparison showed exactly 10:00–11:00 and 16:00–17:00 as lost capacity, with 11:00–16:00 proposed and 10:00–17:00 currently approved.
4. Submission created request `838f5871-30fc-4399-889f-fc60f3f76f84`, pending_review, source onboarding, narrowing true, base revision 1. SQL showed only version 1 remained approved. The employee saw Awaiting manager review and the unresolved capacity notice. The optional onboarding requirement was awaiting_review; the profile requirement remained not_started.
5. Manager opened this employee's Availability drawer. Review approval showed both patterns; Approve availability was disabled until Check draft shift impact completed. The result contained no affected current drafts for this synthetic future fixture.
6. Manager approved with a local QA explanation. SQL confirmed version 2 Monday 11:00–16:00, both immutable versions retaining onboarding source, request effective with the actual reviewer and explanation. Reopening the employee availability step showed Approved availability and that explanation. The optional requirement became completed while required Profile remained not_started.

## Verification and boundaries

- Focused web tests: **48 passed** (clock 14, panel 15, onboarding 10, navigation 9). Includes an observed failing deferred-callback regression before the fix, callback rejection, failed onboarding refetch, optional navigation and shorthand/invalid clock inputs.
- Web TypeScript check passed after runtime changes. No schema migration was needed.
- Actual browser proof covers first onboarding submission, narrowing request, physical comparison, manager empty-draft impact review, approval and employee-visible decision. Database checks confirm the canonical source, periods, versions and requirement statuses.
- No Schedule was published or assignment released. No organization policy was changed. At this slice's close the QA employee remained pending activation with incomplete required profile; its immutable availability evidence was retained locally. [Slice 31](../availability-onboarding-temporary-proof-2026-09-07/README.md) subsequently completed its actual onboarding and temporary replacement flow.
- This does not prove full onboarding activation, employee in-app transition, temporary replacement approval, populated draft conflicts, all ownership policies, mobile layouts, hosted delivery or release readiness. Those remain in the overall acceptance backlog.
