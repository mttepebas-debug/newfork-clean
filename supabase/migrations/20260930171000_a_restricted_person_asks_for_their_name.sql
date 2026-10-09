-- FB-6.2 (KK-32, nf-guvenlik T5b-3 §3 b): somebody still finishing onboarding,
-- or missing a required document, may ask for a preferred name on their own
-- record. Account > Profile's one Save writes the name to every workspace the
-- person is in; a workspace still onboarding them no longer fails it. A closed
-- workspace and a removed access still refuse (restricted_ok does not cover them).
update app_private.authz_actions set restricted_ok = true where key = 'employee.request_preferred_name';
