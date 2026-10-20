import { Button } from "@newfork/ui";
import { BellRing, Ellipsis, Menu, MonitorSmartphone, Share } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

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

  if (support.kind === "unsupported") return null;
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
      {steps ? (
        <HomeScreenSteps
          onClose={closeSteps}
          onNotNow={() => {
            setSteps(false);
            onNotNow();
          }}
        />
      ) : null}
    </aside>
  );
}

/** iPhone Safari has no web push; the Home Screen app does (iOS 16.4+). Account → Notifications opens it too. */
export function HomeScreenSteps({ onClose, onNotNow }: { onClose: () => void; onNotNow: () => void }) {
  const titleId = useId();
  const textId = useId();
  const sheet = useRef<HTMLElement>(null);
  const latest = useRef(onClose);
  latest.current = onClose;

  useEffect(() => {
    sheet.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        latest.current();
        return;
      }
      if (event.key !== "Tab" || !sheet.current) return;
      // Keep Tab inside the sheet while it is open.
      const buttons = [...sheet.current.querySelectorAll<HTMLElement>("button:not(:disabled)")];
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (!first || !last) return;
      const inside = sheet.current.contains(document.activeElement) && document.activeElement !== sheet.current;
      if (event.shiftKey && (!inside || document.activeElement === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || document.activeElement === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown, true);
    return () => document.removeEventListener("keydown", keydown, true);
  }, []);

  return createPortal(
    <div className="phone-alerts-layer" role="presentation">
      {/* A tap outside is Got it; keyboards have Escape. */}
      <div className="phone-alerts-backdrop" aria-hidden onClick={onClose} />
      <section
        ref={sheet}
        className="phone-alerts-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
        tabIndex={-1}
      >
        <h2 id={titleId}>One step first on iPhone</h2>
        <p id={textId}>iPhone shows alerts only for apps on the Home Screen. It takes ten seconds.</p>
        <ol className="phone-alerts-steps">
          <li>
            <span aria-hidden>1</span>
            {/* iOS 18 shows Share in Safari's bar; iOS 26 keeps it behind •••, iOS 27 behind the Page Menu. */}
            <p>
              In Safari, tap <Share size={16} aria-hidden /> <strong>Share</strong>. Don't see it? Tap{" "}
              <Ellipsis size={16} aria-hidden />
              <span className="sr-only">More</span> or <Menu size={16} aria-hidden />
              <span className="sr-only">Page Menu</span> first.
            </p>
          </li>
          <li>
            <span aria-hidden>2</span>
            <p>
              Tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>. Not in the list? Scroll down or tap{" "}
              <strong>View More</strong>.
            </p>
          </li>
          <li>
            <span aria-hidden>3</span>
            <p>
              {/* The Home Screen app keeps its own storage, apart from Safari's sign-in. */}
              Open <strong>Newfork</strong> from your Home Screen, sign in, and tap <strong>Turn on</strong> again.
            </p>
          </li>
        </ol>
        <div className="phone-alerts-sheet-actions">
          <Button onClick={onClose}>Got it</Button>
          <Button className="secondary-button" onClick={onNotNow}>
            Not now
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
