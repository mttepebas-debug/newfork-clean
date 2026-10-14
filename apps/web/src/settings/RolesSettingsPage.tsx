import {
  employeeEligiblePermissions,
  permissionGroupsForRole,
  personalRolePermissions,
  toggleRolePermissions,
  workspaceRoleInputSchema,
  type Permission,
  type PermissionDefinition,
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
import { RequestError } from "../lib/request-error";
import { errorText, SettingsHeader } from "./GeneralSettingsPage";
import {
  deleteWorkspaceRole,
  loadRoleWorkspace,
  saveWorkspaceRole,
} from "./roles-data";
import "./roles-settings.css";

import { isNoAccess } from "../lib/no-access";
import { NoAccessState } from "../shell/NoAccessState";
import { ListOutline, LoadError, RefreshError } from "../shell/LoadState";
import { noAccessHomePath } from "../auth/resolveLanding";
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
const refusedWith = (error: unknown, reason: string) =>
  error instanceof RequestError && error.reason === reason;
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
  const navigableRoles = roles.filter((role) => role.system_key !== "owner");
  const builtInRoles = navigableRoles.filter((role) => role.system_key !== null);
  const customRoles = navigableRoles.filter((role) => role.system_key === null);
  const groupedCustomRoles = customRoles.length > 3;
  const creating = roleId === "new";
  const selected = creating
    ? null
    : roleId
      ? roles.find((role) => role.id === roleId)
      : (roles.find((role) => role.system_key === "manager") ?? roles[0]);
  const selectedGroupedCustom = Boolean(
    groupedCustomRoles && selected?.system_key === null,
  );
  const canManage = Boolean(
    context?.permissions.includes("roles.manage") &&
    ["owner", "admin"].includes(context.membership.role),
  );
  const [customMenuOpen, setCustomMenuOpen] = useState(false);
  const go = (id: string, initial: WorkspaceRoleInput | null = null) =>
    leaveAvailability(navigationRef, () => {
      setCustomMenuOpen(false);
      setCopy(initial);
      navigate(`/app/settings/roles/${id}`);
    });
  // The API's "no" gets the one no-access card, never its raw sentence.
  if (isNoAccess(query.error))
    return (
      <NoAccessState
        subject="roles"
        homeHref={noAccessHomePath(context, "/app/settings/roles")}
      />
    );
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
      {query.isLoading && <ListOutline label="Loading roles" rows={5} columns={3} />}
      {query.error && !query.data && (
        <LoadError
          title="We couldn't load roles"
          detail="Roles didn't load. Nothing was changed."
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.error && query.data && (
        <RefreshError
          message="Roles didn't refresh. This is the last list that loaded."
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.data && (
        <>
          <label className="rp-mobile-selector rp-field">
            Role
            <select
              aria-label="Role"
              value={
                creating
                  ? "new"
                  : selected?.system_key === "owner"
                    ? ""
                    : (selected?.id ?? "")
              }
              onChange={(event) => go(event.target.value)}
            >
              {selected?.system_key === "owner" && (
                <option value="" hidden>
                  Protected role
                </option>
              )}
              {creating && <option value="new">New role</option>}
              {navigableRoles.map((role) => (
                <option value={role.id} key={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
          <div
            className="rp-directory requests-tabs"
            role="tablist"
            aria-label="Workspace roles"
          >
            {creating && (
              <button
                type="button"
                role="tab"
                className="active"
                aria-selected="true"
                onClick={() => go("new")}
              >
                New role
              </button>
            )}
            {(groupedCustomRoles ? builtInRoles : navigableRoles).map((role) => {
              const active = selected?.id === role.id;
              return (
                <button
                  type="button"
                  role="tab"
                  key={role.id}
                  className={active ? "active" : ""}
                  aria-selected={active}
                  aria-label={`${role.name} ${
                    role.system_key ? "Built-in" : "Custom"
                  }`}
                  onClick={() => go(role.id)}
                >
                  {role.name}
                </button>
              );
            })}
            {groupedCustomRoles && (
              <div className="rp-custom-group">
                <button
                  type="button"
                  role="tab"
                  className={selectedGroupedCustom ? "active" : ""}
                  aria-selected={selectedGroupedCustom}
                  aria-haspopup="listbox"
                  aria-expanded={customMenuOpen}
                  aria-controls="roles-custom-menu"
                  onClick={() => setCustomMenuOpen((open) => !open)}
                >
                  Custom roles +{customRoles.length}
                </button>
                {customMenuOpen && (
                  <div
                    className="rp-custom-menu"
                    id="roles-custom-menu"
                    role="listbox"
                    aria-label="Custom roles"
                  >
                    {customRoles.map((role) => (
                      <button
                        type="button"
                        key={role.id}
                        role="option"
                        aria-selected={selected?.id === role.id}
                        className={selected?.id === role.id ? "selected" : ""}
                        onClick={() => go(role.id)}
                      >
                        {role.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="rp-panel">
            {creating || selected ? (
              <RoleEditor
                key={`${selected?.id ?? "new"}:${copy ? signature(copy) : ""}`}
                role={selected ?? null}
                initial={copy}
                creating={creating}
                canManage={canManage}
                roles={roles}
                permissions={query.data?.permissions ?? []}
                workspaceId={workspaceId}
                navigationRef={navigationRef}
                onCopy={(draft) => go("new", draft)}
                onReload={() => queryClient.invalidateQueries({ queryKey })}
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
        </>
      )}
    </section>
  );
}

function RoleEditor({
  role,
  initial,
  creating,
  canManage,
  roles,
  permissions,
  workspaceId,
  navigationRef,
  onCopy,
  onReload,
  onChanged,
}: {
  readonly role: WorkspaceRoleRecord | null;
  readonly initial: WorkspaceRoleInput | null;
  readonly creating: boolean;
  readonly canManage: boolean;
  readonly roles: WorkspaceRoleRecord[];
  readonly permissions: readonly PermissionDefinition[];
  readonly workspaceId: string;
  readonly navigationRef: AvailabilityNavigationRef;
  readonly onCopy: (draft: WorkspaceRoleInput) => void;
  readonly onReload: () => Promise<void>;
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
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const editable = canManage && (creating || role?.editable === true);
  const dirty = signature(draft) !== signature(baseline);
  const save = useMutation({
    mutationFn: () => saveWorkspaceRole(workspaceId, draft, role?.id),
    onSuccess: async (id) => {
      setBaseline(draft);
      setSaved(true);
      await onChanged(id);
    },
    onError: (err) => {
      // BL-1049: somebody saved this role after it was opened; the database
      // says so with its key. Drop the edit and load the saved role (the
      // effect below takes it once the list is back), then say so.
      if (refusedWith(err, "role.changed")) {
        setDraft(baseline);
        setError(
          "This role changed since you opened it. The saved version is shown; make your change again.",
        );
        void onReload();
        return;
      }
      setError(errorText(err));
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteWorkspaceRole(workspaceId, role!.id),
    onSuccess: () => onChanged(),
    onError: (err) => {
      setError(errorText(err));
      setDeleteArmed(false);
      // BL-1049: a member or an invitation took the role meanwhile; reload so
      // the delete button knows and names the references.
      if (refusedWith(err, "role.in_use")) void onReload();
    },
  });
  const busy = save.isPending || remove.isPending;
  const deleteBlocked =
    Boolean(role) &&
    role?.system_key === null &&
    role.deletable === false;
  const deleteHint = deleteArmed
    ? deleteBlocked
      ? `This role has ${role?.blocking_member_count ?? 0} member references and ${
          role?.blocking_invite_count ?? 0
        } invitation references. Resolve them before deleting.`
      : null
    : null;
  useEffect(() => {
    if (role && !dirty && !busy) {
      const next = roleDraft(role);
      setBaseline(next);
      setDraft(next);
    }
  }, [role, dirty, busy]);
  useEffect(() => {
    setDeleteArmed(false);
  }, [role?.id, creating]);
  useEffect(() => {
    if (!deleteArmed || busy) return undefined;
    const timeout = window.setTimeout(() => setDeleteArmed(false), 3200);
    return () => window.clearTimeout(timeout);
  }, [deleteArmed, busy]);
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
    setDeleteArmed(false);
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
    permissions,
  );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!editable || !dirty || busy) return;
    setError(null);
    setDeleteArmed(false);
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
                    if (next.has(group.label)) next.delete(group.label);
                    else next.add(group.label);
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
              <span className="rp-delete-action">
                <Button
                  type="button"
                  className={`danger-text-button rp-delete-button${
                    deleteArmed ? " is-armed" : ""
                  }${deleteBlocked && deleteArmed ? " is-blocked" : ""}`}
                  aria-describedby={deleteHint ? "rp-delete-hint" : undefined}
                  disabled={busy}
                  onClick={() => {
                    setError(null);
                    if (!deleteArmed) {
                      setDeleteArmed(true);
                      return;
                    }
                    if (role?.deletable) {
                      remove.mutate();
                    }
                  }}
                >
                  <Trash2 size={15} aria-hidden />
                  {remove.isPending
                    ? "Deleting..."
                    : deleteArmed
                      ? deleteBlocked
                        ? "Role has dependencies"
                        : "Confirm delete"
                      : "Delete role"}
                </Button>
                {deleteHint ? (
                  <span className="rp-delete-hint" id="rp-delete-hint">
                    {deleteHint}
                  </span>
                ) : null}
              </span>
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
                  setDeleteArmed(false);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!dirty || busy}>
                {save.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
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
