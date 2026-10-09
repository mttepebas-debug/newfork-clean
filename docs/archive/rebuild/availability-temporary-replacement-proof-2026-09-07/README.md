# Temporary availability replacement review

The common Availability panel now shows the active date coverage of overlapping temporary weekly patterns, the dates selected for replacement and the dates retained on either side. Fully replaced records are omitted. Replacement history stays subtracted even when a newer replacement is itself replaced, so older patterns cannot reappear in the picker.

A temporary proposal requires selecting every overlapping active pattern before comparison, impact review or submission. A permanent weekly proposal keeps temporary patterns unless explicitly selected. Users can select/clear all listed replacements. Changing date bounds or timezone clears prior selections; switching weekly/dated edit modes retains the existing separate-draft behavior. Dated-hour replacements remain on their existing path.

The projection describes calendar-date coverage. Mixed-timezone history or a different proposal timezone is labelled accordingly and directs users to the canonical physical-hour comparison. It does not decide availability, leave, ownership, approval, publication or assignment responsibility. Those continue through the existing server command and physical resolver.

## Verification

- **33 web tests passed**: projection 12, replacement UI 2, common panel 13 and physical comparison 6. Cases cover retained left/right segments, completely replaced records, replacement-of-replacement history, leap day, adjacency, open-ended bounds, dated-overlay separation, bulk selection, changed-bound resets, submission payloads and mixed-timezone wording. Web typecheck passed.
- Seven projection cases match IDs returned by the real canonical SQL overlap function. The rollback-only source is `supabase/verification/availability_temporary_projection.sql`; the generated fixture is `supabase/verification/fixtures/availability-temporary-projection.json`. The fixture ran in the owned clean isolated regression DB. No migration changed.
- Real manager browser review used the existing synthetic **Availability UI QA / E-995680** record in workspace `e2afe393-c45d-4537-b984-114300cf568e`. Selecting **2080-01-10–2080-01-20** showed retained **Jan 1–9 / Jan 21–31**. Selecting the record enabled comparison/impact controls. Changing the end to **Jan 19** cleared the selection, disabled those controls and updated retained dates to **Jan 1–9 / Jan 20–31**.
- Desktop **1280 px**: document 1280, panel client/scroll **533/533**. At **390 px**: document 390, panel **310/310**. At **320 px**: document 320, panel **240/240**. Desktop and narrow cards were visually inspected. No horizontal overflow was observed.
- Returning to Profile showed the unsaved-change guard. **Discard and leave** returned to Profile. The viewport was reset and task tab 6 closed. No replacement proposal was submitted through the browser.

## Synthetic fixture and scope

The browser fixture was created through the canonical employee command, using its existing approved hours/timezone unchanged for **2080-01-01–2080-01-31**. Request `3b515eae-5868-4762-918f-363097442fad` became effective at revision 2 under the existing policy. It remains as local immutable QA evidence. Final DB checks show two versions, zero pending requests and fixture hours/timezone equal to the original baseline. Employee ID: `0924b333-80b3-4e02-9820-136716c92290`.

This proves common-panel controls, SQL overlap-selection parity and manager unsaved desktop/mobile review. Employee/onboarding submission and approval browser UAT, larger histories, broad timezone/physical parity and other full-goal requirements remain open. No hosted changes, commit or release were made.
