import { useRef, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { WeeklyPreferenceSave } from "@newfork/shared";
import {
  loadWeeklyPreferences,
  saveWeeklyPreferences,
} from "./availability-data";
import { ManagerAvailability } from "./ManagerAvailability";
import { MyAvailabilityForm } from "./MyAvailabilityForm";
import { isNoAccess } from "../lib/no-access";
import { ListOutline, LoadError } from "../shell/LoadState";
// Employee Hub's "My availability" tabs (employee-weekly-workspace) are drawn here too.
import "./weekly-preferences.css";

type Props = {
  workspaceId: string;
  employeeId?: string;
  audience: "employee" | "manager";
  onboarding?: boolean;
  onSaved?: () => void;
  /** The Availability page's phone view: the manager's tabs read "Availability" / "Manager notes". */
  short?: boolean;
  /** Onboarding's way on ("Skip for now"), kept in the one action bar beside Save. */
  extraAction?: ReactNode;
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
  extraAction,
  short,
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
  // An uncertain save may already have committed: the same command replays
  // with the same key.
  const baseOf = (command: WeeklyPreferenceSave) => JSON.stringify(command);

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
  // BL-797: someone saved first; Reload shows their week.
  const reload = async () => {
    const latest = await query.refetch();
    return latest.isError ? undefined : latest.data;
  };
  const readStatus =
    query.error && typeof query.error === "object" && "status" in query.error
      ? Number(query.error.status)
      : 0;
  // BL-798: the core's "no" reads as a sentence; retrying cannot change it.
  const noAccess = isNoAccess(query.error);
  if (query.isError && noAccess)
    return (
      <div role="alert">
        <p>You don't have access to this availability.</p>
      </div>
    );
  if (
    query.isError &&
    (!query.data ||
      readStatus === 401 ||
      readStatus === 403 ||
      readStatus === 404)
  )
    return (
      <LoadError
        inset
        level={3}
        title="We couldn't load availability"
        detail="Availability didn't load. Nothing was changed."
        retrying={query.isFetching}
        onRetry={() => void query.refetch()}
      />
    );
  if (!query.data)
    return (
      <ListOutline label="Loading availability" rows={7} columns={3} inset />
    );
  return (
    <>
      {query.isError ? (
        <div role="alert">
          <p>Availability didn't refresh. This is the last version that loaded.</p>
          <button type="button" disabled={query.isFetching} onClick={() => void query.refetch()}>
            Try again
          </button>
        </div>
      ) : null}
      {audience === "employee" ? (
        // The person's own week, day by day (Mert 2026-10-16, "A · Alt sayfa").
        <MyAvailabilityForm
          model={query.data}
          onSave={save}
          wizard={onboarding}
          extraAction={extraAction}
          onReload={reload}
        />
      ) : (
        // Employees drawer: the employee's week read only and the manager's notes (AVAIL-GUN-3).
        <ManagerAvailability model={query.data} onSave={save} onReload={reload} short={short} />
      )}
    </>
  );
}
