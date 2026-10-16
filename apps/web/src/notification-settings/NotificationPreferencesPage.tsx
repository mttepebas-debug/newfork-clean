import type {
  NotificationChoiceChannel,
  NotificationPreferences,
  NotificationPreferencesInput,
  NotificationTopicPreference,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Info, Mail, MessageSquare, Smartphone } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { AccountPageHeader } from "../account/components";
import { useAvailabilityNavigationGuard } from "../availability/availability-navigation";
import { LinesOutline, LoadError, RefreshError } from "../shell/LoadState";
import {
  loadNotificationPreferences,
  notificationDelivery,
  notificationPreferencesKey,
  saveNotificationPreferences,
} from "./notification-settings-data";
import { ChannelRow, StatusPill } from "./parts";
import "./notification-settings.css";

type CellKey = `${string}:${NotificationChoiceChannel}`;
const channels: readonly NotificationChoiceChannel[] = ["email", "push"];
const channelName = { email: "email", push: "phone alerts" } as const;

/** What the person gets today for a topic and channel: their choice, else the default. */
function stored(topic: NotificationTopicPreference, channel: NotificationChoiceChannel): boolean {
  return topic[channel].choice ?? topic[channel].default;
}

/**
 * Account > Notifications (variant A, KARARLAR S-123): the channels and a short
 * topic table for the open workspace. Required notices are not a choice and the
 * owner's turned-off topics do not come back from the database at all.
 */
