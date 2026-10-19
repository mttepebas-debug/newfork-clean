import { CatalogDrawer } from "./CatalogDrawer";
import {
  shiftTypeInputSchema,
  type ShiftType,
  type ShiftTypeInput,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { JobColorInput } from "./JobCatalogEditor";
import "./jobs-settings.css";
import { errorText } from "./GeneralSettingsPage";
import { isGoneMeanwhile } from "../lib/catalog-refusals";
import { ShiftCatalogHeader, ShiftCatalogToolbar } from "./ShiftCatalogTabs";
import { CatalogDeleteAction } from "./CatalogDeleteAction";
import { ShiftCatalogList } from "./ShiftCatalogList";
import { ListOutline, LoadError, RefreshError } from "../shell/LoadState";
import {
  listShiftTypes,
  reorderShiftTypes,
  saveShiftType,
  setShiftTypeArchived,
} from "./organization-data";

import { isNoAccess } from "../lib/no-access";
import { NoAccessState } from "../shell/NoAccessState";
import { noAccessHomePath } from "../auth/resolveLanding";
import { WindowAlert } from "../shell/WindowAlert";
import { FieldNote } from "../shell/FieldNote";
import {
  SHIFT_TYPE_TIME_ROWS_MAX,
  addTimeRow,
  makePrimary,
  removeTimeRow,
  timeRowLength,
  timeRowRefusal,
  timeRowsOf,
  updateTimeRow,
  withTimeRows,
  type TimeRows,
} from "./shift-type-times";
const defaultDraft: ShiftTypeInput = {
  name: "",
  color: "#5B7FA3",
  default_start_time: "09:00",
  default_end_time: "17:00",
  time_options: [],
};

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export default function ShiftTypesSettingsPage() {
  const { context } = useAuth();
  const workspaceId = context?.workspace.id ?? "";
  return <ShiftTypesEditor key={workspaceId} workspaceId={workspaceId} />;
}

function ShiftTypesEditor({ workspaceId }: { workspaceId: string }) {
  const { context } = useAuth();
  const canEdit =
    context?.permissions.includes("settings.shift_catalog.manage") ?? false;
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedType = searchParams.get("edit");
  const queryClient = useQueryClient();
  const queryKey = ["shift-types", workspaceId];
  const query = useQuery({
    queryKey,
    queryFn: () => listShiftTypes(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const [editing, setEditing] = useState<ShiftType | "new" | null>(null);
  const [draft, setDraft] = useState<ShiftTypeInput>(defaultDraft);
  const [times, setTimes] = useState<TimeRows>(() => timeRowsOf(defaultDraft));
  const startDraft = (value: ShiftTypeInput): void => {
    setDraft(value);
    setTimes(timeRowsOf(value));
  };
  const changeTimes = (next: TimeRows): void => {
    setTimes(next);
    setDraft((current) => withTimeRows(current, next));
  };
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteLocked, setDeleteLocked] = useState(false);
  const editorSequence = useRef(0);
  const handledTypeLink = useRef<string | null>(null);
  const closeEditor = () => {
    editorSequence.current += 1;
    setEditing(null);
    if (requestedType)
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete("edit");
          return next;
        },
        { replace: true },
      );
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const saveMutation = useMutation({
    mutationFn: ({
      values,
      id,
      revision,
    }: {
      values: ShiftTypeInput;
      id?: string;
      revision?: number;
    }) => saveShiftType(workspaceId, values, id, revision),
    onSuccess: async () => {
      await refresh();
      closeEditor();
      setFormError(null);
    },
    // BL-1045: an item deleted meanwhile leaves the list; its sentence stays.
    onError: (error) => {
      setFormError(errorText(error));
      if (isGoneMeanwhile(error)) void refresh();
    },
  });
  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      setShiftTypeArchived(workspaceId, id, archived),
    onSuccess: refresh,
    // BL-1045: an item deleted meanwhile leaves the list; its sentence stays.
    onError: (error) => {
      setFormError(errorText(error));
      if (isGoneMeanwhile(error)) void refresh();
    },
  });
  const reorderMutation = useMutation({
    mutationFn: (ids: readonly string[]) => reorderShiftTypes(workspaceId, ids),
    onSuccess: refresh,
    onError: (error) => setFormError(errorText(error)),
  });

  const openEditor = (item?: ShiftType): void => {
    if (deleteLocked || saveMutation.isPending) return;
    editorSequence.current += 1;
    setEditing(item ?? "new");
    startDraft(item ? shiftTypeInputSchema.parse(item) : defaultDraft);
    setFormError(null);
  };
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const parsed = shiftTypeInputSchema.safeParse(draft);
    if (!canSave) return;
    if (!parsed.success) {
      setFormError(
        parsed.error.issues[0]?.message ?? "Check the shift type fields",
      );
      return;
    }
    saveMutation.mutate({
      values: parsed.data,
      ...(editing !== "new" && editing
        ? { id: editing.id, revision: editing.default_revision }
        : {}),
    });
  };

  const items = query.data ?? [];
  useEffect(() => {
    if (!requestedType) {
      handledTypeLink.current = null;
      return;
    }
    if (handledTypeLink.current === requestedType || editing || !query.data)
      return;
    const requested = query.data.find(
      (type) => type.id === requestedType && !type.archived_at,
    );
    if (!requested) return;
    handledTypeLink.current = requestedType;
    editorSequence.current += 1;
    setEditing(requested);
    startDraft(shiftTypeInputSchema.parse(requested));
    setFormError(null);
  }, [requestedType, editing, query.data]);
  const active = items.filter((item) => !item.archived_at);
  const savedType = editing && editing !== "new" ? editing : null;
  const latestType = savedType
    ? items.find((item) => item.id === savedType.id)
    : null;
  const defaultsStale = Boolean(
    savedType &&
    latestType &&
    savedType.default_revision !== latestType.default_revision,
  );
  const defaultsChanged = Boolean(
    savedType &&
    (savedType.default_start_time !== draft.default_start_time ||
      savedType.default_end_time !== draft.default_end_time),
  );
  const parsedDraft = shiftTypeInputSchema.safeParse(draft);
  const canSave =
    canEdit &&
    !saveMutation.isPending &&
    !defaultsStale &&
    !deleteLocked &&
    Boolean(editing) &&
    parsedDraft.success &&
    Boolean(draft.default_start_time && draft.default_end_time) &&
    (editing === "new" ||
      Boolean(
        savedType &&
        !sameJson(parsedDraft.data, shiftTypeInputSchema.parse(savedType)),
      ));
  const move = (id: string, offset: -1 | 1): void => {
    const index = active.findIndex((item) => item.id === id);
    const next = index + offset;
    if (index < 0 || next < 0 || next >= active.length) return;
    const ids = active.map((item) => item.id);
    [ids[index], ids[next]] = [ids[next]!, ids[index]!];
    reorderMutation.mutate(ids);
  };

  // The API's "no" gets the one no-access card, never its raw sentence, and
  // the card alone: no title, no tabs (Mert 2026-10-14). Both tabs open by the
  // same Settings gate, so a "no" here is a "no" there too.
  if (isNoAccess(query.error))
    return (
      <NoAccessState
        homeHref={noAccessHomePath(context, "/app/settings/scheduling/shift-types")}
      />
    );
  return (
    <section
      className="settings-page jobs-settings-page shift-catalog-settings-page list-page"
      aria-labelledby="shift-types-settings-title"
    >
      <ShiftCatalogHeader titleId="shift-types-settings-title" />
      {editing ? (
        <CatalogDrawer
          label={editing === "new" ? "New shift type" : `Edit ${editing.name}`}
          className="shift-catalog-settings-page"
          onClose={closeEditor}
          busy={saveMutation.isPending || deleteLocked}
        >
          <form
            className="job-catalog-editor"
            onSubmit={submit}
            aria-label={
              editing === "new" ? "New shift type" : `Edit ${editing.name}`
            }
          >
            <div className="job-editor-title">
              <div>
                <h2>
                  {editing === "new" ? "New shift type" : "Edit shift type"}
                </h2>
                <p>Times may cross midnight. A preset dropped on the Schedule offers these times.</p>
              </div>
              <button
                type="button"
                className="job-icon-button"
                aria-label="Close shift type editor"
                title="Close"
                disabled={saveMutation.isPending || deleteLocked}
                onClick={closeEditor}
              >
                <X size={17} aria-hidden />
              </button>
            </div>
            <div className="catalog-drawer-body">
              <fieldset
                disabled={!canEdit || saveMutation.isPending || deleteLocked}
              >
                <div className="job-field">
                  <label htmlFor="shift-catalog-name">Name</label>
                  <div className="job-name-color">
                    <input
                      id="shift-catalog-name"
                      disabled={!canEdit || saveMutation.isPending}
                      value={draft.name}
                      maxLength={60}
                      required
                      placeholder="Enter a name"
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                    <JobColorInput
                      label="Color"
                      disabled={!canEdit || saveMutation.isPending}
                      value={draft.color}
                      onChange={(color) =>
                        setDraft((current) => ({ ...current, color }))
                      }
                    />
                  </div>
                </div>{" "}
                <ShiftTypeTimesField
                  times={times}
                  disabled={!canEdit || saveMutation.isPending}
                  onChange={changeTimes}
                />
              </fieldset>
              {savedType && defaultsChanged ? (
                <section
                  className="settings-state"
                  aria-label="Default hours change"
                >
                  <strong>Default hours change</strong>
                  <p>
                    Currently saved: {formatRange(savedType)}. After saving:{" "}
                    {formatRange(draft)}.
                  </p>
                  <p>
                    New uses of {draft.name || "this shift type"} will be
                    checked against the new hours. Existing shifts keep their
                    saved reference hours; changing this setting does not
                    revalidate or update them.
                  </p>
                  {!draft.default_start_time && !draft.default_end_time ? (
                    <p>Default start and end times are required.</p>
                  ) : null}
                </section>
              ) : null}
              {defaultsStale ? (
                <p role="alert">
                  The default hours changed while this editor was open. Your
                  draft is preserved. Reload the latest defaults before saving.
                </p>
              ) : null}
              {savedType && (formError || defaultsStale) ? (
                <Button
                  type="button"
                  className="job-secondary-button"
                  disabled={
                    saveMutation.isPending || query.isFetching || deleteLocked
                  }
                  onClick={async () => {
                    const sequence = editorSequence.current;
                    const refreshed = await query.refetch();
                    if (sequence !== editorSequence.current) return;
                    const latest = refreshed.data?.find(
                      (item) => item.id === savedType.id,
                    );
                    if (refreshed.isError || !latest) {
                      setFormError(
                        "Unable to reload this shift type. Your draft has been kept.",
                      );
                      return;
                    }
                    openEditor(latest);
                  }}
                >
                  Discard draft and reload latest
                </Button>
              ) : null}
            </div>
            {/* Over the body's bottom edge, above the footer, which scrolls (UI-FIELDMSG). */}
            <WindowAlert between message={formError} />
            <div className="job-editor-footer">
              {savedType && (
                <CatalogDeleteAction
                  key={savedType.id}
                  kind="shift-types"
                  id={savedType.id}
                  name={savedType.name}
                  workspaceId={workspaceId}
                  disabled={!canEdit || saveMutation.isPending}
                  onLockChange={setDeleteLocked}
                  onDeleted={closeEditor}
                />
              )}
              <div className="job-editor-actions">
                <Button
                  className="job-secondary-button"
                  type="button"
                  disabled={saveMutation.isPending || deleteLocked}
                  onClick={closeEditor}
                >
                  Cancel
                </Button>
                <Button
                  className="job-primary-button"
                  type="submit"
                  disabled={!canSave}
                >
                  {saveMutation.isPending ? "Saving" : "Save shift type"}
                </Button>
              </div>
            </div>
          </form>
        </CatalogDrawer>
      ) : null}
      {query.isLoading || (query.error && !query.data) ? (
        <>
          <ShiftCatalogToolbar disabled={saveMutation.isPending || deleteLocked} />
          {query.isLoading ? (
            <ListOutline label="Loading shift types" rows={5} columns={4} />
          ) : (
            <LoadError
              title="We couldn't load shift types"
              detail="Shift types didn't load. Nothing was changed."
              retrying={query.isFetching}
              onRetry={() => void query.refetch()}
            />
          )}
        </>
      ) : (
        <ShiftCatalogList
          items={items}
          types
          canEdit={canEdit}
          onAdd={() => openEditor()}
          addDisabled={saveMutation.isPending || deleteLocked}
          tabsDisabled={saveMutation.isPending || deleteLocked}
          notice={
            <>
              {/* Waits while a drawer is open: the page behind it is inert and the edit doesn't use the list. */}
              {query.error && !editing ? (
                <RefreshError
                  message="Shift types didn't refresh. This is the last list that loaded."
                  retrying={query.isFetching}
                  onRetry={() => void query.refetch()}
                />
              ) : null}
              {!editing && formError ? (
                <p className="settings-state error" role="alert">
                  {formError}
                </p>
              ) : null}
            </>
          }
          onEdit={openEditor}
          onMove={move}
          onArchive={(item) =>
            archiveMutation.mutate({ id: item.id, archived: !item.archived_at })
          }
          disabled={!canEdit || saveMutation.isPending || deleteLocked}
          reorderPending={reorderMutation.isPending}
          archivePending={archiveMutation.isPending}
        />
      )}
    </section>
  );
}

