import type {
  ScheduleDraftSummary,
  ScheduleEmployee,
  ScheduleLocation,
  SchedulePublicationPreview,
  SchedulePublicationStatus,
  ScheduleReadModel,
} from "@newfork/shared/schedule";
import { Check, Send } from "lucide-react";
import { useState, type ReactNode } from "react";

import { DraftDropdownMenu } from "../schedule/components/DraftDropdownMenu";
import { PublishScheduleDialog } from "../schedule/components/PublishScheduleDialog";
import { SaveDraftMenu } from "../schedule/components/SaveDraftMenu";
import { SCHEDULE_ACTION_BUTTON_CLASS } from "../schedule/lib/scheduleActionButton";
import "./schedule-dialogs-preview.css";

// DEV-only: the four Schedule top-right windows with sample data, so the
// mockup styles (?ui=a|b|c) can be compared without writing to any database.
const WORKSPACE = "7a1f0c52-1d7e-4a8e-9a53-0f4f3d2b9a10";
const OWNER = "0b8e5a3c-6f1d-4c2e-8a7b-9d0e1f2a3b4c";
const WEEK = "2026-10-05";
const MAIN = "3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601";
const GARDEN = "3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f602";
const PATIO = "3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f603";

const locations = [
  { id: MAIN, name: "Main Dining", color: "#c2410c", status: "published" },
  { id: GARDEN, name: "Garden Room", color: "#15803d", status: "published" },
  { id: PATIO, name: "Patio Bar", color: "#1d4ed8", status: "unpublished" },
].map((location, index) => ({
  id: location.id,
  name: location.name,
  color: location.color,
  timezone: "America/Los_Angeles",
  sort_order: index,
  publication_status: location.status,
  published_at: location.status === "published" ? "2026-10-02T17:40:00-07:00" : null,
})) as unknown as ScheduleLocation[];

const departments: ScheduleReadModel["departments"] = [
  { id: "5a0e2b1c-0000-4000-8000-000000000001", name: "Front of house", color: "#0f766e", sort_order: 0 },
  { id: "5a0e2b1c-0000-4000-8000-000000000002", name: "Kitchen", color: "#9a3412", sort_order: 1 },
];

const people = [
  ["Alex Kim", "#f97316"],
  ["Jordan Lee", "#0ea5e9"],
  ["Sam Rivera", "#a855f7"],
  ["Priya Shah", "#ec4899"],
  ["Marco Díaz", "#22c55e"],
  ["Aisha Bello", "#eab308"],
  ["Chen Wei", "#14b8a6"],
  ["Emily Carter", "#6366f1"],
  ["Noah Brooks", "#ef4444"],
  ["Sofia Rossi", "#84cc16"],
  ["Liam O'Neil", "#06b6d4"],
  ["Grace Park", "#d946ef"],
] as const;