export default function NotificationPreferencesPage() {
  const { account, context } = useAuth();
  const workspaceId = context?.workspace.id ?? "";
  const workspaceName = context?.workspace.name ?? "your workspace";
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: notificationPreferencesKey(workspaceId),
    queryFn: () => loadNotificationPreferences(workspaceId),
    enabled: Boolean(workspaceId),
  });
  // Only the cells the person changed; the rest show what is stored.
  const [draft, setDraft] = useState<ReadonlyMap<CellKey, boolean>>(new Map());
  const [saved, setSaved] = useState(false);
  const dirty = draft.size > 0;
  const mutation = useMutation({
    mutationFn: (choices: NotificationPreferencesInput["choices"]) => saveNotificationPreferences(workspaceId, choices),
    onSuccess: (next) => {
      queryClient.setQueryData(notificationPreferencesKey(workspaceId), next);
      setDraft(new Map());
      setSaved(true);
    },
  });
  const discard = () => {
    setDraft(new Map());
    setSaved(false);
    mutation.reset();
  };
  const navigationDialog = useAvailabilityNavigationGuard({
    dirty,
    busy: mutation.isPending,
    onDiscard: discard,
    labels: {
      saving: "Saving notification choices",
      discard: "Discard notification changes?",
      saved: "Notification choices saved",
      unsaved: "Your unsaved notification choices will be lost.",
    },
  });

  const header = (
    <AccountPageHeader
      title="Notifications"
      titleId="notification-preferences-title"
      description={`Choose where ${workspaceName} reaches you. Everything always shows in your Notifications list.`}
    />
  );

  if (!context)
    return (
      <section className="account-page ns-page" aria-labelledby="notification-preferences-title">
        {header}
        <p className="ns-note">
          <Info size={15} aria-hidden />
          Notifications come from a workspace. Open one to choose how it reaches you.
        </p>
      </section>
    );

  const toggle = (topic: NotificationTopicPreference, channel: NotificationChoiceChannel, on: boolean) => {
    const key: CellKey = `${topic.key}:${channel}`;
    setDraft((current) => {
      const next = new Map(current);
      // Choosing what is stored again is no change, so Save closes again.
      if (on === stored(topic, channel)) next.delete(key);
      else next.set(key, on);
      return next;
    });
    setSaved(false);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!dirty) return;
    setSaved(false);
    mutation.mutate(
      [...draft].map(([key, enabled]) => {
        const [topic, channel] = key.split(":") as [string, NotificationChoiceChannel];
        return { topic, channel, enabled };
      }),
    );
  };

  return (
    <section className="account-page ns-page" aria-labelledby="notification-preferences-title">
      {navigationDialog}
      {header}
      {query.isLoading ? <LinesOutline label="Loading notification choices" lines={6} /> : null}
      {query.error && !query.data ? (
        <LoadError
          title="We couldn't load your notification choices"
          detail="Your notification choices didn't load. Nothing was changed."
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.error && query.data ? (
        <RefreshError
          message="Your notification choices didn't refresh. These are the last ones that loaded."
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.data ? (
        <form className="ns-form" onSubmit={submit} noValidate>
          <Channels preferences={query.data} email={account?.email ?? null} workspaceName={workspaceName} />
          <TopicTable
            preferences={query.data}
            value={(topic, channel) => draft.get(`${topic.key}:${channel}`) ?? stored(topic, channel)}
            onToggle={toggle}
            disabled={mutation.isPending}
          />
          <p className="ns-note">
            <Info size={15} aria-hidden />
            <span>
              Something {workspaceName} switched off doesn&rsquo;t show here. Approvals and changes to your own shifts always
              reach your Notifications list; here you choose the extra ways they reach you.
            </span>
          </p>
          {mutation.error ? (
            <p className="form-error" role="alert">
              Your notification choices weren&rsquo;t saved. Try again.
            </p>
          ) : null}
          {saved ? (
            <p className="form-success" role="status">
              Notification choices saved
            </p>
          ) : null}
          <div className="account-form-actions">
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

function Channels({
  preferences,
  email,
  workspaceName,
}: {
  readonly preferences: NotificationPreferences;
  readonly email: string | null;
  readonly workspaceName: string;
}) {
  const { channels } = preferences;
  const emailState = !channels.email.workspace_enabled
    ? { text: `${workspaceName} turned email off.`, pill: <StatusPill>Off</StatusPill>, off: true }
    : !channels.email.address_on_file || !email
      ? { text: "Add a sign-in email in Security to get email.", pill: <StatusPill>No address</StatusPill>, off: true }
      : channels.email.suppressed
        ? { text: `Emails to ${email} bounced. Change it in Security.`, pill: <StatusPill tone="warning">Paused</StatusPill>, off: true }
        : notificationDelivery.email
          ? { text: email, pill: <StatusPill tone="accent">On</StatusPill>, off: false }
          : { text: `${email}. Emails start soon; your choices below are kept.`, pill: <StatusPill>Coming soon</StatusPill>, off: false };
  const pushState = !channels.push.workspace_enabled
    ? { text: `${workspaceName} turned phone alerts off.`, pill: <StatusPill>Off</StatusPill>, off: true }
    : notificationDelivery.push
      ? channels.push.devices > 0
        ? { text: `On for ${channels.push.devices === 1 ? "1 device" : `${channels.push.devices} devices`}.`, pill: <StatusPill tone="accent">On</StatusPill>, off: false }
        : { text: "Not on any of your devices yet.", pill: <StatusPill>Off</StatusPill>, off: false }
      : { text: "Alerts on your phone start soon; your choices below are kept.", pill: <StatusPill>Coming soon</StatusPill>, off: false };
  return (
    <>
      <h2 className="ns-h2" id="notification-channels-title">
        Where you get notified
      </h2>
      <div className="ns-card" role="group" aria-labelledby="notification-channels-title">
        <ChannelRow icon={<Inbox size={17} />} title="In the app" control={<StatusPill tone="accent" locked>Always on</StatusPill>}>
          Every notification lands in your Notifications list.
        </ChannelRow>
        <ChannelRow icon={<Mail size={17} />} title="Email" control={emailState.pill} off={emailState.off}>
          {emailState.text}
        </ChannelRow>
        <ChannelRow icon={<Smartphone size={17} />} title="Phone alerts" control={pushState.pill} off={pushState.off}>
          {pushState.text}
        </ChannelRow>
        <ChannelRow icon={<MessageSquare size={17} />} title="Text messages" control={<StatusPill>Not available</StatusPill>} off>
          Not available yet.
        </ChannelRow>
      </div>
    </>
  );
}

function TopicTable({
  preferences,
  value,
  onToggle,
  disabled,
}: {
  readonly preferences: NotificationPreferences;
  readonly value: (topic: NotificationTopicPreference, channel: NotificationChoiceChannel) => boolean;
  readonly onToggle: (topic: NotificationTopicPreference, channel: NotificationChoiceChannel, on: boolean) => void;
  readonly disabled: boolean;
}) {
  const open = {
    email: preferences.channels.email.workspace_enabled,
    push: preferences.channels.push.workspace_enabled,
  };
  return (
    <>
      <h2 className="ns-h2" id="notification-topics-title">
        What reaches you
      </h2>
      <div className="ns-card ns-table-frame">
        <table className="ns-table" aria-labelledby="notification-topics-title">
          <thead>
            <tr>
              <th scope="col">Notification</th>
              <th scope="col">Email</th>
              <th scope="col">Phone</th>
            </tr>
          </thead>
          <tbody>
            {preferences.topics.map((topic) => (
              <tr key={topic.key}>
                <th scope="row">
                  <strong>{topic.name}</strong>
                </th>
                {channels.map((channel) => (
                  <td key={channel}>
                    <label className="ns-check">
                      <input
                        type="checkbox"
                        aria-label={`${topic.name} by ${channelName[channel]}`}
                        title={open[channel] ? undefined : "Turned off for this workspace"}
                        checked={open[channel] && value(topic, channel)}
                        disabled={disabled || !open[channel]}
                        onChange={(event) => onToggle(topic, channel, event.target.checked)}
                      />
                    </label>
                  </td>
                ))}
              </tr>
            ))}
            <tr className="is-locked">
              <th scope="row">
                <strong>
                  Account and security <StatusPill tone="accent" locked>Required</StatusPill>
                </strong>
                <span>Password and sign-in changes, your role and your access. Always by email.</span>
              </th>
              <td>
                <label className="ns-check">
                  <input type="checkbox" aria-label="Account and security by email, always on" checked disabled readOnly />
                </label>
              </td>
              <td>
                <span className="ns-na" aria-label="Account and security by phone alerts, not sent">
                  —
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
