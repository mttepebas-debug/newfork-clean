import type {
  NotificationChannel, NotificationChannelPreference, NotificationUserPreference,
  NotificationUserPreferencesResponse,
} from "@newfork/shared";
import { displayForNotificationCategory, displayForNotificationType,
  humanizeIdentifier, labelForNotificationLockReason, notificationChannelDisplay } from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { AccountPageHeader } from "./components";
import { getNotificationPreferences, saveNotificationPreferences } from "./notification-preferences-data";
import "./notification-preferences.css";

import { noAccessHomePath } from "../auth/resolveLanding";
import { isNoAccess } from "../lib/no-access";
import { RequestError } from "../lib/request-error";
import { NoAccessState } from "../shell/NoAccessState";
type Entry = NotificationUserPreferencesResponse["catalog"][number];
type Drafts = Record<string, NotificationChannelPreference>;
const channels = ["in_app", "email"] as const;

function preferenceFor(entry: Entry, preferences: NotificationUserPreference[]) {
  return preferences.find(p => p.preference_scope === "type" && p.scope_key === entry.type_key)
    ?? preferences.find(p => p.preference_scope === "category" && p.scope_key === entry.category);
}
function effectiveChannels(entry: Entry, preferences: NotificationUserPreference[]): NotificationChannelPreference {
  const category = preferences.find(p => p.preference_scope === "category" && p.scope_key === entry.category)?.channel_preferences ?? {};
  const specific = preferences.find(p => p.preference_scope === "type" && p.scope_key === entry.type_key)?.channel_preferences ?? {};
  return Object.fromEntries(channels.map(channel => [channel,
    specific[channel] && specific[channel] !== "inherit" ? specific[channel]
      : category[channel] && category[channel] !== "inherit" ? category[channel]
      : entry.default_channels?.[channel] ?? "inherit",
  ]));
}
function canEdit(entry: Entry, channel: NotificationChannel) {
  return entry.supported_channels.includes(channel)
    && !(channel === "in_app" && entry.mandatory_in_app)
    && entry.channel_controls.some(c => c.channel === channel && !c.locked);
}
function checkedFor(entry: Entry, channel: NotificationChannel, draft: NotificationChannelPreference) {
  if (!entry.supported_channels.includes(channel)) return false;
  if (channel === "in_app" && entry.mandatory_in_app) return true;
  const control = entry.channel_controls.find(c => c.channel === channel);
  if (control?.locked && control.reason_code === "organization_policy_denied") return false;
  return draft[channel] !== "disabled";
}
// The database's key for "saved from an old version" (BL-1049).
function changedElsewhere(error: unknown) {
  return error instanceof RequestError && error.reason === "notification.preference_changed";
}
const changedElsewhereLine =
  "Your notification choices changed elsewhere. The latest ones are shown; make your change again.";
function MasterToggle({ label, checked, mixed, disabled, onChange }: {
  label: string; checked: boolean; mixed: boolean; disabled: boolean; onChange: (value: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = mixed; }, [mixed]);
  return <label className="notification-channel-toggle notification-channel-cell">
    <input ref={ref} type="checkbox" aria-label={label} aria-checked={mixed ? "mixed" : checked}
      checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
  </label>;
}

