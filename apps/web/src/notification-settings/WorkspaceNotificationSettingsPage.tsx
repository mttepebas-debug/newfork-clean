import type {
  NotificationAlwaysSentType,
  NotificationWorkspaceSettings,
  NotificationWorkspaceSettingsInput,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, ChevronDown, Lock } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { noAccessHomePath } from "../auth/resolveLanding";
import { useAvailabilityNavigationGuard } from "../availability/availability-navigation";
import { isNoAccess } from "../lib/no-access";
import { SettingsHeader } from "../settings/GeneralSettingsPage";
import { LinesOutline, LoadError, RefreshError } from "../shell/LoadState";
import { NoAccessState } from "../shell/NoAccessState";
import {
  areaName,
  loadNotificationWorkspaceSettings,
  notificationDelivery,
  notificationWorkspaceSettingsKey,
  saveNotificationWorkspaceSettings,
} from "./notification-settings-data";
import { ChannelRow, StatusPill, Switch } from "./parts";
import "./notification-settings.css";

type Draft = NotificationWorkspaceSettingsInput;

function fromSettings(settings: NotificationWorkspaceSettings): Draft {
  return {
    email_enabled: settings.email_enabled,
    push_enabled: settings.push_enabled,
    muted_types: settings.optional.filter((type) => !type.enabled).map((type) => type.key),
  };
}

function sameDraft(a: Draft, b: Draft): boolean {
  return (
    a.email_enabled === b.email_enabled &&
    a.push_enabled === b.push_enabled &&
    a.muted_types.length === b.muted_types.length &&
    a.muted_types.every((key) => b.muted_types.includes(key))
  );
}

/**
 * Settings > Notifications (variant A, KARARLAR S-123): the workspace's
 * channels, the optional notifications the owner may turn off, and what is
 * always sent. Who gets what is the product's rule, not a setting here.
 */
