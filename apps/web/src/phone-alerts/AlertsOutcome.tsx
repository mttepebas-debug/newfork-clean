import { Button } from "@newfork/ui";
import { Check, Info } from "lucide-react";
import { useState } from "react";

import { isAndroidChrome, isStandalone, readInstallEnv, type InstallEnv } from "./install-state";
import { copySetupLink } from "./setup-link";
import "./home-entry.css";

// What a card shows after "Turn on alerts" (TELEFON-TUR2, §4 "Home kartlarında izin sonucu"), the help
// for a browser that said no, and the way to Safari from another iPhone browser. Shared by Home's
// entries and the Home Screen app's first open.

export type Outcome = "on" | "blocked" | "timeout" | "paused" | "failed";
export type DeviceWord = "iphone" | "phone" | "computer";

export function deviceWord(env: InstallEnv = readInstallEnv(window)): DeviceWord {
  if (/iPhone|iPad/.test(env.userAgent)) return "iphone";
  return /Android|Mobile/.test(env.userAgent) ? "phone" : "computer";
}

const at = (date: Date) => date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export function AlertsOn({ sentAt, device }: { readonly sentAt: Date; readonly device: DeviceWord }) {
  const [missed, setMissed] = useState(false);
  return (
    <div className="pa-result" role="status">
      <span className="pa-ok" aria-hidden>
        <Check size={20} />
      </span>
      <div>
        <strong>Alerts are on</strong>
        <p className="pa-line">Test alert sent · {at(sentAt)}</p>
        <button type="button" className="pa-link" aria-expanded={missed} onClick={() => setMissed(!missed)}>
          Didn&rsquo;t see it?
        </button>
        {missed ? (
          <p className="pa-small">
            {device === "iphone"
              ? "Swipe down from the top left to see Notification Center. If a Focus is on, it may be silenced."
              : device === "phone"
                ? "Swipe down from the top of your screen to see it."
                : "Check that notifications for your browser are on in your computer’s settings and that Do not disturb is off."}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Chrome showed its small box and it timed out, or it is not asking at all for now. */
export function NotAsked({ paused }: { readonly paused: boolean }) {
  return (
    <div className="pa-info">
      <Info size={16} aria-hidden />
      <div>
        <strong>{paused ? "Chrome isn’t asking right now" : "Didn’t catch it?"}</strong>
        <p>
          {paused
            ? "Chrome paused the question after a few dismissals. You can allow alerts from the site settings icon at the left of the address bar."
            : "Chrome shows a small box for a few seconds. Tap Turn on alerts to try again."}
        </p>
      </div>
    </div>
  );
}

/** How to turn alerts back on, by where they were blocked. Never a pop-up: plain steps (S-145 (3)). */
export function BlockedHelp() {
  const env = readInstallEnv(window);
  if (/iPhone|iPad/.test(env.userAgent) && isStandalone(window)) {
    return (
      <div className="pa-help">
        <p>Open iPhone Settings &rsaquo; Notifications &rsaquo; Newfork and turn on Allow Notifications.</p>
        <p className="pa-small">
          Not in the list? Touch and hold the Newfork icon, tap Remove, add it again from Safari, then open it and tap Turn on alerts.
        </p>
      </div>
    );
  }
  const chrome = /Chrome\/\d+/.test(env.userAgent) && !/Edg\/|EdgA|OPR\/|SamsungBrowser/.test(env.userAgent);
  if (!chrome) {
    return (
      <div className="pa-help">
        <p>Allow notifications for newfork.app in this browser&rsquo;s site settings.</p>
      </div>
    );
  }
  const steps = isAndroidChrome(env)
    ? ["Tap the site settings icon at the left of the address bar.", "Tap Permissions, then Notifications.", "Choose Allow."]
    : ["Click the site settings icon at the left of the address bar.", "Turn on Notifications.", "Reload this page."];
  return (
    <div className="pa-help">
      <ol>
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  );
}

const OTHER = {
  mail: {
    lead: "Your email app opened this page in its own browser. On iPhone, alerts need Safari.",
    path: "Look for Open in Safari in this screen’s menu. Or copy the link.",
  },
  inapp: {
    lead: "This app’s browser can’t add Newfork to your Home Screen.",
    path: "Use this app’s menu (••• or the Share icon), then Open in Safari. Or copy the link.",
  },
  browser: { lead: "On iPhone, Newfork alerts work after you add Newfork to your Home Screen from Safari.", path: "" },
} as const;

/** V1-X5: another iPhone browser. The way is Safari: its own menu, or the copied link. */
export function OpenInSafari({ where, onClose }: { readonly where: "browser" | "inapp" | "mail"; readonly onClose: () => void }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  const copy = OTHER[where];
  return (
    <div className="pa-safari">
      <strong>Open this page in Safari</strong>
      <p>{copy.lead}</p>
      {copied ? (
        <p role="status">Link copied. Open Safari, tap the address bar, paste, and go.</p>
      ) : copy.path ? (
        <p>{copy.path}</p>
      ) : null}
      {copied === false ? <p role="alert">The link couldn&rsquo;t be copied. Open newfork.app in Safari.</p> : null}
      <p className="pa-small">You&rsquo;ll sign in once in Safari.</p>
      <div className="pa-actions2">
        <Button className="secondary-button" onClick={onClose}>
          Close
        </Button>
        <Button onClick={() => void copySetupLink().then(setCopied)}>Copy link</Button>
      </div>
    </div>
  );
}