export default function NotificationPreferencesPage() {
  const { context, account } = useAuth();
  const queryClient = useQueryClient();
  const [workspaceId, setWorkspaceId] = useState(context?.workspace.id ?? "");
  const [drafts, setDrafts] = useState<Drafts>({});
  const [baseline, setBaseline] = useState<Drafts>({});
  const [saved, setSaved] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const query = useQuery({
    queryKey: ["notification-preferences", account?.userId ?? context?.userId, workspaceId],
    queryFn: () => getNotificationPreferences(workspaceId), retry: false,
  });
  const data = query.data;
  const dirtyKeys = Object.keys(drafts).filter(key => JSON.stringify(drafts[key]) !== JSON.stringify(baseline[key]));
  const dirtyRef = useRef(false);
  dirtyRef.current = dirtyKeys.length > 0;
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof saveNotificationPreferences>[1]) =>
      saveNotificationPreferences(workspaceId, input),
    onSuccess: async () => {
      dirtyRef.current = false;
      setBaseline(drafts);
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ["notification-preferences", account?.userId ?? context?.userId, workspaceId] });
    },
    // BL-1049: somebody (this person in another tab) saved first. Drop the
    // edit and load the latest choices; the line below says so.
    onError: async (error) => {
      if (!changedElsewhere(error)) return;
      dirtyRef.current = false;
      setDrafts(baseline);
      await queryClient.invalidateQueries({ queryKey: ["notification-preferences", account?.userId ?? context?.userId, workspaceId] });
    },
  });
  useEffect(() => {
    if (!data || dirtyRef.current) return;
    const next = Object.fromEntries(data.catalog.map(entry =>
      [entry.type_key, effectiveChannels(entry, data.preferences)]));
    setDrafts(next);
    setBaseline(next);
  }, [data]);
  const groups = useMemo(() => {
    const unique = new Map<string, Entry>();
    for (const entry of data?.catalog ?? []) {
      const previous = unique.get(entry.type_key);
      if (!previous || entry.schema_version > previous.schema_version) unique.set(entry.type_key, entry);
    }
    const grouped = new Map<string, Entry[]>();
    for (const entry of unique.values()) grouped.set(entry.category, [...(grouped.get(entry.category) ?? []), entry]);
    return [...grouped].sort(([a], [b]) => displayForNotificationCategory(a).sortOrder - displayForNotificationCategory(b).sortOrder);
  }, [data?.catalog]);

  const save = () => mutation.mutate({ updates: dirtyKeys.map(key => {
    const entry = groups.flatMap(([, entries]) => entries).find(entry => entry.type_key === key)!;
    const existing = data!.preferences.find(p => p.preference_scope === "type" && p.scope_key === key);
    const effective = preferenceFor(entry, data!.preferences);
    return {
      preference_scope: "type" as const, scope_key: key, channel_preferences: {
        ...existing?.channel_preferences,
        ...Object.fromEntries(channels.filter(channel => canEdit(entry, channel)
          && drafts[key]?.[channel] !== baseline[key]?.[channel]).map(channel => [channel, drafts[key]![channel]])),
      },
      cadence: effective?.cadence ?? entry.default_cadence,
      timezone: effective?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      quiet_hours: effective?.quiet_hours ?? null, safe_preview_enabled: effective?.safe_preview_enabled ?? true,
      expected_version: existing?.version ?? null,
    };
  }) });
  const change = (entries: Entry[], channel: NotificationChannel, enabled: boolean) => {
    setSaved(false);
    setDrafts(current => {
      const next = { ...current };
      for (const entry of entries) if (canEdit(entry, channel))
        next[entry.type_key] = { ...current[entry.type_key], [channel]: enabled ? "enabled" : "disabled" };
      return next;
    });
  };

  return <section className="account-page notification-preferences" aria-labelledby="notification-title">
    <AccountPageHeader title="Notifications" titleId="notification-title"
      description="Choose which updates reach you, workspace by workspace." />
    {(data?.workspaces.length ?? 0) > 1 ? <label className="account-field notification-workspace-picker"><span>Workspace</span>
      <select aria-label="Workspace" value={workspaceId} disabled={dirtyKeys.length > 0 || mutation.isPending}
        onChange={event => { setWorkspaceId(event.target.value); setSaved(false); }}>
        {(data?.workspaces ?? [{ id: context?.workspace.id ?? "", name: context?.workspace.name ?? "" }]).map(workspace =>
          <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
      </select>
      {dirtyKeys.length > 0 ? <small>Save or discard changes before choosing another workspace.</small> : null}
    </label> : !context ? <p>Workspace notification controls become available when you have workspace access.</p> : null}
    {query.isLoading ? <p>Loading preferences</p> : null}
    {isNoAccess(query.error) ? <NoAccessState subject="this workspace's notifications"
      homeHref={noAccessHomePath(context, "/account/preferences/notifications")} />
      : query.error || mutation.error ? <p className="form-error" role="alert">{query.error?.message
        ?? (changedElsewhere(mutation.error) ? changedElsewhereLine : mutation.error?.message)}</p> : null}
    <div className="notification-preference-list" aria-label="Workspace notification channels">
      <div className="notification-matrix-header notification-matrix-grid">
        <span aria-hidden="true" />
        <span>In app</span>
        <span>Email</span>
        <span />
      </div>
      {groups.map(([category, entries]) => {
        const display = displayForNotificationCategory(category);
        const label = category === "security" ? "Workspace access alerts" : display.label;
        const panelId = `notification-group-${category.replace(/[^a-z0-9_-]/gi, "-")}`;
        const isOpen = Boolean(openGroups[category]);
        return <section className="notification-preference-group" key={category} aria-label={label}>
          <div className="notification-preference-group-row notification-matrix-grid" onClick={event => {
            if (event.target instanceof Element && event.target.closest("button, input, label, a, select")) return;
            setOpenGroups(current => ({ ...current, [category]: !current[category] }));
          }}>
            <div className="notification-preference-group-heading">
              <h2>{label}</h2>
              <p>{category === "security" ? "Invitation and access updates for this workspace." : display.description}</p>
            </div>
            {channels.map(channel => {
              const supported = entries.filter(entry => entry.supported_channels.includes(channel));
              const checked = supported.filter(entry => checkedFor(entry, channel, drafts[entry.type_key] ?? {})).length;
              return <MasterToggle key={channel} label={label + " " + notificationChannelDisplay[channel].label}
                checked={supported.length > 0 && checked === supported.length}
                mixed={checked > 0 && checked < supported.length}
                disabled={!data?.can_write || mutation.isPending || !entries.some(entry => canEdit(entry, channel))}
                onChange={enabled => change(entries, channel, enabled)} />;
            })}
            <button className="notification-disclosure" type="button" aria-expanded={isOpen} aria-controls={panelId}
              aria-label={`${isOpen ? "Collapse" : "Expand"} individual notifications for ${label}`}
              onClick={() => setOpenGroups(current => ({ ...current, [category]: !current[category] }))}>
              <ChevronDown size={17} aria-hidden />
            </button>
          </div>
          {isOpen ? <div className="notification-preference-details" id={panelId}>
            <h3>Individual notifications</h3>
            <div className="notification-preference-group-list">
              {entries.map(entry => {
                const display = displayForNotificationType(entry.type_key);
                const fallbackKey = entry.type_key.split(".").slice(-2).join(" ");
                const title = display?.label ?? humanizeIdentifier(fallbackKey);
                return <section className="notification-preference-card notification-matrix-grid" key={entry.type_key}>
                  <header className="notification-preference-card-heading">
                    <h3>{title}</h3><p>{display?.preferenceDescription ?? "Get notified about this workspace update."}</p>
                  </header>
                  {channels.map(channel => {
                    const control = entry.channel_controls.find(control => control.channel === channel);
                    const locked = !canEdit(entry, channel);
                    const reason = channel === "in_app" && entry.mandatory_in_app ? "This notification is always shown in the app."
                      : channel === "email" && data?.email_channel_reason ? (data.email_channel_reason === "email_unverified" ? "Email is unverified." : "Email delivery is unavailable.")
                      : !entry.supported_channels.includes(channel) ? labelForNotificationLockReason("catalog_channel_unsupported")
                      : control?.locked ? labelForNotificationLockReason(control.reason_code) : null;
                    const reasonId = reason ? `notification-${entry.type_key}-${channel}-reason`.replace(/[^a-z0-9_-]/gi, "-") : undefined;
                    return <label className="notification-channel-toggle notification-channel-cell" key={channel}>
                      <input type="checkbox" aria-label={notificationChannelDisplay[channel].label + " for " + title}
                        aria-describedby={reasonId}
                        checked={checkedFor(entry, channel, drafts[entry.type_key] ?? {})}
                        disabled={!data?.can_write || mutation.isPending || locked}
                        onChange={event => change([entry], channel, event.target.checked)} />
                      {reason ? <small className="visually-hidden" id={reasonId}>{reason}</small> : null}
                    </label>;
                  })}
                  <span aria-hidden />
                </section>;
              })}
            </div>
          </div> : null}
        </section>;
      })}
    </div>
    {saved ? <p role="status" className="form-success">Notification preferences saved</p> : null}
    <div className="account-form-actions">
      {dirtyKeys.length ? <Button type="button" className="secondary-button" disabled={mutation.isPending}
        onClick={() => { setDrafts(baseline); setSaved(false); }}>Discard</Button> : null}
      <Button type="button" disabled={!dirtyKeys.length || !data?.can_write || mutation.isPending} onClick={save}>
        {mutation.isPending ? "Saving" : "Save"}
      </Button>
    </div>
  </section>;
}
