import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { WeeklyPreferenceSave } from "@newfork/shared";
import {
  loadWeeklyPreferences,
  previewWeeklyPreferences,
  saveWeeklyPreferences,
} from "./availability-data";
import { WeeklyPreferencesForm } from "./WeeklyPreferencesForm";

type Props = {
  workspaceId: string;
  employeeId?: string;
  audience: "employee" | "manager";
  onboarding?: boolean;
  onSaved?: () => void;
};

export function WeeklyPreferencesPanel(props: Props) {
  return (
    <ConnectedPreferences
      key={`${props.workspaceId}:${props.employeeId ?? "self"}:${props.audience}:${Boolean(props.onboarding)}`}
      {...props}
    />
  );
}

function ConnectedPreferences({
  workspaceId,
  employeeId,
  audience,
  onboarding = false,
  onSaved,
}: Props) {
  const client = useQueryClient();
  const queryKey = [
    "weekly-preferences",
    workspaceId,
    onboarding ? "onboarding" : "workspace",
    employeeId ?? "self",
  ];
  const query = useQuery({
    queryKey,
    queryFn: () => loadWeeklyPreferences(workspaceId, employeeId, onboarding),
    enabled: Boolean(workspaceId),
    retry: false,
  });
  const attempt = useRef<{
    base: string;
    command: WeeklyPreferenceSave;
    key: string;
  } | null>(null);
  const [finalizedCount, setFinalizedCount] = useState(0);
  const baseOf = (command: WeeklyPreferenceSave) =>
    JSON.stringify({ ...command, decisions: undefined });

  async function preview(command: WeeklyPreferenceSave) {
    // An uncertain save may already have committed. Replay its exact command/key
    // before asking for a newer revision or repeating any request decisions.
    if (attempt.current?.base === baseOf(command)) return { items: [] };
    attempt.current = null;
    return previewWeeklyPreferences(workspaceId, command, onboarding);
  }
  async function save(command: WeeklyPreferenceSave) {
    const base = baseOf(command);
    if (attempt.current?.base !== base)
      attempt.current = { base, command, key: crypto.randomUUID() };
    const current = attempt.current!;
    try {
      const result = await saveWeeklyPreferences(
        workspaceId,
        current.command,
        current.key,
        onboarding,
      );
      attempt.current = null;
      setFinalizedCount(result.finalized.length);
      client.setQueryData(queryKey, result.model);
      void client.invalidateQueries({
        queryKey: ["weekly-preferences", workspaceId],
      });
      void client.invalidateQueries({ queryKey: ["schedule-read", workspaceId] });
      onSaved?.();
      return result.model;
    } catch (error) {
      const status =
        error && typeof error === "object" && "status" in error
          ? Number(error.status)
          : 0;
      if (status >= 400 && status < 500) attempt.current = null;
      throw error;
    }
  }
  const readStatus =
    query.error && typeof query.error === "object" && "status" in query.error
      ? Number(query.error.status)
      : 0;
  const readError = query.isError ? (
    <div role="alert">
      <p>
        {query.error instanceof Error
          ? query.error.message
          : "Availability could not be loaded."}
      </p>
      <button type="button" onClick={() => void query.refetch()}>
        Retry
      </button>
    </div>
  ) : null;
  if (
    query.isError &&
    (!query.data ||
      readStatus === 401 ||
      readStatus === 403 ||
      readStatus === 404)
  )
    return readError;
  if (!query.data) return <p role="status">Loading availability...</p>;
  return (
    <>
      {readError}
      {finalizedCount > 0 && (
        <p className="weekly-preferences-notice" role="status">
          {finalizedCount} request{finalizedCount === 1 ? " was" : "s were"}{" "}
          approved before your save. Those assigned shifts remain your
          responsibility.
        </p>
      )}
      <WeeklyPreferencesForm
        model={query.data}
        audience={audience}
        onPreview={preview}
        onSave={save}
        wizard={onboarding}
      />
    </>
  );
}
