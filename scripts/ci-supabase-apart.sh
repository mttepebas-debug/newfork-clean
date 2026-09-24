#!/usr/bin/env bash
# BL-107: CI runs on the user's PC, whose Docker also holds the local Supabase
# stack every session uses (project newfork-clean, ports 553xx). Before
# `supabase start`, rename CI's project to newfork-ci and move its ports to
# 564xx, in the throwaway checkout only; the repo keeps newfork-clean.
# Fails unless both changes took, so the later `supabase stop --no-backup`
# (which runs only when this step succeeded) can never reach the shared stack.
set -euo pipefail
config=supabase/config.toml
sed -i -E \
  -e 's/^project_id = .*/project_id = "newfork-ci"/' \
  -e 's/^((shadow_)?port) = 553([0-9]{2})$/\1 = 564\3/' \
  "$config"
grep -q '^project_id = "newfork-ci"$' "$config"
if grep -qE '^(shadow_)?port = 553' "$config"; then
  echo "::error::$config still has a 553xx port" >&2
  exit 1
fi
