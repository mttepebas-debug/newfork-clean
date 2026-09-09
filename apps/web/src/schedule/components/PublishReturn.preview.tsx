import { useState } from "react";
import type { SchedulePublicationPreview } from "@newfork/shared/schedule";
import { PublishScheduleDialog, type SchedulePublicationChoices } from "./PublishScheduleDialog";
import { usePreflightShiftFocus } from "../hooks/usePreflightShiftFocus";

export function PublishReturnPreview({ preview }: { preview: SchedulePublicationPreview }) {
  const [open, setOpen] = useState(true);
  const [choices, setChoices] = useState<SchedulePublicationChoices | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  usePreflightShiftFocus(target, !open, setTarget);
  const first = preview.findings[0]!;
  const locations = [{ id: first.location_id, name: first.location_name!, timezone: "America/Los_Angeles", sort_order: 0, publication_status: "unpublished" as const, published_at: null }];
  const employees = preview.findings.map((finding) => ({ id: finding.employee_id!, display_name: finding.employee_name!, employee_code: "E-100", location_ids: [first.location_id], job_ids: [], primary_job_id: null, is_excluded_from_schedule: false, availability: null }));
  const draft = { id: preview.draft_id, workspace_id: preview.workspace_id, week_start: preview.week_start, name: "Service week", revision: 1, created_by: first.employee_id!, updated_by: first.employee_id!, created_at: "2026-09-08T12:00:00Z", updated_at: "2026-09-08T12:00:00Z" };
  return <main style={{ margin: 16 }}>
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><h1>Schedule</h1><button onClick={() => { window.scrollTo(0, 0); setOpen(true); }}>Publish</button></header>
    <div style={{ overflowX: "auto" }} data-return-grid>
      <table style={{ width: 1100, borderCollapse: "collapse" }}>
        <thead><tr><th>Employee</th>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <th key={day}>{day}</th>)}</tr></thead>
        <tbody>{Array.from({ length: 15 }, (_, index) => <tr key={index} style={{ height: 44 }}><td>Employee {index + 1}</td>{Array.from({ length: 7 }, (_, day) => <td key={day} />)}</tr>)}
          {preview.findings.map((finding) => <tr key={finding.id} style={{ height: 56 }}><th style={{ width: 240, textAlign: "left" }}>{finding.employee_name}</th>{Array.from({ length: 7 }, (_, day) => <td key={day}>{day === 4 ? <button data-shift-id={finding.shift_ids[0]} style={{ whiteSpace: "nowrap" }}>Dinner</button> : null}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
    {open ? <PublishScheduleDialog drafts={[draft]} activeDraftId={draft.id} initialChoices={choices} locations={locations} employees={employees}
      onClose={() => setOpen(false)} onPreview={async () => preview} onPublish={async () => setOpen(false)}
      onReviewShift={async (finding, selected) => { setChoices(selected); setOpen(false); setTarget(finding.shift_ids[0]!); }} /> : null}
  </main>;
}
