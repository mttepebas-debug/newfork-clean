import type {
  NotificationChannel,
  NotificationChannelPreference,
  NotificationUserPreference,
  NotificationUserPreferencesResponse,
} from "@newfork/shared";
import {
  displayForNotificationCategory,
  displayForNotificationType,
  labelForNotificationLockReason,
  notificationChannelDisplay,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { AccountPageHeader } from "./components";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
} from "./notification-preferences-data";
import "./notification-preferences.css";

type PreferenceDraft = NotificationChannelPreference;
type NotificationUserCatalogEntry =
  NotificationUserPreferencesResponse["catalog"][number];

function reasonLabel(reason: string): string {
  return labelForNotificationLockReason(reason);
}

function preferenceFor(
  entry: NotificationUserCatalogEntry,
  preferences: NotificationUserPreference[],
): NotificationUserPreference | null {
  return (
    preferences.find(
      (preference) =>
        preference.preference_scope === "type" &&
        preference.scope_key === entry.type_key,
    ) ??
    preferences.find(
      (preference) =>
        preference.preference_scope === "category" &&
        preference.scope_key === entry.category,
    ) ??
    null
  );
}

export default function NotificationPreferencesPage() {
  const { context } = useAuth();
  const queryClient = useQueryClient();
  const [workspaceId, setWorkspaceId] = useState(context?.workspace.id ?? "");
  const [drafts, setDrafts] = useState<Record<string, PreferenceDraft>>({});
  const query = useQuery({
    queryKey: ["notification-preferences", workspaceId],
    queryFn: () => getNotificationPreferences(workspaceId),
    enabled: Boolean(workspaceId),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (variables: {
      workspaceId: string;
      input: Parameters<typeof saveNotificationPreferences>[1];
    }) => saveNotificationPreferences(variables.workspaceId, variables.input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["notification-preferences", workspaceId],
      });
    },
  });
  const data = query.data;

  useEffect(() => {
    if (!data) return;
    setDrafts(
      Object.fromEntries(
        data.catalog.map((entry) => {
          const preference = preferenceFor(entry, data.preferences);
          return [entry.type_key, preference?.channel_preferences ?? {}];
        }),
      ),
    );
  }, [data]);

  const selectedWorkspace = useMemo(
    () => data?.workspaces.find((workspace) => workspace.id === workspaceId),
    [data?.workspaces, workspaceId],
  );
  const groupedCatalog = useMemo(() => {
    const groups = new Map<
      string,
      {
        category: string;
        label: string;
        description: string;
        sortOrder: number;
        entries: NotificationUserCatalogEntry[];
      }
    >();
    for (const entry of data?.catalog ?? []) {
      const categoryDisplay = displayForNotificationCategory(entry.category);
      const group = groups.get(entry.category) ?? {
        category: entry.category,
        label: categoryDisplay.label,
        description: categoryDisplay.description,
        sortOrder: categoryDisplay.sortOrder,
        entries: [],
      };
      group.entries.push(entry);
      groups.set(entry.category, group);
    }
    return [...groups.values()].sort((left, right) => {
      if (left.sortOrder !== right.sortOrder)
        return left.sortOrder - right.sortOrder;
      return left.label.localeCompare(right.label);
    });
  }, [data?.catalog]);

  if (!context) return null;

  return (
    <section
      className="account-page notification-preferences"
      aria-labelledby="notification-title"
    >
      <AccountPageHeader
        title="Notification Preferences"
        titleId="notification-title"
        description="Choose which in-app updates you want to receive for each workspace. Organization rules may require or disable some delivery channels."
      />

      <label className="form-field">
        <span>Workspace</span>
        <select
          aria-label="Workspace"
          value={workspaceId}
          onChange={(event) => setWorkspaceId(event.target.value)}
        >
          {(data?.workspaces ?? [
            {
              id: context.workspace.id,
              name: context.workspace.name,
              role: context.membership.role,
              isActive: true,
              onboarding: context.onboarding,
            },
          ]).map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
      </label>

      {query.isLoading ? <p>Loading preferences</p> : null}
      {query.error ? (
        <p className="form-error" role="alert">
          {query.error instanceof Error
            ? query.error.message
            : "Notification preferences could not be loaded"}
        </p>
      ) : null}

      <div className="notification-preference-list">
        {groupedCatalog.map((group) => (
          <section className="notification-preference-group" key={group.category}>
            <header className="notification-preference-group-heading">
              <h2>{group.label}</h2>
              <p>{group.description}</p>
            </header>
            <div className="notification-preference-group-list">
              {group.entries.map((entry) => {
                const preference = preferenceFor(entry, data?.preferences ?? []);
                const draft = drafts[entry.type_key] ?? {};
                const typeDisplay = displayForNotificationType(entry.type_key);
                const title = typeDisplay?.label ?? entry.type_key;
                const description =
                  typeDisplay?.preferenceDescription ??
                  typeDisplay?.description ??
                  "Choose whether this workspace update appears in your inbox.";
                return (
                  <section
                    className="notification-preference-card"
                    key={entry.type_key}
                  >
                    <header className="notification-preference-card-heading">
                      <h3>{title}</h3>
                      <p>{description}</p>
                      <span>{selectedWorkspace?.name ?? context.workspace.name}</span>
                    </header>
                    <div className="notification-preference-body">
                      {entry.channel_controls.map((control) => (
                        <ChannelPreferenceToggle
                          canWrite={Boolean(data?.can_write)}
                          control={control}
                          draft={draft}
                          entry={entry}
                          key={control.channel}
                          title={title}
                          onChange={(channel, checked) =>
                            setDrafts((current) => ({
                              ...current,
                              [entry.type_key]: {
                                ...draft,
                                [channel]: checked ? "enabled" : "disabled",
                              },
                            }))
                          }
                        />
                      ))}
                    </div>
                    <Button
                      type="button"
                      aria-label={`Save ${title}`}
                      disabled={!data?.can_write || mutation.isPending}
                      onClick={() =>
                        mutation.mutate({
                          workspaceId,
                          input: {
                            updates: [
                              {
                                preference_scope: "type",
                                scope_key: entry.type_key,
                                channel_preferences:
                                  drafts[entry.type_key] ?? {},
                                cadence:
                                  preference?.cadence ?? entry.default_cadence,
                                timezone:
                                  preference?.timezone ??
                                  Intl.DateTimeFormat().resolvedOptions()
                                    .timeZone,
                                quiet_hours: preference?.quiet_hours ?? null,
                                safe_preview_enabled:
                                  preference?.safe_preview_enabled ?? true,
                                expected_version: preference?.version ?? null,
                              },
                            ],
                          },
                        })
                      }
                    >
                      Save
                    </Button>
                  </section>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function ChannelPreferenceToggle({
  control,
  canWrite,
  draft,
  entry,
  onChange,
  title,
}: {
  control: NotificationUserCatalogEntry["channel_controls"][number];
  canWrite: boolean;
  draft: PreferenceDraft;
  entry: NotificationUserCatalogEntry;
  onChange: (channel: NotificationChannel, checked: boolean) => void;
  title: string;
}) {
  const channelDisplay = notificationChannelDisplay[control.channel];
  const supported = entry.supported_channels.includes(control.channel);
  const checked = supported && draft[control.channel] !== "disabled";
  const disabled = !canWrite || control.locked || !supported;
  const reason = control.locked ? reasonLabel(control.reason_code) : null;

  return (
    <label className="notification-channel-toggle">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={`${channelDisplay.label} for ${title}`}
        onChange={(event) => onChange(control.channel, event.target.checked)}
      />
      <span>{channelDisplay.label}</span>
      {reason ? (
        <small className="notification-managed-reason">{reason}</small>
      ) : null}
    </label>
  );
}
