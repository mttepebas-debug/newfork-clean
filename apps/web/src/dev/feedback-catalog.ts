// Every toast the app can raise today, with its real title and tone. Titles are
// copied from source; feedback-catalog.test.ts fails when one stops existing.
// Descriptions built at runtime carry a realistic sample instead.

export type ToastTone = "success" | "error" | "warning" | "info";

export type ToastEntry = {
  readonly id: string;
  readonly screen: string;
  readonly source: string;
  readonly tone: ToastTone;
  readonly title: string;
  readonly description?: string;
  readonly trigger: string;
};

const schedule = "src/views/SchedulePage.tsx";
const editor = "src/schedule/components/shift-window/useShiftEditor.tsx";
const dropReview = "src/schedule/hooks/useScheduleDropReview.ts";
const drag = "src/schedule/hooks/useScheduleGridDragControllers.ts";
const publish = "src/schedule/components/PublishScheduleDialog.tsx";

export const toastCatalog: readonly ToastEntry[] = [
  // Schedule: copy, paste, undo
  { id: "shift-copied", screen: "Schedule · editing", source: schedule, tone: "success", title: "Shift copied", description: "Paste mode is ready.", trigger: "Copy a shift (Ctrl+C or menu)" },
  { id: "select-one", screen: "Schedule · editing", source: schedule, tone: "info", title: "Select one shift to copy", trigger: "Copy with several shifts selected" },
  { id: "copy-first", screen: "Schedule · editing", source: schedule, tone: "warning", title: "Copy a shift first", description: "Paste mode needs a copied shift before it can start.", trigger: "Turn on paste mode with nothing copied" },
  { id: "paste-on", screen: "Schedule · editing", source: schedule, tone: "info", title: "Paste mode on", description: "Click a schedule cell to paste the copied shift.", trigger: "Turn paste mode on" },
  { id: "paste-off", screen: "Schedule · editing", source: schedule, tone: "info", title: "Paste mode off", description: "Paste shortcuts are paused.", trigger: "Turn paste mode off" },
  { id: "shift-pasted", screen: "Schedule · editing", source: schedule, tone: "success", title: "Shift pasted", description: "The copied shift was added to the draft.", trigger: "Paste one shift into a cell" },
  { id: "shifts-pasted", screen: "Schedule · editing", source: schedule, tone: "success", title: "Shifts pasted", description: "3 copied shifts were added to the draft.", trigger: "Paste several shifts" },
  { id: "paste-blocked", screen: "Schedule · editing", source: schedule, tone: "error", title: "Paste blocked", description: "This shift was not pasted. Review the conflict before scheduling it.", trigger: "Paste onto a cell with a conflict" },
  { id: "undo", screen: "Schedule · editing", source: schedule, tone: "success", title: "Last edit undone", description: "The draft returned to the previous edit state.", trigger: "Undo (Ctrl+Z)" },
  { id: "restored", screen: "Schedule · editing", source: schedule, tone: "success", title: "Shift restored", description: "The shift is back in the draft.", trigger: "Restore a deleted shift" },
  { id: "restore-missing", screen: "Schedule · editing", source: schedule, tone: "error", title: "Shift could not be restored", description: "The staged shift was not found.", trigger: "Restore a shift that is gone" },
  { id: "save-failed", screen: "Schedule · editing", source: schedule, tone: "error", title: "Schedule change could not be saved", description: "Alex is already scheduled at this time.", trigger: "Any edit the server rejects" },

  // Schedule: presets and drag
  { id: "preset-unavailable", screen: "Schedule · presets & drag", source: schedule, tone: "error", title: "Preset shift is unavailable", description: "Main Dining is closed on Monday, Aug 17.", trigger: "Create from a preset on a closed day" },
  { id: "preset-context", screen: "Schedule · presets & drag", source: schedule, tone: "info", title: "Preset shift context", description: "Dinner · Main Dining · Mon, Aug 17", trigger: "Fires together with the one above" },
  { id: "preset-missing", screen: "Schedule · presets & drag", source: schedule, tone: "error", title: "Preset shift type not found", description: "Refresh the schedule, then try this preset again.", trigger: "Right-click a cell, pick a deleted preset" },
  { id: "drag-blocked", screen: "Schedule · presets & drag", source: drag, tone: "error", title: "This assignment cannot be saved", description: "Maya is not trained for Bartender.", trigger: "Drop a shift on a person who can't take it" },
  { id: "drag-preset-blocked", screen: "Schedule · presets & drag", source: drag, tone: "error", title: "Preset shift is unavailable", description: "Patio is closed on this day.", trigger: "Drag a preset onto a closed day" },
  { id: "drop-warning", screen: "Schedule · presets & drag", source: dropReview, tone: "warning", title: "Shift saved with a warning", description: "Alex prefers not to work Friday evenings.", trigger: "Drop a shift that breaks a soft rule" },
  { id: "drop-warnings", screen: "Schedule · presets & drag", source: dropReview, tone: "warning", title: "Shifts saved with warnings", description: "Alex prefers not to work Friday evenings. Maya goes over 40 hours this week.", trigger: "Drop several shifts with soft conflicts" },
  { id: "drop-failed", screen: "Schedule · presets & drag", source: dropReview, tone: "error", title: "Shift change could not be completed", description: "Reload and try again.", trigger: "Drop fails on the server" },

  // Shift editor
  { id: "invalid-time", screen: "Schedule · shift editor", source: editor, tone: "error", title: "Enter a valid shift time", description: "End time must be after start time.", trigger: "Save with an impossible time" },
  { id: "availability-failed", screen: "Schedule · shift editor", source: editor, tone: "error", title: "Availability could not be checked", description: "Failed to fetch", trigger: "Save while the availability check fails (raw text today)" },
  { id: "availability-not-at-location", screen: "Schedule · shift editor", source: editor, tone: "error", title: "Not assigned to this location", description: "Add them to this location first, or pick someone else.", trigger: "Save a shift for someone not assigned to its location" },
  { id: "availability-out-of-scope", screen: "Schedule · shift editor", source: editor, tone: "error", title: "You can't edit this location's schedule", trigger: "Save a shift at a location outside the manager's scope" },
  { id: "review-shift", screen: "Schedule · shift editor", source: editor, tone: "warning", title: "Review shift", description: "Alex marked Friday evening as unavailable.", trigger: "Save a shift with a conflict you may override" },
  { id: "shift-conflict", screen: "Schedule · shift editor", source: editor, tone: "error", title: "Shift conflict", description: "Alex is already working 4:00 PM–10:00 PM.", trigger: "Save a shift with a blocking conflict" },
  { id: "editor-warning", screen: "Schedule · shift editor", source: editor, tone: "warning", title: "Shift saved with a warning", description: "Alex prefers not to work Friday evenings.", trigger: "Confirm a warn-only save" },

  // Drafts, publish
  { id: "draft-deleted", screen: "Schedule · drafts & publish", source: schedule, tone: "success", title: "Draft deleted", description: "Week of Aug 17 — v2", trigger: "Delete a draft from the draft menu" },
  { id: "assignments-restored", screen: "Schedule · drafts & publish", source: schedule, tone: "success", title: "Approved assignments restored", description: "Your notes and other edits are preserved. Review the draft, then save when ready.", trigger: "Restore approved shift-change assignments" },
  { id: "published", screen: "Schedule · drafts & publish", source: schedule, tone: "success", title: "Schedule published", description: "2 locations and 48 changes published.", trigger: "Publish" },
  { id: "unpublished", screen: "Schedule · drafts & publish", source: schedule, tone: "success", title: "Schedule unpublished", description: "2 locations unpublished. 6 worked shifts kept.", trigger: "Unpublish" },
  { id: "conflicts-updated", screen: "Schedule · drafts & publish", source: publish, tone: "warning", title: "Schedule conflicts updated", description: "2 conflicts refreshed. Publication is continuing.", trigger: "Publish after someone changed availability" },
  { id: "warnings-cleared", screen: "Schedule · drafts & publish", source: publish, tone: "warning", title: "Schedule warnings cleared", description: "Publication is continuing with the latest conflict check.", trigger: "Publish after conflicts went away" },

  // Templates
  { id: "template-saved", screen: "Schedule · templates", source: schedule, tone: "success", title: "Template saved", description: "Summer weekdays", trigger: "Save the week as a template" },
  { id: "template-renamed", screen: "Schedule · templates", source: schedule, tone: "success", title: "Template renamed", description: "Summer weekdays (patio)", trigger: "Rename a template" },
  { id: "template-deleted", screen: "Schedule · templates", source: schedule, tone: "success", title: "Template deleted", description: "Summer weekdays", trigger: "Delete a template" },
  { id: "template-delete-failed", screen: "Schedule · templates", source: schedule, tone: "error", title: "Template could not be deleted", description: "This template changed. Refresh and try again.", trigger: "Delete fails" },
  { id: "template-applied", screen: "Schedule · templates", source: schedule, tone: "success", title: "Template applied", description: "Summer weekdays: 22 shifts added.", trigger: "Apply a template to the draft" },
  { id: "template-applied-archived-label", screen: "Schedule · templates", source: schedule, tone: "warning", title: "Template applied", description: "Summer weekdays: 2 shifts added. Standby is archived, so 2 shifts were added without it.", trigger: "Apply a template whose shifts carry an archived label" },
  { id: "template-apply-failed", screen: "Schedule · templates", source: schedule, tone: "error", title: "Template could not be applied", description: "Refresh the draft, then try again.", trigger: "Apply fails" },
];
