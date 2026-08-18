import {
  shiftTypeInputSchema,
  type ShiftType,
  type ShiftTypeInput,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Clock3,
  Pencil,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { errorText, SettingsHeader } from "./GeneralSettingsPage";
import {
  listShiftTypes,
  reorderShiftTypes,
  saveShiftType,
  setShiftTypeArchived,
} from "./organization-data";

const defaultDraft: ShiftTypeInput = {
  name: "",
  color: "#5B7FA3",
  default_start_time: "09:00",
  default_end_time: "17:00",
};

export default function ShiftTypesSettingsPage() {
  const { context } = useAuth();
  const queryClient = useQueryClient();
  const workspaceId = context?.workspace.id ?? "";
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
  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const saveMutation = useMutation({
    mutationFn: ({ values, id }: { values: ShiftTypeInput; id?: string }) =>
      saveShiftType(workspaceId, values, id),
    onSuccess: async () => {
      await refresh();
      setEditing(null);
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
    setEditing(item ?? "new");
    setDraft(item ? shiftTypeInputSchema.parse(item) : defaultDraft);
    setFormError(null);
  };
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const parsed = shiftTypeInputSchema.safeParse(draft);
    if (!parsed.success) {
      setFormError(
        parsed.error.issues[0]?.message ?? "Check the shift type fields",
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
  const visible = items.filter((item) => showArchived || !item.archived_at);
  const move = (id: string, offset: -1 | 1): void => {
    const index = active.findIndex((item) => item.id === id);
    const next = index + offset;
    if (index < 0 || next < 0 || next >= active.length) return;
    const ids = active.map((item) => item.id);
    [ids[index], ids[next]] = [ids[next]!, ids[index]!];
    reorderMutation.mutate(ids);
  };

  return (
    <section
      className="settings-page"
      aria-labelledby="shift-types-settings-title"
    >
      <SettingsHeader
        icon={<Clock3 size={21} aria-hidden />}
        title="Shift types"
        description="Reusable service periods with default times and schedule colors."
        action={
          <Button type="button" onClick={() => openEditor()}>
            <Plus size={16} aria-hidden />
            Add shift type
          </Button>
        }
      />
      <label className="archive-filter">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(event) => setShowArchived(event.target.checked)}
        />
        Show archived
      </label>
      {editing ? (
        <form
          className="entity-editor"
          onSubmit={submit}
          aria-label={
            editing === "new" ? "Add shift type" : `Edit ${editing.name}`
          }
        >
          <div className="entity-editor-heading">
            <div>
              <strong>
                {editing === "new" ? "New shift type" : "Edit shift type"}
              </strong>
              <span>Default times may cross midnight.</span>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Close shift type editor"
              title="Close"
              onClick={() => setEditing(null)}
            >
              <X size={17} aria-hidden />
            </button>
          </div>
          <div className="shift-type-fields">
            <label className="form-field">
              <span>Name</span>
              <input
                value={draft.name}
                maxLength={60}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                required
              />
            </label>
            <label className="form-field color-field">
              <span>Color</span>
              <input
                type="color"
                value={draft.color}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    color: event.target.value,
                  }))
                }
              />
            </label>
            <label className="form-field">
              <span>Starts</span>
              <input
                type="time"
                value={draft.default_start_time ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    default_start_time: event.target.value || null,
                  }))
                }
                required
              />
            </label>
            <label className="form-field">
              <span>Ends</span>
              <input
                type="time"
                value={draft.default_end_time ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    default_end_time: event.target.value || null,
                  }))
                }
                required
              />
            </label>
          </div>
          {formError ? (
            <p className="form-error" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="entity-editor-actions">
            <Button
              className="secondary-button"
              type="button"
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving" : "Save shift type"}
            </Button>
          </div>
        </form>
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
      {!query.isLoading && !query.error && visible.length === 0 ? (
        <div className="settings-empty">
          <Clock3 size={22} aria-hidden />
          <strong>
            {showArchived ? "No archived shift types" : "No shift types yet"}
          </strong>
          <p>Add the service periods used when building schedules.</p>
        </div>
      ) : null}
      {visible.length > 0 ? (
        <div className="entity-list" aria-label="Shift types">
          {visible.map((item) => (
            <div
              className="entity-row"
              key={item.id}
              data-archived={Boolean(item.archived_at)}
            >
              <span
                className="entity-marker"
                style={{ backgroundColor: item.color }}
                aria-hidden
              />
              <div className="entity-summary">
                <strong>{item.name}</strong>
                <span>
                  {formatTime(item.default_start_time)} -{" "}
                  {formatTime(item.default_end_time)}
                  {item.crosses_midnight ? " · Next day" : ""}
                </span>
              </div>
              {item.archived_at ? (
                <span className="status-label">Archived</span>
              ) : null}
              <div className="row-actions">
                {!item.archived_at ? (
                  <>
                    <button
                      type="button"
                      className="icon-button"
                      disabled={
                        active[0]?.id === item.id || reorderMutation.isPending
                      }
                      aria-label={`Move ${item.name} up`}
                      title="Move up"
                      onClick={() => move(item.id, -1)}
                    >
                      <ArrowUp size={16} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      disabled={
                        active.at(-1)?.id === item.id ||
                        reorderMutation.isPending
                      }
                      aria-label={`Move ${item.name} down`}
                      title="Move down"
                      onClick={() => move(item.id, 1)}
                    >
                      <ArrowDown size={16} aria-hidden />
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Edit ${item.name}`}
                  title="Edit"
                  onClick={() => openEditor(item)}
                >
                  <Pencil size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`${item.archived_at ? "Restore" : "Archive"} ${item.name}`}
                  title={item.archived_at ? "Restore" : "Archive"}
                  onClick={() =>
                    archiveMutation.mutate({
                      id: item.id,
                      archived: !item.archived_at,
                    })
                  }
                >
                  {item.archived_at ? (
                    <RotateCcw size={16} aria-hidden />
                  ) : (
                    <Archive size={16} aria-hidden />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function formatTime(value: string | null): string {
  if (!value) return "No default";
  const [hour, minute] = value.split(":").map(Number);
  const suffix = (hour ?? 0) >= 12 ? "PM" : "AM";
  const displayHour = (hour ?? 0) % 12 || 12;
  return `${displayHour}:${String(minute ?? 0).padStart(2, "0")} ${suffix}`;
}
