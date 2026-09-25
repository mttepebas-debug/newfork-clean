# Local cancellation flow evidence

This is desktop browser and local database evidence for availability slice 22. It is not hosted, mobile, full migration replay or release proof.

The synthetic employee `Availability UI QA` belongs to the existing local QA workspace `e2afe393-c45d-4537-b984-114300cf568e`. The employee is excluded from Schedule candidates. No production records or credentials are included. The original approved leave was prepared locally through the request/decision service; the cancellation submission and partial manager decision were performed through the actual application UI.

| Step | America/Los_Angeles, 2035-01-15 | Evidence |
| --- | --- | --- |
| Original approved leave | 09:00–17:00 | Parent `684627dc-42c9-4ed3-a157-1d5367d24450`, revision 2 |
| Employee chooses cancellation | 10:30–13:00 | Cancellation `82ebef2e-ec66-4656-a594-d6b08cab9380` submitted from My Availability |
| Pending cancellation | Entire 09:00–17:00 remains approved | [Pending state](employee-ui-pending-proof.json) |
| Manager splits at 11:30 | Keeps 10:30–11:30 as leave; cancels 11:30–13:00 | Schedule Requests, Partial, Split period, individual piece decisions, Save |
| Final effective leave | 09:00–11:30 and 13:00–17:00 | [Final state](employee-ui-decision-proof.json), parent revision 3 |

The employee's open page subsequently displayed the partial decision, manager note, original approved hours, cancelled hours and remaining approved intervals. No refresh latency was measured. The original 09:00–17:00 period and initial approval piece remained immutable. This employee had no published assignments or assignment-release rows; this browser case therefore does not prove release/reassignment behavior for an assigned employee. That invariant has separate SQL coverage.

Browser inspection exposed and corrected nested request-card CSS that widened the cancellation form to 1731 px, invalid rendering of timestamp dates, and a stale waiting-for-decision success message after an accepted cancellation. After correction, the 1280 px desktop viewport had no horizontal document overflow; the app main was 977/977 px, request list 829/829 px and cancellation panel 803/803 px (client/scroll widths).

Focus verification: choosing hours moved focus to the cancellation start date; discarding those hour edits returned focus to Choose hours. The manager's Revoke dialog for this owned parent was opened only to verify focus, then closed without saving: focus entered the dialog heading and returned to Revoke. Component tests additionally exercise Tab containment, Escape with the shared unsaved-decision alert, and split editor focus return.

The broader mobile, overnight browser, started-leave browser, notification delivery timing and concurrent manager decision scenarios remain open. Started-leave future subranges, elapsed-hour rejection, unchanged original periods and publication preservation passed the 72-case cancellation SQL suite on both the main local and clean isolated databases.
