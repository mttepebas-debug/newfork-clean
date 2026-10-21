import { Button } from "@newfork/ui";
import { Check } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { FieldNote } from "../shell/FieldNote";
import { AlertsOn, BlockedHelp } from "./AlertsOutcome";
import { useNotificationChannels } from "./channels-data";
import { nfIcon } from "./guide/replica";
import { isStandalone } from "./install-state";
import { showTestAlert } from "./push-client";
import { usePhoneAlerts } from "./use-phone-alerts";
import "./welcome-back.css";

// The Home Screen app's first open on iPhone (TELEFON-TUR2, V3-A "İkinci perde"): the app keeps its own
// storage, so Safari's sign-in does not come along. One screen says where the person is: added ✓, sign
// in, then one "Turn on alerts". Sign-in is today's (email and password); there is no way to create a
// workspace account here, and permission is asked only from the tap (K3, K5).

const doneKey = "newfork.phoneAlerts.appFirstDone";

/** iPhone, opened from the Home Screen, never asked yet and not through this screen before. */
export function homeScreenFirstOpen(win: Window = window): boolean {
  try {
    if (!/iPhone|iPad/.test(win.navigator.userAgent) || !isStandalone(win)) return false;
    const permission = (win as Window & { Notification?: typeof Notification }).Notification?.permission;
    return permission === "default" && win.localStorage.getItem(doneKey) !== "1";
  } catch {
    return false;
  }
}

function markDone() {
  try {
    window.localStorage.setItem(doneKey, "1");
  } catch {
    // Nothing kept: the screen may show once more after a sign-out, never wrongly.
  }
}

function Row({ n, state, title, children }: { n: number; state: "done" | "open" | "closed" | "warn"; title: string; children?: ReactNode }) {
  return (
    <li className={`wb-row is-${state}`}>
      <div className="wb-row-h">
        <span className="wb-num" aria-hidden>
          {state === "done" ? <Check size={14} /> : state === "warn" ? "!" : n}
        </span>
        <span className="wb-row-t">{title}</span>
        {state === "done" ? <span className="sr-only">, done</span> : null}
      </div>
      {children ? <div className="wb-row-b">{children}</div> : null}
    </li>
  );
}

export function WelcomeBack({ destination }: { readonly destination: string }) {
  const navigate = useNavigate();
  const { authenticated, error, signIn } = useAuth();
  const config = useNotificationChannels(authenticated);
  const alerts = usePhoneAlerts();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<{ kind: "on" | "blocked" | "failed"; at: Date } | null>(null);

  const leave = () => {
    markDone();
    navigate(destination, { replace: true });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    await signIn(email, password);
    setSubmitting(false);
  };

  const turnOn = async () => {
    const key = config.push.public_key;
    if (!key) return;
    // Straight from the tap: iPhone asks only from one.
    const next = await alerts.turnOn(key);
    markDone();
    const at = new Date();
    if (next === "on") {
      void showTestAlert("iphone");
      setOutcome({ kind: "on", at });
    } else if (next === "blocked") setOutcome({ kind: "blocked", at });
    else if (next !== "off") setOutcome({ kind: "failed", at });
  };

  const on = outcome?.kind === "on";
  const blocked = outcome?.kind === "blocked";
  const pushReady = config.push.available && Boolean(config.push.public_key);

  return (
    <main className="wb" aria-labelledby="welcome-title">
      <div className="wb-top">
        <span dangerouslySetInnerHTML={{ __html: nfIcon(40) }} />
        <span className="wb-part">Part 2 · In the app</span>
      </div>
      <h1 id="welcome-title" className="wb-h1" tabIndex={-1}>
        {on ? "Alerts are on" : "Welcome back. One last step."}
      </h1>
      <ol className="wb-rows">
        <Row n={1} state="done" title="Added to your Home Screen" />
        {authenticated ? (
          <Row n={2} state="done" title="Signed in" />
        ) : (
          <Row n={2} state="open" title="Sign in">
            <form className="wb-form" onSubmit={submit}>
              <p className="wb-hint">The Home Screen app keeps its own sign-in.</p>
              <div className="onboarding-field">
                <label htmlFor="wb-email">Email</label>
                <input id="wb-email" type="email" inputMode="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="onboarding-field">
                <label htmlFor="wb-password">Password</label>
                <input
                  id="wb-password"
                  type="password"
                  autoComplete="current-password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Link className="pb-link" to="/forgot-password" state={{ email: email.trim() }}>
                  Forgot password?
                </Link>
                <p className="wb-small">The reset link opens in Safari. Set a new password there, then come back to this app and sign in.</p>
              </div>
              <FieldNote id="wb-sign-in" error={error} />
              <Button type="submit" className="wb-block" disabled={submitting}>
                {submitting ? "Please wait" : "Sign in"}
              </Button>
            </form>
          </Row>
        )}
        {blocked ? (
          <Row n={3} state="warn" title="Alerts are off for this iPhone">
            <p className="wb-text">iPhone won&rsquo;t ask again. To turn them on:</p>
            <BlockedHelp />
            <Button className="secondary-button wb-block" onClick={leave}>
              Go to Home
            </Button>
          </Row>
        ) : on ? (
          <Row n={3} state="done" title="Alerts are on">
            <AlertsOn sentAt={outcome.at} device="iphone" />
            <Button className="wb-block" onClick={leave}>
              Go to Home
            </Button>
          </Row>
        ) : authenticated ? (
          <Row n={3} state="open" title="Turn on alerts">
            <p className="wb-text">Your iPhone asks once. You can turn alerts off any time in Settings.</p>
            <div className="wb-example" aria-hidden>
              <span className="wb-example-tag">Example</span>
              <span className="wb-note">
                <span dangerouslySetInnerHTML={{ __html: nfIcon(32, 8) }} />
                <span>
                  <b>Your schedule for Oct 26–Nov 1 is out</b>
                  <span>4 shifts this week.</span>
                </span>
              </span>
            </div>
            {outcome?.kind === "failed" ? <p className="wb-small" role="alert">Alerts couldn&rsquo;t be turned on. Try again.</p> : null}
            {pushReady ? (
              <Button className="wb-block" disabled={alerts.busy} onClick={() => void turnOn()}>
                Turn on alerts
              </Button>
            ) : null}
            <Button className="secondary-button wb-block" onClick={leave}>
              {pushReady ? "Not now" : "Go to Home"}
            </Button>
          </Row>
        ) : (
          <Row n={3} state="closed" title="Turn on alerts" />
        )}
      </ol>
      <p className="wb-small">Alerts are optional. Schedule news always reaches your Notifications list in the app.</p>
    </main>
  );
}
