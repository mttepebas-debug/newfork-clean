-- BL-1157 (ROL-CIFT): owner_target_ok has had no action since the decision chain (KARARLAR S-169); the core
-- stopped reading it in 20261019165900, and the column goes.

alter table app_private.authz_actions drop column owner_target_ok;
