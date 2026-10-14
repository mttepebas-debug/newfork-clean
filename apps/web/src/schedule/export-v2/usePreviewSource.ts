import { useEffect, useState } from "react";
import type { ScheduleDraftSummary, ScheduleReadModel, ScheduleShift } from "@newfork/shared/schedule";
import { fetchScheduleDraftShifts } from "../schedule-data";
import type { ExportSource } from "./snapshot";
import { requestErrorText } from "../../lib/request-error";

/** Owns the same draft read used by the grid, so export cannot lag behind a second source. */
export function usePreviewSource({ workspaceId, model, modelVersion, activeDraftId, editing, editSession, loading, drafts, onMissingDraft }: {
  readonly workspaceId: string | null;
  readonly model: ScheduleReadModel | undefined;
  readonly modelVersion: number;
  readonly activeDraftId: string | null;
  readonly editing: boolean;
  /** The person's open edit: while editing, Export takes the grid as it is now, saved or not (Mert 2026-10-12). */
  readonly editSession: { readonly id: string; readonly revision: number; readonly sourceDraftId: string | null } | null;
  readonly loading: boolean;
  readonly drafts: readonly ScheduleDraftSummary[] | undefined;
  readonly onMissingDraft: () => void;
}) {
  const draft = drafts?.find(item => item.id === activeDraftId);
  const week = model?.week_start;
  const locationKey = model?.locations.map(location => location.id).join(",") ?? "";
  // BL-324: a retry reads the draft again; the attempt is part of the key so the failed read stops counting.
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([workspaceId, week, activeDraftId, draft?.revision, draft?.name, modelVersion, locationKey, attempt]);
  const [resolved, setResolved] = useState<{ key: string; shifts: readonly ScheduleShift[]; error: string | null } | null>(null);
  useEffect(() => {
    if (editing || loading || !workspaceId || !week || !activeDraftId || !drafts) return;
    if (!draft || draft.workspace_id !== workspaceId || draft.week_start !== week) {
      onMissingDraft(); return;
    }
    let cancelled = false;
    void fetchScheduleDraftShifts(workspaceId, week, activeDraftId, locationKey ? locationKey.split(",") : [])
      .then(result => { if (!cancelled) setResolved({ key, shifts: result.shifts, error: null }); })
      .catch((error: unknown) => {
        console.error(error);
        if (!cancelled) setResolved({ key, shifts: [], error: requestErrorText(error, "Could not load the selected draft") });
      });
    return () => { cancelled = true; };
  }, [activeDraftId, draft, drafts, editing, key, loading, locationKey, onMissingDraft, week, workspaceId]);
  const current = resolved?.key === key ? resolved : null;
  if (editing) {
    const editKey = JSON.stringify([workspaceId, week, "edit", editSession?.id, editSession?.revision, modelVersion, locationKey]);
    const editReady = Boolean(editSession && !loading && workspaceId && model?.workspace_id === workspaceId);
    const edited = drafts?.find(item => item.id === editSession?.sourceDraftId);
    const editSource: ExportSource | null = editSession
      ? { kind: "edit_session", id: editSession.id, revision: editSession.revision, draftName: edited?.name ?? null }
      : null;
    return { requestedKey: editKey, resolvedKey: editReady ? editKey : null, source: editSource, loading: !editReady,
      shifts: null, error: null, retry: () => setAttempt(value => value + 1) };
  }
  const ready = !editing && !loading && Boolean(workspaceId && model?.workspace_id === workspaceId) &&
    (!activeDraftId || Boolean(draft && current && !current.error));
  const source: ExportSource | null = activeDraftId
    ? draft ? { kind: "draft", id: draft.id, revision: draft.revision, name: draft.name } : null
    : { kind: "published" };
  return { requestedKey: key, resolvedKey: ready ? key : null, source, loading: !ready,
    shifts: current?.shifts ?? null, error: current?.error ?? null, retry: () => setAttempt(value => value + 1) };
}