// Variant A (PRESET-SAAT, S-183): one row per time, the round button picks the
// primary, "Add time" adds a row, × removes one (the last row stays).
function ShiftTypeTimesField({
  times,
  disabled,
  onChange,
}: {
  readonly times: TimeRows;
  readonly disabled: boolean;
  readonly onChange: (next: TimeRows) => void;
}) {
  const refusal = timeRowRefusal(times);
  return (
    <fieldset className="job-field shift-type-times">
      <legend className="shift-default-time-label">
        Times
        <DefaultHoursInfo />
      </legend>
      <ol className="shift-type-time-rows">
        {times.rows.map((row, index) => {
          const primary = index === times.primary;
          const invalid = refusal?.row === index;
          const label = `Time ${index + 1}`;
          return (
            <li key={index} className="shift-type-time-row" data-primary={primary || undefined}>
              <input
                type="radio"
                name="shift-type-primary-time"
                className="shift-type-time-radio"
                checked={primary}
                aria-label={`Make time ${index + 1} primary`}
                disabled={disabled}
                onChange={() => onChange(makePrimary(times, index))}
              />
              <input
                type="time"
                aria-label={`${label} start`}
                required
                disabled={disabled}
                value={row.start}
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? "shift-catalog-time-error" : undefined}
                onChange={(event) => onChange(updateTimeRow(times, index, { start: event.target.value }))}
              />
              <span className="shift-type-time-dash" aria-hidden>
                –
              </span>
              <input
                type="time"
                aria-label={`${label} end`}
                required
                disabled={disabled}
                value={row.end}
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? "shift-catalog-time-error" : undefined}
                onChange={(event) => onChange(updateTimeRow(times, index, { end: event.target.value }))}
              />
              <span className="shift-type-time-length">{timeRowLength(row) ?? ""}</span>
              <span className="shift-type-time-primary">{primary ? "Primary" : ""}</span>
              <button
                type="button"
                className="job-icon-button shift-type-time-remove"
                aria-label={`Remove time ${index + 1}`}
                title="Remove time"
                disabled={disabled || times.rows.length === 1}
                onClick={() => onChange(removeTimeRow(times, index))}
              >
                <X size={15} aria-hidden />
              </button>
            </li>
          );
        })}
      </ol>
      {/* BL-677 (3): the refusal, said where Save went grey. */}
      <FieldNote id="shift-catalog-time" error={refusal?.message ?? null} />
      <button
        type="button"
        className="shift-type-time-add"
        disabled={disabled || times.rows.length >= SHIFT_TYPE_TIME_ROWS_MAX}
        onClick={() => onChange(addTimeRow(times))}
      >
        <Plus size={14} aria-hidden />
        Add time
      </button>
    </fieldset>
  );
}

