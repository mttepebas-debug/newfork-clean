import { describe, expect, it } from "vitest";
import {
  notificationPreferencesInputSchema,
  notificationPreferencesSchema,
  notificationWorkspaceSettingsInputSchema,
  notificationWorkspaceSettingsSchema,
} from "./notification-settings";

// The shapes get_notification_preferences_service and
// get_notification_workspace_settings_service answer (BILDIRIM-07).
const preferences = {
  channels: {
    in_app: { locked: true },
    email: { workspace_enabled: true, address_on_file: true, suppressed: false },
    push: { workspace_enabled: true, devices: 0 },
    sms: { available: false, workspace_enabled: false },
  },
  topics: [
    { key: "my_schedule", name: "My schedule", email: { choice: null, default: true }, push: { choice: false, default: true } },
  ],
};

const settings = {
  email_enabled: true,
  push_enabled: false,
  sms_enabled: false,
  sms_available: false,
  optional: [{ key: "shift_changes.open_shift_available", area: "shift_changes", description: "An extra shift you can take is open", enabled: true }],
  always_sent: [{ key: "account.password_changed", area: "account", level: "required", description: "Your password was changed" }],
};

describe("notification settings shapes", () => {
  it("reads what the database answers", () => {
    expect(notificationPreferencesSchema.parse(preferences)).toEqual(preferences);
    expect(notificationWorkspaceSettingsSchema.parse(settings)).toEqual(settings);
  });

  it("takes only email and push choices, a boolean or back to the default", () => {
    const ok = { choices: [{ topic: "open_shifts", channel: "push", enabled: null }, { topic: "time_off", channel: "email", enabled: false }] };
    expect(notificationPreferencesInputSchema.parse(ok)).toEqual(ok);
    for (const channel of ["sms", "in_app"]) {
      expect(notificationPreferencesInputSchema.safeParse({ choices: [{ topic: "time_off", channel, enabled: true }] }).success).toBe(false);
    }
    expect(notificationPreferencesInputSchema.safeParse({ choices: [] }).success).toBe(false);
    expect(notificationPreferencesInputSchema.safeParse({ choices: [{ topic: "time_off", channel: "email" }] }).success).toBe(false);
  });

  it("names no workspace or person in a body", () => {
    expect(
      notificationPreferencesInputSchema.safeParse({ choices: [{ topic: "time_off", channel: "email", enabled: true }], user_id: "x" }).success,
    ).toBe(false);
    expect(
      notificationWorkspaceSettingsInputSchema.safeParse({ email_enabled: true, push_enabled: true, muted_types: [], workspace_id: "x" }).success,
    ).toBe(false);
  });

  it("never turns text messages on from a workspace body", () => {
    expect(notificationWorkspaceSettingsInputSchema.safeParse({ email_enabled: true, push_enabled: true, muted_types: [] }).success).toBe(true);
    expect(
      notificationWorkspaceSettingsInputSchema.safeParse({ email_enabled: true, push_enabled: true, sms_enabled: true, muted_types: [] }).success,
    ).toBe(false);
    expect(
      notificationWorkspaceSettingsInputSchema.safeParse({ email_enabled: true, push_enabled: true, muted_types: ["not a key"] }).success,
    ).toBe(false);
  });
});
