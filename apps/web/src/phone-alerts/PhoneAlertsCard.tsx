import { Button } from "@newfork/ui";
import { BellRing, MonitorSmartphone } from "lucide-react";
import { useId, useRef, useState } from "react";

import { HomeScreenGuide } from "./guide/HomeScreenGuide";
import type { PhoneAlertsSupport } from "./install-state";
import "./phone-alerts.css";

// The "Get alerts on this phone" card (plan variant A). Home shows it through
// PhoneAlertsHome, only once phone alerts are set up (KARARLAR S-124).
// It never asks the browser for permission; Turn on only calls back.

export type PhoneAlertsCardProps = {
  readonly support: PhoneAlertsSupport;
  readonly audience: "employee" | "manager";
  /** The browser can ask now; the caller asks for permission. */
  readonly onTurnOn: () => void;
  readonly onNotNow: () => void;
};

const why = {
  employee: "Know right away when your schedule changes or someone asks you to cover.",
  manager: "Know right away when a request needs your approval.",
} as const;

export function PhoneAlertsCard({ support, audience, onTurnOn, onNotNow }: PhoneAlertsCardProps) {
  const titleId = useId();
  const opener = useRef<HTMLButtonElement | null>(null);
  const [steps, setSteps] = useState(false);

  if (support.kind === "unsupported" || support.kind === "other-browser") return null;
  const computer = support.kind === "ready" && support.device === "computer";
  const Icon = computer ? MonitorSmartphone : BellRing;

  const closeSteps = () => {
    setSteps(false);
    opener.current?.focus();
  };

  return (
    <aside className="phone-alerts-card" aria-labelledby={titleId}>
      <span className="phone-alerts-tile" aria-hidden>
        <Icon size={18} />
      </span>
      <div>
        <strong id={titleId}>{computer ? "Get alerts on this computer" : "Get alerts on this phone"}</strong>
        <p>{why[audience]}</p>
        <div className="phone-alerts-actions">
          <Button
            onClick={(event) => {
              if (support.kind !== "needs-install") return onTurnOn();
              opener.current = event.currentTarget;
              setSteps(true);
            }}
          >
            Turn on
          </Button>
          <Button className="secondary-button" onClick={onNotNow}>
            Not now
          </Button>
        </div>
      </div>
      {steps && support.kind === "needs-install" ? (
        <HomeScreenGuide where={{ browser: support.browser, ios: support.ios }} onClose={closeSteps} />
      ) : null}
    </aside>
  );
}
