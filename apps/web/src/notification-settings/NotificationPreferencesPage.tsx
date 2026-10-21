import type {
  NotificationChannelsConfig,
  NotificationChoiceChannel,
  NotificationPreferences,
  NotificationPreferencesInput,
  NotificationTopicPreference,
} from "@newfork/shared";
import { Button, useToast } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Info, Mail, MessageSquare, Smartphone } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { AccountPageHeader } from "../account/components";
import { useAvailabilityNavigationGuard } from "../availability/availability-navigation";
import { LinesOutline, LoadError, RefreshError } from "../shell/LoadState";
import { useNotificationChannels } from "../phone-alerts/channels-data";
import { GuideStrip, HomeScreenGuide, ReturnCard, useGuideFlow, type GuideBrowser } from "../phone-alerts/guide/HomeScreenGuide";
import { isStandalone, phoneAlertsSupport, readInstallEnv } from "../phone-alerts/install-state";
import { copySetupLink, markSetupAddress } from "../phone-alerts/setup-link";
import { usePhoneAlerts } from "../phone-alerts/use-phone-alerts";
import {
  loadNotificationPreferences,
  notificationPreferencesKey,
  saveNotificationPreferences,
} from "./notification-settings-data";
import { ChannelRow, StatusPill, Switch } from "./parts";
import { rowState, topicRows, type TopicRow } from "./topic-rows";
import "./notification-settings.css";
import { FieldNote } from "../shell/FieldNote";

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
  const delivery = useNotificationChannels(Boolean(workspaceId));
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

  // A row's box sets every topic in it (My requests is two).
  const toggle = (row: TopicRow, channel: NotificationChoiceChannel, on: boolean) => {
    setDraft((current) => {
      const next = new Map(current);
      for (const topic of row.topics) {
        const key: CellKey = `${topic.key}:${channel}`;
        // Choosing what is stored again is no change, so Save closes again.
        if (on === stored(topic, channel)) next.delete(key);
        else next.set(key, on);
      }
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
          <Channels preferences={query.data} email={account?.email ?? null} workspaceName={workspaceName} delivery={delivery} />
          <TopicTable
            preferences={query.data}
            delivery={delivery}
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
          <FieldNote
            id="notification-preferences"
            error={mutation.error ? "Your notification choices weren\u2019t saved. Try again." : null}
          />
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
  delivery,
}: {
  readonly preferences: NotificationPreferences;
  readonly email: string | null;
  readonly workspaceName: string;
  readonly delivery: NotificationChannelsConfig;
}) {
  const { channels } = preferences;
  const emailState = !channels.email.workspace_enabled
    ? { text: `${workspaceName} turned email off.`, pill: <StatusPill>Off</StatusPill>, off: true }
    : !channels.email.address_on_file || !email
      ? { text: "Add a sign-in email in Security to get email.", pill: <StatusPill>No address</StatusPill>, off: true }
      : channels.email.suppressed
        ? { text: `Emails to ${email} bounced. Change it in Security.`, pill: <StatusPill tone="warning">Paused</StatusPill>, off: true }
        : delivery.email.available
          ? { text: email, pill: <StatusPill tone="accent">On</StatusPill>, off: false }
          : { text: `${email}. Emails start soon; your choices below are kept.`, pill: <StatusPill>Coming soon</StatusPill>, off: false };
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
        {!channels.push.workspace_enabled ? (
          <ChannelRow icon={<Smartphone size={17} />} title="Phone alerts" control={<StatusPill>Off</StatusPill>} off>
            {workspaceName} turned phone alerts off.
          </ChannelRow>
        ) : delivery.push.available ? (
          <PhoneAlertsRow publicKey={delivery.push.public_key} devices={channels.push.devices} />
        ) : (
          <ChannelRow icon={<Smartphone size={17} />} title="Phone alerts" control={<StatusPill>Coming soon</StatusPill>}>
            Alerts on your phone start soon; your choices below are kept.
          </ChannelRow>
        )}
        <ChannelRow icon={<MessageSquare size={17} />} title="Text messages" control={<StatusPill>Not available</StatusPill>} off>
          Not available yet.
        </ChannelRow>
      </div>
    </>
  );
}

