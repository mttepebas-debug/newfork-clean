import {
  workspaceRoleInputSchema,
  type Permission,
  type WorkspaceRoleInput,
  type WorkspaceRoleRecord,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  LockKeyhole,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { errorText, SettingsHeader } from "./GeneralSettingsPage";
import {
  deleteWorkspaceRole,
  loadRoleWorkspace,
  saveWorkspaceRole,
} from "./roles-data";

const emptyRole: WorkspaceRoleInput = {
  name: "",
  description: "",
  access_class: "manager",
  permission_keys: ["workspace.read", "schedule.read"],
};

export default function RolesSettingsPage() {
  const { context } = useAuth();
  const { roleId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspaceId = context?.workspace.id ?? "";
  const queryKey = ["roles", workspaceId];
  const query = useQuery({
    queryKey,
    queryFn: () => loadRoleWorkspace(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const roles = query.data?.roles ?? [];
  const selected =
    roleId && roleId !== "new"
      ? (roles.find((role) => role.id === roleId) ?? null)
      : null;
  const creating = roleId === "new";
  const canManage = context?.permissions.includes("roles.manage") ?? false;

  return (
    <section
      className="settings-page roles-page"
      aria-labelledby="roles-settings-title"
    >
      <SettingsHeader
        icon={<ShieldCheck size={21} aria-hidden />}
        title="Roles & permissions"
        description="Control workspace access with protected built-in roles and bounded custom roles."
        action={
          canManage ? (
            <Button
              type="button"
              onClick={() => navigate("/app/settings/roles/new")}
            >
              <Plus size={16} aria-hidden />
              New role
            </Button>
          ) : undefined
        }
      />
      {query.isLoading ? (
        <p className="settings-state">Loading roles...</p>
      ) : null}
      {query.error ? (
        <p className="settings-state error" role="alert">
          {errorText(query.error)}
        </p>
      ) : null}
      {query.data ? (
        <div className="roles-workspace">
          <RoleDirectory
            roles={roles}
            selectedId={creating ? "new" : selected?.id}
            onSelect={(id) => navigate(`/app/settings/roles/${id}`)}
          />
          {creating || selected ? (
            <RoleEditor
              key={selected?.id ?? "new"}
              role={selected}
              creating={creating}
              canManage={canManage}
              permissions={query.data.permissions}
              workspaceId={workspaceId}
              onClose={() => navigate("/app/settings/roles")}
              onChanged={async (nextId) => {
                await queryClient.invalidateQueries({ queryKey });
                navigate(
                  nextId
                    ? `/app/settings/roles/${nextId}`
                    : "/app/settings/roles",
                );
              }}
            />
          ) : (
            <div className="role-placeholder">
              <ShieldCheck size={25} aria-hidden />
              <strong>Select a role</strong>
              <p>
                Review access or create a custom role for an operational
                responsibility.
              </p>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

function RoleDirectory({
  roles,
  selectedId,
  onSelect,
}: {
  readonly roles: WorkspaceRoleRecord[];
  readonly selectedId?: string;
  readonly onSelect: (id: string) => void;
}) {
  return (
    <nav className="role-directory" aria-label="Workspace roles">
      {roles.map((role) => (
        <button
          type="button"
          key={role.id}
          className={selectedId === role.id ? "active" : undefined}
          onClick={() => onSelect(role.id)}
        >
          <span className="role-directory-icon" aria-hidden>
            {role.system_key ? (
              <LockKeyhole size={16} />
            ) : (
              <ShieldCheck size={16} />
            )}
          </span>
          <span>
            <strong>{role.name}</strong>
            <small>{role.system_key ? "Built-in" : "Custom"}</small>
          </span>
          <span
            className="role-member-count"
            title={`${role.member_count} active members`}
          >
            <Users size={14} aria-hidden />
            {role.member_count}
          </span>
        </button>
      ))}
    </nav>
  );
}

function RoleEditor({
  role,
  creating,
  canManage,
  permissions,
  workspaceId,
  onClose,
  onChanged,
}: {
  readonly role: WorkspaceRoleRecord | null;
  readonly creating: boolean;
  readonly canManage: boolean;
  readonly permissions: Awaited<
    ReturnType<typeof loadRoleWorkspace>
  >["permissions"];
  readonly workspaceId: string;
  readonly onClose: () => void;
  readonly onChanged: (nextId?: string) => Promise<void>;
}) {
  const editable = canManage && (creating || role?.system_key === null);
  const [draft, setDraft] = useState<WorkspaceRoleInput>(() =>
    role
      ? {
          name: role.name,
          description: role.description,
          access_class:
            role.access_class === "employee" ? "employee" : "manager",
          permission_keys: role.permission_keys,
        }
      : emptyRole,
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);

  useEffect(() => setDeleteArmed(false), [role?.id]);

  const saveMutation = useMutation({
    mutationFn: () => saveWorkspaceRole(workspaceId, draft, role?.id),
    onSuccess: (id) => onChanged(id),
    onError: (error) => setFormError(errorText(error)),
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteWorkspaceRole(workspaceId, role!.id),
    onSuccess: () => onChanged(),
    onError: (error) => {
      setDeleteArmed(false);
      setFormError(errorText(error));
    },
  });
  const groups = useMemo(() => {
    const result = new Map<string, typeof permissions>();
    for (const permission of permissions) {
      const group = result.get(permission.category) ?? [];
      result.set(permission.category, [...group, permission]);
    }
    return [...result.entries()];
  }, [permissions]);

  const togglePermission = (permission: Permission, checked: boolean): void => {
    setDraft((current) => {
      const next = new Set(current.permission_keys);
      if (checked) next.add(permission);
      else next.delete(permission);
      if (permission === "schedule.manage" && checked)
        next.add("schedule.read");
      if (permission === "schedule.read" && !checked)
        next.delete("schedule.manage");
      return { ...current, permission_keys: [...next] };
    });
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setFormError(null);
    const parsed = workspaceRoleInputSchema.safeParse(draft);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Check the role fields");
      return;
    }
    saveMutation.mutate();
  };

  return (
    <form className="role-editor" onSubmit={submit}>
      <div className="role-editor-toolbar">
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Back to role directory"
          title="Back"
        >
          <ArrowLeft size={17} aria-hidden />
        </button>
        <div>
          <strong>{creating ? "New custom role" : role?.name}</strong>
          <span>
            {role?.system_key
              ? "Built-in role · Read only"
              : "Workspace custom role"}
          </span>
        </div>
      </div>

      <div className="role-fields">
        <label className="form-field">
          <span>Name</span>
          <input
            value={draft.name}
            maxLength={64}
            required
            disabled={!editable}
            onChange={(event) =>
              setDraft((current) => ({ ...current, name: event.target.value }))
            }
          />
        </label>
        <label className="form-field">
          <span>Access class</span>
          {role?.system_key ? (
            <input
              value={`${role.access_class[0]?.toUpperCase()}${role.access_class.slice(1)} workspace`}
              disabled
              readOnly
            />
          ) : (
            <select
              value={draft.access_class}
              disabled={!editable}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  access_class:
                    event.target.value === "employee" ? "employee" : "manager",
                }))
              }
            >
              <option value="manager">Manager workspace</option>
              <option value="employee">Employee Hub</option>
            </select>
          )}
        </label>
        <label className="form-field role-description-field">
          <span>Description</span>
          <textarea
            value={draft.description}
            maxLength={240}
            rows={3}
            disabled={!editable}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
        </label>
      </div>

      <div className="permission-section">
        <div className="permission-heading">
          <strong>Permissions</strong>
          <span>{draft.permission_keys.length} enabled</span>
        </div>
        {groups.map(([category, categoryPermissions]) => (
          <fieldset className="permission-group" key={category}>
            <legend>{category}</legend>
            {categoryPermissions.map((permission) => {
              const checked = draft.permission_keys.includes(permission.key);
              const protectedPermission = !permission.custom_grantable;
              const requiredPermission = permission.key === "workspace.read";
              return (
                <label key={permission.key} className="permission-row">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={
                      !editable || protectedPermission || requiredPermission
                    }
                    onChange={(event) =>
                      togglePermission(permission.key, event.target.checked)
                    }
                  />
                  <span>
                    <strong>{permission.label}</strong>
                    <small>{permission.description}</small>
                  </span>
                  {protectedPermission ? <em>Protected</em> : null}
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>

      {formError ? (
        <p className="form-error" role="alert">
          {formError}
        </p>
      ) : null}
      {editable ? (
        <div className="role-editor-actions">
          {!creating && role ? (
            deleteArmed ? (
              <div
                className="delete-confirmation"
                role="group"
                aria-label="Confirm role deletion"
              >
                <span>Delete this unused role?</span>
                <Button
                  type="button"
                  className="danger-button"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate()}
                >
                  <Trash2 size={16} aria-hidden />
                  Confirm delete
                </Button>
                <Button
                  type="button"
                  className="secondary-button"
                  onClick={() => setDeleteArmed(false)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                className="danger-text-button"
                onClick={() => setDeleteArmed(true)}
              >
                <Trash2 size={16} aria-hidden />
                Delete role
              </Button>
            )
          ) : (
            <span />
          )}
          <Button type="submit" disabled={saveMutation.isPending}>
            <Save size={16} aria-hidden />
            {saveMutation.isPending ? "Saving" : "Save role"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