function DefaultHoursInfo() {
  return (
    <span className="shift-default-info">
      <span
        tabIndex={0}
        className="shift-default-info-trigger"
        aria-label="Times details"
      >
        <Info size={13} aria-hidden />
      </span>
      <span className="shift-default-info-popover" role="tooltip">
        A preset dropped on the Schedule offers these times, the primary first;
        with one time it is placed at once. Managers can still change a
        shift's start and end before saving. Employee shift-type availability
        and time-off shortcuts use the primary time as the service reference.
        Existing saved shifts keep their own hours.
      </span>
    </span>
  );
}

function formatTime(value: string | null): string {
  if (!value) return "No default";
  const [hour, minute] = value.split(":").map(Number);
  const suffix = (hour ?? 0) >= 12 ? "PM" : "AM";
  const displayHour = (hour ?? 0) % 12 || 12;
  return `${displayHour}:${String(minute ?? 0).padStart(2, "0")} ${suffix}`;
}

function formatRange(
  value: Pick<ShiftTypeInput, "default_start_time" | "default_end_time">,
): string {
  if (!value.default_start_time && !value.default_end_time)
    return "No default hours";
  return `${formatTime(value.default_start_time)} – ${formatTime(value.default_end_time)}${value.default_start_time && value.default_end_time && value.default_end_time < value.default_start_time ? " (Ends next day)" : ""}`;
}
