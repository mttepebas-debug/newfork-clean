import { useState } from "react";

import { PhoneAlertsCard } from "../phone-alerts/PhoneAlertsCard";
import type { PhoneAlertsSupport } from "../phone-alerts/install-state";

// DEV-only: the phone alerts card in each device state, one per page so the
// gallery can frame it at phone width (/dev/feedback?alerts=<state>).

export const phoneAlertStates = {
  "iphone-safari": {
    label: "iPhone Safari, not on the Home Screen",
    support: { kind: "needs-install", device: "phone", browser: "safari", ios: 27 },
  },
  "iphone-home-screen": {
    label: "iPhone, opened from the Home Screen",
    support: { kind: "ready", device: "phone", installed: true },
  },
  "android-chrome": {
    label: "Android Chrome",
    support: { kind: "ready", device: "phone", installed: false },
  },
} as const satisfies Record<string, { label: string; support: PhoneAlertsSupport }>;

export type PhoneAlertState = keyof typeof phoneAlertStates;

export function isPhoneAlertState(value: string | null): value is PhoneAlertState {
  return value !== null && Object.hasOwn(phoneAlertStates, value);
}

export function PhoneAlertsPreview({ state }: { state: PhoneAlertState }) {
  const { label, support } = phoneAlertStates[state];
  const [outcome, setOutcome] = useState<null | "on" | "later">(null);
  return (
    <main className="fg-alerts-page">
      <p className="fg-alerts-label">
        {label}
        <span>Home shows it once phone alerts are set up.</span>
      </p>
      {outcome === null ? (
        <PhoneAlertsCard
          support={support}
          audience="employee"
          onTurnOn={() => setOutcome("on")}
          onNotNow={() => setOutcome("later")}
        />
      ) : (
        <p className="fg-alerts-outcome" role="status">
          {outcome === "on"
            ? "Turn on called back. On Home it asks the browser here."
            : "Not now called back. The card is gone."}{" "}
          <button type="button" onClick={() => setOutcome(null)}>
            Show the card again
          </button>
        </p>
      )}
    </main>
  );
}
