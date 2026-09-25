# Default-hours application proof — local only

The real local Lineup QA Manager session opened the owned test week **2035-02-26**, resumed its edit session and opened **Review current default hours**. The sole selected open shift used revision 1 of the synthetic **Availability defaults UI QA** type.

The browser preview displayed **12:00–16:00 → 11:00–17:00**, in **America/Los_Angeles**, with zero peer overlaps. Applying through the browser closed the dialog and exposed Undo in the edit toolbar. The database read then confirmed reference source `type_default`, revision **2**, a dirty edit session, one immutable review, and **zero published assignments**. See [applied state](browser-applied.json).

Layout checks used viewport widths **1280**, **390** and **320**. Dialog client/scroll widths were respectively **743/743**, **337/337**, **267/267**; document width matched each viewport. Desktop and 320 px screenshots were visually inspected in the tool. The viewport override was reset to 1280 px.

The browser's Discard action opened the standard unsaved-change alert. Confirming Discard returned to the live weekly preview. Only the test's newly created shift type and job were then archived by exact IDs, leaving the immutable review intact. See [cleanup state](browser-cleanup.json). The task tab was closed. The existing employee and manager fixtures, locations, other drafts and browser tabs were preserved.

This browser case is an unassigned open shift. Assigned-employee availability, soft overrides, hard leave, uncertain peer clocks, atomic rollback and preservation of an existing published shift are covered by the SQL suite, not this browser case. The later retry-state correction is SQL verified; shortcut containment and pending-focus handling have component coverage. No Schedule was published and no hosted deployment occurred.