/**
 * Phone alerts on this device (BILDIRIM-15): the browser holds the permission and the subscription, so
 * the row says where this device stands and turns it on or off; the count names the person's others.
 */
function PhoneAlertsRow({ publicKey, devices }: { readonly publicKey: string; readonly devices: number }) {
  const alerts = usePhoneAlerts();
  const toast = useToast();
  const guide = useGuideFlow();
  const opener = useRef<HTMLButtonElement | null>(null);
  const support = useMemo(() => phoneAlertsSupport(readInstallEnv(window)), []);
  const where: GuideBrowser | null = support.kind === "needs-install" ? { browser: support.browser, ios: support.ios } : null;
  const others = Math.max(0, devices - (alerts.state === "on" ? 1 : 0));
  const elsewhere = others === 0 ? "" : others === 1 ? " Also on 1 other device." : ` Also on ${others} other devices.`;
  const computer = !/Android|iPhone|iPad|Mobile/.test(window.navigator.userAgent);
  const homeScreenApp = /iPhone|iPad/.test(window.navigator.userAgent) && isStandalone(window);
  const icon = <Smartphone size={17} />;

  // A link with ?setup=alerts (Copy link, Open in Safari) opens the steps by itself; it never asks for permission.
  const linked = useRef(new URLSearchParams(window.location.search).get("setup") === "alerts");
  useEffect(() => {
    if (alerts.state === "needs-install" && linked.current) {
      linked.current = false;
      guide.open(0);
    }
    // Another iPhone browser: its own Open in Safari takes the address as it is, so it carries the steps along.
    if (alerts.state === "other") markSetupAddress();
  }, [alerts.state, guide]);

  let row;
  switch (alerts.state) {
    case null:
      row = (
        <ChannelRow icon={icon} title="Phone alerts" control={<StatusPill>Checking</StatusPill>}>
          Checking this device.
        </ChannelRow>
      );
      break;
    case "unsupported":
      row = (
        <ChannelRow icon={icon} title="Phone alerts" control={<StatusPill>Not available</StatusPill>} off>
          {/iPhone|iPad/.test(window.navigator.userAgent) ? "Alerts need iOS 16.4 or later on this iPhone." : "This browser can’t show alerts."}
          {elsewhere}
        </ChannelRow>
      );
      break;
    case "other":
      row = (
        <ChannelRow
          icon={icon}
          title="Phone alerts"
          control={
            <Button
              className="secondary-button"
              onClick={() => void copySetupLink().then((copied) => (copied ? toast.success("Link copied. Open Safari, tap the address bar, paste, and go.") : toast.error("The link couldn’t be copied. Open newfork.app in Safari.")))}
            >
              Copy link
            </Button>
          }
        >
          Open Newfork in Safari to get alerts on this iPhone.{elsewhere}
        </ChannelRow>
      );
      break;
    case "needs-install":
      row = (
        <ChannelRow
          icon={icon}
          title="Phone alerts"
          control={
            <Button
              className="secondary-button"
              onClick={(event) => {
                opener.current = event.currentTarget;
                guide.open(0);
              }}
            >
              Show me how
            </Button>
          }
        >
          Add Newfork to your Home Screen to get alerts on this iPhone.{elsewhere}
        </ChannelRow>
      );
      break;
    case "blocked":
      row = (
        <ChannelRow icon={icon} title="Phone alerts" control={<StatusPill tone="warning">Blocked</StatusPill>} off>
          {homeScreenApp
            ? "Alerts are off for this iPhone. Turn them on in Settings › Notifications › Newfork."
            : "Blocked in this browser’s settings. Allow notifications for Newfork there to get alerts here."}
          {elsewhere}
        </ChannelRow>
      );
      break;
    case "on":
      row = (
        <ChannelRow
          icon={icon}
          title="Phone alerts"
          control={<Switch label="Phone alerts on this device" checked disabled={alerts.busy} onChange={() => void alerts.turnOff()} />}
        >
          On for this {computer ? "computer" : "phone"}.{elsewhere}
        </ChannelRow>
      );
      break;
    default:
      row = (
        <ChannelRow
          icon={icon}
          title="Phone alerts"
          control={
            <Button disabled={alerts.busy} onClick={() => void alerts.turnOn(publicKey)}>
              Turn on
            </Button>
          }
        >
          Off on this device. Alerts pop up even when the app is closed.{elsewhere}
        </ChannelRow>
      );
  }
  const notNow = (
    <Button className="secondary-button" onClick={guide.dismiss}>
      Not now
    </Button>
  );
  return (
    <>
      {row}
      {where && guide.phase === "strip" ? (
        <div className="ns-guide-slot">
          <GuideStrip
            where={where}
            onOpen={guide.open}
            actions={
              <>
                <Button className="secondary-button" onClick={() => guide.open(0)}>
                  Show again
                </Button>
                {notNow}
              </>
            }
          />
        </div>
      ) : null}
      {where && guide.phase === "return" ? (
        <div className="ns-guide-slot">
          <ReturnCard where={where} compact={false} onAgain={() => guide.open(0)} onNotNow={guide.dismiss} />
        </div>
      ) : null}
      {alerts.failed ? (
        <p className="ns-inline-error" role="alert">
          Phone alerts couldn&rsquo;t be changed on this device. Try again.
        </p>
      ) : null}
      {where && guide.openAt !== null ? (
        <HomeScreenGuide
          where={where}
          startAt={guide.openAt}
          onClose={() => {
            guide.close();
            opener.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}

function TopicTable({
  preferences,
  delivery,
  value,
  onToggle,
  disabled,
}: {
  readonly preferences: NotificationPreferences;
  readonly delivery: NotificationChannelsConfig;
  readonly value: (topic: NotificationTopicPreference, channel: NotificationChoiceChannel) => boolean;
  readonly onToggle: (row: TopicRow, channel: NotificationChoiceChannel, on: boolean) => void;
  readonly disabled: boolean;
}) {
  const rows = topicRows(preferences.topics);
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
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">
                  <strong>
                    {row.name}
                    {row.level === "optional" ? <StatusPill>Optional</StatusPill> : null}
                  </strong>
                  <span>{row.description}</span>
                </th>
                {channels.map((channel) => {
                  const state = rowState(row.topics.map((topic) => value(topic, channel)));
                  const mixed = open[channel] && state.mixed;
                  return (
                    <td key={channel}>
                      <label className="ns-check">
                        <input
                          type="checkbox"
                          ref={(box) => {
                            if (box) box.indeterminate = mixed;
                          }}
                          aria-label={`${row.name} by ${channelName[channel]}`}
                          title={open[channel] ? undefined : "Turned off for this workspace"}
                          checked={open[channel] && state.checked}
                          disabled={disabled || !open[channel]}
                          onChange={(event) => onToggle(row, channel, event.target.checked)}
                        />
                      </label>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="is-locked">
              <th scope="row">
                <strong>
                  Account and security <StatusPill tone="accent" locked>Required</StatusPill>
                </strong>
                <span>
                  {delivery.email.available
                    ? `Password and sign-in changes, your role and your access. Always by email${delivery.push.available ? ", and on every device with phone alerts on" : ""}.`
                    : "Password and sign-in changes, your role and your access. Always in your Notifications list, and by email once emails start."}
                </span>
              </th>
              <td>
                {delivery.email.available ? (
                  <label className="ns-check">
                    <input type="checkbox" aria-label="Account and security by email, always on" checked disabled readOnly />
                  </label>
                ) : (
                  <span className="ns-na" aria-label="Account and security by email, coming soon">
                    —
                  </span>
                )}
              </td>
              <td>
                {delivery.push.available ? (
                  // Required notices reach every device that takes phone alerts.
                  <label className="ns-check">
                    <input type="checkbox" aria-label="Account and security by phone alerts, always on" checked disabled readOnly />
                  </label>
                ) : (
                  <span className="ns-na" aria-label="Account and security by phone alerts, not sent">
                    —
                  </span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
