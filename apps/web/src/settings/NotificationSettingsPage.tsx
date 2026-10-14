import { Button, ConfirmButton } from "@newfork/ui";
import {
  displayForNotificationCategory,
  displayForNotificationType,
  notificationChannelDisplay,
  notificationSeverityDisplay,
  type NotificationChannel,
  type NotificationOrgPolicyInput,
  type NotificationPolicyView,
  type NotificationSettingsResponse,
} from "@newfork/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, RotateCcw, Search, Send, ShieldCheck } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { RequestError } from "../lib/request-error";
import { SettingsHeader, errorText } from "./GeneralSettingsPage";
import {
  getNotificationSettings,
  previewNotificationPolicy,
  resetNotificationPolicies,
  saveNotificationPolicy,
} from "./notification-settings-data";
import "./notification-settings.css";

import { isNoAccess } from "../lib/no-access";
import { NoAccessState } from "../shell/NoAccessState";
import { ListOutline, LoadError, RefreshError } from "../shell/LoadState";
import { noAccessHomePath } from "../auth/resolveLanding";
const channels = ["in_app", "email", "push"] as const;
type CatalogEntry = NotificationSettingsResponse["catalog"][number];
type Draft = Pick<
  NotificationOrgPolicyInput,
  "enabled" | "allowed_channels" | "cadence" | "reason"
>;

