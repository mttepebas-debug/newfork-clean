alter table public.employee_onboarding_requirements
  add constraint employee_onboarding_requirements_id_workspace_id_key
  unique (id, workspace_id);

alter table public.signature_template_versions
  add constraint signature_template_versions_id_workspace_id_key
  unique (id, workspace_id);

alter table public.employee_onboarding_cases
  drop constraint if exists employee_onboarding_cases_membership_id_fkey;

alter table public.employee_onboarding_cases
  add constraint employee_onboarding_cases_membership_id_workspace_id_fkey
  foreign key (membership_id, workspace_id)
  references public.workspace_memberships(id, workspace_id) on delete cascade;

alter table public.employee_availability_versions
  drop constraint if exists employee_availability_versions_case_id_fkey;

alter table public.employee_availability_versions
  add constraint employee_availability_versions_case_id_workspace_id_fkey
  foreign key (case_id, workspace_id)
  references public.employee_onboarding_cases(id, workspace_id) on delete cascade;

alter table public.onboarding_events
  drop constraint if exists onboarding_events_case_id_fkey;

alter table public.onboarding_events
  add constraint onboarding_events_case_id_workspace_id_fkey
  foreign key (case_id, workspace_id)
  references public.employee_onboarding_cases(id, workspace_id) on delete cascade;

alter table public.employee_documents
  drop constraint if exists employee_documents_requirement_id_fkey;

alter table public.employee_documents
  add constraint employee_documents_requirement_id_workspace_id_fkey
  foreign key (requirement_id, workspace_id)
  references public.employee_onboarding_requirements(id, workspace_id) on delete cascade;

alter table public.employee_acknowledgement_envelopes
  drop constraint if exists employee_acknowledgement_envelopes_case_id_fkey,
  drop constraint if exists employee_acknowledgement_envelopes_requirement_id_fkey,
  drop constraint if exists employee_acknowledgement_envelopes_template_version_id_fkey,
  drop constraint if exists employee_acknowledgement_envelopes_membership_id_fkey;

alter table public.employee_acknowledgement_envelopes
  add constraint employee_acknowledgement_envelopes_case_id_workspace_id_fkey
  foreign key (case_id, workspace_id)
  references public.employee_onboarding_cases(id, workspace_id) on delete cascade,
  add constraint employee_acknowledgement_envelopes_requirement_id_workspace_id_fkey
  foreign key (requirement_id, workspace_id)
  references public.employee_onboarding_requirements(id, workspace_id) on delete restrict,
  add constraint employee_acknowledgement_envelopes_template_version_id_workspace_id_fkey
  foreign key (template_version_id, workspace_id)
  references public.signature_template_versions(id, workspace_id) on delete restrict,
  add constraint employee_acknowledgement_envelopes_membership_id_workspace_id_fkey
  foreign key (membership_id, workspace_id)
  references public.workspace_memberships(id, workspace_id) on delete restrict;
