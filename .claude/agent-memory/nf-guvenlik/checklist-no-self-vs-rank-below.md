---
name: checklist-no-self-vs-rank-below
description: In authz_actions, no_self blocks owner/admin on their own row too; rank_below alone already blocks a manager's own row and exempts owner/admin. A decision saying "same as the record edit rule" means rank_below without no_self.
metadata:
  type: feedback
---

`app_private.authz_check` (latest def in `20260924223214_live_updates_use_private_channels.sql`):
- `no_self` -> `rank` for ANY class on their own row (owner and admin included).
- `rank_below` on own row -> `rank` only when class is not owner/admin (user decision 2A, 2026-09-24); on another person, target rank >= actor rank -> `rank` (so admin->admin is refused too).

So "follows the record edit rule" (REUSE "Çalışan kaydı": owner and admin edit their own record) = `rank_below` only. Adding `no_self` as well is stricter than the rule: the owner/admin loses their own row.

**Why:** FB-6.1 .2 `e80013a` (2026-09-26): `availability.team_write` got both flags; probe showed owner->owner and admin->admin(self) note true on main, false after. REUSE line says "kayıt düzenleme kuralıyla aynı".

**How to apply:** when a new person action gets flags, compare the flag pair with the decision text cell by cell: self (owner, admin, manager), peer admin, owner as target. Probe `weekly_preference_manager_scope`-style helpers main vs branch with a scratch world (`tests.world('pr')`) in a rolled-back transaction; see [[feedback-rollback-trial-safety]]. Also note: on main a manager already cannot reach a peer manager's availability at all (read false), because `service_actor_can_access_employee` gates first.
