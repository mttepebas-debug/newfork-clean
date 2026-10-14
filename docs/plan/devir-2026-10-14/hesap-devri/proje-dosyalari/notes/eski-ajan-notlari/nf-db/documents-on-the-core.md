---
name: documents-on-the-core
description: FB-6.6 traps — draft definitions silently drop requirement rows; internal work vs entry points; S2 row rule; permission fold
metadata:
  type: project
---

- `employee_onboarding_requirements` insert with a `source_id` whose document type is not `published` (or does not exist) is silently dropped by the `a_document_requirement_publication` trigger (`return null`). Fixtures must publish the definition (`publication_status='published'` or `set_document_publication_service`). All four red files of FB-6.6 were this.
- Put the core gate on the public `*_service`, not on work another flow calls after its own gate: onboarding start (`app_private.initialize_employee_onboarding`, called by invitation acceptance) and activation (`app_private.activate_employee_onboarding_case`, called by the employee's own last step) are internal. A gate inside broke `joining_from_two_workspaces` (draft workspace = `workspace_closed`).
- S2 (Mert 2026-10-02): a document row waiting for review is read only by who may `documents.review` it and its owner: `app_private.document_row_readable(actor, r)`; list, get and the onboarding review use it.
- S1: legal name approval is `onboarding.legal_name` (org/write, no_self, rank_below) — org/write reaches no manager under M2, so it is role-based, not permission-based.
- `signature_templates.*` folded into `documents.*` (A1b); `settings.signature_templates.read` keeps its name, permission `documents.read`.
- Settings writes (`settings.*.write`, org/write) never reach a manager-type role whatever permission it holds.
- One save of a draft definition = one revision: `guard_document_definition_edit` skips the bump when the row was already written in this transaction (`old.updated_at = now()`).

**Why:** FB-6.6 A1a/A1b, 2026-10-02. **How to apply:** before writing document/onboarding fixtures or gates.