export default function NotificationSettingsPage() {
  const { context } = useAuth();
  const queryClient = useQueryClient();
  const workspaceId = context?.workspace.id ?? "";
  const queryKey = ["notification-settings", workspaceId] as const;
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const [category, setCategory] = useState("all");
  const [scopeValue, setScopeValue] = useState("global");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [resetReason, setResetReason] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const settings = useQuery({
    queryKey,
    queryFn: () => getNotificationSettings(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const data = settings.data;
  const canWrite = Boolean(
    data?.can_write &&
      context?.permissions.includes("notifications.settings.write"),
  );
  const canPreview = Boolean(
    context?.permissions.includes("notifications.test_send"),
  );

  const save = useMutation({
    mutationFn: (policy: NotificationOrgPolicyInput) =>
      saveNotificationPolicy(workspaceId, policy),
    onMutate: () => {
      setStatus("Saving notification policy…");
      setError(null);
    },
    onSuccess: (_result, policy) => {
      setDrafts((current) => {
        const next = { ...current };
        delete next[policy.type_key];
        return next;
      });
      setStatus("Notification policy saved.");
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (saveError, policy) => {
      setDrafts((current) => {
        const next = { ...current };
        delete next[policy.type_key];
        return next;
      });
      // BL-1049: the database says the policy moved on with its key; the
      // sentence is not read. The latest version is loaded to review.
      const changedElsewhere =
        saveError instanceof RequestError &&
        saveError.reason === "notification.policy_changed";
      setError(
        changedElsewhere
          ? "This policy changed elsewhere. Your optimistic edit was rolled back; review the latest version and try again."
          : `${errorText(saveError)}. Your optimistic edit was rolled back.`,
      );
      setStatus(null);
      if (changedElsewhere) void queryClient.invalidateQueries({ queryKey });
    },
  });

  const reset = useMutation({
    mutationFn: (target: Parameters<typeof resetNotificationPolicies>[1]["target"]) =>
      resetNotificationPolicies(workspaceId, {
        target,
        reason: resetReason,
      }),
    onMutate: () => {
      setError(null);
      setStatus("Resetting notification policies…");
    },
    onSuccess: (result) => {
      setDrafts({});
      setStatus(
        `${result.affected} notification ${result.affected === 1 ? "policy" : "policies"} reset.`,
      );
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (resetError) => {
      setError(errorText(resetError));
      setStatus(null);
    },
  });

  const preview = useMutation({
    mutationFn: (entry: CatalogEntry) =>
      previewNotificationPolicy(workspaceId, {
        type_key: entry.type_key,
        channel: entry.supported_channels[0] ?? "in_app",
        recipient_user_id: null,
      }),
    onMutate: () => {
      setError(null);
      setStatus("Evaluating safe preview…");
    },
    onSuccess: (result) => {
      setStatus(
        `Safe preview ${result.decision === "allow" ? "allowed" : "denied"}; no external message was sent.`,
      );
    },
    onError: (previewError) => {
      setError(errorText(previewError));
      setStatus(null);
    },
  });

  const catalog = useMemo(() => {
    // Policy drafts are keyed by type, so show only its latest catalog version.
    const unique = new Map<string, CatalogEntry>();
    for (const entry of data?.catalog ?? []) {
      const previous = unique.get(entry.type_key);
      if (!previous || entry.schema_version > previous.schema_version) {
        unique.set(entry.type_key, entry);
      }
    }
    return [...unique.values()];
  }, [data?.catalog]);
  const categories = useMemo(
    () =>
      [...new Set(catalog.map((entry) => entry.category))].sort(
        (left, right) => {
          const leftDisplay = displayForNotificationCategory(left);
          const rightDisplay = displayForNotificationCategory(right);
          if (leftDisplay.sortOrder !== rightDisplay.sortOrder)
            return leftDisplay.sortOrder - rightDisplay.sortOrder;
          return leftDisplay.label.localeCompare(rightDisplay.label);
        },
      ),
    [catalog],
  );
  const visibleEntries = useMemo(
    () =>
      catalog.filter((entry) => {
        const display = displayForNotificationType(entry.type_key);
        const categoryDisplay = displayForNotificationCategory(entry.category);
        const searchable = [
          display?.label,
          display?.description,
          display?.adminDescription,
          display?.audienceLabel,
          categoryDisplay.label,
          categoryDisplay.description,
          entry.type_key,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return (
          (category === "all" || entry.category === category) &&
          (!deferredSearch || searchable.includes(deferredSearch))
        );
      }),
    [category, catalog, deferredSearch],
  );

  // The API's "no" gets the one no-access card, never its raw sentence.
  if (isNoAccess(settings.error))
    return (
      <NoAccessState
        homeHref={noAccessHomePath(context, "/app/settings/notifications")}
      />
    );
  if (!context) return null;
  const header = (
    <SettingsHeader
      icon={<Bell size={21} aria-hidden />}
      title="Notifications"
      titleId="notifications-settings-title"
      description="Choose which workspace updates are sent, who receives them, and which delivery channels are allowed. Personal preferences can only narrow these rules."
    />
  );
  if (settings.isPending)
    return (
      <section
        className="settings-page notification-settings"
        aria-labelledby="notifications-settings-title"
      >
        {header}
        <ListOutline label="Loading notification settings" rows={6} columns={3} />
      </section>
    );
  if (settings.isError && !data)
    return (
      <section
        className="settings-page notification-settings"
        aria-labelledby="notifications-settings-title"
      >
        {header}
        <LoadError
          title="We couldn't load notification settings"
          detail="Notification settings didn't load. Nothing was changed."
          retrying={settings.isFetching}
          onRetry={() => void settings.refetch()}
        />
      </section>
    );
  if (!data) return null;

  const scope = parseScope(scopeValue, data);
  const policyFor = (entry: CatalogEntry): NotificationPolicyView =>
    scope.kind === "global"
      ? entry.policy
      : data.policies.find(
          (policy) =>
            policy.type_key === entry.type_key &&
            policy.scope.kind === scope.kind &&
            policy.scope.id === scope.id,
        ) ?? defaultPolicy(entry, scope.name, scope.kind, scope.id);
  const updateDraft = (entry: CatalogEntry, change: Partial<Draft>) => {
    const policy = policyFor(entry);
    setDrafts((current) => ({
      ...current,
      [entry.type_key]: {
        enabled: policy.enabled,
        allowed_channels: policy.allowed_channels,
        cadence: policy.cadence,
        reason: "",
        ...current[entry.type_key],
        ...change,
      },
    }));
    setStatus(null);
    setError(null);
  };

  return (
    <section className="settings-page notification-settings" aria-labelledby="notifications-settings-title">
      {header}
      {settings.isError ? (
        <RefreshError
          message="Notification settings didn't refresh. These are the last settings that loaded."
          retrying={settings.isFetching}
          onRetry={() => void settings.refetch()}
        />
      ) : null}

      {!canWrite ? (
        <div className="notification-readonly" role="note">
          <ShieldCheck size={18} aria-hidden />
          <div><strong>Read-only access</strong><span>You can inspect policy and audit history, but cannot change it.</span></div>
        </div>
      ) : null}

      <div className="notification-settings-toolbar">
        <label className="notification-search">
          <span>Search notification rules</span>
          <span className="notification-search-control">
            <Search size={16} aria-hidden />
            <input value={search} onChange={(event) => setSearch(event.target.value)} />
          </span>
        </label>
        <label>
          <span>Category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">All categories</option>
            {categories.map((value) => <option key={value} value={value}>{displayForNotificationCategory(value).label}</option>)}
          </select>
        </label>
        <label>
          <span>Policy scope</span>
          <select
            value={scopeValue}
            onChange={(event) => {
              setScopeValue(event.target.value);
              setDrafts({});
              setStatus(null);
              setError(null);
            }}
          >
            <option value="global">{WORKSPACE_SCOPE_LABEL}</option>
            <optgroup label="Roles">
              {data.roles.map((role) => <option key={role.id} value={`role:${role.id}`}>{role.name}</option>)}
            </optgroup>
            <optgroup label="Locations">
              {data.locations.map((location) => <option key={location.id} value={`location:${location.id}`}>{location.name}</option>)}
            </optgroup>
          </select>
        </label>
      </div>

      {canWrite ? (
        <div className="notification-reset-bar">
          <label>
            <span>Reset reason</span>
            <input
              value={resetReason}
              onChange={(event) => setResetReason(event.target.value)}
              placeholder="Required for audit history"
              maxLength={500}
            />
          </label>
          {/* A reset wipes saved policies: red, and the second click confirms. */}
          <ConfirmButton
            type="button"
            className="danger-button"
            disabled={category === "all" || resetReason.trim().length < 3 || reset.isPending}
            confirmLabel="Confirm reset category"
            onConfirm={() => reset.mutate({ kind: "category", value: category as CatalogEntry["category"] })}
          >
            <RotateCcw size={15} aria-hidden /> Reset current category
          </ConfirmButton>
          <ConfirmButton
            type="button"
            className="danger-button"
            disabled={resetReason.trim().length < 3 || reset.isPending}
            confirmLabel="Confirm reset all"
            onConfirm={() => reset.mutate({ kind: "all" })}
          >
            <RotateCcw size={15} aria-hidden /> Reset all policies
          </ConfirmButton>
        </div>
      ) : null}

      {error ? <p className="form-error notification-feedback" role="alert">{error}</p> : null}
      <p className="notification-feedback" role="status" aria-live="polite">{status ?? ""}</p>

      <div className="notification-policy-list" aria-label="Notification policy catalog">
        {visibleEntries.length === 0 ? (
          <p className="notification-settings-state">No notification types match these filters.</p>
        ) : visibleEntries.map((entry) => {
          const effective = policyFor(entry);
          const display = displayForNotificationType(entry.type_key);
          const categoryDisplay = displayForNotificationCategory(entry.category);
          const title = display?.label ?? humanLabel(entry.type_key);
          const description =
            display?.adminDescription ??
            display?.description ??
            "Controls whether this workspace update appears in notification inboxes.";
          const draft = drafts[entry.type_key] ?? {
            enabled: effective.enabled,
            allowed_channels: effective.allowed_channels,
            cadence: effective.cadence,
            reason: "",
          };
          return (
            <article className="notification-policy-card" key={entry.type_key}>
              <div className="notification-policy-heading">
                <div>
                  <h2>{title}</h2>
                  <p>{description}</p>
                  <div className="notification-tags">
                    <span>{categoryDisplay.label}</span>
                    <span>{notificationSeverityDisplay[entry.severity]}</span>
                    <span>{sensitivityLabel(entry.sensitivity)}</span>
                  </div>
                </div>
                <label className="notification-enabled">
                  <input
                    type="checkbox"
                    aria-label={`${title} enabled`}
                    checked={draft.enabled}
                    disabled={!canWrite || entry.mandatory_in_app}
                    onChange={(event) => updateDraft(entry, { enabled: event.target.checked })}
                  />
                  <span>{draft.enabled ? "Enabled" : "Disabled"}</span>
                </label>
              </div>
              <dl className="notification-policy-metadata">
                <div><dt>Policy source</dt><dd>{effective.source === "catalog_default" ? "Catalog default" : `${scopeLabel(effective.scope)} · v${effective.version}`}</dd></div>
                <div><dt>Audience</dt><dd>{display?.audienceLabel ?? "Workspace members selected by policy"}</dd></div>
                <div><dt>Requirement</dt><dd>{entry.mandatory_in_app ? "Always shown in app" : "Can be managed"}</dd></div>
              </dl>
              <fieldset disabled={!canWrite} className="notification-channel-fieldset">
                <legend>Allowed channels</legend>
                {channels.map((channel) => {
                  const supported = entry.supported_channels.includes(channel);
                  const checked = draft.allowed_channels.includes(channel);
                  return (
                    <label key={channel} title={supported ? undefined : "Not supported by this notification type"}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!canWrite || !supported || (checked && draft.allowed_channels.length === 1)}
                        onChange={(event) => updateDraft(entry, {
                          allowed_channels: event.target.checked
                            ? [...draft.allowed_channels, channel]
                            : draft.allowed_channels.filter((value) => value !== channel),
                        })}
                      />
                      {channelLabel(channel)}{!supported ? " (not available yet)" : ""}
                    </label>
                  );
                })}
              </fieldset>
              <div className="notification-policy-actions">
                <label>
                  <span>Cadence</span>
                  <select
                    value={draft.cadence}
                    disabled={!canWrite}
                    onChange={(event) => updateDraft(entry, { cadence: event.target.value as Draft["cadence"] })}
                  >
                    <option value="immediate">Immediate</option>
                    <option value="daily_digest">Daily digest</option>
                    <option value="weekly_digest">Weekly digest</option>
                  </select>
                </label>
                <label className="notification-reason">
                  <span>Reason for {title}</span>
                  <input
                    value={draft.reason}
                    disabled={!canWrite}
                    maxLength={500}
                    placeholder="Required for audit history"
                    onChange={(event) => updateDraft(entry, { reason: event.target.value })}
                  />
                </label>
                {canPreview ? (
                  <Button
                    type="button"
                    aria-label={`Run safe test for ${title}`}
                    disabled={preview.isPending}
                    onClick={() => preview.mutate(entry)}
                  ><Send size={15} aria-hidden /> Safe test</Button>
                ) : null}
                {canWrite ? (
                  <ConfirmButton
                    type="button"
                    className="danger-button"
                    aria-label={`Reset ${title}`}
                    confirmName={`Confirm reset ${title}`}
                    disabled={resetReason.trim().length < 3 || reset.isPending}
                    confirmLabel="Confirm reset"
                    onConfirm={() => reset.mutate({ kind: "type", value: entry.type_key })}
                  ><RotateCcw size={15} aria-hidden /> Reset</ConfirmButton>
                ) : null}
                {canWrite ? (
                  <Button
                    type="button"
                    aria-label={`Save ${title}`}
                    disabled={!drafts[entry.type_key] || draft.reason.trim().length < 3 || save.isPending}
                    onClick={() => save.mutate({
                      type_key: entry.type_key,
                      schema_version: entry.schema_version,
                      scope: scope.kind === "global" ? { kind: "global", id: null } : { kind: scope.kind, id: scope.id! },
                      expected_version: effective.version,
                      enabled: draft.enabled,
                      allowed_channels: draft.allowed_channels,
                      cadence: draft.cadence,
                      reason: draft.reason,
                    })}
                  >Save</Button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      <details className="notification-audit">
        <summary>Policy audit history ({data.audit.length})</summary>
        {data.audit.length === 0 ? <p>No policy changes recorded.</p> : (
          <ol>{data.audit.map((item) => <li key={item.id}><strong>{item.action}</strong><span>{item.reason ?? "No reason"}</span><time dateTime={item.occurred_at}>{new Date(item.occurred_at).toLocaleString()}</time></li>)}</ol>
        )}
      </details>
    </section>
  );
}

// The server still names the whole-workspace scope "Organization"; the screen says "workspace".
const WORKSPACE_SCOPE_LABEL = "Workspace";

function scopeLabel(scope: { kind: string; name: string }) {
  return scope.kind === "global" ? WORKSPACE_SCOPE_LABEL : scope.name;
}

function parseScope(value: string, data: NotificationSettingsResponse) {
  if (value === "global") return { kind: "global" as const, id: null, name: WORKSPACE_SCOPE_LABEL };
  const [kind, id] = value.split(":") as ["role" | "location", string];
  const items = kind === "role" ? data.roles : data.locations;
  return { kind, id, name: items.find((item) => item.id === id)?.name ?? "Unknown scope" };
}

function defaultPolicy(
  entry: CatalogEntry,
  name: string,
  kind: "role" | "location",
  id: string | null,
): NotificationPolicyView {
  return {
    id: null,
    scope: { kind, id, name },
    enabled: entry.policy.enabled,
    allowed_channels: entry.policy.allowed_channels,
    cadence: entry.policy.cadence,
    version: null,
    updated_by: null,
    updated_at: null,
    source: "catalog_default",
  };
}

function humanLabel(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}
function channelLabel(channel: NotificationChannel) {
  return notificationChannelDisplay[channel].label;
}
function sensitivityLabel(value: CatalogEntry["sensitivity"]) {
  if (value === "internal") return "Internal update";
  if (value === "confidential") return "Contains employee info";
  return "Sensitive time data";
}
