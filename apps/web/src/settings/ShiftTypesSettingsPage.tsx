import { CatalogDrawer } from "./CatalogDrawer";
import {
  SAME_START_END_TIME_MESSAGE,
  shiftTypeInputSchema,
  type ShiftType,
  type ShiftTypeInput,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, Info, Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { JobColorInput } from "./JobCatalogEditor";
import "./jobs-settings.css";
import { errorText, SettingsHeader } from "./GeneralSettingsPage";
import { ShiftCatalogTabs } from "./ShiftCatalogTabs";
import { CatalogDeleteAction } from "./CatalogDeleteAction";
import { ShiftCatalogList } from "./ShiftCatalogList";
import {
  listShiftTypes,
  reorderShiftTypes,
  saveShiftType,
  setShiftTypeArchived,
} from "./organization-data";

import { isNoAccess } from "../lib/no-access";
import { NoAccessState } from "../shell/NoAccessState";
import { noAccessHomePath } from "../auth/resolveLanding";
const defaultDraft: ShiftTypeInput = {
  name: "",
  color: "#5B7FA3",
  default_start_time: "09:00",
  default_end_time: "17:00",
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
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<ShiftType | "new" | null>(null);
  const [draft, setDraft] = useState<ShiftTypeInput>(defaultDraft);
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
    onError: (error) => setFormError(errorText(error)),
  });
  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      setShiftTypeArchived(workspaceId, id, archived),
    onSuccess: refresh,
    onError: (error) => setFormError(errorText(error)),
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
    setDraft(item ? shiftTypeInputSchema.parse(item) : defaultDraft);
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
    setDraft(shiftTypeInputSchema.parse(requested));
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
  // The shared schema's own refusal, not a second copy of the rule.
  const sameHours =
    !parsedDraft.success &&
    parsedDraft.error.issues.some(
      (issue) =>
        issue.path[0] === "default_end_time" &&
        issue.message === SAME_START_END_TIME_MESSAGE,
    );
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

  // The API's "no" gets the one no-access card, never its raw sentence.
  // The card takes the catalog's place, not the page's: the title and the
  // Shift types | Shift labels switch stay, so the other tab is still reachable.
  if (isNoAccess(query.error))
    return (
      <section
        className="settings-page jobs-settings-page shift-catalog-settings-page"
        aria-labelledby="shift-types-settings-title"
      >
        <SettingsHeader
          icon={<Clock3 size={21} aria-hidden />}
          title="Shift types"
          description="Reusable service periods with default times and schedule colors."
          action={
            <div className="shift-catalog-header-actions">
              <ShiftCatalogTabs />
            </div>
          }
        />
        <NoAccessState
          subject="shift types"
          homeHref={noAccessHomePath(context, "/app/settings/scheduling/shift-types")}
        />
      </section>
    );
  return (
    <section
      className="settings-page jobs-settings-page shift-catalog-settings-page"
      aria-labelledby="shift-types-settings-title"
    >
      <SettingsHeader
        icon={<Clock3 size={21} aria-hidden />}
        title="Shift types"
        description="Reusable service periods with default times and schedule colors."
        action={
          <div className="shift-catalog-header-actions">
            <ShiftCatalogTabs
              disabled={saveMutation.isPending || deleteLocked}
            />
            <Button
              className="job-primary-button"
              type="button"
              disabled={!canEdit || saveMutation.isPending || deleteLocked}
              onClick={() => openEditor()}
            >
              <Plus size={16} aria-hidden />
              Add shift type
            </Button>
          </div>
        }
      />
      {editing ? (
        <CatalogDrawer
          label={editing === "new" ? "Add shift type" : `Edit ${editing.name}`}
          className="shift-catalog-settings-page"
          onClose={closeEditor}
          busy={saveMutation.isPending || deleteLocked}
        >
          <form
            className="job-catalog-editor"
            onSubmit={submit}
            aria-label={
              editing === "new" ? "Add shift type" : `Edit ${editing.name}`
            }
          >
            <div className="job-editor-title">
              <div>
                <h2>
                  {editing === "new" ? "New shift type" : "Edit shift type"}
                </h2>
                <p>Default times may cross midnight.</p>
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
                <div className="job-shift-times">
                  <div className="job-field">
                    <span className="shift-default-time-label">
                      <label htmlFor="shift-catalog-default-start">
                        Default start
                      </label>
                      <DefaultHoursInfo />
                    </span>
                    <input
                      id="shift-catalog-default-start"
                      type="time"
                      required
                      disabled={!canEdit || saveMutation.isPending}
                      value={draft.default_start_time ?? ""}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          default_start_time: event.target.value || null,
                        }))
                      }
                    />
                  </div>
                  <div className="job-field">
                    <span className="shift-default-time-label">
                      <label htmlFor="shift-catalog-default-end">
                        Default end
                      </label>
                      <DefaultHoursInfo />
                    </span>
                    <input
                      id="shift-catalog-default-end"
                      type="time"
                      required
                      disabled={!canEdit || saveMutation.isPending}
                      value={draft.default_end_time ?? ""}
                      aria-invalid={sameHours || undefined}
                      aria-describedby={sameHours ? "shift-catalog-time-error" : undefined}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          default_end_time: event.target.value || null,
                        }))
                      }
                    />
                    {/* BL-677 (3): the schema's refusal, said where Save went grey. */}
                    {sameHours ? (
                      <small className="form-error" id="shift-catalog-time-error">
                        {SAME_START_END_TIME_MESSAGE}
                      </small>
                    ) : null}
                  </div>
                </div>
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
              {formError ? (
                <p className="form-error" role="alert">
                  {formError}
                </p>
              ) : null}
            </div>
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
      {!editing && formError ? (
        <p className="settings-state error" role="alert">
          {formError}
        </p>
      ) : null}
      {query.isLoading ? (
        <p className="settings-state">Loading shift types...</p>
      ) : null}
      {query.error ? (
        <p className="settings-state error" role="alert">
          {errorText(query.error)}
        </p>
      ) : null}
      {!query.isLoading && !query.error && (
        <ShiftCatalogList
          items={items}
          types
          showArchived={showArchived}
          onArchivedChange={setShowArchived}
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

function DefaultHoursInfo() {
  return (
    <span className="shift-default-info">
      <span
        tabIndex={0}
        className="shift-default-info-trigger"
        aria-label="Default hours details"
      >
        <Info size={13} aria-hidden />
      </span>
      <span className="shift-default-info-popover" role="tooltip">
        These hours prefill new Schedule shifts that use this shift type.
        Managers can still change the actual start and end time before saving.
        Employee shift-type availability and time-off shortcuts also use these
        hours as the service reference. Existing saved shifts keep their own
        hours.
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
