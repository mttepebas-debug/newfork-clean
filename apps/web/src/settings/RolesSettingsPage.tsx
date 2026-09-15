import {
  employeeEligiblePermissions,
  permissionGroupsForRole,
  personalRolePermissions,
  toggleRolePermissions,
  workspaceRoleInputSchema,
  type Permission,
  type WorkspaceRoleInput,
  type WorkspaceRoleRecord,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Info,
  LockKeyhole,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import {
  leaveAvailability,
  useAvailabilityNavigationGuard,
  type AvailabilityNavigationRef,
} from "../availability/availability-navigation";
import { errorText, SettingsHeader } from "./GeneralSettingsPage";
import {
  deleteWorkspaceRole,
  loadRoleWorkspace,
  saveWorkspaceRole,
} from "./roles-data";
import "./roles-settings.css";

const blankRole = (): WorkspaceRoleInput => ({
  name: "",
  description: "",
  access_class: "manager",
  permission_keys: [...personalRolePermissions],
});
const roleDraft = (role: WorkspaceRoleRecord): WorkspaceRoleInput => ({
  name: role.name,
  description: role.description,
  access_class: role.access_class === "owner" ? "admin" : role.access_class,
  permission_keys: [...role.permission_keys],
  expected_updated_at: role.updated_at,
});
const signature = (draft: WorkspaceRoleInput) =>
  JSON.stringify({
    ...draft,
    permission_keys: [...draft.permission_keys].sort(),
  });

export default function RolesSettingsPage() {
  const { context, refresh } = useAuth();
  const { roleId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const navigationRef: AvailabilityNavigationRef = useRef(null);
  const [copy, setCopy] = useState<WorkspaceRoleInput | null>(null);
  const workspaceId = context?.workspace.id ?? "";
  const queryKey = ["roles", workspaceId];
  const query = useQuery({
    queryKey,
    queryFn: () => loadRoleWorkspace(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const roles = query.data?.roles ?? [];
  const creating = roleId === "new";
  const selected = creating
    ? null
    : roleId
      ? roles.find((role) => role.id === roleId)
      : (roles.find((role) => role.system_key === "manager") ?? roles[0]);
  const canManage = Boolean(
    context?.permissions.includes("roles.manage") &&
    ["owner", "admin"].includes(context.membership.role),
  );
  const go = (id: string, initial: WorkspaceRoleInput | null = null) =>
    leaveAvailability(navigationRef, () => {
      setCopy(initial);
      navigate(`/app/settings/roles/${id}`);
    });
  return (
    <section
      className="settings-page roles-page bl051-roles"
      aria-labelledby="roles-settings-title"
    >
      <SettingsHeader
        titleId="roles-settings-title"
        icon={<ShieldCheck size={21} aria-hidden />}
        title="Roles & permissions"
        description="Choose what each role can view and change."
        action={
          canManage ? (
            <Button type="button" onClick={() => go("new")}>
              <Plus size={16} aria-hidden />
              New role
            </Button>
          ) : undefined
        }
      />
      <div className="rp-panel">
        {query.isLoading && <p className="settings-state">Loading roles...</p>}
        {query.error && (
          <p className="form-error" role="alert">
            {errorText(query.error)}
          </p>
        )}
        {query.data && (
          <div className="rp-split">
            <label className="rp-mobile-selector rp-field">
              Role
              <select
                aria-label="Role"
                value={creating ? "new" : (selected?.id ?? "")}
                onChange={(event) => go(event.target.value)}
              >
                {creating && <option value="new">New role</option>}
                {roles.map((role) => (
                  <option value={role.id} key={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            <nav className="rp-directory" aria-label="Workspace roles">
              {roles.map((role) => (
                <button
                  type="button"
                  key={role.id}
                  className={selected?.id === role.id ? "selected" : ""}
                  aria-current={selected?.id === role.id ? "true" : undefined}
                  onClick={() => go(role.id)}
                >
                  {role.system_key === "owner" ? (
                    <LockKeyhole size={16} aria-hidden />
                  ) : (
                    <ShieldCheck size={16} aria-hidden />
                  )}
                  <span>
                    {role.name}
                    <small>{role.system_key ? "Built-in" : "Custom"}</small>
                  </span>
                </button>
              ))}
            </nav>
            {creating || selected ? (
              <RoleEditor
                key={`${selected?.id ?? "new"}:${copy ? signature(copy) : ""}`}
                role={selected ?? null}
                initial={copy}
                creating={creating}
                canManage={canManage}
                roles={roles}
                workspaceId={workspaceId}
                navigationRef={navigationRef}
                onCopy={(draft) => go("new", draft)}
                onChanged={async (id) => {
                  await queryClient.invalidateQueries({ queryKey });
                  await refresh();
                  navigate(
                    id ? `/app/settings/roles/${id}` : "/app/settings/roles",
                  );
                }}
              />
            ) : (
              <p className="settings-state">
                Role not found. Select a role from the list.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function RoleEditor({
  role,
  initial,
  creating,
  canManage,
  roles,
  workspaceId,
  navigationRef,
  onCopy,
  onChanged,
}: {
  readonly role: WorkspaceRoleRecord | null;
  readonly initial: WorkspaceRoleInput | null;
  readonly creating: boolean;
  readonly canManage: boolean;
  readonly roles: WorkspaceRoleRecord[];
  readonly workspaceId: string;
  readonly navigationRef: AvailabilityNavigationRef;
  readonly onCopy: (draft: WorkspaceRoleInput) => void;
  readonly onChanged: (id?: string) => Promise<void>;
}) {
  const [baseline, setBaseline] = useState(() =>
    role ? roleDraft(role) : blankRole(),
  );
  const [draft, setDraft] = useState(() =>
    role ? roleDraft(role) : (initial ?? blankRole()),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(["Schedule", "Personal access"]),
  );
  const editable = canManage && (creating || role?.editable === true);
  const dirty = signature(draft) !== signature(baseline);
  const save = useMutation({
    mutationFn: () => saveWorkspaceRole(workspaceId, draft, role?.id),
    onSuccess: async (id) => {
      setBaseline(draft);
      setSaved(true);
      await onChanged(id);
    },
    onError: (err) => setError(errorText(err)),
  });
  const remove = useMutation({
    mutationFn: () => deleteWorkspaceRole(workspaceId, role!.id),
    onSuccess: () => onChanged(),
    onError: (err) => {
      setError(errorText(err));
      setDeleteArmed(false);
    },
  });
  const busy = save.isPending || remove.isPending;
  useEffect(() => {
    if (role && !dirty && !busy) {
      const next = roleDraft(role);
      setBaseline(next);
      setDraft(next);
    }
  }, [role, dirty, busy]);
  const dialog = useAvailabilityNavigationGuard({
    dirty: editable && dirty,
    busy,
    navigationRef,
    onDiscard: () => {
      setDraft(baseline);
      setError(null);
    },
    labels: {
      saving: "Saving role",
      discard: "Discard role changes?",
      saved: "Role saved",
      unsaved:
        "Your unsaved permission changes will be lost. The saved role stays in place.",
    },
  });
  const toggle = (keys: readonly Permission[], checked: boolean) => {
    setSaved(false);
    setDraft((current) => ({
      ...current,
      permission_keys: toggleRolePermissions(
        current.permission_keys,
        keys,
        checked,
      ),
    }));
  };
  const groups = permissionGroupsForRole(
    role?.access_class ?? draft.access_class,
  );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!editable || !dirty || busy) return;
    setError(null);
    const parsed = workspaceRoleInputSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the role fields");
      return;
    }
    save.mutate();
  };
  const copyRole = (source: WorkspaceRoleRecord): WorkspaceRoleInput => ({
    ...roleDraft(source),
    name: `${source.name} copy`.slice(0, 64),
    expected_updated_at: undefined,
  });
  return (
    <form className="rp-editor" onSubmit={submit}>
      {creating && (
        <label className="rp-field">
          Starting point
          <select
            disabled={busy}
            defaultValue=""
            onChange={(event) => {
              const source = roles.find(
                (candidate) => candidate.id === event.target.value,
              );
              setDraft(source ? copyRole(source) : blankRole());
            }}
          >
            <option value="">Blank — basic personal access</option>
            {roles
              .filter((candidate) =>
                ["manager", "employee"].includes(candidate.access_class),
              )
              .map((candidate) => (
                <option value={candidate.id} key={candidate.id}>
                  Copy {candidate.name}
                </option>
              ))}
          </select>
          <small>
            Copies are independent. Later changes to the source role do not
            affect this role.
          </small>
        </label>
      )}
      {(creating || role?.system_key === null) && (
        <div className="rp-fields">
          <label className="rp-field">
            Name
            <input
              value={draft.name}
              required
              maxLength={64}
              disabled={!editable || busy}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </label>
          <label className="rp-field">
            Experience
            <select
              value={draft.access_class}
              disabled={!creating || busy}
              onChange={(event) => {
                const access =
                  event.target.value === "employee" ? "employee" : "manager";
                setDraft((current) => ({
                  ...current,
                  access_class: access,
                  permission_keys:
                    access === "employee"
                      ? current.permission_keys.filter((key) =>
                          employeeEligiblePermissions.includes(key),
                        )
                      : current.permission_keys,
                }));
              }}
            >
              <option value="manager">Manager workspace</option>
              <option value="employee">Employee experience</option>
            </select>
          </label>
          <label className="rp-field rp-description">
            Description
            <input
              value={draft.description}
              maxLength={240}
              disabled={!editable || busy}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </label>
        </div>
      )}
      <div className="rp-permission-head">
        <span>Permissions</span>
        <span>Read</span>
        <span>Edit</span>
      </div>
      {groups.map((group) => {
        const read = [...new Set(group.areas.flatMap((area) => area.read))];
        const edit = [...new Set(group.areas.flatMap((area) => area.edit))];
        const all = [...read, ...edit];
        const enabled = all.filter((key) =>
          draft.permission_keys.includes(key),
        ).length;
        const summary =
          enabled === 0
            ? "Off"
            : enabled === all.length
              ? edit.length
                ? "Full edit"
                : "Read only"
              : !edit.some((key) => draft.permission_keys.includes(key)) &&
                  read.every((key) => draft.permission_keys.includes(key))
                ? "Read only"
                : "Custom";
        return (
          <div className="rp-category" key={group.label}>
            <div className="rp-category-head">
              <button
                type="button"
                className="rp-category-toggle"
                aria-expanded={open.has(group.label)}
                onClick={() =>
                  setOpen((current) => {
                    const next = new Set(current);
                    next.has(group.label)
                      ? next.delete(group.label)
                      : next.add(group.label);
                    return next;
                  })
                }
              >
                {open.has(group.label) ? (
                  <ChevronDown size={14} aria-hidden />
                ) : (
                  <ChevronRight size={14} aria-hidden />
                )}
                <span>{group.label}</span>
                <small>{summary}</small>
              </button>
              <PermissionCheck
                label={`${group.label} category Read`}
                keys={read}
                grants={draft.permission_keys}
                disabled={!editable || busy}
                onChange={(checked) => toggle(read, checked)}
              />
              <PermissionCheck
                label={`${group.label} category Edit`}
                keys={edit}
                grants={draft.permission_keys}
                disabled={!editable || busy}
                onChange={(checked) => toggle(edit, checked)}
              />
            </div>
            {open.has(group.label) &&
              group.areas.map((area) => (
                <div className="rp-permission-row" key={area.id}>
                  <span className="rp-permission-label">
                    {area.label}
                    <span
                      className="rp-info"
                      tabIndex={0}
                      role="img"
                      aria-label={area.description}
                      title={area.description}
                    >
                      <Info size={13} aria-hidden />
                    </span>
                  </span>
                  <PermissionCheck
                    label={`${area.label} Read`}
                    keys={area.read}
                    grants={draft.permission_keys}
                    disabled={!editable || busy}
                    onChange={(checked) => toggle(area.read, checked)}
                  />
                  <PermissionCheck
                    label={`${area.label} Edit`}
                    keys={area.edit}
                    grants={draft.permission_keys}
                    disabled={!editable || busy}
                    onChange={(checked) => toggle(area.edit, checked)}
                  />
                </div>
              ))}
          </div>
        );
      })}
      {!editable && (
        <p className="rp-locked">
          <LockKeyhole size={15} aria-hidden />
          {role?.system_key === "owner"
            ? "Owner is protected and always has full access."
            : "You can view this role. Only an authorized higher role can change it."}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {saved && !dirty && (
        <p className="form-success" role="status">
          Role saved.
        </p>
      )}
      {editable && (
        <>
          <div className="rp-footer">
            {!creating &&
              role &&
              ["manager", "employee"].includes(role.access_class) && (
                <Button
                  type="button"
                  className="secondary-button"
                  onClick={() => onCopy(copyRole(role))}
                >
                  <Copy size={15} aria-hidden />
                  Copy role
                </Button>
              )}
            {role?.system_key === null && (
              <Button
                type="button"
                className="danger-text-button"
                disabled={busy}
                onClick={() => setDeleteArmed(!deleteArmed)}
              >
                <Trash2 size={15} aria-hidden />
                Delete role
              </Button>
            )}
            <div className="rp-footer-actions">
              <Button
                type="button"
                className="secondary-button"
                disabled={!dirty || busy}
                onClick={() => {
                  setDraft(baseline);
                  setError(null);
                  setSaved(false);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!dirty || busy}>
                {save.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
          {deleteArmed && (
            <div className="rp-delete" role="group" aria-label="Delete role">
              {role?.deletable ? (
                <>
                  <p>Delete this unused role?</p>
                  <Button
                    type="button"
                    className="danger-button"
                    disabled={busy}
                    onClick={() => remove.mutate()}
                  >
                    Confirm delete
                  </Button>
                </>
              ) : (
                <p>
                  This role has {role?.blocking_member_count ?? 0} member
                  references and {role?.blocking_invite_count ?? 0} invitation
                  references. Resolve these dependencies before deleting. No
                  members will be reassigned automatically.
                </p>
              )}
              <Button
                type="button"
                className="secondary-button"
                onClick={() => setDeleteArmed(false)}
              >
                Keep role
              </Button>
            </div>
          )}
        </>
      )}
      {dialog}
    </form>
  );
}

function PermissionCheck({
  label,
  keys,
  grants,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly keys: readonly Permission[];
  readonly grants: readonly Permission[];
  readonly disabled: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const selected = keys.filter((key) => grants.includes(key)).length;
  const mixed = selected > 0 && selected < keys.length;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <span className="rp-check-cell">
      {keys.length ? (
        <input
          ref={ref}
          type="checkbox"
          aria-label={label}
          aria-checked={mixed ? "mixed" : selected === keys.length}
          checked={selected === keys.length}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
      ) : (
        <span aria-hidden>—</span>
      )}
    </span>
  );
}
