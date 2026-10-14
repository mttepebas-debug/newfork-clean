---
name: db-decides-client-mirrors
description: Don't mirror a database rule on the client with a client-supplied flag; let the DB refuse with a hint and show its sentence (BL-218 review)
metadata:
  type: feedback
---
BL-218 .3b first copied the `is_owner_record` pattern: an optional `only_management_jobs` flag the drawer computed and the shared schema trusted to skip "primary job required". Review (code-review max, 2026-09-29) rejected it: the API then depended on the client's flag (a client that omitted it got 400 on a valid save), the flag entered the create command's idempotency fingerprint, and the form folded two refusals into one sentence. Fix: the schema keeps only the checks the payload alone can decide (no location, no primary location, no job), worded from `managementAndOwnerRefusals`; anything that depends on catalog state (which jobs sit under Management) is the database's refusal (`employee.primary_job_required`), bridged to a readable sentence with its reason.
**Why:** a rule decided twice drifts, and a client hint is not an input the server may trust.
**How to apply:** before adding a client-side precheck, ask "can the payload alone decide this?" If not, add no flag; let the DB raise a hinted refusal and render it. Related: [[rpcfailure-filter]].