export default function WorkspaceNotificationSettingsPage() {
  const { context } = useAuth();
  const workspaceId = context?.workspace.id ?? "";
  const workspaceName = context?.workspace.name ?? "This workspace";
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: notificationWorkspaceSettingsKey(workspaceId),
    queryFn: () => loadNotificationWorkspaceSettings(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState(false);
  const stored = query.data ? fromSettings(query.data) : null;
  const current = draft ?? stored;
  const dirty = Boolean(draft && stored && !sameDraft(draft, stored));
  const mutation = useMutation({
    mutationFn: (settings: Draft) => saveNotificationWorkspaceSettings(workspaceId, settings),
    onSuccess: (next) => {
      queryClient.setQueryData(notificationWorkspaceSettingsKey(workspaceId), next);
      // A person's table follows what the owner turned off.
      void queryClient.invalidateQueries({ queryKey: ["notification-preferences", workspaceId] });
      setDraft(null);
      setSaved(true);
    },
  });
  const discard = () => {
    setDraft(null);
    setSaved(false);
    mutation.reset();
  };
  const navigationDialog = useAvailabilityNavigationGuard({
    dirty,
    busy: mutation.isPending,
    onDiscard: discard,
    labels: {
      saving: "Saving notification settings",
      discard: "Discard notification settings changes?",
      saved: "Notification settings saved",
      unsaved: "Your unsaved notification settings will be lost.",
    },
  });

  if (isNoAccess(query.error))
    return <NoAccessState homeHref={noAccessHomePath(context, "/app/settings/notifications")} />;

  const change = (patch: Partial<Draft>) => {
    if (!current) return;
    setDraft({ ...current, ...patch });
    setSaved(false);
  };
  const setTypeOn = (key: string, on: boolean) => {
    if (!current) return;
    const others = current.muted_types.filter((muted) => muted !== key);
    change({ muted_types: on ? others : [...others, key] });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!dirty || !current) return;
    setSaved(false);
    mutation.mutate(current);
  };

  return (
    <section className="settings-page ns-page" aria-labelledby="notifications-settings-title">
      {navigationDialog}
      <SettingsHeader
        icon={<Bell size={21} aria-hidden />}
        title="Notifications"
        description={`Choose how ${workspaceName} reaches its people. Each person can turn off the extra ways for themselves.`}
      />
      {query.isLoading ? <LinesOutline label="Loading notification settings" lines={6} /> : null}
      {query.error && !query.data ? (
        <LoadError
          title="We couldn't load notification settings"
          detail="Notification settings didn't load. Nothing was changed."
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.error && query.data ? (
        <RefreshError
          message="Notification settings didn't refresh. These are the last ones that loaded."
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.data && current ? (
        <form className="ns-form" onSubmit={submit} noValidate>
          <h2 className="ns-h2" id="workspace-channels-title">
            Channels
          </h2>
          <div className="ns-card" role="group" aria-labelledby="workspace-channels-title">
            <ChannelRow title="In the app" control={<StatusPill tone="accent" locked>Always on</StatusPill>}>
              Every notification lands in each person&rsquo;s Notifications list.
            </ChannelRow>
            <ChannelRow
              title={<>Email{notificationDelivery.email ? null : <StatusPill>Coming soon</StatusPill>}</>}
              control={
                <Switch
                  label="Email"
                  checked={current.email_enabled}
                  disabled={mutation.isPending}
                  onChange={(on) => change({ email_enabled: on })}
                />
              }
            >
              {notificationDelivery.email
                ? "People choose which ones they get."
                : "People choose which ones they get. Emails start soon; this choice is kept."}
            </ChannelRow>
            <ChannelRow
              title={<>Phone alerts{notificationDelivery.push ? null : <StatusPill>Coming soon</StatusPill>}</>}
              control={
                <Switch
                  label="Phone alerts"
                  checked={current.push_enabled}
                  disabled={mutation.isPending}
                  onChange={(on) => change({ push_enabled: on })}
                />
              }
            >
              {notificationDelivery.push
                ? "Pop-up alerts on phones and computers. Each person turns them on for their own device."
                : "Pop-up alerts on phones and computers. They start soon; this choice is kept."}
            </ChannelRow>
            <ChannelRow title="Text messages" control={<StatusPill>Not available</StatusPill>} off>
              Needs a paid text message service. Not switched on.
            </ChannelRow>
          </div>

          <h2 className="ns-h2" id="workspace-optional-title">
            Optional notifications
          </h2>
          <div className="ns-card" role="group" aria-labelledby="workspace-optional-title">
            {query.data.optional.map((type) => (
              <ChannelRow
                key={type.key}
                title={type.description}
                control={
                  <Switch
                    label={type.description}
                    checked={!current.muted_types.includes(type.key)}
                    disabled={mutation.isPending}
                    onChange={(on) => setTypeOn(type.key, on)}
                  />
                }
              >
                {areaName(type.area)}
              </ChannelRow>
            ))}
          </div>

          <AlwaysSent types={query.data.always_sent} />

          {mutation.error ? (
            <p className="form-error" role="alert">
              Notification settings weren&rsquo;t saved. Try again.
            </p>
          ) : null}
          {saved ? (
            <p className="form-success" role="status">
              Notification settings saved
            </p>
          ) : null}
          <div className="ns-actions">
            {dirty ? (
              <Button className="secondary-button" type="button" disabled={mutation.isPending} onClick={discard}>
                Discard
              </Button>
            ) : null}
            <Button type="submit" disabled={!dirty || mutation.isPending}>
              {mutation.isPending ? "Saving" : "Save"}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function AlwaysSent({ types }: { readonly types: readonly NotificationAlwaysSentType[] }) {
  const groups = new Map<string, NotificationAlwaysSentType[]>();
  for (const type of types) groups.set(type.area, [...(groups.get(type.area) ?? []), type]);
  return (
    <details className="ns-card ns-always">
      <summary>
        <strong>Always sent</strong>
        <span>These keep work moving and accounts safe. They can&rsquo;t be switched off.</span>
        <ChevronDown size={17} aria-hidden />
      </summary>
      <div className="ns-always-groups">
        {[...groups].map(([area, list]) => (
          <section key={area} aria-label={areaName(area)}>
            <h3>{areaName(area)}</h3>
            <ul>
              {list.map((type) => (
                <li key={type.key}>
                  <Lock size={13} aria-hidden />
                  {type.description}
                  {type.level === "required" ? <StatusPill>Also by email</StatusPill> : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </details>
  );
}