const employees = people.map(([name, color], index) => ({
  id: `9c4d2e1f-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  employee_code: `E-${1001 + index}`,
  display_name: name,
  color,
  location_ids: [MAIN, GARDEN, PATIO],
  job_ids: [],
})) as unknown as ScheduleEmployee[];

const employeeId = (index: number) => employees[index]?.id ?? "";

function draft(id: string, name: string, by: string, updatedAt: string, revision: number) {
  return {
    id,
    workspace_id: WORKSPACE,
    week_start: WEEK,
    name,
    revision,
    created_by: OWNER,
    updated_by: OWNER,
    created_at: "2026-09-30T09:00:00-07:00",
    updated_at: updatedAt,
    created_by_name: by,
    updated_by_name: by,
  } as ScheduleDraftSummary;
}

const drafts = [
  draft("d0c1a2b3-0000-4000-8000-000000000001", "Week 41 – Lunch heavy", "Alex Kim", "2026-10-03T11:24:00-07:00", 7),
  draft("d0c1a2b3-0000-4000-8000-000000000002", "Week 41 – Backup plan", "Jordan Lee", "2026-10-02T16:05:00-07:00", 3),
  draft("d0c1a2b3-0000-4000-8000-000000000003", "Fall menu soft launch", "Local Owner", "2026-10-01T08:47:00-07:00", 2),
];
const activeDraftId = drafts[0]?.id ?? null;

const publishedSchedule = {
  published_at: "2026-10-02T17:40:00-07:00",
  published_by_name: "Local Owner",
};

const publicationStatuses = locations.map((location) => ({
  id: location.id,
  name: location.name,
  color: (location as ScheduleLocation & { color: string }).color,
  timezone: location.timezone,
  status: location.publication_status,
  reason: location.publication_status === "published" ? "active_publication_and_shifts" : "missing_publication",
  publication_includes_location: location.publication_status === "published",
  published_shift_count: location.publication_status === "published" ? 30 : 0,
  draft_shift_count: 32,
  published_at: location.published_at,
  published_by_name: location.publication_status === "published" ? "Local Owner" : null,
})) as SchedulePublicationStatus["locations"];

const deltas: Record<string, Omit<SchedulePublicationPreview["locations"][number], "location_id" | "location_name" | "next_shift_count">> = {
  [MAIN]: { active_publication_id: "e1000000-0000-4000-8000-000000000001", active_version: 3, current_shift_count: 38, added: 6, updated: 4, removed: 2, unchanged: 26, affected_employee_ids: [0, 1, 2, 4, 7].map(employeeId), changed_since_start: null },
  [GARDEN]: { active_publication_id: "e1000000-0000-4000-8000-000000000002", active_version: 2, current_shift_count: 14, added: 3, updated: 1, removed: 0, unchanged: 10, affected_employee_ids: [3, 5, 8].map(employeeId), changed_since_start: { kind: "published", by_name: "Jordan Lee", at: "2026-10-02T17:40:00-07:00" } },
  [PATIO]: { active_publication_id: null, active_version: null, current_shift_count: 0, added: 12, updated: 0, removed: 0, unchanged: 0, affected_employee_ids: [6, 9, 10, 11, 1].map(employeeId), changed_since_start: null },
};

const findings: SchedulePublicationPreview["findings"] = [
  { id: "finding-clopening-01", code: "clopening", severity: "soft", overrideable: true, tier: "risk", introduced: true, message: "Jordan Lee closes Friday at 11:30 PM and opens Saturday at 7:00 AM.", fix_hint: "Give Jordan a later Saturday start or move the Friday close.", location_id: MAIN, location_name: "Main Dining", employee_id: employeeId(1), employee_name: "Jordan Lee", scheduled_date: "2026-10-10", shift_ids: ["f1000000-0000-4000-8000-000000000001"] },
  { id: "finding-availability-01", code: "availability", severity: "soft", overrideable: true, availability_state: "new", warning_policy: "warn", message: "Priya marked Saturday evenings as unavailable.", location_id: GARDEN, location_name: "Garden Room", employee_id: employeeId(3), employee_name: "Priya Shah", scheduled_date: "2026-10-10", shift_ids: ["f1000000-0000-4000-8000-000000000002"] },
  { id: "finding-solo-opener-01", code: "solo_opener", severity: "soft", overrideable: true, tier: "note", introduced: false, message: "Patio Bar opens with one person on Sunday.", location_id: PATIO, location_name: "Patio Bar", employee_id: null, scheduled_date: "2026-10-11", shift_ids: [] },
];

async function preview(draftId: string, locationIds: string[]): Promise<SchedulePublicationPreview> {
  await new Promise((resolve) => setTimeout(resolve, 350));
  const selected = locations.filter((location) => locationIds.includes(location.id));
  return {
    status: "override_required",
    workspace_id: WORKSPACE,
    week_start: WEEK,
    draft_id: draftId,
    draft_revision: 7,
    fingerprint: `mock-${draftId}-${locationIds.join("-")}`.padEnd(40, "0").slice(0, 120),
    locations: selected.map((location) => {
      const delta = deltas[location.id]!;
      return {
        location_id: location.id,
        location_name: location.name,
        next_shift_count: delta.current_shift_count + delta.added - delta.removed,
        ...delta,
      };
    }),
    findings: findings.filter((finding) => locationIds.includes(finding.location_id)),
  };
}

function Station({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="schedule-dialogs-preview-station">
      <span>{label}</span>
      {children}
    </div>
  );
}

export default function ScheduleDialogsPreview() {
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishedMenuOpen, setPublishedMenuOpen] = useState(false);
  const noop = () => undefined;

  return (
    <main className="schedule-dialogs-preview">
      <header>
        <h1>Schedule top-right windows</h1>
        <p>
          Real components with sample data for the week of Oct 5. Nothing is
          saved or published here. Pick a style at the bottom left.
        </p>
      </header>
      <div className="schedule-dialogs-preview-bar">
        <Station label="Published menu">
          <div className="schedule-action-menu">
            <button
              type="button"
              className={`schedule-published-indicator ${SCHEDULE_ACTION_BUTTON_CLASS}`}
              data-schedule-top-action-trigger="published"
              data-publication-tone="partial"
              aria-expanded={publishedMenuOpen}
              onClick={() => setPublishedMenuOpen((open) => !open)}
            >
              <Check size={15} aria-hidden /> Published
            </button>
            {publishedMenuOpen ? (
              <div className="schedule-action-menu-panel">
                <button type="button" onClick={() => { setPublishedMenuOpen(false); setPublishOpen(true); }}>
                  Publish another draft
                </button>
                <button type="button" onClick={() => setPublishedMenuOpen(false)}>
                  Unpublish schedule
                </button>
              </div>
            ) : null}
          </div>
        </Station>
        <Station label="Publish while editing">
          <SaveDraftMenu
            drafts={drafts}
            activeDraftId={activeDraftId}
            activeDraftName={drafts[0]?.name ?? null}
            publishedSchedule={publishedSchedule}
            trigger={
              <button
                type="button"
                className={`schedule-publish-action ${SCHEDULE_ACTION_BUTTON_CLASS}`}
                data-schedule-top-action-trigger="publish"
                data-publication-tone="partial"
              >
                <Send size={15} aria-hidden /> Publish
              </button>
            }
            onSaveDraft={() => false}
            onSaveAndPublish={() => {
              setPublishOpen(true);
              return true;
            }}
          />
        </Station>
        <Station label="New Schedule menu">
          <DraftDropdownMenu
            drafts={drafts}
            activeDraftId={activeDraftId}
            triggerLabel={drafts[0]?.name ?? "New Schedule"}
            canEditPublishedSchedule
            publishedSchedule={publishedSchedule}
            publishedLocationStatuses={publicationStatuses}
            topActionId="new-schedule"
            onPreviewDraft={noop}
            onEditDraft={noop}
            onStartBlankDraft={noop}
            onEditPublishedSchedule={noop}
            onDeleteDraft={noop}
            onUnpublishSchedule={noop}
          />
        </Station>
        <Station label="Publish window">
          <button
            type="button"
            className={`schedule-publish-action ${SCHEDULE_ACTION_BUTTON_CLASS}`}
            data-schedule-top-action-trigger="publish"
            data-publication-tone="partial"
            onClick={() => setPublishOpen(true)}
          >
            <Send size={15} aria-hidden /> Publish
          </button>
        </Station>
      </div>
      {publishOpen ? (
        <PublishScheduleDialog
          drafts={drafts}
          activeDraftId={activeDraftId}
          locations={locations}
          departments={departments}
          employees={employees}
          onClose={() => setPublishOpen(false)}
          onPreview={(draftId, locationIds) => preview(draftId, locationIds)}
          onPublish={async () => {
            await new Promise((resolve) => setTimeout(resolve, 600));
            setPublishOpen(false);
          }}
        />
      ) : null}
    </main>
  );
}
