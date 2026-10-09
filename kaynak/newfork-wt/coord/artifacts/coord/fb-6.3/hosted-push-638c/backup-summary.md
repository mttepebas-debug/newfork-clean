# Hosted push FB-6.3.8c (20261003042000 time_off_is_read_by_who_decides_it) - backup
Project hvyvyisrqyathtliyyyv, taken 2026-10-01 before apply. Rows: authz_actions-before.json.
Last migration before push: 20261003041000.
Rollback (one line):
update app_private.authz_actions set rank_below=false, no_self=false where key='requests.read';
