---
name: checklist-shared-schema-field-changes
description: When the API parses DB answers through a shared schema, removing a field breaks open old tabs at deploy, and overwriting a DB sub-object (settings) drops keys the DB adds later
metadata:
  type: feedback
---

Two traps from FB-6.3.5 / .5b (2026-10-01):
1. Removing a field from a shared schema that the API runs DB answers through (departments/jobs `sort_order`, BL-496) means the deployed API stops sending it; a web bundle already open in a tab still expects it and errors on its first read until reload.
2. The API built the Employee Hub answer as `{ ...model, settings: { time_format } }`, replacing the `settings` object the DB returned; a key the DB added later (`time_off_lead_hours`) vanished silently. Fixed by spreading `...model.settings` first.

**Why:** both pass every unit test; they only show at deploy time or when the DB side lands.

**How to apply:** in a review where a shared schema loses a field, say what the open-tab effect is (low while there are no live users). Where the API rebuilds a sub-object of a DB answer, check it spreads the DB's object instead of replacing it. Related: [[checklist-contract-real-db-shape]].
