#!/usr/bin/env bash
# The pgTAP green list only grows (CLAUDE.md §2, BL-281).
#
# Without a base: every supabase/tests/*.test.sql is in exactly one of
# ci-green.txt (runs in CI) or ci-not-green.txt (known not green, with a
# reason), and every listed file exists. This half needs no history, so a
# cancelled push or a wrong base cannot hide a new unlisted file.
# With a base (argument 1): ci-green.txt lost no line whose file still exists,
# and ci-not-green.txt gained no line -- a test goes green, not onto the list.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

base="${1:-}"
green=supabase/tests/ci-green.txt
pending=supabase/tests/ci-not-green.txt
status=0
fail() { echo "::error::$1"; status=1; }
# ci-not-green.txt lines are "<path>  # reason"; ci-green.txt is bare paths.
list() { sed -e 's/\r$//' -e 's/[[:space:]]*#.*$//' -e '/^[[:space:]]*$/d' "$1" | sort; }

for f in $(list "$green") $(list "$pending"); do
  if [ ! -e "$f" ]; then fail "$f is listed but does not exist"; fi
done
for f in $( (list "$green"; list "$pending") | sort | uniq -d); do
  fail "$f is listed more than once across ci-green.txt and ci-not-green.txt"
done
for f in $(ls supabase/tests/*.test.sql | sort | comm -23 - <( (list "$green"; list "$pending") | sort -u)); do
  fail "$f is in neither ci-green.txt nor ci-not-green.txt: add it to ci-green.txt"
done

if [ -n "$base" ]; then
  for f in $(git diff -U0 "$base" -- "$green" | sed -n 's/^-\(supabase\/tests\/[^[:space:]]*\).*$/\1/p'); do
    if [ -e "$f" ] && ! list "$green" | grep -qxF "$f"; then
      fail "$f was removed from ci-green.txt but still exists"
    fi
  done
  if git cat-file -e "$base:$pending" 2>/dev/null; then
    for f in $(git diff -U0 "$base" -- "$pending" | sed -n 's/^+\(supabase\/tests\/[^[:space:]]*\).*$/\1/p'); do
      fail "$f was added to ci-not-green.txt; a test goes green, it does not join the red list"
    done
  fi
fi
exit $status
