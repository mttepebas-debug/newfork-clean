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
# CI-GITHUB-LANE (Mert, 2026-10-20): a GitHub-hosted runner is a machine of its own with no shared
# stack, whatever its name ("GitHub Actions 7"); it takes lane 1.
if [[ "${RUNNER_ENVIRONMENT:-}" == "github-hosted" ]]; then
  index=1
elif [[ "$runner_name" =~ -pc-([0-9]+)$ ]]; then
  index="${BASH_REMATCH[1]}"
elif [[ "$runner_name" =~ -pc$ ]]; then
  index=1
else
  echo "::error::unrecognised runner name '$runner_name' -- teach ci-supabase-apart.sh its index" >&2
  exit 1
fi
# Each runner owns one lane of port blocks, so two runners never share one:
# block prefix = 589 + index + 10*step (runner pc: 590xx, 600xx, ... 650xx;
# pc-2: 591xx, 601xx, ...). Index 1-5 only: lane 6 would reach 595xx, where
# scripts/schema-snapshot.mjs starts its throwaway stack.
if (( index < 1 || index > 5 )); then
  echo "::error::runner index $index has no port lane (1-5) -- teach ci-supabase-apart.sh a new one" >&2
  exit 1
fi
project_id="newfork-ci-pc${index}"
config=supabase/config.toml
# The two-digit tails of every port the shared stack listens on (553xx).
suffixes=$(sed -nE 's/^(shadow_)?port = 553([0-9]{2})$/\2/p' "$config")
if [[ -z "$suffixes" ]]; then
  echo "::error::$config has no 553xx port to move" >&2
  exit 1
fi

# Windows carves temporary TCP port-exclusion ranges out of the dynamic pool
# for Hyper-V/WSL's own NAT, and they move after a reboot (`netsh interface
# ipv4 show excludedportrange protocol=tcp` from PowerShell lists today's). A
# Docker port inside one fails `supabase start` with "forwards/expose returned
# unexpected status: 500" -- not a Docker flake, a host-level block. 566xx
# once sat in one (56530-56629); on 2026-10-16 590xx did (58930-59029, run
# 38971735410). So the runner takes the first block in its lane that no
# range covers (administered ones, marked *, included), and fails only when
# every block is taken. Only meaningful under WSL; a real Linux runner has no
# netsh.exe and takes its first block. APART_NETSH: a fake netsh for tests.
netsh="${APART_NETSH:-/mnt/c/Windows/System32/netsh.exe}"
ranges=""
if [[ -x "$netsh" ]]; then
  ranges=$("$netsh" int ipv4 show excludedportrange protocol=tcp 2>/dev/null | tr -d '\r' \
    | awk '$1 ~ /^[0-9]+$/ && $2 ~ /^[0-9]+$/ {print $1, $2}') || true
fi
prefix=""
skipped=""
for step in 0 1 2 3 4 5 6; do
  candidate=$((589 + index + 10 * step))
  hit=""
  for suffix in $suffixes; do
    hit=$(awk -v p="$candidate$suffix" 'NF==2 && p>=$1 && p<=$2 {print p" in "$1"-"$2; exit}' <<<"$ranges")
    [[ -n "$hit" ]] && break
  done
  if [[ -z "$hit" ]]; then
    prefix=$candidate
    break
  fi
  skipped+=" ${candidate}xx (port $hit)"
done
if [[ -z "$prefix" ]]; then
  echo "::error::no free port block for runner index $index: every block in its lane falls inside Windows's excluded ranges:$skipped" >&2
  exit 1
fi
echo "::notice::runner index $index uses Supabase ports ${prefix}xx (project $project_id)${skipped:+; skipped excluded:$skipped}"

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
