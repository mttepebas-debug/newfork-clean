#!/bin/sh
# usage: fn.sh name  -> prints function(s) whose name matches exactly
awk -v n="$1" '/^#### FN /{p=0; split($3,a,"("); split(a[1],b,"."); if(b[2]==n) p=1} p' fndefs.sql
