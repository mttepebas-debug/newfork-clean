#!/bin/bash
P="psql -h 127.0.0.1 -p 55432 -U postgres -v ON_ERROR_STOP=1 -q -1"
start=${1:-0}; i=0; cd /home/claude/newfork-clean/supabase/migrations
for f in *.sql; do i=$((i+1)); [ $i -le $start ] && continue
  sed -E 's/,\s*maintain//Ig; s/maintain\s*,//Ig; /create extension if not exists (pg_cron|pg_net)/Id' "$f" > /tmp/m.sql
  if ! $P -d app -f /tmp/m.sql > /tmp/m.log 2>&1; then echo "FAIL #$i $f"; grep ERROR /tmp/m.log | head -3; exit 1; fi
done; echo "all applied ($i)"
