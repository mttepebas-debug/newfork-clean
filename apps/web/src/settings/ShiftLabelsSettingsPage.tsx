import { CatalogDrawer } from "./CatalogDrawer";
import {
  shiftLabelInputSchema,
  type ShiftLabel,
  type ShiftLabelInput,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Tags, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { JobColorInput } from "./JobCatalogEditor";
import "./jobs-settings.css";
import { errorText, SettingsHeader } from "./GeneralSettingsPage";
import { ShiftCatalogTabs } from "./ShiftCatalogTabs";
import { CatalogDeleteAction } from "./CatalogDeleteAction";
import { ShiftCatalogList } from "./ShiftCatalogList";
import {
  listShiftLabels,
  reorderShiftLabels,
  saveShiftLabel,
  setShiftLabelArchived,
} from "./organization-data";

import { isNoAccess } from "../lib/no-access";
import { NoAccessState } from "../shell/NoAccessState";
import { noAccessHomePath } from "../auth/resolveLanding";
const defaultDraft: ShiftLabelInput = {
  name: "",
  color: "#54736A",
};

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export default function ShiftLabelsSettingsPage() {
  const { context } = useAuth();
  const canEdit =
    context?.permissions.includes("settings.shift_catalog.manage") ?? false;
  const queryClient = useQueryClient();
  const workspaceId = context?.workspace.id ?? "";
  const queryKey = ["shift-labels", workspaceId];
  const query = useQuery({
    queryKey,
    queryFn: () => listShiftLabels(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<ShiftLabel | "new" | null>(null);
  const [draft, setDraft] = useState<ShiftLabelInput>(defaultDraft);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteLocked, setDeleteLocked] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const saveMutation = useMutation({
    mutationFn: ({ values, id }: { values: ShiftLabelInput; id?: string }) =>
      saveShiftLabel(workspaceId, values, id),
    onSuccess: async () => {
      await refresh();
      setEditing(null);
      setFormError(null);
    },
    onError: (error) => setFormError(errorText(error)),
  });
  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      setShiftLabelArchived(workspaceId, id, archived),
    onSuccess: refresh,
    onError: (error) => setFormError(errorText(error)),
  });
  const reorderMutation = useMutation({
    mutationFn: (ids: readonly string[]) =>
      reorderShiftLabels(workspaceId, ids),
    onSuccess: refresh,
    onError: (error) => setFormError(errorText(error)),
  });

  const openEditor = (item?: ShiftLabel): void => {
    if (deleteLocked || saveMutation.isPending) return;
    setEditing(item ?? "new");
    setDraft(item ? shiftLabelInputSchema.parse(item) : defaultDraft);
    setFormError(null);
  };
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const parsed = shiftLabelInputSchema.safeParse(draft);
    if (!canSave) return;
    if (!parsed.success) {
      setFormError(
        parsed.error.issues[0]?.message ?? "Check the shift label fields",
      );
      return;
    }
    saveMutation.mutate({
      values: parsed.data,
      ...(editing !== "new" && editing ? { id: editing.id } : {}),
    });
  };

  const items = query.data ?? [];
  const active = items.filter((item) => !item.archived_at);
  const parsedDraft = shiftLabelInputSchema.safeParse(draft);
  const labelBaseline =
    editing && editing !== "new" ? shiftLabelInputSchema.parse(editing) : null;
  const canSave =
    canEdit &&
    !saveMutation.isPending &&
    !deleteLocked &&
    Boolean(editing) &&
    parsedDraft.success &&
    (editing === "new" ||
      Boolean(labelBaseline && !sameJson(parsedDraft.data, labelBaseline)));
  const move = (id: string, offset: -1 | 1): void => {
    const index = active.findIndex((item) => item.id === id);
    const next = index + offset;
    if (index < 0 || next < 0 || next >= active.length) return;
    const ids = active.map((item) => item.id);
    [ids[index], ids[next]] = [ids[next]!, ids[index]!];
    reorderMutation.mutate(ids);
  };

  // The API's "no" gets the one no-access card, never its raw sentence.
  if (isNoAccess(query.error))
    return (
      <NoAccessState
        subject="shift labels"
        homeHref={noAccessHomePath(context, "/app/settings/scheduling/shift-labels")}
      />
    );
  return (
    <section
      className="settings-page jobs-settings-page shift-catalog-settings-page"
      aria-labelledby="shift-labels-settings-title"
    >
      <SettingsHeader
        icon={<Tags size={21} aria-hidden />}
        title="Shift labels"
        description="Reusable badge tags such as Training, Close, Expo, or Lead Server."
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
              Add shift label
            </Button>
          </div>
        }
      />
      {editing ? (
        <CatalogDrawer
          label={editing === "new" ? "Add shift label" : `Edit ${editing.name}`}
          className="shift-catalog-settings-page"
          onClose={() => setEditing(null)}
          busy={saveMutation.isPending || deleteLocked}
        >
          <form
            className="job-catalog-editor"
            onSubmit={submit}
            aria-label={
              editing === "new" ? "Add shift label" : `Edit ${editing.name}`
            }
          >
            <div className="job-editor-title">
              <div>
                <h2>
                  {editing === "new" ? "New shift label" : "Edit shift label"}
                </h2>
                <p>Names must be unique among active labels.</p>
              </div>
              <button
                type="button"
                className="job-icon-button"
                aria-label="Close shift label editor"
                disabled={!canEdit || saveMutation.isPending || deleteLocked}
                title="Close"
                onClick={() => setEditing(null)}
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
                </div>
              </fieldset>
              {formError ? (
                <p className="form-error" role="alert">
                  {formError}
                </p>
              ) : null}
            </div>
            <div className="job-editor-footer">
              {editing !== "new" && (
                <CatalogDeleteAction
                  key={editing.id}
                  kind="shift-labels"
                  id={editing.id}
                  name={editing.name}
                  workspaceId={workspaceId}
                  disabled={!canEdit || saveMutation.isPending}
                  onLockChange={setDeleteLocked}
                  onDeleted={() => setEditing(null)}
                />
              )}
              <div className="job-editor-actions">
                <Button
                  className="job-secondary-button"
                  type="button"
                  disabled={!canEdit || saveMutation.isPending || deleteLocked}
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="job-primary-button"
                  type="submit"
                  disabled={!canSave}
                >
                  {saveMutation.isPending ? "Saving" : "Save shift label"}
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
        <p className="settings-state">Loading shift labels...</p>
      ) : null}
      {query.error ? (
        <p className="settings-state error" role="alert">
          {errorText(query.error)}
        </p>
      ) : null}
      {!query.isLoading && !query.error && (
        <ShiftCatalogList
          items={items}
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
