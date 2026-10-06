#!/usr/bin/env bash
# BL-107: CI runs on the user's PC, whose Docker also holds the local Supabase
# stack every session uses (project newfork-clean, ports 553xx). Before
# `supabase start`, rename CI's project and move its ports, in the throwaway
# checkout only; the repo keeps newfork-clean. Fails unless both changes took,
# so the later `supabase stop --no-backup` (which runs only when this step
# succeeded) can never reach the shared stack.
#
# BL-112: check, db and e2e can now run at the same time, each on its own
# runner (one job per runner at a time). Isolation is keyed to the RUNNER,
# not the job: a db job on runner pc-2 and an e2e job on runner pc-2 must
# never run at once on the same project/ports either (they can't, since one
# runner runs one job), but two db jobs from two different pushes landing on
# pc-2 and pc-3 at the same time must not collide -- keying by job name alone
# (the old newfork-ci-db) would let that happen.
#
# RUNNER_NAME is a built-in Actions env var (e.g. "newfork-local-pc",
# "newfork-local-pc-2"). Exports CI_RUNNER_INDEX so the e2e job's own
# web/api ports (playwright.config.ts) can be derived from the same runner.
set -euo pipefail
runner_name="${RUNNER_NAME:?RUNNER_NAME not set}"
if [[ "$runner_name" =~ -pc-([0-9]+)$ ]]; then
  index="${BASH_REMATCH[1]}"
elif [[ "$runner_name" =~ -pc$ ]]; then
  index=1
else
  echo "::error::unrecognised runner name '$runner_name' -- teach ci-supabase-apart.sh its index" >&2
  exit 1
fi
project_id="newfork-ci-pc${index}"
# Windows carves temporary TCP port-exclusion ranges out of the dynamic pool
# for Hyper-V/WSL's own NAT, and they drift over time (`netsh interface ipv4
# show excludedportrange protocol=tcp` from PowerShell lists today's). 566xx
# landed inside one (56530-56629) and every start on that block failed with
# "forwards/expose returned unexpected status: 500" -- not a Docker flake, a
# host-level block. 589+index sits in today's open gap (58442-63288); if a
# future exclusion lands here too, move this number, not the design.
prefix=$((589 + index))

# Fail fast, with a clear message, instead of `supabase start` retrying for
# minutes against a port Windows has carved out for Hyper-V/WSL's own NAT
# (see the prefix comment above). Only meaningful under WSL; a real Linux
# runner (this workflow's `ubuntu-latest` fallback) has no such thing, so a
# missing netsh.exe skips the check rather than failing the build.
netsh=/mnt/c/Windows/System32/netsh.exe
if [[ -x "$netsh" ]]; then
  for port in "${prefix}21" "${prefix}22" "${prefix}20" "${prefix}29" "${prefix}23" "${prefix}24" "${prefix}27"; do
    excluded=$("$netsh" int ipv4 show excludedportrange protocol=tcp 2>/dev/null | tr -d '\r' \
      | awk -v p="$port" 'NF==2 && $1 ~ /^[0-9]+$/ && $2 ~ /^[0-9]+$/ && p>=$1 && p<=$2 {print $1"-"$2; exit}')
    if [[ -n "$excluded" ]]; then
      echo "::error::port $port (runner index $index) falls inside Windows's excluded range $excluded -- change the prefix in scripts/ci-supabase-apart.sh" >&2
      exit 1
    fi
  done
fi

config=supabase/config.toml
sed -i -E \
  -e "s/^project_id = .*/project_id = \"$project_id\"/" \
  -e "s/^((shadow_)?port) = 553([0-9]{2})\$/\1 = ${prefix}\3/" \
  "$config"
grep -q "^project_id = \"$project_id\"\$" "$config"
if grep -qE '^(shadow_)?port = 553' "$config"; then
  echo "::error::$config still has a 553xx port" >&2
  exit 1
fi
echo "CI_RUNNER_INDEX=$index" >> "$GITHUB_ENV"
