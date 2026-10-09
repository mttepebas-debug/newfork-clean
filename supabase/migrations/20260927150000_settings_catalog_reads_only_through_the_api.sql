-- FB-6.1.9: Settings > Documents, Acknowledgements and Roles read through the
-- API (the *_service reads in 20260927100000). The browser no longer reads
-- these six tables, so its direct read goes: no twin path. Row security stays
-- on; with no policy and no grant the browser reads nothing.
--
-- Left for later, because the browser still reads or writes them:
-- workspace_roles, locations and jobs (Employees drawer), departments,
-- shift_types, shift_labels and important_dates (Settings writes).

drop policy document_types_select_authorized on public.document_types;
drop policy signature_retention_policies_select_authorized on public.signature_retention_policies;
drop policy signature_templates_select_authorized on public.signature_templates;
drop policy signature_template_versions_select_authorized on public.signature_template_versions;
drop policy workspace_role_permissions_select_authorized on public.workspace_role_permissions;
drop policy permissions_select_authenticated on public.permissions;

revoke select on
  public.document_types,
  public.signature_retention_policies,
  public.signature_templates,
  public.signature_template_versions,
  public.workspace_role_permissions,
  public.permissions
from anon, authenticated;
